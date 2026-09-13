# Baharnaj website redesign — implementation prompt

You are working in the existing Baharnaj repository. Implement a substantial, cohesive redesign of the existing website at https://baharnaj.ir/ using the brand direction below. Do not merely recolor the current layout. Improve composition, navigation, typography, Persian content and component quality while preserving working functionality. Execute and verify the work; do not stop after presenting a plan.

## 1. Read first, then work efficiently

Read applicable AGENTS.md instructions and the attached `Baharnaj_Brand_Guide_v1.md` completely. Inspect the actual repository before assuming its architecture. The expected stack is React/Vite, JavaScript, Tailwind and Django/DRF; retain the stack and conventions actually present. Do not migrate frameworks, introduce TypeScript, upgrade unrelated dependencies, or install a new UI library for this redesign.

Inspect the running website/local application on desktop and mobile, in light and dark mode. Map public routes, layouts, theme provider, typography settings, shared components, CMS content sources, booking state and logo assets. Identify existing strengths to retain and the specific layout/copy problems to fix. If the public site is inaccessible, use the local application and state that limitation. The person writing this brief could not load the public site; this is a design specification, not a verified list of current visual defects.

Before edits, check git status and preserve unrelated work. Give a short plan of no more than six steps, then implement. Search targeted files, avoid repeatedly dumping the repository or generating lengthy planning documents. Build shared foundations once and reuse them. Ask only for a missing decision that genuinely blocks safe implementation; make reasonable design decisions otherwise.

## 2. Source of truth and latest brand decisions

Use this priority order: this prompt's explicit updates → latest supplied sparkle-logo references → brand guide → existing presentation. Existing application logic and authoritative business data must be preserved unless this brief explicitly changes them.

Brand: بهارناژ / Baharnaj, a beauty salon in Rasht with a background of approximately three decades of experience. Positioning: experienced, current, warm and approachable; accessible-premium, not intimidating luxury. Personality: professional and creative, personable with restrained playfulness. Speak to younger customers without excluding established clients.

IMPORTANT overrides to v1:

- NO leaves, sprouts, botanical ornaments or plant metaphors in the logo or UI. They made the identity feel like a tea company. Use a restrained four-point beauty sparkle suggesting shine, paired with flowing editorial lettering and a small pink dot. Do not scatter sparkle icons around the page.
- Editorial typography IS encouraged for selected headings and brand moments. Vazirmatn is for readable paragraphs and interface text, not a requirement to make every heading look like an app label.
- Preserve the evergreen/ivory/pink palette but let real beauty photography and editorial composition communicate the category. Do not turn the website into a forest-green wellness template.

The result should feel like a real, thoughtfully run salon: beautiful work, recognizable people, clear information and an easy next step. No generic AI luxury copy, artificial intimacy or decorative excess.

## 3. Scope and safety boundaries

Redesign all existing public-facing surfaces coherently: header/navbar, footer, homepage, about content/page, services overview and detail, gallery, booking, contact/location, existing blog/article pages and public authentication screens. Preserve route URLs, service slugs, deep links and SEO infrastructure. Do not create redundant pages where an existing route or section serves the purpose.

Admin/employee panels are not a structural redesign target. If shared theme tokens or primitives affect them, verify and fix resulting contrast/layout regressions; retain their compact, practical typography, role controls and workflows. Do not change payment, commission, availability, appointment, authentication or permission logic. Preserve multi-service booking and existing specialist/time selection behavior.

Do not reset databases, replace real content with demo data, mutate production CMS records, delete assets indiscriminately, change DNS/server configuration or deploy without separate authorization. Use existing configuration mechanisms for copy/assets. If CMS values override frontend defaults, explain that and provide a proposed content map; do not pretend editing fallback strings updates live CMS content. No schema migrations unless an essential blocker is explained and authorized.

## 4. Visual system: controlled, editorial and usable

Create or consolidate semantic tokens using the existing styling system. Components should consume tokens, not accumulate arbitrary hex colors or unrelated per-component dark overrides.

Brand palette: ivory `#F7F3EB`, evergreen `#173F35`, ink `#202723`, sage `#DCE5D9`, petal pink `#E8C7CB`, citrus `#D8EA85`. Ivory/neutral space dominates light mode, evergreen anchors it, pink adds small warm accents. Sage is optional support. Citrus is rare or omitted if it makes the composition busy. Do not force all colors into every screen.

Starting semantic pairs, to measure and refine in the rendered UI:

| Role | Light theme | Dark theme |
|---|---|---|
| Canvas | #F7F3EB | #111B18 |
| Surface | #FFFFFF | #192923 |
| Raised surface | #EEEAE2 | #24382F |
| Main text | #202723 | #F7F3EB |
| Secondary text | #526058 | #BDC9C1 |
| Primary button background | #173F35 | #DCE5D9 |
| Primary button text | #F7F3EB | #173F35 |
| Text link | #173F35 | #DCE5D9 |
| Soft accent surface | #E8C7CB | #E8C7CB |
| Text on soft accent | #202723 | #202723 |

These are starting tokens, not a blanket claim of accessibility. Measure actual foreground/background combinations, including opacity and hover/focus states. Target at least 4.5:1 for normal text, 3:1 for large text and 3:1 for essential control boundaries/indicators against adjacent colors. Define separate decorative-divider and interactive-border tokens: a subtle divider is not automatically an adequate input boundary. Check muted text, placeholders, filters, calendar days, selected states, badges, outlines, links and validation errors. Disabled controls must still be understandable. Never communicate state through color alone.

Dark mode is deliberately composed, not a CSS inversion: deep warm green-charcoal canvas, distinguishable surfaces, ivory text, pale high-contrast actions. Keep photographs natural and exempt images from blanket dimming/inversion. For pastel panels in either theme explicitly set dark foreground text; never inherit light text onto a pale panel. No nearly black evergreen buttons disappearing into a dark background.

Use one restrained spacing/radius/shadow system. Suggested radius family: 8px controls, 12–16px cards/dialogs, pills only for appropriate compact filters/badges. Use thin separators, whitespace and image hierarchy instead of enclosing every paragraph in a card. Keep card action alignment and image ratios consistent; allow real Persian text to wrap without fixed-height clipping.

Typography: at most two content font families, excluding logo artwork. Use an appropriate Persian-capable editorial display face only if a properly licensed local font is available. Inspect existing assets/licenses first. Do not download an unlicensed commercial font, fake a Latin serif into Persian, or add multiple external font dependencies. If no licensed display font is available, use a well-composed existing Persian family with stronger heading hierarchy and report the optional font gap. Body/UI: Vazirmatn or the suitable existing licensed family; self-host WOFF2 where feasible, limited weights, sensible fallbacks, font-display: swap.

Use fluid headings, roughly 32–40px mobile and 48–64px desktop hero, with Persian-appropriate line height. Body approximately 16–18px and 1.8 line height. Secondary text ordinarily no smaller than 14px. Respect existing user text-size settings. Do not letter-space connected Persian or justify paragraphs into awkward gaps. Editorial design comes from composition and rhythm, not giant text everywhere.

## 5. Logo, browser title and navigation

Use the latest full sparkle wordmark for suitable large placements and the matching compact sparkle emblem for small placements/favicons. Preserve spelling, aspect ratio, breathing room and dot positions. The older circular leaf icon is obsolete: do not accidentally reuse it. Do not redraw complex Persian letters as approximate SVG paths, use emoji as the logo, or pretend a raster wrapped in SVG is a vector.

Inspect supplied assets. If only concept images exist, use them honestly as temporary artwork where clean presentation is possible and report the need for final transparent/vector assets. Do not show an ivory image rectangle floating awkwardly on a dark navbar, apply CSS inversion to the pink accent, stretch the logo or shrink a bilingual lockup until unreadable. Prefer an honest accessible text fallback over a visibly broken asset. Do not invent missing asset filenames. Production logo refinement is separate from this UI implementation.

Header: restrained, readable, stable-height and responsive. Put brand at the RTL start; use existing destinations with concise labels such as «خدمات»، «نمونه‌کارها»، «دربارهٔ ما»، «تماس با ما». Keep one primary «رزرو نوبت» action and compact theme control; preserve login/account access without letting it dominate the public brand. Do not invent links to nonexistent routes. Avoid transparent text over unpredictable photos. If sticky, maintain contrast and reserve layout space without jumps.

Mobile: brand, menu and essential actions fit without crowding at 360px. Accessible menu with labelled controls, aria-expanded, keyboard support, Escape, focus management, scroll handling and closure after navigation. A mobile booking bar is optional only if it materially helps and does not duplicate visible CTAs, cover fields, collide with dialogs or ignore safe-area insets.

Theme toggle must use the existing preference system, persist correctly, respect initial system preference when no explicit choice exists, and avoid a startup flash. Provide an accessible action label. Do not build a second theme provider. Keep text-size controls in the footer if that is their current intended location.

Update title fallback to «سالن زیبایی بهارناژ در رشت | رزرو نوبت و نمونه‌کارها», while preserving deliberate per-page CMS SEO overrides. Update the site-name fallback, favicon and relevant existing manifest branding; preserve canonical URLs, JSON-LD, sitemap/robots behavior and social metadata. Route changes must update titles. Do not replace all page titles with one slogan or falsely update business facts in structured data.

## 6. Homepage and public pages

Homepage should materially improve hierarchy, not become a long stack of generic marketing sections:

1. Hero: short Persian headline beside a compelling real salon/result photograph on desktop; intentional stacked layout on mobile. No huge empty viewport, autoplay background video or carousel. Headline «زیبایی، به سلیقهٔ تو.» Supporting line «از انتخاب رنگ تا جزئیات نهایی، اول سلیقه‌ات را می‌شنویم.» Small descriptor «سالن زیبایی بهارناژ در رشت». Primary «رزرو نوبت», secondary «دیدن نمونه‌کارها». Use one restrained sparkle detail at most.
2. Services: actual catalog categories, concise descriptions and clear links, using a simple editorial list or disciplined grid. Do not repeat identical stock icons and empty copy across cards. Avoid a services mega-grid that pushes all evidence far down the page.
3. Selected work: a few strong genuine images with useful service/category labels, intentional crops and a gallery link. Prefer visible work over a carousel hiding it. No fabricated before/afters.
4. About/trust: a concise story next to a real team/salon image, not three invented statistical counters. Use the copy direction below and verified business details.
5. Team: genuine names, specialties, photographs and short factual bios when present. Preserve real specialist links and booking preselection. Never invent credentials or use stock faces as staff.
6. Existing genuine reviews if available; otherwise omit the section cleanly rather than creating filler.
7. Practical visit information and a final booking opportunity. Avoid repeating the hero sales pitch.

Combine or omit sections when real content is missing; do not pad the page. Keep an intentional rhythm between photography, open text and practical UI. About page/content should deepen the story rather than duplicate the homepage verbatim.

Service details: preserve slugs, breadcrumbs and booking preselection. Clearly present actual inclusions, duration if known, price basis/range and variables, relevant work and available specialists. Preserve variable pricing; no fake fixed prices or durations. Gallery: usable active filters in both themes, clear empty/error states, predictable image layout, keyboard-accessible lightbox if present, no hidden captions essential to understanding a result.

Booking: improve the current workflow rather than replacing its business rules. Clear progress, readable calendar/time states, preserved selections when moving back, concise validation, visible summary and price basis, and explicit server-confirmed outcome. Distinguish «درخواست نوبت» from confirmed booking when the backend does. Prevent double submission, preserve input on recoverable failure and never announce success before a successful response. Test against local/test data, not by creating a live appointment.

Footer: concise brand note, useful navigation, accurate contact/location/hours from existing authoritative settings, real Instagram link, theme/text preferences where appropriate. No huge SEO keyword paragraph. Map/external embeds should not block core content; use the existing location link or click-to-load approach if necessary.

Existing blogs/auth pages inherit the same typography, surfaces, controls and spacing. Do not leave untouched legacy pages that visually belong to a different site.

## 7. Persian content: human, specific, economical

Rewrite generic public marketing copy in natural Persian. Use correct «بهارناژ», half-spaces and punctuation consistently. Marketing can address «تو»; transactional/help text should use respectful «شما». Do not translate English marketing clichés literally. No forced Gen Z slang, pet names, appearance shaming or jokes during errors/payment/booking.

Suggested About heading: «بهارناژ؛ تجربه‌ای ریشه‌دار، نگاهی امروزی».

Suggested About paragraph: «بهارناژ در رشت، با پشتوانهٔ حدود سه دهه تجربه، نگاهی امروزی به زیبایی دارد. برای ما، هر کار از شنیدن سلیقهٔ شما شروع می‌شود؛ اینکه چه چیزی دوست دارید و در روزمره با چه سبکی راحت‌ترید.» Use this as concise brand copy, not as license to invent a founding date. Ensure service promises match actual operations. Do not imply that the current salon name has operated continuously for 30 years if that is not verified.

Useful section labels: «خدمات بهارناژ»، «از نزدیک ببین»، «با تیم بهارناژ آشنا شو»، «برای دیدنت آماده‌ایم». Use each only where it fits; clarity beats cleverness.

Conditional pricing explanation, where accurate: «هزینهٔ نهایی به قد و حجم مو و مواد انتخابی بستگی دارد؛ پیش از شروع، با شما هماهنگ می‌کنیم.»

Avoid «سفری به دنیای زیبایی»، «جایی که هنر و زیبایی به هم می‌رسند»، «تجربه‌ای بی‌نظیر و منحصربه‌فرد»، «بهترین سالن شمال»، «زیبایی بی‌نقص» and endless references to rituals, luxury or transformation. Do not add fake awards, satisfaction percentages, client counts, reviews, testimonials or medical claims. No irrelevant doctorate-as-beauty-expertise claim. Keep genuine factual details and substantive service/article information; shorter does not mean removing information needed to decide or book.

Centralize reusable UI copy appropriately. Keep CMS-owned text editable. Do not duplicate competing descriptions across files. Use actual Persian customer-facing strings for loading, empty, error and confirmation states, not English placeholders or development messages.

## 8. Components, responsiveness and performance

Audit shared Button, Link, Input, Select, Textarea, Checkbox/Radio, Tabs, Badge, Card, Dialog, Drawer, Accordion, Toast and calendar components that actually exist. Consolidate only where useful; do not build a new design-system framework. Define coherent variants/sizes and default/hover/focus/active/disabled/loading/error states. Fix styling at its source rather than layering !important overrides or broad global selectors.

Avoid nested interactive elements, clickable divs, hover-only actions, tiny icon-only targets and unexpected card click behavior. Use semantic elements, labelled fields, visible focus, associated errors, correct dialog focus restoration and touch targets around 44px. Use RTL logical spacing and bidi isolation for phone numbers/URLs. Preserve Persian calendar conventions and real currency semantics; do not globally convert API values or assume toman equals rial.

Use real existing photographs with correct alt text and object-position. Do not replace client work with AI people or pretend stock photos are salon results. Missing media should degrade gracefully. Optimize image sizing/formats through existing supported tooling; explicit dimensions prevent shifts, below-fold media lazy-loads and the hero is not accidentally lazy-loaded. Do not bulk re-encode production uploads.

Keep motion limited to useful short feedback, roughly 150–220ms, and respect reduced-motion preferences. No custom cursor, scroll hijacking, parallax, floating blobs, glowing borders, glassmorphism layers, infinite marquees or repetitive reveal animations. Content must remain visible if animation fails. Avoid new heavyweight dependencies and remotely loaded fonts/assets that make slow connections worse.

## 9. Verification and definition of done

Run existing relevant build/lint/tests; distinguish pre-existing failures from introduced failures. Add focused regression coverage for changed behavior using the existing tools. Inspect actual rendered screenshots and interactions, not just successful compilation.

Check representative public pages at 360, 390, 768, 1024 and 1440px in both themes. Include a real service detail, populated/empty gallery, booking with validation, mobile navigation, footer and an existing long-content page. Check text enlargement/200% zoom and reduced motion. Verify no horizontal overflow, cut-off Persian text, invisible actions, clipped dialogs, obstructed fields, broken images, accidental theme mismatches or excessive blank space. Inspect keyboard navigation and contrast of key text/control state pairs. Report measured contrast failures and fix them, not merely say “accessible.”

Smoke-test existing deep links and refresh behavior, service-to-booking preselection, multi-service state, gallery filters, account links, theme persistence and CMS content precedence. Verify shared styling has not broken representative admin/employee screens, especially calendars, tables, badges, forms and dialogs. Do not use real payments, notifications or production bookings as tests. If role credentials or a browser are unavailable, explicitly list the unverified areas instead of claiming success.

Work order: inspect → tokens/type/logo treatment → shared controls/header/footer → homepage and copy → remaining public pages → dual-theme responsive QA and fixes. Produce a cohesive finished implementation within this scope, not a halfway-recolored site.

Final handoff: concise summary of changes, affected routes, tests actually run, screenshot locations if available, and any missing production logo/font/content assets. Include a small implementation note explaining token roles and where future copy/assets are maintained. No unsupported claims of zero bugs, perfect SEO or completed production deployment. Do not push or deploy without explicit authorization.
