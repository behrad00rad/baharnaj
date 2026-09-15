# Baharnaj Telegram integration

This is a Django source-of-truth integration with TeleBotHost TBL incoming commands and a direct Telegram Bot API outbound transport. There is no second Telegram webhook or polling receiver. Telegram, not SMS. No real messages or deployment are part of implementation.

## Setup and activation

1. Use the repository's supported Python **3.12** environment (the pre-existing `salon.security` imports `imghdr`, removed in Python 3.13). Install `backend/requirements.txt`; this adds only `jdatetime` and its small calendar dependency. Do not run the existing Python 3.14 virtualenv without addressing that unrelated compatibility issue.
2. Back up the database, then from `backend` run `python manage.py migrate`. Migrations are additive. No financial/marketing rule or sample discount is activated.
3. Fill the server-only environment entries in `backend/.env.example`. Use a random dedicated integration secret, e.g. `python -c 'import secrets; print(secrets.token_urlsafe(48))'` in your private terminal. Set HTTPS public `SITE_URL`/`PUBLIC_BACKEND_URL`, bot username (without @), and token. Never put secrets in `VITE_` variables or logs.
4. Follow [TeleBotHost installation and contract](telebothost/README.md). The same bot token is placed privately in TeleBotHost and Django; Django's sendMessage does not replace the incoming webhook. The integration secret is a different credential.
5. Run `python manage.py telegram_diagnostics` (configuration booleans only). Run `python manage.py telegram_diagnostics --connectivity` **on the actual production host** to check TCP/443 to Telegram. This does not message anyone or validate bot credentials. Development connectivity cannot establish production connectivity. If unreachable, do not activate direct outbound. `transport.py` is the replacement boundary for a future authenticated relay; no speculative second stack is installed.
6. Keep `TELEGRAM_ENABLED=false`, `TELEGRAM_DRY_RUN=true` during initial setup. Set enabled true with dry run still true for linking and mock outbox acceptance checks. Customer-initiated TBL command replies will operate once you publish the commands; don't publish until ready. Dry run applies to Django outbound, not interactive bot replies.
7. In `/admin/telegram`, configure real salon contact details, templates, time windows and desired rules. Address/phone reuse existing `SalonSettings`; map/hours/Instagram/support are explicit settings, no invented monitored inbox. Link your own authenticated admin account under Templates & settings and explicitly select manager reports. Customer marketing is excluded from admin accounts.
8. Install the example systemd service/timer after adapting user, paths and environment file. Protect the environment file with mode 600. `systemctl enable --now baharnaj-telegram.timer` is an **operator activation step**, not executed here. Alternatively cron every minute: `* * * * * cd /srv/baharnaj/backend && .venv/bin/python manage.py telegram_worker`. Use one scheduler, no per-web-worker scheduler. No in-process sleeping loop.
9. Explicitly use campaign Test to send only to your own verified admin connection. In dry run the result is `simulated`, never `accepted`. For live test-to-self, leave customer campaigns unqueued, set `TELEGRAM_DRY_RUN=false`, then explicitly trigger Test. Existing appointment updates can send if customers are already linked and consented: use a separate staging bot/database for prelaunch validation.
10. After test-to-self, verify actual TBL callbacks, error handling, Django worker results and production connectivity. Enable desired birthday, maintenance, reactivation or points rules separately. No paid broadcasts, plans or ads are enabled by this repository.

## Routes and UI

- `/admin/telegram`: overview, customers/segments, campaign workflow, automations/loyalty, templates/settings.
- `/telegram`: authenticated customer settings, real balance, available point rewards, issued benefits and reservation against an owned appointment.
- Successful `/book`: optional connection card. A guest gets a random 7-day receipt capability **only in the creation response**, never in appointment list serialization. The receipt authorizes a ten-minute single-use bot link scoped to that booking. Phone numbers and existing tracking codes never issue Telegram links. The receipt stays in page state, not URLs/local storage.
- `/api/v1/telegram/customer/`, `/benefits/`: website ownership checks.
- `/api/v1/telegram/bot/`: HMAC-authenticated, allowlisted TBL contract.
- `/api/v1/telegram/admin/`: admin-only paginated resources/actions. Secrets and numeric chat IDs are omitted from browser payloads.
- `/api/v1/telegram/visit/<opaque-uuid>/`: first-party redirect to configured `/book` only, optional service preselection and attribution token. The token is **never a login or booking-management credential**.

Disconnecting an account revokes all of that user’s account/booking connections and pending links; a guest disconnect affects only its authorized booking. Returning to the bot does not restore consent.

`/booking/manage` adds a small website screen over the existing receipt lookup/cancellation API: phone plus confirmation code is required, cancellation has explicit confirmation, and changes are coordinated through the real salon contact under the existing terms. Bot links do not carry those credentials or perform cancellations.

## Delivery and business rules

The worker reconciles **committed** appointments/items and durable status history, then writes an outbox. Booking performs no Telegram networking. It consolidates multi-service appointment summaries; default reminders are 24 and 3 hours, late-created reminder times and stale downtime backlog are skipped. Each appointment fingerprint invalidates obsolete queued records, and state/consent/role is checked again at send time. Acknowledgment never changes appointment business status.

Default optional-message window is 10:00–20:00 Asia/Tehran. Appointment status changes bypass that window. A reminder that cannot fit before expiry/appointment is suppressed. Marketing has a shared one-per-seven-day cap for campaigns, reactivation and maintenance, across account identity. Service maintenance additionally requires both care and marketing consent. Service rules start disabled with zero interval; staff must choose intervals/text. An explicit item completion timestamp drives care; legacy completed rows are backfilled from their last audited update time (an approximation, not a reconstructed historical completion instant). Completed-service history drives care, private feedback, maintenance and suppression by newer/upcoming relevant services. Decline or low feedback suppresses promotions for 30 days; snooze is deduplicated for seven days. Feedback is private and never testimonial consent.

The singleton database lease plus conditional per-job claims works on SQLite and PostgreSQL. A hard maximum of 50 jobs per batch and a global rate budget avoid scheduler overlaps; at most one job per private chat per minute. Claim lease is 15 minutes, worker network budget under 14 minutes. No database transaction spans a network request. Explicit 429 and server errors retry with bounded attempts. 403 marks unreachable without rewriting consent. A timeout/connection ambiguity or stale claim is `unknown` and **never automatically retried**. This conservative choice can lose a send but avoids promising exactly-once behavior. Operators inspect unknown records; no bulk resend button bypasses safety.

Campaign content/revision and eligible recipients are snapshotted in Delivery. Sending-time eligibility is rechecked; edits after queueing create a new draft revision, pause/cancel stop the remaining queue. Accepted messages cannot be recalled. Reports distinguish simulated, queued, accepted, failed, suppressed, cancelled and unknown. Accepted means Telegram accepted the API call, not device delivery/read. Attribution defaults to seven days from the first tracked link visit (configurable) and is only credited for an authenticated booking by the intended customer; guest visits are counted but guest bookings are deliberately not identity-attributed. No causal revenue claims.

Points are immutable entries (earning, conversion/redemption, expiry and reversals), keyed by business event. Earning stays off at zero; owner sets one point per N **paid toman**, expiry days. Completed, settled, final-priced appointments qualify. The current rule applies to eligible committed history when enabled; review this before enabling. Any refund/cancellation reverses the original earning in full. Expiry consumes only each grant’s remaining FIFO balance; spent older points do not expire newer grants. Benefit rules specify actual dates, catalog service IDs, percent **or** fixed amount, optional maximum and point cost. Coupons are customer-bound, single-use, non-stacking, with frozen terms. Booking reserves only; admin explicitly redeems before any payment or service completion. Discount is allocated once into read-only item discount fields and the existing effective-price calculation, with original fixed/variable pricing and catalog snapshots preserved; existing finance totals/payment/commission logic remains authoritative. No discount can be applied to unresolved prices. Refunds follow existing discounted paid amounts, and a redeemed coupon is not automatically reissued.

Birthday month/day supports Jalali or Gregorian. In non-leap years, Esfand 30 maps to Esfand 29 and February 29 to February 28. One birthday issuance key per customer per Gregorian year and a minimum 364-day guard are used regardless of edits/calendar changes to prevent repeat gifts. A missing/inactive gift gives a plain greeting. Manager reports require explicit opt-in on a verified admin connection; role revocation blocks pending reports. Daily appointment summary starts at 10:00; cancellation daily summary at 10:00 reports the complete previous salon-local day, explicitly labeled by **cancellation event date**, not appointment date. Campaign completion and failure digest contain minimal information and link to the protected panel.

## Verification and rollback

Local verification commands (all use mocks/test databases, never customer sends):

```sh
cd backend
python manage.py test telegram_crm salon --noinput
python manage.py check
python manage.py makemigrations --check --dry-run
cd ../frontend
npm test
npm run build
npm run lint
cd ..
node telegram/telebothost/router.test.mjs
npx playwright test -c e2e/telegram.config.js
```

For an independent Firefox run, install its Playwright browser/runtime dependencies and use `TELEGRAM_TEST_BROWSER=firefox npx playwright test -c e2e/telegram.config.js`.

The Playwright suite mocks API responses and checks all five tabs plus customer settings at 390/1366 px in both themes. It does not substitute for live TeleBotHost or deployed backend verification. Local screenshots are written to `/tmp/telegram-*.png`.

Rollback: set `TELEGRAM_ENABLED=false`, stop/disable timer, and pause campaigns in the admin panel before removing UI/routes. Disable interactive TBL commands separately if needed. Keep additive tables and ledgers for audit; do not roll back financial history or delete consent/delivery records as a shortcut. Rotate the integration secret in both runtimes after suspected exposure. The bot token can be rotated through BotFather.

For requirement-by-requirement coverage, exact check results and known verification limits, see [implementation audit](IMPLEMENTATION_AUDIT.md).

## Simple admin setup and help

The Telegram admin now opens on a short start screen at `/admin/telegram`. Use **تنظیمات ربات** to submit the bot token and bot name/link. The **بررسی توکن** action calls Telegram's [getMe](https://core.telegram.org/bots/api#getme) only; it sends no message and does not change the webhook. The built-in **راهنما** pages explain setup, messages, reminders, delivery problems, stopping sends and rewards in Persian. Message preparation uses three steps and an explicit final confirmation; advanced features open only when selected.

The panel can now store the token and TeleBotHost integration secret, superseding the original environment-only entry workflow. Saved credentials are write-only: blank means retain, values are never returned in GET/save responses, and inputs clear after a successful save. They are encrypted at rest with [Fernet](https://cryptography.io/en/latest/fernet/) using a domain-separated key derived from the existing server `SECRET_KEY`. Preserve that server key with protected backups; changing it without re-entering credentials makes the integration fail closed. Audit logs record changed field names and mode, never credential values. `cryptography` was already present transitively; it is now an explicit dependency.

Until a panel configuration is saved, existing environment configuration still applies. Afterwards the panel's saved mode and nonempty values take precedence; missing credential overrides can still use server environment credentials. `TELEGRAM_FORCE_DISABLED=true` is an unconditional operator emergency stop. Changes are read by the web process and next worker job without a restart. Credential changes stop sending and clear verification; activating live mode requires successful token verification and explicit confirmation. A verified bot cannot silently be replaced by a different bot with existing customer links. Concurrent edits require a fresh revision.

The form does **not** install TeleBotHost commands or a scheduler. Complete those one-time steps with the deployment operator. The integration secret can be generated in the browser using secure random bytes and copied into private TeleBotHost settings before saving; it is not stored in browser storage. Site/backend HTTPS origins and salon contact links can also be entered in the panel. No external paid service or AI assistance is needed for the guides or settings.

Apply migration `telegram_crm.0005_integrationsettings` before opening the setup page. For verification of the redesigned UI, use the frontend `AdminTelegram.test.jsx` suite and the browser checks in `e2e/telegram.config.js` in addition to the backend Telegram tests.
