import imghdr
import re
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import serializers

PHONE_RE = re.compile(r"^(?:\+98|0098|0)9\d{9}$")
IMAGE_TYPES = {"jpeg": ("image/jpeg", b"\xff\xd8\xff"), "png": ("image/png", b"\x89PNG\r\n\x1a\n"), "gif": ("image/gif", b"GIF8"), "webp": ("image/webp", b"RIFF")}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def validate_phone(value):
    compact = re.sub(r"[\s-]", "", value or "")
    if not PHONE_RE.fullmatch(compact):
        raise serializers.ValidationError("شماره تلفن معتبر نیست.")
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
