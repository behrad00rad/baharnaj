"""Non-destructive offline backup. Run only after maintenance and writer shutdown.
Reads an operator-created JSON manifest; prints no secret contents.
"""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile

os.umask(0o077)
manifest = json.loads(Path(sys.argv[1]).read_text())
required = ['checkout', 'database', 'media', 'backend_env', 'compose_env', 'proxy_config', 'service_config', 'backup_directory']
for key in required:
    value = Path(manifest[key])
    if not value.is_absolute() or '..' in value.parts:
        raise SystemExit(f'{key}: require verified absolute path')
    if key != 'backup_directory' and not value.exists():
        raise SystemExit(f'{key}: missing; refusing backup')
destination = Path(manifest['backup_directory'])
destination.mkdir(mode=0o700, parents=False, exist_ok=False)
source = Path(manifest['database'])
if not source.is_file() or not source.stat().st_size:
    raise SystemExit('Existing database must be a non-empty file')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
    with sqlite3.connect(destination / 'database.sqlite3') as backup:
        db.backup(backup)
        if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Database integrity check failed')
with tarfile.open(destination / 'media.tar.gz', 'w:gz') as archive:
    archive.add(manifest['media'], arcname='media')
with tarfile.open(destination / 'configuration.tar.gz', 'w:gz') as archive:
    for key in ['backend_env','compose_env','proxy_config','service_config']:
        archive.add(manifest[key], arcname=key)
    # Include private Firebase/Telegram/certificate files explicitly in the manifest.
    for index, value in enumerate(manifest.get('additional_secret_files', [])):
        path = Path(value)
        if not path.is_absolute() or not path.is_file():
            raise SystemExit('Additional secret path invalid')
        archive.add(path, arcname=f'additional-secret-{index}')
commit = subprocess.check_output(['git','-C',manifest['checkout'],'rev-parse','HEAD'], text=True).strip()
(destination / 'previous-commit.txt').write_text(commit + '\n')
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
images = manifest.get('previous_images', [])
if not images: raise SystemExit('previous_images must list inspected running image IDs/tags')
subprocess.run(['docker','image','save','-o',str(destination / 'previous-images.tar'),*images], check=True)
for path in destination.iterdir():
    if not path.is_file() or not path.stat().st_size: raise SystemExit('Empty backup artifact')
print('Backup completed; database integrity and non-empty artifacts verified. Store an encrypted off-host copy.')
