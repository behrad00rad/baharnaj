import hashlib
import json
from datetime import timedelta
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from salon.models import CustomerProfile
from .models import SMSCampaign, SMSDelivery, SMSAttempt, SMSSettings, SMSConsentEvent
from .audience import audience
from .phone import normalize_phone
from .providers import get_provider, ProviderUnavailable, Rejected, SendResult
from .templates import render, marketing_message, sms_size


def configuration():
    return SMSSettings.objects.get_or_create(pk=1)[0]


def provider_state():
    try:
        provider = get_provider()
        return {'configured': True, 'development': provider.development_only,
                'marketing_ready': settings.SMS_PUBLIC_BASE_URL.startswith('https://'),
                'message': 'حالت آزمایشی؛ ارسال واقعی انجام نمی‌شود.' if provider.development_only else 'آداپتور پیکربندی شده؛ اتصال با ارسال آزمایشی بررسی شود.'}
    except ProviderUnavailable as exc:
        return {'configured': False, 'development': False, 'message': str(exc)}


def context_for(source, customer, service=None, config=None):
    config = config or configuration()
    service = service or getattr(source, 'service', None)
    return {'first_name': customer.user.first_name or 'مشتری گرامی',
        'service_name': (service.persian_name or service.name) if service else '',
        'booking_link': source.booking_link or config.booking_link,
        'discount_code': source.discount_code, 'salon_name': config.salon_name}


def campaign_preview(campaign, strict=False):
    rows = audience(campaign.segment)
    entries = []
    config = configuration()
    rendered_bodies = []
    for row in rows:
        customer = row['customer']
        body = render(campaign.message, context_for(campaign, customer, config=config))
        rendered_bodies.append(body)
        message = marketing_message(body, customer, preview=not strict)
        entries.append({'customer': customer.pk, 'phone': normalize_phone(row['phone']), 'name': row['name'], 'message': message, **sms_size(message)})
    # Validate even an empty audience, without pretending there are recipients.
    if not entries:
        render(campaign.message, {'first_name': 'مشتری', 'service_name': campaign.service.name if campaign.service else '',
            'salon_name': configuration().salon_name, 'booking_link': campaign.booking_link or configuration().booking_link,
            'discount_code': campaign.discount_code})
    fingerprint = hashlib.sha256(json.dumps({'id': campaign.pk, 'message': campaign.message,
        'segment': campaign.segment, 'service': campaign.service_id, 'code': campaign.discount_code,
        'link': campaign.booking_link, 'rendered_bodies': rendered_bodies, 'config': [config.salon_name, config.booking_link, settings.SMS_PUBLIC_BASE_URL],
        'audience': [(r['id'], r['phone'], r['name']) for r in rows]}, sort_keys=True, default=str).encode()).hexdigest()
    return entries, fingerprint


@transaction.atomic
def confirm_campaign(pk, token, scheduled_at=None):
    campaign = SMSCampaign.objects.select_for_update().get(pk=pk)
    if campaign.status != 'draft':
        return campaign  # Idempotent confirmation/double click.
    get_provider()
    entries, fingerprint = campaign_preview(campaign, strict=True)
    try:
        confirmed = signing.loads(token, salt='sms-preview', max_age=900)
    except signing.BadSignature as exc:
        raise ValueError('پیش‌نمایش منقضی شده است؛ دوباره مخاطبان را بررسی کنید.') from exc
    if confirmed != fingerprint or not entries:
        raise ValueError('مخاطبان یا متن تغییر کرده‌اند یا مخاطبی وجود ندارد؛ پیش‌نمایش را دوباره بررسی کنید.')
    if scheduled_at and scheduled_at <= timezone.now():
        raise ValueError('زمان ارسال باید در آینده باشد.')
    campaign.audience_snapshot = [e['customer'] for e in entries]
    campaign.scheduled_at = scheduled_at
    campaign.status = 'scheduled' if scheduled_at else 'queued'
    campaign.save(update_fields=('audience_snapshot', 'scheduled_at', 'status'))
    SMSDelivery.objects.bulk_create([SMSDelivery(campaign=campaign, customer_id=e['customer'], phone=e['phone'],
        message=e['message'], kind='marketing', dedupe_key=f'campaign:{pk}:{e["phone"]}') for e in entries])
    return campaign


def marketing_allowed(customer, phone):
    if not customer or customer.is_deleted or not customer.user.is_active or customer.user.account_status != 'active':
        return False
    try:
        if normalize_phone(customer.user.phone) != phone:
            return False
    except ValueError:
        return False
    # A legacy duplicate profile must never bypass an opt-out on the same phone.
    for other in CustomerProfile.all_objects.select_related('user').all():
        try:
            if normalize_phone(other.user.phone) == phone and (not other.marketing_sms_allowed or other.marketing_opted_out_at):
                return False
        except ValueError:
            continue
    return True


@transaction.atomic
def set_consent(customer, allowed, actor, evidence, self_service=False):
    customer = CustomerProfile.objects.select_for_update().get(pk=customer.pk)
    if allowed and customer.marketing_opted_out_at and not self_service:
        raise ValueError('لغو دریافت توسط مشتری ثبت شده است؛ فقط خود مشتری می‌تواند دوباره عضو شود.')
    if allowed and not evidence.strip():
        raise ValueError('منبع و تاریخ رضایت مشتری را ثبت کنید.')
    customer.marketing_sms_allowed = allowed
    customer.marketing_opted_out_at = None if allowed else timezone.now()
    customer.save(update_fields=('marketing_sms_allowed', 'marketing_opted_out_at'))
    SMSConsentEvent.objects.create(customer=customer, allowed=allowed, actor=actor, evidence=evidence)
    if not allowed:
        SMSDelivery.objects.filter(customer=customer, kind='marketing', status='queued').update(status='cancelled', failure_reason='لغو دریافت پیامک تبلیغاتی')
    return customer


def deliver_batch(limit=None):
    config = configuration()
    # No claims while unconfigured; queued work remains visible and recoverable.
    provider = get_provider()
    now = timezone.now()
    SMSDelivery.objects.filter(status='sending', claimed_at__lt=now - timedelta(minutes=10)).update(
        status='unknown', failure_reason='نتیجه ارسال نامشخص است؛ پیش از ارسال دوباره با ارائه‌دهنده بررسی شود.')
    SMSAttempt.objects.filter(status='sending', delivery__status='unknown').update(status='unknown', failure_reason='پردازش ارسال قطع شد؛ نتیجه نیاز به بررسی دارد.')
    SMSCampaign.objects.filter(status='scheduled', scheduled_at__lte=now).update(status='queued')
    from django.db.models import Q
    ids = list(SMSDelivery.objects.filter(status='queued').filter(Q(campaign__isnull=True) | Q(campaign__status='queued')).order_by('created_at', 'id').values_list('pk', flat=True)[:limit or config.batch_size])
    for pk in ids:
        # Compare-and-set works with SQLite and PostgreSQL; only the winner sends.
        with transaction.atomic():
            if not SMSDelivery.objects.filter(pk=pk, status='queued').update(status='sending', claimed_at=now, provider=settings.SMS_PROVIDER):
                continue
            delivery = SMSDelivery.objects.select_related('customer__user', 'campaign', 'automation', 'appointment').get(pk=pk)
            cancelled = (delivery.campaign_id and delivery.campaign.status == 'cancelled') or (delivery.automation_id and not delivery.automation.enabled)
            cancelled = cancelled or (delivery.kind == 'marketing' and not marketing_allowed(delivery.customer, delivery.phone))
            if delivery.kind == 'transactional' and delivery.appointment_id:
                expected = ('cancelled',) if delivery.automation_id and delivery.automation.kind == 'appointment_cancelled' else ('pending', 'confirmed')
                cancelled = cancelled or delivery.appointment.status not in expected or delivery.appointment.is_deleted
            if delivery.kind == 'transactional' and delivery.automation_id and delivery.automation.kind == 'appointment_reminder' and delivery.appointment_id:
                from datetime import datetime
                # A queued reminder must still describe the current appointment slot.
                valid_slot = False
                for item in delivery.appointment.items.exclude(completion_status='cancelled'):
                    start = timezone.make_aware(datetime.combine(item.date, item.start_time))
                    key = f'rule:{delivery.automation_id}:item:{item.pk}:{start.isoformat()}'
                    if key == delivery.dedupe_key and start > timezone.now():
                        valid_slot = True
                cancelled = cancelled or not valid_slot
            elif delivery.kind == 'transactional' and delivery.automation_id and delivery.appointment_id:
                from .events import event_key
                cancelled = cancelled or delivery.dedupe_key != f'rule:{delivery.automation_id}:' + event_key(delivery.appointment, delivery.automation.kind)
            if cancelled:
                delivery.status, delivery.failure_reason = 'cancelled', 'ارسال به دلیل وضعیت نوبت، رضایت مشتری یا توقف قانون لغو شد.'
                delivery.save(update_fields=('status', 'failure_reason'))
                continue
            attempt = SMSAttempt.objects.create(delivery=delivery)
        try:
            result = provider.send(phone=delivery.phone, message=delivery.message, idempotency_key=delivery.dedupe_key)
            if not isinstance(result, SendResult) or not result.message_id:
                raise ValueError('Invalid provider result')
            # A development adapter cannot claim delivery in CRM statistics.
            delivery.status = 'cancelled' if provider.development_only else ('delivered' if result.delivered else 'sent')
            delivery.failure_reason = 'آزمایشی؛ پیامک واقعی ارسال نشده است.' if provider.development_only else ''
            delivery.provider_message_id = str(result.message_id)[:255]
            delivery.sent_at = None if provider.development_only else timezone.now()
            delivery.delivered_at = timezone.now() if result.delivered and not provider.development_only else None
        except Rejected:
            delivery.status, delivery.failure_reason = 'failed', 'ارائه‌دهنده پیام را نپذیرفت.'
        except Exception:
            # Timeout may happen AFTER acceptance. Never automatically resend.
            delivery.status, delivery.failure_reason = 'unknown', 'نتیجه ارسال نامشخص است؛ نیاز به بررسی ارائه‌دهنده دارد.'
        with transaction.atomic():
            delivery.save(update_fields=('status', 'failure_reason', 'provider_message_id', 'sent_at', 'delivered_at'))
            attempt.status, attempt.failure_reason, attempt.provider_message_id = delivery.status, delivery.failure_reason, delivery.provider_message_id
            attempt.save(update_fields=('status', 'failure_reason', 'provider_message_id'))
    return len(ids)


def campaign_report(campaign):
    from django.db.models import Count
    counts = {row['status']: row['count'] for row in campaign.deliveries.values('status').annotate(count=Count('id'))}
    total = sum(counts.values())
    accepted = counts.get('sent', 0) + counts.get('delivered', 0)
    return {'total': total, 'sent': counts.get('sent', 0), 'delivered': counts.get('delivered', 0),
        'failed': counts.get('failed', 0), 'unknown': counts.get('unknown', 0), 'cancelled': counts.get('cancelled', 0),
        'pending': counts.get('queued', 0) + counts.get('sending', 0),
        'success_rate': round(accepted * 100 / total, 1) if total else 0}
