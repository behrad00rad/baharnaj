"""Scan built assets without printing matching values. Public Firebase IDs allowed."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
patterns = [rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', rb'"private_key"\s*:', rb'ghp_[A-Za-z0-9]{20,}', rb'github_pat_[A-Za-z0-9_]{20,}']
if len(sys.argv) > 2:
    for line in Path(sys.argv[2]).read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and value and key in {'SECRET_KEY','EMAIL_HOST_PASSWORD','TELEGRAM_BOT_TOKEN','TELEGRAM_INTEGRATION_SECRET'}:
            patterns.append(re.escape(value.encode()))
files = [path for path in root.rglob('*') if path.is_file()]
assert files, 'No built assets found'
failures = []
for path in files:
    data = path.read_bytes()
    if path.suffix == '.map' or any(re.search(pattern, data) for pattern in patterns):
        failures.append(str(path.relative_to(root)))
if failures:
    raise SystemExit('Suspected secret/source map; values suppressed: ' + ', '.join(failures))
print(f'PASS {len(files)} built files: no source maps, private-key/token patterns, or supplied runtime secrets')
