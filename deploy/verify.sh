#!/usr/bin/env bash
# Local/CI ONLY. New isolated storage each time; no live paths or secrets accepted.
set -euo pipefail
cd "$(dirname "$0")/.."
project="baharnaj-check-$(date +%s)-$$"
checks_dir=$(mktemp -d /tmp/baharnaj-check.XXXXXXXX)
export CHECKS_DIR="$checks_dir"
export RELEASE_ID="$project"
python3 - <<'PY'
import os, secrets
from pathlib import Path
p = Path(os.environ['CHECKS_DIR'])
for name in ['data', 'media']: (p / name).mkdir(mode=0o755)
(p / 'backend.env').write_text('SECRET_KEY=' + secrets.token_urlsafe(60) + '\nDEBUG=false\nEMAIL_HOST=smtp.invalid\nTELEGRAM_ENABLED=false\nTELEGRAM_DRY_RUN=true\nTELEGRAM_FORCE_DISABLED=true\n')
(p / 'backend.env').chmod(0o600)
PY
export BACKEND_ENV_FILE="$checks_dir/backend.env"
export DATABASE_DIR="$checks_dir/data"
export MEDIA_DIR="$checks_dir/media"
export PROXY_PORT=18081
prod() { docker compose -f compose.prod.yaml -p "$project" "$@"; }
# Stop containers on success/failure; retain isolated DB/media/volume for diagnosis.
trap 'prod stop >/dev/null 2>&1 || true' EXIT
prod config --quiet
prod build
docker run --rm --network none -u 0 -v "$checks_dir:/checks" "baharnaj-backend:$RELEASE_ID" python -c 'import os; [os.chown("/checks/"+name,10001,10001) for name in ["data","media"]]; os.chmod("/checks/media",0o755)'
prod run --rm --no-deps backend python manage.py migrate --noinput
prod run --rm --no-deps backend python manage.py collectstatic --noinput
prod run --rm --no-deps backend python manage.py check --deploy
# Stronger policy only in this isolated command; does not enable it on the server.
prod run --rm --no-deps -e SECURE_HSTS_INCLUDE_SUBDOMAINS=true -e SECURE_HSTS_PRELOAD=true backend python manage.py check --deploy --fail-level WARNING
for check in test_settings.py test_runtime.py; do
    docker run --rm --network none --env-file "$BACKEND_ENV_FILE" -v "$PWD/deploy:/checks:ro" "baharnaj-backend:$RELEASE_ID" python "/checks/$check"
done
prod run --rm --no-deps backend python -c 'from PIL import Image; Image.new("RGB", (1,1), "white").save("/app/media/phase0-smoke.png")'
prod up -d --wait
python3 deploy/smoke.py http://127.0.0.1:18081
prod cp frontend:/usr/share/nginx/html "$checks_dir/assets"
python3 deploy/scan_assets.py "$checks_dir/assets" "$BACKEND_ENV_FILE"
prod exec -T frontend sh -c 'test ! -d /app/src && test ! -d /app/node_modules'
printf 'Verification passed. Isolated artifacts retained at %s\n' "$checks_dir"
