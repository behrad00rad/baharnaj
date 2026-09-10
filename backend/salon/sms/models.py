from django.db import models


class SMSCampaign(models.Model):
    name = models.CharField(max_length=160)
    message = models.TextField(max_length=2000)
    segment = models.JSONField(default=dict)
    service = models.ForeignKey('salon.Service', null=True, blank=True, on_delete=models.PROTECT)
    discount_code = models.CharField(max_length=80, blank=True)
    booking_link = models.URLField(blank=True)
    status = models.CharField(max_length=20, default='draft', choices=[(s, s) for s in ('draft', 'scheduled', 'queued', 'completed', 'cancelled')])
    created_by = models.ForeignKey('salon.User', on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    audience_snapshot = models.JSONField(default=list, blank=True)


class SMSAutomation(models.Model):
    KINDS = ('birthday', 'service_reminder', 'inactive', 'appointment_reminder',
             'appointment_created', 'appointment_confirmed', 'appointment_changed', 'appointment_cancelled')
    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=30, choices=[(s, s) for s in KINDS])
    enabled = models.BooleanField(default=False)
    message = models.TextField(max_length=2000)
    interval_days = models.PositiveIntegerField(default=30)
    hours_before = models.PositiveIntegerField(default=24)
    service = models.ForeignKey('salon.Service', null=True, blank=True, on_delete=models.PROTECT)
    category = models.ForeignKey('salon.ServiceCategory', null=True, blank=True, on_delete=models.PROTECT)
    segment = models.JSONField(default=dict, blank=True)
    booking_link = models.URLField(blank=True)
    discount_code = models.CharField(max_length=80, blank=True)
    last_run = models.DateTimeField(null=True, blank=True)


class SMSSettings(models.Model):
    # Single row, created on first admin/worker access. Secrets live in the environment.
    salon_name = models.CharField(max_length=100, default='بهارناژ')
    booking_link = models.URLField(blank=True)
    manager_phone = models.CharField(max_length=20, blank=True)
    daily_summary_enabled = models.BooleanField(default=False)
    daily_summary_hour = models.PositiveSmallIntegerField(default=21)
    campaign_summary_enabled = models.BooleanField(default=False)
    failure_alert_enabled = models.BooleanField(default=False)
    batch_size = models.PositiveSmallIntegerField(default=50)
    last_worker_at = models.DateTimeField(null=True, blank=True)


class SMSDelivery(models.Model):
    STATUSES = ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'unknown')
    campaign = models.ForeignKey(SMSCampaign, null=True, blank=True, on_delete=models.PROTECT, related_name='deliveries')
    automation = models.ForeignKey(SMSAutomation, null=True, blank=True, on_delete=models.PROTECT)
    customer = models.ForeignKey('salon.CustomerProfile', null=True, blank=True, on_delete=models.PROTECT, related_name='sms_history')
    appointment = models.ForeignKey('salon.Appointment', null=True, blank=True, on_delete=models.PROTECT)
    phone = models.CharField(max_length=20)
    message = models.TextField()
    kind = models.CharField(max_length=20, choices=[(s, s) for s in ('marketing', 'transactional', 'management', 'test')])
    status = models.CharField(max_length=20, default='queued', choices=[(s, s) for s in STATUSES])
    dedupe_key = models.CharField(max_length=255, unique=True)
    provider = models.CharField(max_length=255, blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [models.Index(fields=('status', 'created_at'), name='sms_queue_idx')]


class SMSAttempt(models.Model):
    delivery = models.ForeignKey(SMSDelivery, on_delete=models.PROTECT, related_name='attempts')
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default='sending')
    provider_message_id = models.CharField(max_length=255, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)


class SMSConsentEvent(models.Model):
    customer = models.ForeignKey('salon.CustomerProfile', on_delete=models.PROTECT, related_name='sms_consent_events')
    allowed = models.BooleanField()
    evidence = models.CharField(max_length=500)
    actor = models.ForeignKey('salon.User', null=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
