# Theme and footer visual QA

Visual-only pass; no business logic, notification behavior, API, backend, SEO or routing changes.

- Fixed light text on selected lime booking cards and footer actions, low-contrast dark panel links, fixed light hover/disabled surfaces, status colors and chart tooltips.
- Paired semantic tokens now distinguish link text, filled actions, brand foregrounds, highlight cards, feedback and chart series. Light terracotta text improved from 3.89:1 to 5.06:1 against the page background; dark primary hover text measures 5.01:1. These are sampled token-pair measurements, not a claim of full WCAG certification.
- Mapped the Jalali datepicker's own variables to the app theme; corrected selected date foregrounds, overlays, native options and file controls.
- Moved text sizing from public navigation/mobile menu and panel headers to their footers. Native radio inputs provide a compact Persian pill selector with selected, hover and focus states. Typography scaling and storage contracts are unchanged.
- Footer settings wrap within mobile layouts and panel footers leave clearance for the employee bottom navigation.

Validation: 48 frontend tests passed. Twelve browser scenarios covered 17 routes in both themes at 360, 390, 430, 768, 1024 and 1366 pixels using populated API fixtures; no page-level horizontal overflow. A targeted thirteenth scenario verified visible finance tooltips, employee finance modals, appointment forms/datepickers, and all text sizes persisting after reload independently of theme. Before/after mobile and desktop screenshots plus tooltip/modal/datepicker screenshots were inspected. Frontend production build and whitespace checks passed. No deployment performed.
