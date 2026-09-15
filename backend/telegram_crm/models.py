"""Django owns identity, consent and delivery. No Telegram profile is an identity proof."""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class Connection(models.Model):
    # Account scope and receipt scope deliberately use different unique keys.
    scope = models.CharField(max_length=80, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    appointment = models.OneToOneField('salon.Appointment', null=True, blank=True, on_delete=models.PROTECT)
    telegram_user_id = models.BigIntegerField(null=True, blank=True)
    chat_id = models.BigIntegerField(null=True, blank=True)
    username = models.CharField(max_length=64, blank=True)
    connected = models.BooleanField(default=False)
    reachable = models.BooleanField(default=True)
    appointments = models.BooleanField(default=False)
    marketing = models.BooleanField(default=False)
    birthday = models.BooleanField(default=False)
    loyalty = models.BooleanField(default=False)
    care = models.BooleanField(default=False)
    manager_reports = models.BooleanField(default=False)
    neighborhood = models.CharField(max_length=120, blank=True)
    birth_month = models.PositiveSmallIntegerField(null=True, blank=True)
    birth_day = models.PositiveSmallIntegerField(null=True, blank=True)
    birth_calendar = models.CharField(max_length=12, default='jalali')
    suppressed_until = models.DateTimeField(null=True, blank=True)
    generation = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)


class ConsentLog(models.Model):
    connection = models.ForeignKey(Connection, on_delete=models.PROTECT)
    source = models.CharField(max_length=32)
    changes = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)


class LinkToken(models.Model):
    digest = models.CharField(max_length=64, unique=True)
    connection = models.ForeignKey(Connection, on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)


class Receipt(models.Model):
    digest = models.CharField(max_length=64, unique=True)
    appointment = models.ForeignKey('salon.Appointment', on_delete=models.CASCADE)
    expires_at = models.DateTimeField()


class Incoming(models.Model):
    update_id = models.CharField(max_length=100, unique=True)
    body_digest = models.CharField(max_length=64)
    response = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class Config(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    reminder_hours = models.JSONField(default=list)
    status_events = models.JSONField(default=list)
    marketing_start = models.PositiveSmallIntegerField(default=10)
    marketing_end = models.PositiveSmallIntegerField(default=20)
    cap_days = models.PositiveSmallIntegerField(default=7)
    birthday_enabled = models.BooleanField(default=False)
    points_per_toman = models.PositiveIntegerField(default=0, help_text='One point per this many paid toman; zero disables earning')
    points_expiry_days = models.PositiveIntegerField(default=365)
    birthday_gift = models.ForeignKey('BenefitRule', null=True, blank=True, on_delete=models.SET_NULL)
    reactivation_days = models.PositiveIntegerField(default=90)
    reactivation_enabled = models.BooleanField(default=False)
    attribution_days = models.PositiveIntegerField(default=7)
    manager_daily = models.BooleanField(default=False)
    manager_cancellations = models.BooleanField(default=False)
    manager_failures = models.BooleanField(default=False)
    hours = models.CharField(max_length=200, blank=True)
    instagram_url = models.URLField(blank=True)
    map_url = models.URLField(blank=True)
    support_url = models.URLField(blank=True)
    heartbeat = models.DateTimeField(null=True, blank=True)
    worker_lease = models.DateTimeField(null=True, blank=True)

    @classmethod
    def solo(cls):
        return cls.objects.get_or_create(pk=1, defaults={'reminder_hours': [24, 3], 'status_events': ['pending', 'confirmed', 'rescheduled', 'cancelled']})[0]


class Template(models.Model):
    name = models.CharField(max_length=80, unique=True)
    text = models.TextField(max_length=3500)
    version = models.PositiveIntegerField(default=1)


class Segment(models.Model):
    name = models.CharField(max_length=100)
    filters = models.JSONField(default=dict)


class Campaign(models.Model):
    name = models.CharField(max_length=100)
    text = models.TextField(max_length=3500)
    filters = models.JSONField(default=dict)
    service = models.ForeignKey('salon.Service', null=True, blank=True, on_delete=models.PROTECT)
    offer = models.ForeignKey('BenefitRule', null=True, blank=True, on_delete=models.PROTECT)
    terms = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, default='draft')
    revision = models.PositiveIntegerField(default=1)
    scheduled_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class Delivery(models.Model):
    key = models.CharField(max_length=240, unique=True)
    connection = models.ForeignKey(Connection, on_delete=models.PROTECT)
    generation = models.PositiveIntegerField()
    kind = models.CharField(max_length=24)
    text = models.TextField()
    template_version = models.PositiveIntegerField(default=1)
    appointment = models.ForeignKey('salon.Appointment', null=True, on_delete=models.PROTECT)
    appointment_version = models.CharField(max_length=64, blank=True)
    campaign = models.ForeignKey(Campaign, null=True, on_delete=models.PROTECT, related_name='deliveries')
    metadata = models.JSONField(default=dict)
    scheduled_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True)
    status = models.CharField(max_length=16, default='queued', db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    claimed_at = models.DateTimeField(null=True)
    accepted_at = models.DateTimeField(null=True)
    message_id = models.BigIntegerField(null=True)
    error = models.CharField(max_length=120, blank=True)
    acknowledged_at = models.DateTimeField(null=True)
    tracking = models.UUIDField(default=uuid.uuid4, unique=True)
    visits = models.PositiveIntegerField(default=0)
    first_visited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['status', 'scheduled_at'])]


class ServiceRule(models.Model):
    service = models.OneToOneField('salon.Service', on_delete=models.PROTECT)
    enabled = models.BooleanField(default=False)
    interval_days = models.PositiveIntegerField(default=0)
    aftercare = models.TextField(max_length=2000, blank=True)
    feedback = models.BooleanField(default=False)


class Feedback(models.Model):
    connection = models.ForeignKey(Connection, on_delete=models.PROTECT)
    appointment = models.ForeignKey('salon.Appointment', on_delete=models.PROTECT)
    rating = models.PositiveSmallIntegerField(null=True)
    declined = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['connection', 'appointment'], name='one_private_feedback')]


class PointsEntry(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    delta = models.IntegerField()
    key = models.CharField(max_length=200, unique=True)
    reason = models.CharField(max_length=160)
    expires_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError('Ledger is append-only; write a reversal.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Ledger is append-only.')


class BenefitRule(models.Model):
    name = models.CharField(max_length=100)
    enabled = models.BooleanField(default=False)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    services = models.ManyToManyField('salon.Service')
    percent = models.PositiveSmallIntegerField(default=0)
    fixed = models.PositiveIntegerField(default=0)
    maximum = models.PositiveIntegerField(default=0)
    points_cost = models.PositiveIntegerField(default=0)
    # Single-use personal coupons; never stack. Explicitly conservative policy.


class Benefit(models.Model):
    code = models.UUIDField(default=uuid.uuid4, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    rule = models.ForeignKey(BenefitRule, on_delete=models.PROTECT)
    key = models.CharField(max_length=160, unique=True)
    terms = models.JSONField()
    reserved_for = models.OneToOneField('salon.Appointment', null=True, blank=True, on_delete=models.PROTECT)
    redeemed_at = models.DateTimeField(null=True)
    discount = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)


class Attribution(models.Model):
    appointment = models.OneToOneField('salon.Appointment', on_delete=models.PROTECT)
    delivery = models.ForeignKey(Delivery, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class AppointmentRevision(models.Model):
    appointment = models.OneToOneField('salon.Appointment', on_delete=models.CASCADE)
    fingerprint = models.CharField(max_length=64)
    revision = models.PositiveIntegerField(default=1)


class IntegrationSettings(models.Model):
    """Separate from public business configuration; credentials are encrypted at rest."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    token_ciphertext = models.TextField(blank=True)
    secret_ciphertext = models.TextField(blank=True)
    bot_username = models.CharField(max_length=64, blank=True)
    site_url = models.URLField(blank=True)
    backend_url = models.URLField(blank=True)
    mode = models.CharField(max_length=12, choices=[('off', 'Off'), ('test', 'Dry run'), ('live', 'Live')], default='off')
    bot_id = models.BigIntegerField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
