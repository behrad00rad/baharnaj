import hashlib
import math
import string
from datetime import datetime
from zoneinfo import ZoneInfo

import jdatetime
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from salon.security import normalize_phone
from .models import DEFAULT_TEMPLATES, SmsConfig, SmsPreference, SmsTemplate, validate_template_text
from .provider_settings import provider_settings

TEHRAN = ZoneInfo("Asia/Tehran")
PATTERN_FIELDS = {
    "booking_received": ("first_name", "service_names"),
    "booking_confirmed": ("first_name", "service_names", "date", "time", "manage_url"),
    "booking_rescheduled": ("first_name", "date", "time", "manage_url"),
    "booking_cancelled": ("first_name", "service_names"),
    "appointment_reminder": ("first_name", "service_names", "date", "time", "manage_url"),
}


def pattern_values(kind, values):
    return [" ".join(str(values.get(field, "")).replace("|", " ").split())[:160] for field in PATTERN_FIELDS[kind]]


def clean_phone(value):
    phone = normalize_phone(value)
    return phone if len(phone) == 11 and phone.startswith("09") and phone.isascii() and phone.isdigit() else None


def mask_phone(value):
    return f"{value[:4]}***{value[-4:]}" if value else ""


def sms_parts(text):
    gsm = set(string.ascii_letters + string.digits + " @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!\"#¤%&'()*+,-./:;<=>?¡ÄÖÑÜ§¿äöñüà")
    single = all(char in gsm for char in text)
    length = len(text.encode("utf-16-be")) // 2 if not single else len(text)
    limit, joined = (160, 153) if single else (70, 67)
    return max(1, math.ceil(length / (limit if length <= limit else joined)))


def runtime(config=None):
    config = config or SmsConfig.solo()
    provider = provider_settings()
    enabled = settings.SMS_ENABLED and config.mode != "off" and settings.SMS_PROVIDER == "melipayamak"
    dry_run = settings.SMS_DRY_RUN or config.mode != "live"
    credentials = provider.credentials
    body_ids = {kind: value for kind, value in provider.body_ids.items() if value}
    sender = bool(provider.sender)
    configured = credentials and all(str(value).isascii() and str(value).isdigit() for value in body_ids.values()) and (sender or len(body_ids) == len(DEFAULT_TEMPLATES))
    verified = bool(config.last_provider_verification)
    return {"enabled": enabled, "dry_run": dry_run, "mode": config.mode, "credentials": credentials, "sender": sender, "body_ids": body_ids, "configured": configured, "verified": verified, "live_ready": enabled and not dry_run and configured and verified, "credentials_readable": provider.readable}


def render_template(kind, values):
    choice = SmsConfig.solo().template_selection.get(kind, "custom")
    template = SmsTemplate.objects.filter(kind=kind).first() if choice == "custom" else None
    text = template.text if template else DEFAULT_TEMPLATES[kind]
    validate_template_text(text)
    try:
        result = text.format(**{key: str(values.get(key, "")) for key in ("first_name", "date", "time", "service_names", "manage_url", "salon_name", "salon_phone")})
    except (KeyError, ValueError, IndexError):
        raise ValidationError("متغیر قالب معتبر نیست.") from None
    return result, template.version if template else 1


def appointment_snapshot(appointment):
    items = list(appointment.items.select_related("service").exclude(completion_status="cancelled").order_by("date", "start_time", "pk"))
    if not items and appointment.status == "cancelled":
        items = list(appointment.items.select_related("service").order_by("date", "start_time", "pk"))
    first = items[0] if items else None
    start = datetime.combine(first.date, first.start_time, tzinfo=TEHRAN) if first else None
    service_names = "، ".join((item.service.persian_name or item.service.name) for item in items[:3])
    if len(items) > 3:
        service_names += " و دیگر خدمات"
    user = appointment.customer.user
    values = {
        "first_name": (user.first_name or "دوست")[:40],
        "date": jdatetime.date.fromgregorian(date=first.date).strftime("%Y/%m/%d") if first else "",
        "time": first.start_time.strftime("%H:%M") if first else "",
        "service_names": service_names[:160],
        "manage_url": f"{settings.SITE_URL.rstrip('/')}/booking/manage",
        "salon_name": "بهارناژ",
        "salon_phone": "09111375136",
    }
    fingerprint = hashlib.sha256("|".join(f"{item.pk}:{item.date}:{item.start_time}:{item.completion_status}" for item in items).encode()).hexdigest()[:20]
    return start, values, fingerprint


def recipient_for(appointment, now=None):
    user = appointment.customer.user
    preference = SmsPreference.objects.filter(user=user).first()
    if preference and (not preference.appointments or preference.suppressed_until and preference.suppressed_until > (now or timezone.now())):
        return None
    return clean_phone(user.phone)
