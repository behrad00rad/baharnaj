"""Read-only HTTP smoke checks. Defaults target ONLY the isolated local stack.
Usage: python deploy/smoke.py [base_url] [existing_media_path]
No accounts, bookings, notifications, or login attempts are created.
"""
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:18080'
media = sys.argv[2] if len(sys.argv) > 2 else '/media/phase0-smoke.png'
passed = 0


def get(path, **headers):
    req = Request(base + path, headers={'Host': 'baharnaj.ir', 'X-Forwarded-Proto': 'https', **headers})
    try: response = urlopen(req, timeout=15)
    except HTTPError as error: response = error
    with response: return response.status, response.headers, response.read()


def check(condition, label):
    global passed
    if not condition: raise AssertionError(label)
    passed += 1
    print('PASS', label)

status, headers, body = get('/')
check(status == 200, 'built homepage')
check(b'/@vite/client' not in body and b'RefreshRuntime' not in body, 'no Vite or React Refresh in HTML')
assets = re.findall(rb'(?:src|href)="(/assets/[^" ]+)"', body)
check(bool(assets) and any(re.search(rb'-[A-Za-z0-9_-]{6,}\.', asset) for asset in assets), 'hashed assets')
for asset in assets:
    code, ah, ab = get(asset.decode())
    check(code == 200 and 'immutable' in ah.get('Cache-Control', ''), 'immutable asset ' + asset.decode())
check('no-cache' in headers.get('Cache-Control', ''), 'HTML revalidation')
for key, value in [('X-Content-Type-Options','nosniff'), ('X-Frame-Options','DENY'), ('Referrer-Policy','same-origin')]:
    check(headers.get(key) == value, key)
for path in ['/@vite/client','/@react-refresh','/@fs/etc/passwd','/src/main.jsx','/src/anything','/.env','/.git/config','/package.json','/backend/db.sqlite3','/assets/missing.js','/media/.env']:
    check(get(path)[0] == 404, 'blocked ' + path)
status, headers, body = get('/api/v1/nonexistent-phase0/')
check(status == 404 and b'DEBUG' not in body and b'urlpatterns' not in body, 'generic Django 404')
check('max-age=' in headers.get('Strict-Transport-Security',''), 'Django HSTS')
for path in ['/api/v1/services/','/api/v1/employees/','/api/v1/gallery/','/api/v1/blog/posts/','/robots.txt','/sitemap.xml','/book','/services/example','/blog/example','/admin/appointments','/employee/schedule','/django-admin/login/','/static/admin/css/base.css','/firebase-messaging-sw.js',media]:
    check(get(path)[0] == 200, path)
_, headers, _ = get('/api/v1/services/', Origin='http://localhost:5173')
check('Access-Control-Allow-Origin' not in headers, 'localhost CORS denied')
_, headers, _ = get('/api/v1/auth/csrf/')
cookie = headers.get('Set-Cookie','')
check('Secure' in cookie and 'SameSite=Lax' in cookie, 'CSRF cookie security')
print(f'{passed} smoke assertions passed')
