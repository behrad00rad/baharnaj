# Admin and employee usability update

The internal panels now share a short Persian introduction and an expandable three-step guide tailored to each section. Telegram retains its existing dedicated help. Guides use native keyboard-accessible disclosures, reset on route changes, and do not add requests or dependencies.

Changes:
- Admin: guidance for overview, appointments, employees, services, customers, finance, gallery and blog.
- Employee: guidance for today, new appointments, calendar, earnings, availability and profile.
- Financial review comes before secondary reports; three main figures stay visible. Other figures, charts and ledger summaries remain available in labeled disclosures.
- Appointment status history and optional service/blog search-engine fields are expandable. Essential pricing, payment and publication controls remain available.
- Shared theme colors, larger controls, visible keyboard focus and responsive schedule/filter layouts.
- Clear per-day schedule save labels and success messages. Invalid active time ranges are rejected locally. Saving one day preserves unsaved edits to other days and prevents concurrent saves.
- Removed the unused employee Calendar implementation; the routed CalendarWorkspace is preserved.

Validation:
- 64 frontend tests pass, including existing payment/appointment tests and a new schedule regression test.
- Production build succeeds.
- Browser checks cover seven admin and five employee pages at 390px and 1366px in light and dark themes, checking guidance, horizontal overflow and JavaScript errors. API responses are mocked; these checks do not demonstrate live server transactions.
- No production deployment, customer messaging, or business-data changes were performed.

The earlier Telegram implementation is committed as dd07b18. Its push was blocked by automatic approval review pending explicit confirmation of the configured GitHub destination. This UI update is currently in the working tree.
