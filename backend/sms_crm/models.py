import re
import string

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

KINDS = ("booking_received", "booking_confirmed", "booking_rescheduled", "booking_cancelled", "appointment_reminder", "test")
ALLOWED_VARIABLES = frozenset(("first_name", "date", "time", "service_names", "manage_url", "salon_name", "salon_phone"))
DEFAULT_TEMPLATES = {
    "booking_received": "{first_name} عزیز، درخواست نوبتت برای {service_names} در بهارناژ ثبت شد. پس از بررسی سالن، وضعیت نوبت بهت اطلاع داده می‌شود.",
    "booking_confirmed": "{first_name} عزیز، نوبت {service_names} برای {date} ساعت {time} تأیید شد. مدیریت نوبت: {manage_url}",
    "booking_rescheduled": "{first_name} عزیز، زمان نوبتت تغییر کرد: {date} ساعت {time}. جزئیات: {manage_url}",
    "booking_cancelled": "{first_name} عزیز، نوبت {service_names} لغو شد. برای هماهنگی دوباره می‌توانی از سایت بهارناژ وقت بگیری.",
    "appointment_reminder": "یادآوری بهارناژ: {first_name} عزیز، نوبت {service_names} در {date} ساعت {time} است. مدیریت نوبت: {manage_url}",
}


def validate_template_text(value):
    if not value or len(value) > 700:
        raise ValidationError("متن قالب باید بین ۱ تا ۷۰۰ نویسه باشد.")
    try:
        for _, field, spec, conversion in string.Formatter().parse(value):
            if field is not None and (field not in ALLOWED_VARIABLES or spec or conversion):
                raise ValueError()
    except (ValueError, IndexError):
        raise ValidationError("متغیر قالب معتبر نیست.") from None
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
        raise ValidationError("نویسهٔ نامعتبر در قالب وجود دارد.")


class SmsConfig(models.Model):
    mode = models.CharField(max_length=8, choices=[(x, x) for x in ("off", "test", "live")], default="off")
    reminder_hours = models.JSONField(default=list)
    enabled_events = models.JSONField(default=list)
    template_selection = models.JSONField(default=dict)
    daily_limit = models.PositiveIntegerField(default=100)
    promotional_start = models.PositiveSmallIntegerField(default=9)
    promotional_end = models.PositiveSmallIntegerField(default=21)
    heartbeat = models.DateTimeField(null=True, blank=True)
    worker_lease = models.DateTimeField(null=True, blank=True)
    last_provider_verification = models.DateTimeField(null=True, blank=True)
    provider_display = models.CharField(max_length=80, blank=True)

    @classmethod
    def solo(cls):
        return cls.objects.get_or_create(pk=1, defaults={"reminder_hours": [24, 3], "enabled_events": list(DEFAULT_TEMPLATES)[:4]})[0]


class SmsProviderSettings(models.Model):
    """Panel-managed provider settings. Credentials are Fernet ciphertext only."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    username_ciphertext = models.TextField(blank=True)
    password_ciphertext = models.TextField(blank=True)
    sender = models.CharField(max_length=32, blank=True)
    body_ids = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)


class SmsPreference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sms_preference")
    appointments = models.BooleanField(default=True)
    marketing = models.BooleanField(default=False)
    birthday = models.BooleanField(default=False)
    loyalty = models.BooleanField(default=False)
    care = models.BooleanField(default=False)
    suppressed_until = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=32, default="booking")
    updated_at = models.DateTimeField(auto_now=True)


class SmsConsentLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="sms_consent_actions")
    source = models.CharField(max_length=32)
    changes = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("گزارش رضایت قابل ویرایش نیست.")
        super().save(*args, **kwargs)


class SmsTemplate(models.Model):
    kind = models.CharField(max_length=32, unique=True, choices=[(k, k) for k in DEFAULT_TEMPLATES])
    text = models.TextField(validators=[validate_template_text])
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.full_clean()
        if self.pk:
            previous = type(self).objects.get(pk=self.pk)
            if previous.text != self.text:
                self.version = previous.version + 1
        super().save(*args, **kwargs)


class SmsDelivery(models.Model):
    STATUSES = ("queued", "claimed", "simulated", "accepted", "delivered", "failed", "unknown", "cancelled", "expired")
    key = models.CharField(max_length=200, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    recipient = models.CharField(max_length=16)
    kind = models.CharField(max_length=32, choices=[(k, k) for k in KINDS])
    text = models.TextField()
    template_version = models.PositiveIntegerField(default=1)
    body_id = models.CharField(max_length=64, blank=True)
    appointment = models.ForeignKey("salon.Appointment", on_delete=models.PROTECT, null=True, blank=True, related_name="sms_deliveries")
    schedule_version = models.CharField(max_length=64, blank=True)
    scheduled_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=[(s, s) for s in STATUSES], default="queued")
    attempts = models.PositiveSmallIntegerField(default=0)
    claimed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    last_polled_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    provider_id = models.CharField(max_length=80, blank=True)
    provider_code = models.CharField(max_length=40, blank=True)
    error = models.CharField(max_length=80, blank=True)
    parts = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=("status", "scheduled_at"), name="sms_due_idx"),
            models.Index(fields=("status", "accepted_at"), name="sms_poll_idx"),
            models.Index(fields=("claimed_at",), name="sms_rate_idx"),
        ]
