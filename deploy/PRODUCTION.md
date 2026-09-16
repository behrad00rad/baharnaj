# Phase 0 deployment and rollback

Repository preparation is not a live deployment. No usable authenticated VPS
connection was available in this workspace. The deployment directory, running
services, database location, media location, proxy, certificate, exposed ports,
secret presence and backup inventory are **unverified blockers**. Do not infer
these paths from the development Compose volume. In particular, do not point
production at a newly created empty directory. No migration files change here.

## Architecture and trust boundary

Cloudflare → existing VPS TLS proxy → **127.0.0.1:8080** → built Nginx frontend →
private Gunicorn backend (one worker) → existing SQLite and media bind mounts.
Only collected static files use a new named volume. The backend has no published
port. No Telegram worker, scheduler, Redis, PostgreSQL, or paid service is added.
The production image uses UID/GID 10001; operator must verify read/write access to
the existing database directory, its SQLite journal files, and media directory.
Nginx also needs read/traverse access to public media (directories 755, files 644,
or equivalent scoped ACLs). Verify existing permissions before rollout.
Do not recursively change ownership blindly. Back up ownership/ACLs first and
use a narrowly scoped ACL or an approved UID mapping if required.

Production Compose always forces DEBUG off, Telegram off/dry-run/force-disabled,
no Firebase credentials/project, and SQLite. Preserve existing Telegram encryption
keys in the backed-up runtime configuration; never rotate them blindly. FCM web
metadata is omitted from the Phase 0 frontend build. In-app notifications remain.
No email delivery is performed by deployment commands. SMTP is required before
startup; an absent host fails startup. An unreachable/incorrect SMTP host remains
an operator blocker, not evidence that mail works. Password-reset behavior is
unchanged. Never use the dummy smtp.invalid test configuration on the VPS.

React owns `/admin/` and its panel routes. `/django-admin/` is the Django admin
entry point; legacy `/admin/login/`, auth/model URLs are also routed to Django.
`/api/`, robots and sitemap go to Django; static and media are served read-only
by Nginx. Unknown media types download as octet-stream, with nosniff and sandbox;
common raster images retain their MIME types. Upload bodies allow 20 MiB, while
the application retains its 5 MiB per-image validation. No source mounts exist.

## Read-only inspection before authorization

On an already authenticated VPS session, run these read-only commands. Do not
paste secret-bearing `docker inspect`, `compose config`, `.env`, or proxy output
into logs. Inspect configuration privately and report variable presence only.

```bash
pwd
sudo docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
sudo ss -lntp
systemctl is-active nginx caddy apache2 cloudflared
sudo docker volume ls
```

Privately inspect the actual proxy configuration and service/Compose file,
certificate issuer/expiry, SQLite/media mounts, and backup inventory. Check the
runtime environment for the variable names below without printing their values.
Identify every writer (web, worker, timer). Determine whether the outer proxy is
Nginx, Caddy or a tunnel before editing it. The included architecture assumes an
existing host TLS proxy. If the real ingress differs, adapt and retest before
approval; never install a competing listener on 80/443.

Cloudflare must use Full (strict) with a valid origin certificate, never Flexible.
Keep its HTTPS redirect. The origin must also redirect HTTP to HTTPS and must
not expose 8000/5173/8080 externally. In the **existing HTTPS server block**, route
the application to loopback and overwrite forwarded headers (Nginx example):

```nginx
client_max_body_size 20m;
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

If Cloudflare real-IP restoration is configured, trust only its verified address
ranges; never blindly trust client X-Forwarded-For. The outer proxy must strip
client forwarded protocol headers. Internal Nginx accepts only literal `https`;
Django retains SECURE_PROXY_SSL_HEADER and SSL redirect as defense in depth.
The public outer proxy owns HTTPS for **all** paths, including static/SPA/media.
Configure HSTS there too: initially `max-age=300` on HTTPS responses only. Django
adds the same short HSTS to API responses. Verify certificates, redirects and
forwarded headers first; increase to 86400, then a longer policy after observation.
Only enable includeSubDomains/preload after every subdomain is audited. Local
smoke tests simulate the trusted TLS hop and do not prove actual HTTPS or TLS.

## Operator configuration

Copy `backend/.env.production.example` outside the checkout, with mode 600.
Provide SECRET_KEY (unique random >=50 characters), EMAIL_HOST, EMAIL_PORT,
EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS/SSL, DEFAULT_FROM_EMAIL.
An unauthenticated relay may leave user/password empty only if verified intentional.
Review ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, SITE_URL,
PUBLIC_BACKEND_URL, SECURE_SSL_REDIRECT, SECURE_HSTS_SECONDS,
SECURE_HSTS_INCLUDE_SUBDOMAINS/PRELOAD, CSRF/SESSION/REFRESH_COOKIE_SECURE,
WEB_CONCURRENCY and GUNICORN_TIMEOUT. SameSite is Lax for same-domain deployment.
Never use a development or previously exposed secret; changing SECRET_KEY logs
users out. Coordinate any real rotation separately. Frontend VITE variables are
public compiled metadata; server secrets must never use the VITE prefix.

Copy `deploy/.env.example` outside the checkout and populate RELEASE_ID (reviewed
commit), BACKEND_ENV_FILE, DATABASE_DIR (existing db.sqlite3 parent), MEDIA_DIR,
PROXY_PORT. Compose refuses missing storage directories. If the existing database
has a different filename, adapt the SQLite mount/path explicitly before approval.
Do not rename/replace the live database by guesswork.

## Backup, deployment, rollback commands

Exact live paths cannot be supplied honestly until VPS inspection. The commands
below use **interactive input**, validate existing paths, and have no unresolved
path globs. Execute only after explicit deployment authorization. Record a private
operations manifest with absolute paths named `checkout`, `database`, `media`,
`backend_env`, `compose_env`, `proxy_config`, `service_config`, `backup_directory`
(a new directory under an existing private backup parent), `previous_images`
(list of inspected running image IDs), and `additional_secret_files` (all private
Firebase, Telegram, TLS and other credential files). Include the actual service
configuration even if deployment is systemd rather than Compose. The old release
checkout must remain available; the reviewed release should be a separate checkout.

1. Enable maintenance/restricted access at the inspected existing ingress and
   stop **all** database/media writers using their inspected service names. Those
   service-specific commands remain blocked pending inspection. No customer writes
   may occur between backup and health approval. Preserve the old proxy file.
2. Run the backup (creates new files only; SQLite backup API, media/config archives,
   previous commit, image archive, non-empty checks):

```bash
read -r -p 'Existing reviewed checkout: ' RELEASE_DIR
read -r -p 'Private operations manifest file: ' OPERATIONS_MANIFEST
test -d "$RELEASE_DIR/.git" && test -s "$OPERATIONS_MANIFEST"
python3 "$RELEASE_DIR/deploy/backup.py" "$OPERATIONS_MANIFEST"
```

   Copy backups encrypted off-host and perform a restore rehearsal in a separate
   directory. Keep `.env`, certificates, encryption keys and backups out of Git.
   Do not proceed if backup or integrity checks fail.
3. Fetch/check out the exact approved commit into a **separate release directory**;
   refuse dirty state, retain old images and checkout. Run in a shell with `set -e`:

```bash
set -e
read -r -p 'New release checkout (existing clone): ' RELEASE_DIR
read -r -p 'Reviewed full commit SHA: ' REVIEWED_COMMIT
read -r -p 'Private production Compose env file: ' COMPOSE_ENV
test -d "$RELEASE_DIR/.git" && test -s "$COMPOSE_ENV"
test -z "$(git -C "$RELEASE_DIR" status --porcelain)"
git -C "$RELEASE_DIR" fetch origin
git -C "$RELEASE_DIR" cat-file -e "$REVIEWED_COMMIT^{commit}"
git -C "$RELEASE_DIR" checkout --detach "$REVIEWED_COMMIT"
cd "$RELEASE_DIR"
# RELEASE_ID in COMPOSE_ENV must equal REVIEWED_COMMIT.
prod() { docker compose --env-file "$COMPOSE_ENV" -f "$RELEASE_DIR/compose.prod.yaml" -p baharnaj-production "$@"; }
prod config --quiet
prod build
prod run --rm --no-deps backend python manage.py check --deploy
prod run --rm --no-deps backend python manage.py migrate --plan
# Only after verified backup and migration-plan review; exactly one process:
prod run --rm --no-deps backend python manage.py migrate --noinput
prod run --rm --no-deps backend python manage.py collectstatic --noinput
prod up -d --wait --force-recreate
prod ps
```

4. Apply the reviewed change to the existing outer proxy, validate its configuration
   and reload only after authorization. Exact commands depend on the unverified
   ingress. Validate loopback first, then the real HTTPS origin and Cloudflare:

```bash
read -r -p 'Existing harmless media URL path: ' MEDIA_TEST_PATH
python3 deploy/smoke.py http://127.0.0.1:8080 "$MEDIA_TEST_PATH"
python3 deploy/smoke.py https://baharnaj.ir "$MEDIA_TEST_PATH"
```

   Verify public HTTP redirects, untrusted forwarded headers cannot bypass TLS,
   backend/dev ports are closed, admin login and an operator-controlled authenticated
   session work, media and SEO URLs are correct, no localhost CORS, and outer-proxy
   HSTS is present on HTML/assets. Readiness must pass before removing maintenance.
   Check no pre-existing Telegram timers/workers remain active. No message tests.

5. Rollback: keep maintenance enabled, stop the **new** stack with `prod stop`
   (never delete volumes), restore the reviewed previous proxy configuration from
   the private archive, validate it, and start the **previous** services using their
   recorded commands/images. Load archived images if necessary:

```bash
read -r -p 'Verified backup directory: ' BACKUP_DIR
test -s "$BACKUP_DIR/previous-images.tar"
docker image load -i "$BACKUP_DIR/previous-images.tar"
```

   No migration changes belong to this patch, so restoring the application normally
   requires **no database restore**. If a reviewed migration requires a database
   rollback, stop every writer, take a second backup of current data, and restore
   the integrity-checked backup to the exact recorded database path only with a
   separately approved restore plan. Never overwrite live SQLite/WAL files while
   running. Restore media only if changed and approved; never overwrite newer uploads
   blindly. Test previous public/API/admin endpoints before lifting maintenance.
   Exact service, proxy and conditional data-restore commands remain blocked until
   actual VPS layout is inspected; they are intentionally not invented here.

References: [Django proxy security](https://docs.djangoproject.com/en/dev/topics/security/),
[Gunicorn settings](https://docs.gunicorn.org/en/stable/settings.html),
[Vite runtime requirements](https://vite.dev/guide/).
