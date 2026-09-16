"""No DB writes or network. Exercise real login cookie response with mocked auth."""
import os
import sys
sys.path.insert(0, "/app")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.test import RequestFactory
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpResponse
from unittest.mock import Mock, patch
from salon.views import CookieTokenView

user = Mock(role='admin')
serializer = Mock(user=user, validated_data={'access': 'dummy-access', 'refresh': 'dummy-refresh'})
request = Mock(data={'username': 'isolated'}, META={})
with patch('salon.views.User.objects') as users, patch('salon.views.is_locked', return_value=False), patch('salon.views.clear_failed_logins'), patch('salon.views.get_token', return_value='dummy-csrf'):
    users.filter.return_value.first.return_value = user
    view = CookieTokenView()
    view.get_serializer = Mock(return_value=serializer)
    response = view.post(request)
    cookie = response.cookies[settings.REFRESH_COOKIE_NAME]
    assert cookie['secure'] and cookie['httponly'] and cookie['samesite'] == 'Lax'
print('PASS refresh cookie: Secure, HttpOnly, SameSite=Lax')
request = RequestFactory().get('/', secure=True)
middleware = SessionMiddleware(lambda req: HttpResponse())
middleware.process_request(request)
request.session = Mock(session_key='dummy-session', modified=True, accessed=True)
request.session.is_empty.return_value = False
request.session.get_expire_at_browser_close.return_value = True
response = middleware.process_response(request, HttpResponse())
cookie = response.cookies[settings.SESSION_COOKIE_NAME]
assert cookie['secure'] and cookie['httponly'] and cookie['samesite'] == 'Lax'
print('PASS session cookie: Secure, HttpOnly, SameSite=Lax')
assert not settings.DEBUG and not settings.TELEGRAM_ENABLED and settings.TELEGRAM_DRY_RUN and settings.TELEGRAM_FORCE_DISABLED
assert not settings.FIREBASE_SERVICE_ACCOUNT_CONFIGURED
print('PASS DEBUG off; Telegram disabled/dry-run/force-disabled; Firebase unconfigured')
