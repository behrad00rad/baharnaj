# Phase 0 implementation and verification — 2026-09-16

Repository changes and local verification are complete. **Live Phase 0 is not
complete:** no VPS access/layout verification or deployment occurred. Original
production checkboxes remain open. `TASKS.md` was already untracked when work
started; its existing backlog was preserved, with a separate local-verification
section added. No commits or pushes were made.

## Findings and architecture

The original Dockerfiles started Django runserver and Vite dev; settings defaulted
DEBUG on, accepted the development secret, mixed development hosts with production,
reused CORS origins for CSRF, always used cross-site cookies, had no STATIC_ROOT,
and used console mail. The backend example contained obsolete Web Push private
key material. Docker ignore coverage was incomplete. Public-site findings in the
request were not re-probed against live production.

Result: existing Cloudflare/TLS ingress → loopback Nginx serving only built Vite
assets and read-only static/media → internal non-root Gunicorn (one configurable
worker) → existing SQLite/media bind mounts. Development remains separate.
Production configuration rejects bad secrets, hosts and origins; requires SMTP;
sets secure same-domain cookies and proxy security; forces Telegram disabled,
dry-run, emergency-disabled; excludes Firebase credentials and worker services.
See [operator configuration and rollout](PRODUCTION.md) for all required variable
names and exact parameterized commands. No actual VPS paths have been invented.

## Results

| Verification | Result |
|---|---|
| Backend production image | Built successfully, Python 3.12.1, Gunicorn 23.0.0 |
| Frontend production image | Built successfully, Node 22.13.0 build, Nginx runtime |
| Development and production Compose | Both validate; missing production inputs correctly rejected |
| Django system check | 0 issues |
| Migration drift | No changes detected |
| Fresh isolated SQLite migrations | All applied successfully |
| Collected static assets | 157 files; admin CSS served successfully |
| Backend suite | **120 passed, 3 failed/error out of 123** |
| Frontend suite | **63 passed, 1 failed out of 64**; 18/19 files passed |
| Frontend lint | **0 errors, 13 warnings** |
| Frontend production build | Passed |
| Production settings regression tests | **12/12 passed** |
| Cookie/runtime checks | **3/3 passed**, real cookie-producing code with mocked authentication/session persistence |
| HTTP smoke | **39/39 assertions passed** |
| Extra encoded/private-path probes | **4/4 passed** |
| Built asset scan | **14 files passed**; no source maps, private-key/token patterns or dummy runtime secrets |
| Runtime source/node_modules absence | Passed |
| Nginx configuration test | Passed |
| Repeatable `deploy/verify.sh` | Passed end to end with fresh isolated storage |
| `git diff --check`, shell syntax, Python compilation | Passed |
| Live HTTPS, Cloudflare, SMTP delivery, existing data/backup validation | **Not performed; operator blockers** |

The 39 HTTP assertions cover built hashes, no Vite/Refresh, immutable assets,
HTML revalidation, security headers, blocked development/secret paths, generic
Django 404, API HSTS, services/employees/gallery/blog, robots/sitemap, direct public,
admin and employee SPA paths, Django admin login/CSS, Firebase worker path, media,
localhost CORS denial, and Secure/SameSite CSRF cookie. Refresh and session cookies
are separately verified as Secure/HttpOnly/SameSite=Lax. API catalog fixtures are
empty isolated data; these checks do not prove real salon data or authenticated
business workflows. No customer account/login/booking/message was created.

Initial production `check --deploy` exits successfully with exactly:

- `security.W005`: includeSubDomains is intentionally false until all subdomains
  are audited for HTTPS.
- `security.W021`: preload is intentionally false until domain-wide review.

These are **HSTS rollout decisions, not proxy-owned exemptions or silenced checks**.
HSTS starts at 300 seconds; outer TLS ingress must supply the same policy on
static/SPA/media. A separate isolated invocation with includeSubDomains/preload
true produces **0 issues**, without enabling either on the production example or
claiming the real domain is ready. SSL redirect, console-email and secret warnings
are resolved. Live TLS/proxy validation is still required before rollout.

Known baseline failures reproduced (no business code modified):

- Backend revenue response test: missing `total` field.
- Backend employee earnings test: list versus mapping `statuses` contract.
- Backend booking availability test: fixed-date expected 10:00 slot missing.
- Frontend calendar test: date-sensitive assertion.
- Existing frontend lint and React act warnings remain.

The requested PostgreSQL migration repair and python-dotenv advisory are left for
Phase 1; PostgreSQL tests were not run and SQLite was not replaced.

Transient verification issues were corrected, not hidden: host frontend tools were
missing, so checks ran in the pinned Node container; Django 6.1 rejected mixed
MAILERS/legacy settings, corrected to MAILERS-only; Python 3.13 lacked existing
imghdr, so the repository's 3.12.1 pin was retained; standalone checks initially
used unwritable /app SQLite and were rerun with /tmp paths; full suite initially
lacked its external Telegram JSON fixture and had force-disable conflicting with
mocked activation tests, corrected with a read-only fixture mount and normal test
settings under `--network none`; initial local media fixture lacked Nginx traverse
permission, corrected only on /tmp test media. Final results are above.

This workspace also had legacy iptables FORWARD DROP despite Docker's nft rules.
Temporary rules limited to each isolated test bridge allowed smoke verification;
both exact rules were removed afterward. No VPS firewall was changed. Test stacks
were stopped; databases/media/volumes were retained, not deleted.

## Files changed and purpose

| Files | Purpose |
|---|---|
| `backend/config/settings.py` | Fail-closed production secret/hosts/origins, separate CSRF, HTTPS/HSTS/cookies, SMTP MAILERS, static/media paths |
| `backend/config/urls.py` | Add unambiguous Django admin entry while retaining legacy admin namespace |
| `backend/requirements.txt` | Pin Gunicorn |
| `backend/Dockerfile` | Separate development/production targets; non-root Gunicorn and readiness |
| `backend/gunicorn.conf.py`, `backend/healthcheck.py` | Conservative configurable worker/timeout and read-only catalog health check |
| `frontend/Dockerfile` | Pinned Node/npm ci/build stages and dist-only Nginx runtime |
| `frontend/nginx.conf`, `frontend/proxy_params_baharnaj` | SPA/API/SEO/admin/static/media routing, source blocking, caching, headers, trusted protocol forwarding |
| `compose.yaml` | Preserve explicit development targets and DEBUG |
| `compose.prod.yaml` | Standalone loopback-only production stack, required existing mounts, restart policies and disabled messaging |
| `backend/.env.example` | Remove obsolete Web Push key variables, separate development CSRF origin |
| `backend/.env.production.example`, `deploy/.env.example` | Safe runtime and deployment-variable templates |
| `frontend/.env.example` | Clarify public Firebase metadata versus private Admin credentials |
| `.gitignore`, `.dockerignore`, `backend/.dockerignore`, `frontend/.dockerignore` | Exclude secrets, credentials, certificates, SQLite/media, environments and backups |
| `.github/workflows/ci.yml` | Keep business tests in development settings; add independent production safety build/smoke job |
| `deploy/test_settings.py`, `deploy/test_runtime.py` | Regression checks for startup rejection, cookie flags and disabled integrations |
| `deploy/smoke.py`, `deploy/scan_assets.py`, `deploy/verify.sh` | Repeatable isolated production verification and secret-safe asset scanning |
| `deploy/backup.py` | Non-destructive SQLite backup API, integrity check, media/config/image archives, non-empty verification |
| `deploy/PRODUCTION.md`, `deploy/VERIFICATION.md` | Deployment/rollback handoff and honest verification record |
| `README.md`, `SECURITY.md` | Link production workflow and describe security boundary/rotation guidance |
| `TASKS.md` | Preserve backlog; record verified local items without checking live production items |

## Commands executed

Read-only inspection included `git status --short`, `find .. -name AGENTS.md`,
`cat`/`sed` on the requested source/configuration files (environment values and SSH
note were suppressed), `git ls-files`, `docker info`, `docker compose version`,
`docker ps`, image/network inspection, `nginx -t`, and secret-safe Python scans.
`rg` was unavailable; find/grep were used. No applicable AGENTS.md was found.

The local dummy environment was generated with Python `secrets.token_urlsafe(60)`
into mode-600 `/tmp/baharnaj-phase0/backend.env`; no secret value was printed.
Compose inputs selected `/tmp/baharnaj-phase0/data`, `/tmp/baharnaj-phase0/media`,
release `phase0-local`, project `baharnaj-phase0`, and loopback port 18080.
The fresh reusable harness independently generated another isolated directory.

Main verification commands (output redirected to `/tmp/baharnaj-phase0/*.log`):

```bash
docker compose config --quiet
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 config --quiet
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 build
docker build --target dependencies -t baharnaj-frontend-check:phase0-local frontend
docker run --rm --network none baharnaj-frontend-check:phase0-local npm test
docker run --rm --network none baharnaj-frontend-check:phase0-local npm run lint
docker run --rm --network none baharnaj-frontend-check:phase0-local npm run build
docker run --rm --network none -e DEBUG=true -e SQLITE_PATH=/tmp/check.sqlite3 -e TELEGRAM_FORCE_DISABLED=true baharnaj-backend:phase0-local python manage.py check
docker run --rm --network none -e DEBUG=true -e SQLITE_PATH=/tmp/check.sqlite3 -e TELEGRAM_FORCE_DISABLED=true baharnaj-backend:phase0-local python manage.py makemigrations --check --dry-run
docker run --rm --network none -v /workspaces/baharnaj/telegram/telebothost/contract.json:/telegram/telebothost/contract.json:ro -e DEBUG=true -e SQLITE_PATH=/tmp/check.sqlite3 baharnaj-backend:phase0-local python manage.py test
docker run --rm --network none --env-file /tmp/baharnaj-phase0/backend.env -e SQLITE_PATH=/tmp/check.sqlite3 baharnaj-backend:phase0-local python manage.py check --deploy
docker run --rm --network none --env-file /tmp/baharnaj-phase0/backend.env -e SQLITE_PATH=/tmp/check.sqlite3 -e SECURE_HSTS_INCLUDE_SUBDOMAINS=true -e SECURE_HSTS_PRELOAD=true baharnaj-backend:phase0-local python manage.py check --deploy
docker run --rm --network none --env-file /tmp/baharnaj-phase0/backend.env -v /workspaces/baharnaj/deploy:/checks:ro baharnaj-backend:phase0-local python /checks/test_settings.py
docker run --rm --network none --env-file /tmp/baharnaj-phase0/backend.env -v /workspaces/baharnaj/deploy:/checks:ro baharnaj-backend:phase0-local python /checks/test_runtime.py
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 run --rm --no-deps backend python manage.py migrate --noinput
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 run --rm --no-deps backend python manage.py collectstatic --noinput
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 up -d --wait
python deploy/smoke.py
python deploy/scan_assets.py /tmp/baharnaj-phase0/assets /tmp/baharnaj-phase0/backend.env
bash deploy/verify.sh
docker compose --env-file /tmp/baharnaj-phase0/compose.env -f compose.prod.yaml -p baharnaj-phase0 stop
bash -n deploy/verify.sh
python -m py_compile deploy/backup.py deploy/smoke.py deploy/test_settings.py deploy/test_runtime.py deploy/scan_assets.py
git diff --check
```

Local-only support actions: container `python` created a 1×1 PNG under isolated
media and set its directory/file permissions to 755/644; `docker compose cp`
extracted built assets for scanning. A failed first build/config attempt omitted
required Compose inputs and correctly failed. Image rebuilds followed settings
and Python compatibility corrections. Full business suites ran with networking
blocked; production smoke requests were read-only.

## Secret review and remaining handoff

Tracked text scanning found historical `WEB_PUSH_VAPID_PRIVATE_KEY` material in
`backend/.env.example`; the current example has no WEB_PUSH variables. Retire or
rotate that key if ever used; review Git history/remediation separately, without
blindly rewriting it. Credential-shaped URLs in CI and a Telegram test are test
fixtures, not newly found production credentials. Pattern scanning is not proof
that no historical secret exists. The tracked `.venv-broken` is excluded from
images; repository cleanup belongs to a separate change. No actual .env, private
key, service-account JSON or certificate was added to Git.

Operator blockers: authenticated read-only VPS inspection; actual deployment and
storage paths; current proxy/service/certificate/port inventory; verified backup
and restore rehearsal; UID/media ACL review; real SMTP configuration; Cloudflare
Full (strict), forwarded-header and HTTPS verification; HSTS subdomain review;
explicit live deployment approval. Exact live service stop/reload/rollback/data
restore commands cannot be adapted until that inventory exists. The runbook
provides validated interactive commands and a backup tool without pretending
unknown paths are inspected. Its backup utility was syntax-checked but has not
been exercised against real production backups.

**No live deployment/restart, DNS/Cloudflare change, database/media deletion,
credential rotation, customer message, Git commit/push/merge, or Telegram
activation occurred.** Only disposable test databases were initialized/migrated;
no existing database/media was overwritten and no Docker volume was deleted.
