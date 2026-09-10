# Salon SMS / CRM

The admin module is at `/admin/sms`. It uses existing customers, appointment items, appointments, confirmed payments and completed refunds. No provider is selected and no real SMS was sent during implementation. All new customer marketing preferences default to disabled.

## Features and financial definitions

- Campaign drafts, editing, service/category/employee audience filters, minimum completed appointments or net confirmed spending, registration recency, visit dates and inactivity. Inactivity uses the last completed service date, never registration. Customers without a completed visit are not classified as inactive. Location is deliberately absent because it is not stored.
- Preview lists recipients and calculates actual rendered character/part counts (including the opt-out link). Confirmation freezes message bodies and audience IDs; a signed 15-minute confirmation rejects changed content or audiences. Scheduled campaigns keep that reviewed audience, while consent is rechecked at dispatch.
- Read-only delivery and attempt history, campaign status/counts and acceptance rate. `sent` means provider acceptance, not delivery. `delivered` requires positive provider evidence. Unknown outcomes are reported separately.
- Customer profiles show appointment counts, actual visit counts, completed appointments, net confirmed spending, last visit, common services/specialists, consent history, optional maintained birth date and SMS history. Spending is confirmed payments (including subsequently refunded payments) minus completed refunds, queried independently of item joins.
- Configurable birthday, per-service/category maintenance, inactivity and appointment reminders. Birthdays use stored Gregorian dates and fire once per calendar year; missing dates are skipped. Maintenance uses the latest completed cycle per applicable service, with a seven-day catch-up window. Inactivity fires once per last-visit date. Upcoming appointment reminders skip expired/cancelled/rescheduled slots.
- Optional transactional rules for booking registration, confirmation, changes and cancellation enqueue after the booking commits. They never call a provider during the HTTP request. Failures are isolated from the committed booking and logged. Rules apply to future events; enabling a rule does not retrospectively message all past bookings.
- Optional manager daily summary (Tehran time, as of configured hour), campaign summary, and at most one failure alert per day. Summaries contain aggregate numbers, not customer details.

There is no points economy or coupon redemption system. The optional discount-code field is message text only and does not change appointment prices or financial records. A loyalty-points/coupon system remains a separate follow-up, as permitted by the task. Appointment dates in SMS variables are ISO Gregorian; the time is the salon's Tehran time. Admin date inputs explicitly identify the Gregorian calendar.

## Provider setup

Configure the backend environment, never frontend variables:

```dotenv
SMS_PROVIDER=your_package.iranian_sms.Provider
SMS_API_KEY=your-secret
SMS_SENDER_NUMBER=your-sender
SMS_PUBLIC_BASE_URL=https://your-public-frontend.example
SMS_ALLOW_TEST_PROVIDER=0
```

`SMS_PROVIDER` is a dotted class path implementing `salon.sms.providers.SMSProvider`. An adapter receives `api_key` and `sender`; implement `send(phone=..., message=..., idempotency_key=...)` and return `SendResult(message_id, delivered=False)`. Use bounded network timeouts, the provider's actual request/response contract, and its idempotency capability when available. A definitive non-acceptance may raise `Rejected`. A timeout or other ambiguous outcome must not be labelled a definitive rejection. Raw provider exceptions/credentials are not stored in customer-visible errors.

The provider-specific adapter must be implemented once a vendor and its API are selected. There is intentionally no invented Iranian provider API or generic fake HTTP endpoint. The module shows “provider not configured” when the class/credentials are absent. HTTPS public origin is additionally required for marketing sends. Draft/audience previews remain usable without credentials; when the public origin is absent they show an explicit opt-out-link placeholder and cannot be confirmed for sending.

There is no production mock provider. A test-only development adapter requires both DEBUG and an explicit opt-in; its output is marked cancelled with a Persian “test only, no real SMS” explanation, never sent/delivered. Provider delivery receipt polling/webhooks are not fabricated: an eventual adapter can add authenticated receipt reconciliation using provider message IDs. Acceptance statistics remain honest until then.

## Worker and deployment

Apply migrations before running the new application:

```sh
python manage.py migrate
python manage.py process_sms --loop --interval 60
```

Run the worker under a supervisor with automatic restart and the same database/environment as Django. Alternatively, run `python manage.py process_sms` from cron every minute. Do not enable both. The dashboard displays worker heartbeat/staleness. The command processes one bounded batch (default 50, admin range 1–100) per iteration; the interval is at least 30 seconds. Choose a batch/interval compatible with the selected provider's quota. Browser tabs are not involved in scheduling.

For the existing development Compose stack, start/migrate the backend first, then enable the optional worker:

```sh
docker compose up -d backend
docker compose exec backend python manage.py migrate
docker compose --profile sms up -d sms-worker
```

The worker uses the shared `backend_data` volume. Production should supervise exactly one scheduler; dispatch uses atomic compare-and-set claims and unique deduplication keys so an overlapping batch cannot send an already claimed row twice. SQLite may serialize concurrent writers; PostgreSQL uses the same queue contracts. Scheduled dispatch is at or after the configured time, subject to worker availability and backlog.

No automatic retries are performed. A crash/timeout can occur after provider acceptance. Claims older than ten minutes become `unknown` and require provider investigation. Successful and failed deliveries retain separate attempt logs; `retry_count` currently stays zero. Explicit new campaigns are possible, but there is deliberately no “retry all” control that could duplicate an uncertain SMS. Cancellation stops queued rows; an already claimed/provider-accepted message may still send. Disabling an automation cancels its queued work when the worker reaches it.

Marketing consent is checked again immediately before transport. Changes made after a provider has accepted a message cannot recall it. A normalized phone can appear only once in a campaign, and an opted-out/non-consenting legacy duplicate profile suppresses marketing to that phone. Existing duplicate identities are preserved rather than merged or deleting their bookings. New booking paths normalize Iranian `09`, `+98`, `98`, `0098` formats and reuse existing matching customer identities. Customer reuse never authorizes an anonymous caller to reset an existing account password.

## Consent and permissions

Only admin-role users can access campaigns, rules, audiences, reports, CRM profiles and settings. Employees and customers are denied bulk CRM access by backend permissions. Customers can update their own preferences through `PATCH /api/v1/customer/sms-preferences/`; the signed `/sms/preferences?token=...` page supports guest opt-out without exposing customer history. GET alone never opts anyone out.

Initial admin-recorded consent requires an explanation of the explicit consent source/date. A recorded opt-out cannot be overridden by an admin; only the authenticated customer can rejoin. Consent transitions have an append-only API history. Transactional booking messages and manager/test messages are distinct from marketing. Automation text is admin-controlled, so admins must keep appointment templates operational rather than placing promotions in them. The public privacy page explains the distinction and opt-out route.

## Validation

Migration 0026 was applied locally after an SQLite backup at `/tmp/baharnaj-before-sms-20260909.sqlite3` (owner-only permissions). Existing users, customer counts, service prices/slugs, appointment item prices, payments, commissions and overlap triggers were checked against the backup and preserved. Apply the migration separately in deployment.

Backend tests cover real-data segmentation, opt-out/duplicate-phone suppression, previews, campaign queue/schedule/deduplication, test sends, provider absence/partial failures/ambiguous outcomes, crash recovery, birthday/maintenance/inactivity/reminder timing, transactional hooks, manager summaries, permissions, immutable delivery history, phone normalization and existing-customer booking reuse. Existing notification and pricing tests are also run. The broader suite retains its four documented baseline failures: revenue response shape, earnings status shape, media URL and dated availability.

Results: 27 new SMS tests pass; the SMS + notification + pricing selection passes all 54 tests. Full Django suite: 103/107 pass, with only the four baseline failures above. Frontend: 57/57 tests pass and production build succeeds. Django system/migration-drift checks and Compose validation pass. Frontend lint has warnings but no errors.

Frontend tests exercise provider/worker state, confirmation, audience filters and transactional/loyalty separation. Browser checks cover 390/768/1366px, both themes and Compact/Normal/Large text, including confirmation, editor and audience views. Test transport is mocked; no customer or manager received an SMS. No deployment was started.
