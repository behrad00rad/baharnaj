"""Runtime configuration shared by web, TBL authentication and the durable worker.

Panel secrets are write-only, encrypted with a domain-separated key derived from
Django SECRET_KEY. No process-local cache: changes are visible to the next job.
"""
import base64
import hashlib
import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.views.decorators.debug import sensitive_variables
from rest_framework import serializers
from .models import IntegrationSettings, Config, Connection


def cipher():
    key = hashlib.sha256(('baharnaj/telegram/credentials/v1\0'+settings.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


@dataclass
class Runtime:
    bot_token: str = field(repr=False)
    integration_secret: str = field(repr=False)
    bot_username: str = ''
    site_url: str = ''
    backend_url: str = ''
    mode: str = 'off'
    readable: bool = True

    @property
    def enabled(self):
        return self.readable and self.mode != 'off' and not getattr(settings, 'TELEGRAM_FORCE_DISABLED', False)

    @property
    def dry_run(self):
        return self.mode != 'live'


@sensitive_variables()
def runtime(row=None):
    row = row or IntegrationSettings.objects.filter(pk=1).first()
    result = Runtime(settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_INTEGRATION_SECRET,
                     settings.TELEGRAM_BOT_USERNAME, settings.SITE_URL.rstrip('/'),
                     settings.PUBLIC_BACKEND_URL.rstrip('/'),
                     'off' if not settings.TELEGRAM_ENABLED else 'test' if settings.TELEGRAM_DRY_RUN else 'live')
    if row:
        result.mode = row.mode
        result.bot_username = row.bot_username or result.bot_username
        result.site_url = row.site_url or result.site_url
        result.backend_url = row.backend_url or result.backend_url
        try:
            if row.token_ciphertext:
                result.bot_token = cipher().decrypt(row.token_ciphertext.encode()).decode()
            if row.secret_ciphertext:
                result.integration_secret = cipher().decrypt(row.secret_ciphertext.encode()).decode()
        except (InvalidToken, ValueError):
            # A missing/rotated server key must fail closed, never silently use another bot.
            result.bot_token = result.integration_secret = ''
            result.readable = False
    return result


def public_setup():
    row = IntegrationSettings.objects.filter(pk=1).first()
    current = runtime(row)
    heartbeat = Config.solo().heartbeat
    return {'bot_username': current.bot_username, 'site_url': current.site_url,
            'backend_url': current.backend_url, 'mode': current.mode,
            'token_present': bool(current.bot_token), 'secret_present': bool(current.integration_secret),
            'credentials_readable': current.readable, 'verified_at': row.verified_at if row else None,
            'revision': row.revision if row else 0, 'heartbeat': heartbeat,
            'worker_recent': bool(heartbeat and heartbeat > timezone.now()-timezone.timedelta(minutes=5)),
            'emergency_stop': getattr(settings, 'TELEGRAM_FORCE_DISABLED', False),
            'source': 'panel' if row else 'environment'}


class SetupInput(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    token = serializers.CharField(required=False, allow_blank=True, max_length=160, write_only=True, trim_whitespace=True)
    integration_secret = serializers.CharField(required=False, allow_blank=True, max_length=200, write_only=True, trim_whitespace=True)
    bot_username = serializers.CharField(required=False, allow_blank=True, max_length=64)
    site_url = serializers.URLField(required=False, max_length=200)
    backend_url = serializers.URLField(required=False, max_length=200)
    mode = serializers.ChoiceField(choices=['off', 'test', 'live'], required=False)
    confirm_live = serializers.BooleanField(default=False)

    def validate_token(self, value):
        if value and not re.fullmatch(r'\d{5,16}:[A-Za-z0-9_-]{30,100}', value):
            raise serializers.ValidationError('توکن کامل دریافتی از BotFather را وارد کنید.')
        return value

    def validate_integration_secret(self, value):
        if value and (len(value) < 32 or not value.isascii() or any(c.isspace() for c in value)):
            raise serializers.ValidationError('رمز اتصال باید دست‌کم ۳۲ حرف یا عدد انگلیسی، بدون فاصله باشد.')
        return value

    def validate_bot_username(self, value):
        value = value.strip().removeprefix('https://t.me/').lstrip('@').rstrip('/')
        if value and (not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{4,63}', value) or not value.lower().endswith('bot')):
            raise serializers.ValidationError('نام یا پیوند ربات را وارد کنید؛ نام ربات با bot تمام می‌شود.')
        return value

    def validate(self, data):
        for key in ['site_url', 'backend_url']:
            if key in data:
                url = urlsplit(data[key])
                if url.scheme != 'https' or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
                    raise serializers.ValidationError({key: 'نشانی اصلی HTTPS را بدون مسیر اضافی وارد کنید؛ مانند https://example.com'})
                data[key] = data[key].rstrip('/')
        return data


@sensitive_variables()
@transaction.atomic
def save_setup(data):
    row = IntegrationSettings.objects.select_for_update().filter(pk=1).first()
    if data['revision'] != (row.revision if row else 0):
        raise serializers.ValidationError('تنظیمات در صفحه دیگری تغییر کرده است. صفحه را تازه کنید.')
    current = runtime(row)
    if not row:
        row = IntegrationSettings(bot_username=current.bot_username, site_url=current.site_url,
                                  backend_url=current.backend_url, mode=current.mode, revision=0)
    token_changed = bool(data.get('token') and data['token'] != current.bot_token)
    identity_changed = 'bot_username' in data and data['bot_username'] != current.bot_username
    if identity_changed and Connection.objects.filter(connected=True).exists():
        raise serializers.ValidationError('مشتریان به ربات فعلی متصل‌اند. برای تغییر ربات از مسئول راه‌اندازی کمک بگیرید.')
    for name in ['bot_username', 'site_url', 'backend_url', 'mode']:
        if name in data:
            setattr(row, name, data[name])
    for name, target in [('token', 'token_ciphertext'), ('integration_secret', 'secret_ciphertext')]:
        if data.get(name):
            setattr(row, target, cipher().encrypt(data[name].encode()).decode())
    if token_changed or identity_changed or (data.get('integration_secret') and data['integration_secret'] != current.integration_secret):
        row.verified_at = None
        row.mode = 'off'
    next_runtime = runtime(row)
    if next_runtime.integration_secret and next_runtime.integration_secret == next_runtime.bot_token:
        raise serializers.ValidationError('رمز اتصال باید با توکن ربات متفاوت باشد.')
    if row.mode != 'off' and (not next_runtime.readable or not next_runtime.bot_username or not next_runtime.integration_secret):
        raise serializers.ValidationError('ابتدا نام ربات و رمز اتصال را ذخیره کنید.')
    if row.mode == 'live':
        if not row.verified_at or not next_runtime.bot_token:
            raise serializers.ValidationError('ابتدا دکمه «بررسی توکن» را بزنید.')
        if current.mode != 'live' and not data.get('confirm_live'):
            raise serializers.ValidationError('شروع ارسال واقعی نیاز به تأیید شما دارد.')
        if not next_runtime.site_url.startswith('https://') or not next_runtime.backend_url.startswith('https://'):
            raise serializers.ValidationError('نشانی HTTPS سایت و سرور را کامل کنید.')
    row.revision += 1
    row.save()
    return row


@sensitive_variables()
def verify_saved_bot():
    row = IntegrationSettings.objects.filter(pk=1).first()
    current = runtime(row)
    if not current.bot_token:
        raise serializers.ValidationError('ابتدا توکن ربات را ذخیره کنید.')
    # Fixed destination; no customer message, webhook change or user-supplied URL fetch.
    request = Request('https://api.telegram.org/bot'+current.bot_token+'/getMe', data=b'{}', headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.load(response)
    except HTTPError:
        raise serializers.ValidationError('تلگرام توکن را نپذیرفت. توکن BotFather را دوباره بررسی کنید.') from None
    except (URLError, OSError, ValueError):
        raise serializers.ValidationError('ارتباط سرور با تلگرام برقرار نشد. کمی بعد دوباره بررسی کنید.') from None
    bot = payload.get('result', {}) if isinstance(payload, dict) else {}
    if not isinstance(bot, dict) or not payload.get('ok') or bot.get('is_bot') is not True or type(bot.get('id')) is not int or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{4,63}', bot.get('username', '')):
        raise serializers.ValidationError('پاسخ معتبر از تلگرام دریافت نشد.')
    with transaction.atomic():
        locked = IntegrationSettings.objects.select_for_update().filter(pk=1).first()
        if (locked.revision if locked else 0) != (row.revision if row else 0):
            raise serializers.ValidationError('تنظیمات تغییر کرده است. دوباره بررسی کنید.')
        if ((locked and locked.bot_id and locked.bot_id != bot['id']) or
                (current.bot_username and current.bot_username.lower() != bot['username'].lower() and Connection.objects.filter(connected=True).exists())):
            raise serializers.ValidationError('این توکن متعلق به ربات قبلی نیست. اتصال مشتریان به ربات دیگری منتقل نمی‌شود.')
        locked = locked or IntegrationSettings(mode=current.mode, site_url=current.site_url, backend_url=current.backend_url, revision=0)
        locked.bot_id, locked.bot_username, locked.verified_at = bot['id'], bot['username'], timezone.now()
        locked.revision += 1
        locked.save()
