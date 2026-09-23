"""Write-only panel credentials, encrypted at rest and never cached in-process."""
import base64
import hashlib
from dataclasses import dataclass, field

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.views.decorators.debug import sensitive_variables
from rest_framework import serializers

from .models import DEFAULT_TEMPLATES, SmsConfig, SmsProviderSettings


def cipher():
    key = hashlib.sha256(("baharnaj/sms/credentials/v1\0" + settings.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


@dataclass(repr=False)
class ProviderSettings:
    username: str = field(default="", repr=False)
    password: str = field(default="", repr=False)
    sender: str = ""
    body_ids: dict = field(default_factory=dict)
    readable: bool = True
    source: str = "environment"

    @property
    def credentials(self):
        return bool(self.readable and self.username and self.password)


@sensitive_variables()
def provider_settings(row=None):
    row = row if row is not None else SmsProviderSettings.objects.filter(pk=1).first()
    if not row:
        return ProviderSettings(
            username=settings.MELIPAYAMAK_USERNAME,
            password=settings.MELIPAYAMAK_PASSWORD,
            sender=settings.MELIPAYAMAK_SENDER,
            body_ids=dict(settings.MELIPAYAMAK_BODY_IDS),
        )
    result = ProviderSettings(sender=row.sender, body_ids=dict(row.body_ids), source="panel")
    try:
        if row.username_ciphertext:
            result.username = cipher().decrypt(row.username_ciphertext.encode()).decode()
        if row.password_ciphertext:
            result.password = cipher().decrypt(row.password_ciphertext.encode()).decode()
    except (InvalidToken, UnicodeDecodeError, ValueError):
        result.username = result.password = ""
        result.readable = False
    return result


def public_setup(row=None):
    row = row if row is not None else SmsProviderSettings.objects.filter(pk=1).first()
    current = provider_settings(row)
    return {
        "source": current.source,
        "revision": row.revision if row else 0,
        "credentials_readable": current.readable,
        "username_present": bool(current.username),
        "password_present": bool(current.password),
        "sender": current.sender,
        "body_ids_configured": [kind for kind, value in current.body_ids.items() if value],
        "updated_at": row.updated_at if row else None,
    }


class SetupInput(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    username = serializers.CharField(required=False, allow_blank=True, max_length=100, write_only=True, trim_whitespace=True)
    password = serializers.CharField(required=False, allow_blank=True, max_length=200, write_only=True, trim_whitespace=False)
    sender = serializers.CharField(required=False, allow_blank=True, max_length=32)
    body_ids = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=64), required=False)
    clear_body_ids = serializers.ListField(child=serializers.ChoiceField(choices=DEFAULT_TEMPLATES), required=False)

    def validate_username(self, value):
        if any(character.isspace() or ord(character) < 33 or ord(character) > 126 for character in value):
            raise serializers.ValidationError("نام کاربری باید با حروف انگلیسی و بدون فاصله باشد.")
        return value

    def validate_password(self, value):
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise serializers.ValidationError("گذرواژه دارای نویسه نامعتبر است.")
        return value

    def validate_sender(self, value):
        if value and (not value.isascii() or not value.isdigit() or len(value) < 3):
            raise serializers.ValidationError("شماره فرستنده باید عددی باشد.")
        return value

    def validate_body_ids(self, value):
        if any(kind not in DEFAULT_TEMPLATES or identifier and (not identifier.isascii() or not identifier.isdigit()) for kind, identifier in value.items()):
            raise serializers.ValidationError("شناسه‌های الگو باید عددی باشند.")
        return value


@sensitive_variables()
@transaction.atomic
def save_setup(data):
    row = SmsProviderSettings.objects.select_for_update().filter(pk=1).first()
    if data["revision"] != (row.revision if row else 0):
        raise serializers.ValidationError("تنظیمات تغییر کرده است. صفحه را تازه کنید.")
    before = provider_settings(row) if row else provider_settings()
    if not row:
        row = SmsProviderSettings(revision=0)
    username = data.get("username") or before.username
    password = data.get("password") or before.password
    if not username or not password:
        raise serializers.ValidationError("نام کاربری و گذرواژه را با هم وارد کنید.")
    changed = False
    if data.get("username") and data["username"] != before.username:
        row.username_ciphertext = cipher().encrypt(data["username"].encode()).decode()
        changed = True
    if data.get("password") and data["password"] != before.password:
        row.password_ciphertext = cipher().encrypt(data["password"].encode()).decode()
        changed = True
    # First panel save may preserve existing environment credentials, but moves
    # them into encrypted panel storage so subsequent reads never mix sources.
    if not row.username_ciphertext:
        row.username_ciphertext = cipher().encrypt(username.encode()).decode()
        changed = True
    if not row.password_ciphertext:
        row.password_ciphertext = cipher().encrypt(password.encode()).decode()
        changed = True
    if "sender" in data and data["sender"] != before.sender:
        row.sender = data["sender"]
        changed = True
    elif row.revision == 0:
        row.sender = before.sender
    body_ids = dict(before.body_ids)
    for kind, identifier in data.get("body_ids", {}).items():
        if identifier:
            body_ids[kind] = identifier
    for kind in data.get("clear_body_ids", []):
        body_ids.pop(kind, None)
    if body_ids != before.body_ids:
        changed = True
    row.body_ids = body_ids
    if changed:
        SmsConfig.objects.filter(pk=1).update(mode="off", last_provider_verification=None)
    row.revision += 1
    row.save()
    return row
