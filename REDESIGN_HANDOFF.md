# Baharnaj redesign handoff

The redesign is retained in commit `60f6bc6`. Follow-up work was reviewed against `42fba99`, including the intervening Jalali date changes, «گالری» navigation label, content deletion controls and compact finance layout. Those changes are preserved. No deployment or production data changes were performed.

## Presentation and behavior

- Ivory, evergreen and petal-pink themes; smaller Persian headings, natural photo colors, consistent controls and clearer form boundaries.
- Rebuilt homepage composition: requested hero copy, three catalog entries, three gallery images, concise story, available team/articles and practical visit information. Missing photos do not create large empty hero panels.
- Accessible mobile navigation, skip link, gallery filtering/lightbox focus, and date-dialog focus restoration. Existing theme and text-size preferences are retained.
- Booking retains service preselection, multiple services, specialist selection, Jalali dates, availability and variable pricing. Pending responses are labelled as requests; confirmed responses are distinguished. Submission is guarded and recoverable errors retain entered information.
- Corrected dark-mode sidebar/toast colors and selected time-slot colors without restructuring staff workflows.

Affected public routes: `/`, `/services`, `/services/:slug`, `/gallery`, `/about`, `/team`, `/contact`, `/blog`, `/blog/:slug`, `/book`, `/login`, `/privacy`, `/terms`, and the existing not-found surface. `/booking-confirmation` continues to redirect to `/book`. Existing URLs, CMS SEO overrides, canonical/social metadata and structured-data infrastructure remain in place.

## Maintenance and content ownership

| Content or asset | Source / maintenance point |
| --- | --- |
| Theme colors | `frontend/src/styles/theme.css`: canvas/surfaces, foregrounds, paired actions, feedback and focus. `color-border` is decorative; `color-field-border` / `color-border-strong` identify controls. |
| Shared states | `frontend/src/styles/contrast.css`; page composition stays in `App.css` and `pages/Blog.css`. |
| Hero and brand story | `frontend/src/shared/brandCopy.js`; frontend-owned copy, not a CMS update. |
| Contact, location and hours label | `frontend/src/shared/siteConfig.js`; existing business details retained. |
| Services and pricing | Existing `services/` API: Persian name, descriptions, duration, pricing type/range/note, images, specialists and SEO fields. Keep substantive CMS content; review generic marketing text in the existing editor. |
| Hero and selected work | Existing `gallery/` images and captions. The first available gallery entry supplies the hero; no stock/AI salon results were introduced. |
| Team | Existing `employees/` names, specialties, bios and profile photos. Missing staff photos are omitted. |
| Articles | Existing blog API and editor, including cover images, content blocks and per-article SEO overrides. |
| Font | Self-hosted Vazirmatn v33.003 variable WOFF2 in `frontend/public/fonts/`, with its SIL OFL license; `font-display: swap`. Source: the author's `rastikerdar/vazirmatn` repository. |
| Interim identity | Accessible text wordmark in `PublicLayout.jsx` and text-initial favicon in `public/favicon.svg`. |

Editing these frontend defaults does **not** update live CMS records. No new CMS schema or competing content store was added.

## Verification

Final results against the latest commits: build passed; 55 tests in 17 unit-test files passed; 20 browser tests passed. Lint completed with 14 existing warnings in hooks/staff pages and no errors. `git diff --check` passed.

Commands: `npm --prefix frontend run build`, `npm --prefix frontend test`, `npm --prefix frontend run lint`, and `npx playwright test -c e2e/redesign.config.js`.

Browser coverage uses intercepted local test responses: 360, 390, 768, 1024 and 1440px in both themes; public routes, populated/empty/error gallery, service details and refresh/preselection, multiple-service back navigation, validation and failed-submit retry, menu/lightbox/date keyboard behavior, preference persistence, reduced motion and 200% text enlargement. Staff checks cover appointment/calendar pages, finance/earnings, tooltips, dialogs and date controls. These are frontend checks, not live integration or permission tests.

Measured normal text/action pairs meet 4.5:1 and tested control boundaries meet 3:1. Examples: primary buttons 10.55:1 light / 9.04:1 dark; field boundaries 4.02:1 / 4.96:1; pink-panel text 9.78:1. The dark sidebar active-text pair was corrected from 1.10:1 to 9.31:1. Full measurements: `/tmp/baharnaj-contrast.json`.

Screenshots (local QA artifacts):

- `/tmp/redesign-{light,dark}-1440-hero.png`
- `/tmp/redesign-{light,dark}-{390,1440}-home.png`
- `/tmp/redesign-{light,dark}-390-gallery.png`
- `/tmp/redesign-{light,dark}-{390,1440}-service.png`
- `/tmp/redesign-{light,dark}-200pct.png`
- `/tmp/theme-after-{light,dark}-{390,1440}-_book.png`
- `/tmp/theme-after-{light,dark}-{390,1440}-_admin_finance.png`
- `/tmp/theme-after-{light,dark}-{390,1440}-_employee_earnings.png`

## Remaining production inputs and limits

The referenced brand guide and final sparkle wordmark/emblem were not supplied. Replace the honest temporary text identity when approved transparent/vector assets arrive. No licensed Persian editorial display face was supplied; the layout uses Vazirmatn throughout public content.

The public site could not be inspected through the available web access, and no genuine salon photographs were available in tracked local media. Populated-media screenshots contain labelled geometric QA fixtures, not salon work. Final crops and real CMS content still need review with the actual media. Live role credentials, backend integration, real payments/notifications and production appointments were not used. The responsive checks include 200% text enlargement, not a claim of exhaustive native-browser zoom or assistive-technology certification.
