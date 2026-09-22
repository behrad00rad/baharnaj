import imghdr
import re
import base64
import binascii
import hashlib
import hmac
import secrets
import struct
from datetime import timedelta

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import serializers

PHONE_RE = re.compile(r"^(?:\+98|0098|0)9\d{9}$")
IMAGE_TYPES = {"jpeg": ("image/jpeg", b"\xff\xd8\xff"), "png": ("image/png", b"\x89PNG\r\n\x1a\n"), "gif": ("image/gif", b"GIF8"), "webp": ("image/webp", b"RIFF")}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def validate_phone(value):
    compact = normalize_phone(value)
    if not PHONE_RE.fullmatch(compact):
        raise serializers.ValidationError("شماره تلفن معتبر نیست.")
    return compact


def normalize_phone(value):
    compact = re.sub(r"[\s-]", "", value or "")
    if compact.startswith("+98"):
        compact = "0" + compact[3:]
    elif compact.startswith("0098"):
        compact = "0" + compact[4:]
    return compact


def validate_image_upload(upload):
    if upload.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("حجم تصویر نباید بیشتر از ۵ مگابایت باشد.")
    header = upload.read(16)
    upload.seek(0)
    detected = imghdr.what(None, header)
    if detected not in IMAGE_TYPES or not header.startswith(IMAGE_TYPES[detected][1]):
        raise serializers.ValidationError("نوع فایل تصویر معتبر نیست.")
    return upload


def login_key(identifier, ip):
    return f"login-failures:{identifier.lower()}:{ip or 'unknown'}"


def is_locked(user):
    return bool(user.locked_until and user.locked_until > timezone.now())


def record_failed_login(user, identifier, ip, window_seconds=900, max_attempts=5):
    key = login_key(identifier, ip)
    attempts = cache.get(key, 0) + 1
    cache.set(key, attempts, window_seconds)
    user.failed_login_attempts = attempts
    if attempts >= max_attempts:
        user.locked_until = timezone.now() + timedelta(minutes=15)
    user.save(update_fields=("failed_login_attempts", "locked_until", "updated_at") if hasattr(user, "updated_at") else ("failed_login_attempts", "locked_until"))
    return attempts


def clear_failed_logins(user, identifier, ip):
    cache.delete(login_key(identifier, ip))
    user.failed_login_attempts = 0
    user.locked_until = None
    user.save(update_fields=("failed_login_attempts", "locked_until"))


def _totp_cipher():
    key = hashlib.sha256(("baharnaj/admin-totp/v1\0" + settings.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_totp_secret(secret):
    return _totp_cipher().encrypt(secret.encode()).decode()


def decrypt_totp_secret(value):
    try:
        return _totp_cipher().decrypt(value.encode()).decode()
    except (InvalidToken, AttributeError, UnicodeDecodeError):
        return ""


def generate_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp_counter(now=None):
    now = now or timezone.now()
    return int(now.timestamp() // 30)


def valid_totp_counter(secret, code, now=None):
    normalized = re.sub(r"[\s-]", "", str(code or ""))
    if not re.fullmatch(r"\d{6}", normalized) or not secret:
        return None
    for counter in range(totp_counter(now) - 1, totp_counter(now) + 2):
        message = struct.pack(">Q", counter)
        try:
            key = base64.b32decode(secret + "=" * (-len(secret) % 8))
        except (binascii.Error, ValueError):
            return None
        digest = hmac.new(key, message, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        expected = str(((digest[offset] & 0x7F) << 24 | digest[offset + 1] << 16 | digest[offset + 2] << 8 | digest[offset + 3]) % 1_000_000).zfill(6)
        if hmac.compare_digest(expected, normalized):
            return counter
    return None


def generate_recovery_codes(count=8):
    return [f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(count)]
