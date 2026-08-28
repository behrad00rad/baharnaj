# Security Hardening

This change prepares the backend for admin and employee UI work under the PR title **Auth: unify roles, harden token handling, lock down permissions**.

## Changes

- `User.role` is the authorization source of truth with `customer`, `employee`, and `admin` values. `User.save()` derives `is_staff` from `role`; callers must not set staff independently.
- JWTs include `role`. Refresh tokens are issued only in the `baharnaj_refresh` HTTP-only cookie. Access tokens stay in frontend memory and are never written to localStorage.
- Refresh rotation, secure/SameSite cookie settings, credentialed CORS, and CSRF token/header handling are configured. Origins come from `CORS_ALLOWED_ORIGINS`; production must set that variable explicitly.
- DRF defaults to `IsAuthenticated`, with explicit `AllowAny` only on catalog, availability, guest booking, login, CSRF bootstrap, and password reset request/confirm endpoints.
- Login and guest booking use scoped DRF throttles. Login also locks an account after five failed attempts in 15 minutes for 15 minutes.
- Password reset request and confirm endpoints use Django's time-limited password reset token and email delivery.
- Employee appointment-item and profile endpoints use reusable ownership permissions. Financial write viewsets are admin-only.
- Admin appointment status changes and employee edits are recorded in `AdminActionLog`; appointment status changes also append status history.
- Gallery, service-image, and profile-photo uploads validate size and image magic bytes, with a 5 MiB limit.

## Remaining Gaps

- File storage is still local. Production should use private object storage, malware scanning, and signed URLs before storing user uploads.
- Login history is modeled, but request middleware/event logging should be added to record every successful and failed login consistently.
- Password-reset email contains a token payload for now; the frontend should replace it with a branded, HTTPS reset link before production.
- SQLite is suitable for local development. Production should use PostgreSQL and a database-native exclusion constraint for appointment range overlap.
