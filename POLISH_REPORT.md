# Final polish pass — no deployment

## Typography and controls

Existing public/admin/employee CSS now uses a common theme scale: 14px captions, 15px secondary UI, 16px body/forms and 20px lead text at the normal setting. Larger fixed headings scale proportionally; responsive editorial display headings retain their composition. Rem-based values preserve browser accessibility settings. Forms and primary actions use the body size, with flexible headers, wrapping actions and scrolling modals.

The Persian text-size selector appears in the public navigation/mobile menu and both panel headers. Compact uses 93.75%, Normal 100%, Large 112.5%. `baharnaj-text-size` persists independently of `baharnaj-theme`; the document applies it before React renders. Storage failure does not prevent using the controls.

## Notification audit and changes

Already present: persistent Notification model, recipient-scoped list/count/read/read-all APIs, bell polling, FirebaseDevice with multiple registrations, Admin initialization, after-commit best-effort FCM delivery, booking/payment event hooks, background worker. The raw Web Push sender, API and dependency had already been removed; the historical PushSubscription model/migration remains deprecated, with no live delivery references.

Completed: re-registration on panel mount, window focus and hourly refresh; explicit opt-out persistence; server-first device disabling; foreground in-app alert; truthful test-notification feedback; read failures no longer falsely decrement the counter; same-origin worker click routing; background notification IDs used as tags; worker click handler installed before Firebase; appointment links open the relevant appointment; employee partial/full cancellations and guest reschedules reach admins. Existing booking dedupe and employee payment confirmation/rejection hooks remain in place. Failed FCM dispatch cannot undo the persistent notification or raise through its after-commit callback.

The backend loads `FIREBASE_SERVICE_ACCOUNT_JSON`, then `FIREBASE_SERVICE_ACCOUNT_FILE`, then application-default credentials. The known local `backend/baharnaj-firebase-adminsdk.json` is now a server-only fallback when no file override is supplied. Relative file overrides resolve against the backend directory. Firebase Admin initialization was verified with the local credential, without printing credentials or contacting recipients. Credential filenames are excluded from Git and Docker context; no secret enters React or VITE variables. Provider exception bodies are not logged by the Firebase initialization/delivery helper.

Browser handling follows Firebase's [receive-message documentation](https://firebase.google.com/docs/cloud-messaging/web/receive-messages) and [registration guidance](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

## Copy and SEO

Homepage H1 is now «زیبایی را / خودت تعریف کن.» instead of a location-stuffed heading. Shortened hero, manifesto, service intro and team copy. Removed the repetitive location suffix from service-detail H1s. Rewrote the services-page intro and About copy in natural Persian. Detailed service/article content remains available.

Retained titles/descriptions, canonical paths, salon/service/article structured data, sitemap/robots, actual contact/location information, image descriptions and service↔article↔booking links. No hidden text, doorway pages or filler SEO sections were added.

## Verification and remaining external requirements

Automated notification tests cover persistence on provider failure, per-recipient booking dedupe, multiple devices, invalid-token deactivation, read/read-all isolation, payment reports and approval/rejection, employee cancellation, guest reschedule and scoped appointment links. Frontend tests cover text-size persistence, permission gesture, foreground messages, registration refresh/opt-out, worker display and click routing.

Real FCM delivery cannot be verified until the public frontend web-app config and public VAPID key are supplied. The service account cannot substitute for those values. Configure the existing `VITE_FIREBASE_*` entries from `frontend/.env.example`, restart/build, then enable notifications from the bell and use the test action in foreground and background on an HTTPS origin (localhost is supported for development). Test with multiple real browsers and denied permission as well. No production deployment was started.

The broader existing Django suite has four baseline failures, reproduced using unchanged HEAD code: revenue response `total`, earnings `statuses` shape, profile-photo URL expectation, and dated booking availability. Business logic was left outside this polish pass.

Latest verification: frontend production build passed; 48 frontend unit/component tests passed; lint completed with existing warnings. Production-preview Playwright checks with mocked API responses cover all three text sizes × both themes × public/admin/employee at 375/768/1440 pixels, preference restoration through reload, and large-mode booking/services/blog/legal/finance/calendar pages. Screenshots of all three surfaces were inspected. The frontend source, public directory and generated build contain no PEM private-key marker, and the service-account file is untracked and ignored. No database migration is required.

Final counts: 48 frontend tests; 12 production-preview browser scenarios (plus targeted modal rerun); 14 notification tests and 12 blog/SEO tests passed. Django checks and migration drift check passed. Broader Django baseline failures remain as listed above.
