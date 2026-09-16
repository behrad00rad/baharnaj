# Baharnaj master task list

This is the ordered backlog for taking Baharnaj from its current public development deployment to a safe, usable salon system. Complete phases in order. Telegram stays disabled until the core system is stable.

## Phase 0 — Emergency production safety

- [ ] Put the public site behind a temporary maintenance page or restricted access while production is unsafe.
- [ ] Set production `DEBUG=False` and verify Django debug pages are no longer public.
- [ ] Replace any development/default `SECRET_KEY`; rotate it if it may have been used publicly.
- [ ] Audit and rotate production credentials, tokens, Firebase credentials, database passwords, and integration secrets as necessary.
- [ ] Restrict `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` to real production origins.
- [ ] Confirm `http://localhost:5173` is not accepted as a credentialed origin in production.
- [ ] Stop exposing the Vite development server, React Refresh, `/@vite/client`, and `/src/*`.
- [ ] Build the frontend with `npm run build` and serve only the generated static assets.
- [ ] Replace Django `runserver` with a production application server such as Gunicorn or Uvicorn.
- [ ] Configure Nginx or Caddy for the frontend, API, media, SPA fallback, sitemap, and robots routes.
- [ ] Keep HTTP-to-HTTPS redirection and configure HSTS carefully after HTTPS is confirmed everywhere.
- [ ] Add secure production settings for cookies, proxy headers, static files, and error pages.
- [ ] Remove the obsolete `WEB_PUSH_*` key material from `backend/.env.example`; rotate it if it was ever used.
- [ ] Run `python manage.py check --deploy` with production-like environment variables until it passes.

**Repository/local verification (2026-09-16; live items above remain unverified):**

- [x] Add separate production Compose, Gunicorn, built Nginx frontend, and persistent-storage safeguards; both images build.
- [x] Verify fail-closed settings (12 tests), secure refresh/session cookies, and disabled messaging configuration locally.
- [x] Verify 39 isolated HTTP smoke assertions, plus 4 encoded/private-path checks and built-asset secret scanning.
- [x] Remove obsolete Web Push variables from the working-tree example (historical key rotation remains pending).
- [x] Prepare backup/deployment/rollback runbook and repeatable CI production-safety checks.
- [ ] Inspect VPS paths, proxy/TLS, backups and SMTP; authorize deployment separately and verify public behavior.
- [ ] Complete HSTS subdomain/preload review; initial policy intentionally retains security.W005/W021.

See [verification and blockers](deploy/VERIFICATION.md) and [operator runbook](deploy/PRODUCTION.md).

**Done when:** public HTML contains built asset hashes rather than Vite development scripts; source files and Django debug pages are inaccessible; production deployment checks pass.

## Phase 1 — Repair CI and database migrations

- [ ] Reproduce the GitHub Actions PostgreSQL migration failure locally or in an isolated CI database.
- [ ] Fix all migrations so a completely fresh PostgreSQL database migrates successfully.
- [ ] Test forward migration, rollback where supported, and re-application.
- [ ] Verify the appointment overlap guarantee on PostgreSQL using a database-native constraint or equivalent safe locking strategy.
- [ ] Decide whether any database contains pre-migration data from before migration `0010`.
- [ ] If old data exists, create and test a data migration for legacy appointments, services, employees, schedules, and financial records.
- [ ] Reconcile the admin revenue API contract with its outdated test (`total` response mismatch).
- [ ] Reconcile the employee earnings status response contract with its outdated test (list versus mapping).
- [ ] Replace fixed/past dates in availability tests with deterministic future/frozen dates.
- [ ] Fix the date-sensitive frontend calendar test so it does not depend on the current real date.
- [ ] Clean the React test `act(...)` warnings and unused-variable lint warnings.
- [ ] Upgrade `python-dotenv` from `1.2.1` to a non-vulnerable version (`1.2.2` or later compatible version).
- [ ] Run backend tests on both SQLite and PostgreSQL.
- [ ] Run frontend unit tests, lint, and production build.
- [ ] Make the GitHub Actions backend, frontend, and E2E jobs all pass.

**Done when:** the latest `main` commit has a fully green CI run, including migrations and E2E.

## Phase 2 — Production database, storage, and operations

- [ ] Confirm which database the live site currently uses.
- [ ] Move production to PostgreSQL if it still uses SQLite.
- [ ] Create an encrypted automatic database-backup schedule.
- [ ] Perform and document a real restore test from a backup.
- [ ] Move uploaded media to reliable object storage or a properly backed-up persistent volume.
- [ ] Define private/public media rules; use signed access for private files if introduced.
- [ ] Add image/file malware scanning or a safe upload-processing policy.
- [ ] Add application error monitoring and structured server logs without customer secrets.
- [ ] Add uptime monitoring and backend health/readiness endpoints.
- [ ] Add disk, database, certificate-expiry, backup-failure, and worker-failure alerts.
- [ ] Document deployment, migration, rollback, backup, and emergency-disable procedures.
- [ ] Separate development, staging, and production configuration and data.

**Done when:** a failed deployment or server loss can be detected, rolled back, and restored without losing salon data.

## Phase 3 — Remove demo data and prepare real salon content

- [ ] Remove gibberish/test service descriptions, SEO values, categories, articles, tags, biographies, and prices from production.
- [ ] Enter the final Persian name, short description, full description, duration, pricing type, price/range/note, and images for every service.
- [ ] Enter every specialist's real Persian name, specialty, biography, services, photo, and active status.
- [ ] Verify actual working hours, holidays, time off, and Islamic mourning-day closure handling.
- [ ] Add enough real gallery work for each important service category.
- [ ] Review image crops, sizes, compression, alt text, and ownership/consent.
- [ ] Finalize homepage, About, contact, location, phone numbers, Instagram, policies, and booking instructions.
- [ ] Finalize privacy, cancellation, rescheduling, deposit/payment, refund, and no-show policies.
- [ ] Replace the temporary text identity/favicon with an approved logo and brand assets.
- [ ] Review the mother-daughter/30-year brand story with Bahar and the salon manager.
- [ ] Publish a small set of useful real articles; remove all test articles.
- [ ] Review every service and article SEO title, description, slug, internal links, and structured data.
- [ ] Add and verify the real Google Search Console token; submit and inspect the sitemap.

**Done when:** nothing customer-visible looks like a test, placeholder, internal note, or unfinished identity.

## Phase 4 — Core booking and salon acceptance testing

- [ ] Create a staging environment with realistic but non-sensitive sample data.
- [ ] Test guest multi-service booking from start to confirmation.
- [ ] Test simultaneous booking attempts and confirm overlapping appointments cannot be created.
- [ ] Test booking holds, expiration, retry, duplicate submission, and weak/interrupted internet.
- [ ] Test fixed, starting-from, range, consultation, and variable pricing.
- [ ] Test final-price approval before completion/payment for variable services.
- [ ] Test admin and employee appointment creation.
- [ ] Test customer lookup, confirmation code, cancellation, and rescheduling.
- [ ] Test waitlist registration and decide whether slot-opening notifications will actually be automated.
- [ ] Test staff working schedules, exceptions, leave requests, and approvals.
- [ ] Test partial completion/cancellation in a multi-service appointment.
- [ ] Test cash/card/manual payment reports, confirmation, rejection, partial payment, refund, and payment locking.
- [ ] Test employee commissions after settlement and after refunds/cancellations.
- [ ] Confirm all finance dashboard numbers come from real records and reconcile against hand calculations.
- [ ] Confirm payment can only be recorded once where the workflow requires it.
- [ ] Confirm employee ownership and admin-only actions on every sensitive endpoint.
- [ ] Test upload limits, invalid files, profile photos, service images, gallery images, and blog media.
- [ ] Test public, admin, and employee flows on real Android/iPhone-sized devices and desktop browsers.
- [ ] Test RTL, light/dark themes, all text sizes, keyboard behavior, and 200% zoom with real API data.
- [ ] Test the system under slow, intermittent, and temporarily unavailable internet conditions.

**Done when:** the salon manager and at least one employee can complete a full fake working day in staging without developer intervention.

## Phase 5 — Customer confirmations and account decision

- [ ] Configure a production email provider; the current console backend does not send mail.
- [ ] Replace password-reset token payloads with a branded HTTPS reset link.
- [ ] Choose and integrate an Iranian SMS provider if SMS confirmations are required.
- [ ] Send or display a reliable booking receipt containing the confirmation code and management link.
- [ ] Define templates for received, confirmed, rescheduled, cancelled, reminder, and follow-up events.
- [ ] Decide whether customer accounts are part of the first launch.
- [ ] Until a dashboard exists, either remove the `create account` option or clearly explain its limited purpose.
- [ ] If customer accounts launch, implement the dashboard scope below.

**Done when:** a customer can always recover or find their booking and receives truthful status information.

## Phase 6 — Customer dashboard MVP

### Authentication and profile

- [ ] Create customer-specific login routing; customer accounts must never be sent to the admin panel.
- [ ] Support login with phone plus password initially; consider OTP only after choosing a dependable Iranian provider.
- [ ] Add password reset and logout.
- [ ] Show/edit name, phone, birthday, neighborhood, and profile preferences.
- [ ] Require verification before changing the primary phone number.
- [ ] Add account deletion/request flow and clear privacy wording.

### Appointments

- [ ] Show the next appointment first, with services, specialists, date/time, status, price state, and payment state.
- [ ] Show appointment history with completed/cancelled status.
- [ ] Allow reschedule/cancel only when salon policy and appointment state permit it.
- [ ] Require confirmation before cancellation and show any deadline or fee clearly.
- [ ] Provide a direct `book again` action that preselects previous services/specialists.
- [ ] Provide the booking confirmation/management code and a shareable receipt view.
- [ ] Show a clear contact-salon action when self-service changes are no longer allowed.

### Notifications and preferences

- [ ] Show persistent in-app customer notifications.
- [ ] Let customers separately control operational reminders and promotional consent.
- [ ] Let customers manage Firebase push, email, SMS, and later Telegram preferences without dark patterns.
- [ ] Record consent time, source, and changes for auditing.

### Payments and loyalty

- [ ] Show payment history and refunds without exposing internal employee/commission data.
- [ ] Do not add online payment until a reliable Iranian gateway and reconciliation process are selected.
- [ ] Show loyalty points/coupons only after the salon approves the commercial rules and the logic is tested.
- [ ] Show coupon terms, expiry, eligible services, reservation, use, and reversal truthfully.

### Customer experience

- [ ] Use a mobile-first Persian interface with one simple dashboard home screen.
- [ ] Avoid exposing internal statuses or technical terminology.
- [ ] Add empty, loading, offline, expired-session, and error states.
- [ ] Add tests proving customers can access only their own profile, appointments, payments, coupons, and notifications.

**MVP recommendation:** launch only profile + upcoming appointment + history + cancel/reschedule + notification preferences. Add loyalty and online payment later.

## Phase 7 — Admin and employee workflow verification

- [ ] Verify employee profile photos render consistently across public and internal panels.
- [ ] Verify specialist biographies appear on the intended public cards and booking step.
- [ ] Verify employees can reach the public homepage and log out easily.
- [ ] Verify employee schedule/profile sections do not duplicate conflicting controls.
- [ ] Verify employees can create appointments only for themselves and report only allowed payments.
- [ ] Verify admin calendar defaults to today and works correctly across Jalali month/week boundaries.
- [ ] Verify admin filters, search, pagination, drawers, dialogs, and deletion confirmations with large datasets.
- [ ] Verify daily/weekly/monthly finance charts and employee filters against backend totals.
- [ ] Verify refunds, immutable financial history, commission snapshots, and audit logs.
- [ ] Verify gallery category creation/selection and safe deletion/archive behavior.
- [ ] Verify blog drafts, scheduling, publishing, revisions, media, categories, tags, and SEO fields.
- [ ] Add consistent success/error messages for every save, delete, upload, status, and financial action.
- [ ] Resolve remaining React effect/lint warnings that could hide stale UI behavior.

**Done when:** the two panels can be used by non-technical salon staff without needing explanations from the developer.

## Phase 8 — Firebase notifications

- [ ] Create/configure the production Firebase web application.
- [ ] Configure all required `VITE_FIREBASE_*` values and public VAPID key in the production build.
- [ ] Mount Firebase Admin credentials securely on the backend; never include them in frontend variables or the repository.
- [ ] Test opt-in, opt-out, token refresh, multiple devices, invalid tokens, denied permission, and logout cleanup.
- [ ] Test foreground, background, closed-browser, notification click-through, and duplicate suppression.
- [ ] Confirm persistent in-app notifications remain correct when FCM delivery fails.
- [ ] Decide which events go to admins, employees, and later customers.
- [ ] Add monitoring for provider failures without logging tokens or secret payloads.

**Done when:** real devices receive the correct notification and failures never corrupt booking/payment operations.

## Phase 9 — Security and privacy hardening

- [ ] Add consistent login-success/failure history logging through middleware or authentication hooks.
- [ ] Review account lockout and throttling behind the production proxy/client-IP configuration.
- [ ] Review every DRF endpoint against the permission matrix with automated tests.
- [ ] Add customer object-ownership tests before releasing the customer dashboard.
- [ ] Review refresh-token rotation, logout invalidation, CSRF, cookie domain, SameSite, and secure settings in production.
- [ ] Add a Content Security Policy and review other browser security headers.
- [ ] Prevent sensitive values and personal data from entering logs, analytics, URLs, or error pages.
- [ ] Define data retention, export, correction, and deletion procedures.
- [ ] Review admin/employee account creation, deactivation, password policy, and lost-device response.
- [ ] Make dependency audits run even if an earlier CI test fails, so security results are still reported.
- [ ] Perform a final secrets scan, dependency audit, authorization review, and basic penetration test.

**Done when:** production configuration and authorization have been reviewed independently of UI behavior.

## Phase 10 — Real end-to-end release

- [ ] Add CI service orchestration so E2E tests exercise a real Django/PostgreSQL backend instead of only mocked API responses.
- [ ] Cover guest booking, customer management, admin confirmation, employee completion, payment, refund, and commission in E2E.
- [ ] Add deployment smoke tests for `/`, public APIs, direct SPA routes, media, sitemap, robots, admin login, and health endpoints.
- [ ] Prepare a production seed/import plan for services, staff, schedules, and content without demo records.
- [ ] Perform a staging release rehearsal including database migration, rollback, backup, and restore.
- [ ] Obtain sign-off from the salon manager on content, prices, policies, schedules, and workflows.
- [ ] Deploy during a low-risk window and monitor logs, bookings, and errors closely.
- [ ] Keep a documented manual booking fallback for internet/server outages.

**Done when:** one real controlled booking can move safely through the entire workflow and the salon has a fallback plan.

## Phase 11 — Telegram, after the core release

- [ ] Keep `TELEGRAM_ENABLED=false`, dry-run enabled, and campaigns unscheduled until prior phases are stable.
- [ ] Review Telegram commercial rules, consent, templates, loyalty, birthday, maintenance, and discount policies with the salon.
- [ ] Configure the real bot token, username, integration secret, HTTPS origins, and encryption-key backup.
- [ ] Install and verify the TeleBotHost logic.
- [ ] Install exactly one production worker/timer and monitor its heartbeat.
- [ ] Link only the manager first and run diagnostics.
- [ ] Test account linking, `/stop`, disconnect, consent separation, reminders, cancellations, and manager reports.
- [ ] Send a dry-run and then a live test only to the manager.
- [ ] Rerun the Telegram Playwright suite in a stable browser environment.
- [ ] Gradually enable operational reminders before any promotional campaign.
- [ ] Do not enable loyalty, coupons, birthdays, or bulk campaigns until their policies and costs are approved.

**Done when:** manager-only live tests are reliable, delivery reporting is truthful, and no customer can be messaged without recorded consent.

## Phase 12 — Post-launch and productization

- [ ] Track booking completion, cancellation, no-show, repeat visit, service demand, and source attribution without fake revenue claims.
- [ ] Collect structured feedback from the manager, employees, and customers for several weeks.
- [ ] Fix operational friction before adding more marketing automation.
- [ ] Create a privacy-safe analytics/reporting plan.
- [ ] Decide which features are truly reusable across other salons or clinics.
- [ ] Only after Baharnaj is stable, design multi-tenant isolation, per-business branding, plans, billing, onboarding, support, and data export.
- [ ] Validate the product with several real businesses before investing in a general all-industry SaaS.

## Current verified status (2026-09-16)

- Public domain responds, but serves the Vite development application and Django debug output.
- Public production content contains test/demo text and records.
- Frontend production build succeeds.
- Local frontend suite: 63 passed, 1 date-sensitive calendar test failed.
- Local backend suite: 120 passed, 3 outdated/date-sensitive tests failed.
- Latest GitHub Actions run: backend failed during PostgreSQL migration; frontend failed its calendar test; E2E was skipped.
- npm production audit reported no known vulnerabilities.
- Python audit found `PYSEC-2026-2270` in `python-dotenv==1.2.1`.
- Telegram code is extensive but live TeleBotHost/bot/worker operation is not verified.
