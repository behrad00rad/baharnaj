# Baharnaj Telegram integration — implementation prompt

Implement a complete Telegram integration in the existing Baharnaj repository: (1) a bot deployable to TeleBotHost, (2) a new Telegram management section inside the existing custom admin panel, and (3) booking/customer UI for connecting Telegram. Include appointment reminders, targeted campaigns, birthday and loyalty features, service-maintenance reminders and salon-management reports. This is Telegram messaging, not SMS. Deliver working code and setup instructions, not just a design or scaffold.

The bot token will be supplied later. Complete all code, migrations, configuration examples, mock-backed tests and deployable TBL command files without requiring a real token. Keep outbound sending disabled by default. Do not send real messages, purchase a hosting plan, publish the bot or deploy the website during implementation.

## 1. Inspect and reuse

Read AGENTS.md and inspect actual architecture, models, roles, booking flows, notifications, financials, theme tokens and available background jobs first. Expected stack: React/Vite + JavaScript/Tailwind and Django/DRF, initially SQLite; retain what actually exists. Reuse existing notification, customer, appointment, service, coupon and loyalty abstractions instead of duplicating them. Preserve unrelated changes, existing routes, SEO, role boundaries and booking/payment behavior. Do not migrate frameworks or add heavy dependencies unnecessarily.

Give a brief plan, then implement in coherent increments until all requested features work. Do not ask routine design questions. Use reasonable configurable defaults and disclose any genuine platform or repository blocker. Do not downgrade required loyalty/campaign features to TODOs merely because their models are absent; build the smallest complete backend/UI needed, with commercial rules inactive until configured.

## 2. Platform and architecture — important

Read current official documentation before writing TBL:
- https://docs.telebothost.com/
- https://docs.telebothost.com/http-instance/making-requests/
- https://docs.telebothost.com/webhook-instance/global-webhook/
- https://docs.telebothost.com/webhook-instance/limits-and-security/
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/features#deep-linking
- https://core.telegram.org/bots/faq

TeleBotHost executes sandboxed JavaScript commands using TBL globals such as Bot, Api and HTTP. It is not a generic Python/Node container. Deliver actual TBL commands, matching rules/callback handlers and configuration, with exact installation steps. Do not deliver a Telegraf/aiogram server and call it TeleBotHost-compatible. Verify signatures, available crypto/configuration helpers and response formats against docs; do not invent SDK APIs. Its HTTP helper supports JSON bodies and custom headers; await calls and check their documented success/error response.

Django is the source of truth for appointments, customer identity, consent, audience segmentation, templates, loyalty, campaigns and delivery records. TBL handles incoming commands/buttons and calls narrowly scoped authenticated Django endpoints. Store only minimal conversation state on TeleBotHost. Customer history must not be duplicated there.

Preferred outbound path: Django's durable reminder/campaign worker calls Telegram Bot API using the bot token server-side. TeleBotHost remains the sole receiver of Telegram updates; do not register a competing Django Telegram webhook or run getUpdates polling for the same bot. Django sending through the same token does not require taking over incoming updates.

Verify outbound Telegram connectivity from the actual deployment environment when available. If it cannot reach Telegram, report this specifically. Keep a small transport interface so a documented, authenticated TeleBotHost relay can be substituted if required; do not implement two full delivery stacks speculatively. Do not assume TeleBotHost outbound-webhook limits equal Telegram sending limits. Document plan quotas and whether ads appear; do not promise unlimited or advertisement-free hosting.

Use the existing worker/scheduler if available. Otherwise choose a modest durable Django outbox plus a management command run by a documented systemd timer/cron, with safe claiming/locking compatible with the actual database. Never use browser timers, a scheduler per web worker, long sleeps, or a memory-only job queue. Keep worker/network failures independent of booking completion.

## 3. Identity, security and preferences

Customers must start the bot before it can message their private chat. Never send based on phone number or username alone. Persist Telegram numeric user/chat IDs using a suitable integer type and check private-chat context. Usernames are display metadata only.

Link from an authenticated customer account or an authorized booking receipt/session. An entered phone number or guessable appointment ID does not authorize issuing a linking token. Use a random, short, expiring, single-use token stored hashed, compatible with Telegram's deep-link payload limit. No personal data or raw IDs in the URL. Redeem atomically through authenticated TBL-to-Django communication. Ask the person to confirm linking in the bot before consuming the token. Do not reveal booking details until linking succeeds.

Account-level linkage requires verified account ownership. For guest booking, scope linkage to that authorized booking unless customer ownership is verified through the existing authentication system. A guest token must never expose every appointment associated with a supplied phone number. Handle already-linked, conflicting-chat, expired, reused, disconnected and relinking cases explicitly; never silently transfer an account to another chat.

Authenticate service-to-service requests using a dedicated integration secret stored server-side; prefer supported HMAC with timestamp and nonce/body integrity, otherwise use a documented HTTPS bearer-secret scheme with replay/idempotency safeguards. Do not use the bot token as the integration secret. Bind action authorization to the verified Telegram actor and backend ownership, not client-supplied customer IDs. Deduplicate repeated Telegram updates/callbacks. Enforce allowlisted operations, validation, rate limits and role checks. Do not expose a generic arbitrary-message relay.

Keep separate persisted choices for appointment updates, promotions/reactivation, and optional birthday/loyalty/service-care notifications. Marketing is unchecked by default and never a condition of booking or transactional reminders. Log source/time and changes in preferences. Recheck consent immediately before sending. `/stop` stops all optional bot notifications; also provide a marketing-only opt-out that retains appointment reminders. Disconnect invalidates pending sends and link access. A blocked bot marks the connection unreachable without rewriting historical consent. Never silently resubscribe a returning user.

Collect birthday month/day and neighborhood only optionally, preferably in profile/bot settings after booking. Do not request birth year or precise location unless there is an actual need. Region segments use customer-provided/admin-verified neighborhood data; no location inference from names, phone numbers or Telegram profiles.

## 4. Booking/customer integration

After successful booking, show a compact optional «یادآوری نوبت در تلگرام» card with a clear action «اتصال به تلگرام». Explain: «اگر مایل باشید، خبر تأیید و یادآوری نوبت را در تلگرام دریافت می‌کنید.» Match wording to the actual backend booking status.

Keep booking successful even if Telegram is unavailable. Preserve multi-service selection, specialists, dates, times and price logic. Never require a new account just for a booking that currently supports guests. For an already-linked customer with valid consent, show connected status without repeating onboarding. Show marketing choice separately: «مایلم پیشنهادها و تخفیف‌های بهارناژ را هم دریافت کنم.»

Provide connect/retry/expired/pending/connected/disconnect states. Opening Telegram is not proof of linking: verify backend status on return, using bounded polling or existing event infrastructure. Stop polling on timeout/unmount. Customer settings must permit changing preferences later. If integration is unconfigured, hide the connection CTA or show an honest unavailable state without blocking booking.

Preserve context and service preselection when bot links lead back to booking. Sensitive booking details/actions require authenticated ownership or scoped expiring authorization. Campaign tracking links must not serve as account-login credentials. Cancellation/reschedule buttons should open the existing protected website flow with confirmation and its policies, rather than bypass it.

## 5. Persian bot experience

Provide /start, /help, /settings, /stop and a concise main menu:
«نوبت‌های من»، «رزرو نوبت»، «هدیه‌ها و امتیازها»، «تنظیمات پیام‌ها»، «آدرس و تماس».

Keep consistent Back/Home controls, answer callback queries promptly and use clear loading/failure responses. Avoid sending a new menu on every tap if editing the existing one is appropriate. No dead buttons. An unlinked user can browse public contact/booking links and get a secure website-linking route; do not disclose customer data. Existing linked users can see their authorized upcoming appointments and real loyalty benefits.

Use a professional, warm Persian voice consistent with Baharnaj: brief, specific and welcoming, with at most one purposeful sparkle emoji in a typical message. No exaggerated beauty promises, fake urgency, appearance shaming, or claims of rewards that have not been issued. Templates should support a small validated list of variables, escaped safely for Telegram formatting, with graceful missing-name handling and limits for text/captions/buttons. No arbitrary template code execution.

Use real business settings for address, hours, contact and Instagram. Include a map link and website booking action. Customer support should link to the actual support channel; do not imply someone is monitoring bot replies unless a response workflow exists.

## 6. Transactional and service reminders

Implement configurable events: request received, appointment confirmed, rescheduled, cancelled and upcoming reminders (default 24 hours and 3 hours before). Use Asia/Tehran for salon schedules and readable Persian dates, while persisting timezone-aware instants consistently. Consolidate multi-service appointments into one useful summary; avoid one reminder per service.

Re-read appointment state before sending. Cancel obsolete reminder jobs on cancellation/rescheduling and regenerate against the new appointment version. Skip already-past reminders for last-minute bookings; do not send a backlog of overdue messages after downtime. Distinguish acknowledgment «یادآوری را دیدم» from appointment confirmation; a tap must not change appointment business status unless explicitly supported by the existing workflow.

Service-maintenance reminders: admin-configurable interval per service/category, calculated from completed services, not merely booked dates. Provide sensible preview dates but do not invent professional maintenance intervals; rules stay disabled until configured. Suppress a reminder when a newer relevant service has been completed or an upcoming relevant appointment already exists. Include «فعلاً لازم ندارم» or snooze functionality and a preselected booking link.

Useful brand extras: one optional aftercare message after a completed service using staff-approved per-service text; one optional private feedback request, with an easy decline. Prevent repeated requests for the same visit. Do not publish feedback or treat a rating as consent to a testimonial. No medical advice generation or AI chatbot dependency.

## 7. Segmented campaigns

Provide predefined editable segment recipes and a simple structured filter UI:
- Hair-color customers: completed matching service/category within a configurable period.
- Nail customers: same, using catalog IDs rather than matching Persian strings.
- Inactive customers: previous completed visit but none in the last configurable N days (initial suggestion 90), excluding customers with an upcoming booking. Never-visited leads are separate.
- Neighborhood/region: explicit recorded area, with unknown values shown separately.
- Optional combinations: service + inactivity + area; AND/OR grouping kept simple and predictable.

Show total matches, reachable linked customers, eligible opted-in recipients and exclusion reasons before scheduling. Avoid duplicate recipients across overlapping segments. Store a recipient snapshot for audit; recheck unsubscribe, blocked status, caps and relevant eligibility before actual send. Do not include all salon customers just because they exist in the database.

Campaign workflow: draft → audience/template/button preview → explicit test-to-authorized-admin option → schedule/send confirmation → queued/running/paused/completed/cancelled. Show recipient count, local send time and offer terms on the confirmation screen. Editing already-sending content creates a new revision; pausing/cancelling stops remaining queued recipients, not messages already sent.

Support text and optionally one existing/authorized image with one booking CTA; do not build a full email-style visual editor. Example draft only: «این هفته، کراتین مو با ۲۰٪ تخفیف در بهارناژ. جزئیات و زمان‌های رزرو: [link]». Do not activate this discount by default. The actual offer must exist, have explicit dates/service eligibility and reflect backend pricing.

Default configurable promotional cap: one promotional message per customer per seven days, sharing a budget across campaigns/reactivation/promotional maintenance messages. Default marketing window: 10:00–20:00 Asia/Tehran. Show suppressions in reports. Keep appointment status updates independent; optional reminders must follow sensible quiet-hour settings without being shifted past the appointment. Do not send a promotion immediately after a complaint or declined follow-up if that suppression preference is recorded.

## 8. Birthday, points and personal offers

Birthday: optional saved month/day and calendar system. Support the site's Persian calendar correctly; define and test a non-leap-year policy for leap-day birthdays. One greeting per customer per birthday year, in the salon's time zone and allowed sending window. No year required. Add a birthday gift only when an actual configured benefit has been issued successfully; otherwise send a plain greeting. Prevent changing a date from generating repeated rewards.

Points: reuse an existing club/ledger; otherwise build a minimal immutable transaction ledger with earning, redemption, reversal, reason and audit trail. Define admin-configurable earning/expiry rules and keep earning inactive until the owner configures them. Derive rewards from eligible completed/paid business events; don't award twice on retries, and reverse according to recorded refund/cancellation policy. Never derive balances from Telegram storage or fabricate a balance. Notify consented users of real changes with a concise summary; consolidate event bursts.

Personal coupons: create real customer-bound benefits with start/end dates, eligible services, percentage/fixed value, maximum discount if relevant, usage limits and stacking rules. Validate and redeem server-side atomically against the existing pricing/payment flow. Do not create a second conflicting finance engine. For variable-price services show an estimated discount until price is finalized; persist the discount and audit at the proper financial event. A forwarded code must not give another customer the benefit. If the project only supports reservation of a coupon at booking, make later redemption explicit and idempotent.

Admin can configure birthday gift, reactivation and loyalty rules, preview their cost/terms, pause them and inspect issued/used/expired benefits. Do not activate unsolicited discounts, points earning or recurring marketing with arbitrary financial rules during migrations.

## 9. New custom admin section: «تلگرام و ارتباط با مشتری»

Build inside the existing React admin panel, not only Django admin. Match its typography, Persian RTL, light/dark tokens and responsive patterns. Use a manageable set of tabs:

1. Overview: connection/configuration readiness, linked/eligible customers, actual queued/accepted/failed/unknown counts, next jobs and worker last heartbeat.
2. Customers & segments: searchable paginated customers, service/history/region filters, consent/link state, audience previews and saved segment recipes. Exports if added must be permission-controlled and minimal.
3. Campaigns: composer, audience selection, preview, test, explicit send/schedule confirmation, pause/cancel and real results.
4. Automations & loyalty: appointment schedules, birthdays, service follow-ups, care/feedback rules, points and coupon configuration. Clear enabled/disabled state and next-run preview.
5. Templates & settings: approved Persian templates, variables, salon timezone, quiet hours, caps, bot username, masked configuration status, manager recipients and delivery diagnostics. Secrets must never be exposed in browser payloads, logs or source control; use deployment configuration for tokens.

Use useful empty states instead of fake dashboard numbers. Confirmation dialogs should summarize consequences. Provide readable statuses with text/icons and contrast in both themes. Include keyboard focus, accessible labels, touch-friendly controls, pagination and no mobile overflow. Avoid tiny charts, gradient dashboards, unnecessary nested cards or decoration-heavy layouts.

Managers: securely link their chat from their authenticated admin account, with explicit recipient selection and role checks. No admin-by-Telegram-username. Provide configurable daily appointment summary, cancellation summary/alerts, campaign completion report and delivery failure digest. Send only to selected verified admins; immediately stop on role revocation/disconnection. Define whether cancellation counts are by cancellation event date or appointment date and label them. Do not send customer marketing to manager accounts accidentally. Keep sensitive appointment information minimal and link to the protected admin panel.

## 10. Delivery reliability, reporting and attribution

Persist event/outbox and delivery records with unique business deduplication keys, recipient, template version, appointment/campaign reference, scheduled time, attempt count, retry time, Telegram message ID and sanitized error. Enqueue only after the relevant database commit. Claim jobs safely with bounded batches; avoid a database transaction spanning a network call. Recover stale claims without unbounded duplicate sending. Handle 429 retry_after, retryable network/5xx failures, blocked/deactivated chats and permanent template errors appropriately.

Use conservative configurable send rates, respect current Telegram/hosting limits and never enable paid broadcasts automatically. Campaign retries must not resend records already confirmed accepted. A network timeout after a send may have an unknown outcome because Telegram sendMessage does not provide general exactly-once delivery: record ambiguous outcomes and a conservative reconciliation/retry policy instead of promising duplicates are impossible.

Report queued, accepted by Telegram, failed, suppressed, cancelled and unknown outcomes separately. Telegram API acceptance is not a read receipt or guaranteed device delivery. Do not invent read/open rates. Explicit acknowledgment taps can be reported as acknowledgments. Track CTA redirects using opaque identifiers and first-party routes; validate destination allowlists. Label visits as link visits, not confirmed human reads. Preserve campaign attribution through booking and report attributed bookings/completed appointments; disclose the chosen configurable attribution window and avoid claiming causal revenue uplift.

## 11. Configuration, testing and handoff

Provide additive migrations and .env.example entries for enabled/dry-run mode, public backend/site URLs, bot username, outbound bot token, TBL integration secret, rate limits and scheduler settings. Keep real secrets out of the repo and frontend VITE variables. Missing token is a supported not-configured state. Add a safe mock transport/dry-run mode and a diagnostic command that does not message customers. A test-send endpoint must be restricted to authorized verified admin recipients and require an explicit action.

Deliver a /telegram/telebothost/ directory (or repo-consistent equivalent) with actual command Logic files, exact command names/matching/callback configuration, runtime settings and installation README. Include signed request/response contracts and fixtures shared with backend tests. Do not invent an import format; if the current platform only supports manual creation, provide paste-ready files and exact steps. Document adding the token in TeleBotHost and, for direct outbound delivery, securely in Django; document integration-secret setup, bot branding/menu, worker deployment, readiness checks, rollback and test-to-self activation. Existing sparkle logo can be supplied to BotFather manually; do not assume its file exists.

Tests must cover meaningful boundaries: token expiry/reuse and guest scoping; cross-customer/admin access denial; separate consent/stop; duplicated events; cancellation/rescheduling; maintenance suppression; segment intersections; marketing caps/quiet hours; birthday calendar/leap policy; duplicate coupon redemption/points awards and refunds; worker restart/claims; 429/403/unknown outcomes; placeholder escaping; missing configuration; attribution authorization. Use local fixtures/mocks—no real customer messaging or production data mutations. Verify booking still works with Telegram off and with API failures. Run relevant existing build/lint/tests and inspect new admin/booking UI on phone/desktop in both themes.

Finish with a concise list of implemented features, changed routes/files, checks actually performed, and exact remaining activation steps. Distinguish mock-tested behavior from live TeleBotHost verification. The deliverable is complete runnable code with clear configuration—not a claim that an unconfigured bot is already live. Do not claim perfection or deploy/send without authorization.
