from datetime import timedelta, datetime
from django.conf import settings
from .integration import runtime
from django.db.models import Q, F
from django.utils import timezone
from salon.models import AppointmentItem
from .models import Config, Delivery, Campaign, Connection, ServiceRule, Benefit
from .services import TEHRAN, configured, fingerprint, audience, enqueue
from .automation import reconcile, relevant_service_exists
from .transport import TelegramTransport, MockTransport

PROMOTIONAL = ('campaign', 'reactivation', 'maintenance')


def eligibility(d, now):
    c = d.connection
    if not c.connected or not c.reachable or c.generation != d.generation or not c.user.is_active or c.user.account_status != 'active':
        return 'connection_unavailable'
    if d.expires_at and d.expires_at <= now:
        return 'expired'
    pref = {'status': 'appointments', 'reminder': 'appointments', 'campaign': 'marketing', 'reactivation': 'marketing', 'maintenance': 'care', 'care': 'care', 'feedback': 'care', 'birthday': 'birthday', 'loyalty': 'loyalty', 'manager': 'manager_reports', 'test': 'manager_reports'}.get(d.kind)
    if not pref or not getattr(c, pref):
        return 'no_consent'
    if d.kind in ('manager', 'test'):
        if c.user.role != 'admin' or c.appointment_id:
            return 'role_revoked'
    elif c.user.role != 'customer':
        return 'wrong_role'
    if d.appointment and (d.appointment.customer.user_id != c.user_id or c.appointment_id and c.appointment_id != d.appointment_id):
        return 'ownership_changed'
    if d.kind in PROMOTIONAL and c.appointment_id:
        return 'account_scope_required'
    if d.appointment and d.kind in ('reminder', 'status'):
        if d.appointment.is_deleted or fingerprint(d.appointment) != d.appointment_version:
            return 'obsolete_version'
        if d.kind == 'reminder' and d.appointment.status not in ('pending', 'confirmed'):
            return 'appointment_inactive'
    if d.kind == 'feedback':
        if d.appointment and d.appointment.status != 'completed':
            return 'visit_not_completed'
    config = Config.solo()
    if d.kind == 'status' and d.metadata.get('event', d.metadata.get('status')) not in config.status_events:
        return 'automation_disabled'
    if d.kind == 'feedback' and not ServiceRule.objects.filter(enabled=True, feedback=True, service__appointment_items__appointment=d.appointment).exists():
        return 'automation_disabled'
    if d.kind == 'care':
        if not ServiceRule.objects.filter(enabled=True, service_id=d.metadata.get('service')).exclude(aftercare='').exists():
            return 'automation_disabled'
        if not AppointmentItem.objects.filter(pk=d.metadata.get('item'), completion_status='completed').exists():
            return 'visit_not_completed'
    if d.kind == 'birthday' and not config.birthday_enabled:
        return 'automation_disabled'
    if d.kind == 'maintenance':
        if not ServiceRule.objects.filter(service_id=d.metadata.get('service'), enabled=True, interval_days__gt=0).exists():
            return 'automation_disabled'
        item = AppointmentItem.objects.filter(pk=d.metadata.get('item')).first()
        if not item or item.completion_status != 'completed' or relevant_service_exists(c, item):
            return 'newer_or_upcoming_service'
        if not c.marketing:
            return 'no_marketing_consent'
    if d.kind in PROMOTIONAL:
        if c.suppressed_until and c.suppressed_until > now:
            return 'followup_suppression'
        if Delivery.objects.filter(connection__user=c.user, kind__in=PROMOTIONAL, status__in=['accepted', 'unknown']).filter(Q(accepted_at__gt=now-timedelta(days=config.cap_days)) | Q(status='unknown', claimed_at__gt=now-timedelta(days=config.cap_days))).exclude(pk=d.pk).exists():
            return 'promotional_cap'
    if d.campaign_id:
        if d.campaign.status in ('paused', 'draft'):
            return 'pause'
        if d.campaign.status == 'cancelled':
            return 'campaign_cancelled'
        if d.campaign.offer_id:
            benefit = Benefit.objects.filter(pk=d.metadata.get('benefit_id'), user=c.user).select_related('rule').first()
            if not benefit or not benefit.rule.enabled or not datetime.fromisoformat(benefit.terms['starts_at']) <= now < datetime.fromisoformat(benefit.terms['ends_at']):
                return 'offer_inactive'
        _, recipients = audience(d.campaign.filters, only_user=c.user_id)
        if c.pk not in {r.pk for r in recipients}:
            return 'audience_changed'
    if d.kind == 'reactivation':
        _, recipients = audience({'inactive_days': config.reactivation_days}, only_user=c.user_id)
        if not config.reactivation_enabled or c.pk not in {r.pk for r in recipients}:
            return 'audience_changed'
    if d.kind not in ('status', 'test'):
        local = timezone.localtime(now, TEHRAN)
        if not config.marketing_start <= local.hour < config.marketing_end:
            return 'quiet_hours'
    return None


def keyboard(d):
    base = runtime().site_url.rstrip('/')
    url = base + ('/admin/telegram' if d.kind in ('manager', 'test') else '/book')
    if d.campaign_id:
        url = runtime().backend_url.rstrip('/') + f'/api/v1/telegram/visit/{d.tracking}/'
    elif d.metadata.get('service'):
        url += f'?service={d.metadata["service"]}'
    rows = [[{'text': 'پنل مدیریت' if d.kind in ('manager', 'test') else 'رزرو نوبت', 'url': url}]]
    if d.kind in ('reminder', 'status'):
        rows.append([{'text': 'پیگیری، لغو و تغییر نوبت', 'url': base+'/booking/manage'}])
    if d.kind == 'reminder':
        rows.append([{'text': 'یادآوری را دیدم', 'callback_data': f'ack:{d.pk}'}])
    if d.kind == 'maintenance':
        rows.append([{'text': 'فعلاً لازم ندارم', 'callback_data': f'decline:{d.pk}'}, {'text': 'هفته بعد', 'callback_data': f'snooze:{d.pk}'}])
    if d.kind == 'feedback':
        rows.append([{'text': str(n), 'callback_data': f'rate:{d.pk}:{n}'} for n in range(1, 6)])
        rows.append([{'text': 'مایل به پاسخ نیستم', 'callback_data': f'decline:{d.pk}'}])
    if d.kind in PROMOTIONAL:
        rows.append([{'text': 'لغو پیام‌های تبلیغاتی', 'callback_data': 'marketing_off'}])
    return rows


def run_batch(transport=None, generate=True):
    supplied_transport = transport is not None
    initial_mode = runtime().mode
    config = Config.solo()
    now = timezone.now()
    lease_until = now+timedelta(minutes=15)
    # SQLite-safe compare-and-swap singleton lease. Network calls never hold DB locks.
    if not Config.objects.filter(pk=1).filter(Q(worker_lease=None) | Q(worker_lease__lt=now)).update(worker_lease=lease_until, heartbeat=now):
        return {'busy': True}
    try:
        if generate:
            reconcile()
        Delivery.objects.filter(status='sending', claimed_at__lt=now-timedelta(minutes=15)).update(status='unknown', error='stale_claim_outcome_unknown')
        if transport is None:
            if not configured():
                return {'configured': False}
            if not runtime().dry_run and not runtime().bot_token:
                return {'configured': False}
            transport = MockTransport() if runtime().dry_run else TelegramTransport()
        sent = 0
        budget = min(50, settings.TELEGRAM_BATCH_SIZE, max(0, settings.TELEGRAM_MAX_PER_MINUTE-Delivery.objects.filter(claimed_at__gte=now-timedelta(minutes=1)).count()))
        ids = list(Delivery.objects.filter(status='queued', scheduled_at__lte=now).order_by('scheduled_at', 'pk').values_list('pk', flat=True)[:max(0, budget)])
        for pk in ids:
            if not supplied_transport and (not runtime().enabled or runtime().mode != initial_mode):
                break
            if not Config.objects.filter(pk=1, worker_lease=lease_until, worker_lease__gt=timezone.now()).exists():
                break
            d = Delivery.objects.select_related('connection__user', 'appointment', 'campaign').get(pk=pk)
            reason = eligibility(d, timezone.now())
            if reason == 'pause':
                continue
            if reason == 'quiet_hours':
                local = timezone.localtime(timezone.now(), TEHRAN)
                next_time = local.replace(hour=config.marketing_start, minute=0, second=0, microsecond=0)
                if next_time <= local:
                    next_time += timedelta(days=1)
                if d.expires_at and next_time >= d.expires_at:
                    Delivery.objects.filter(pk=pk, status='queued').update(status='suppressed', error='quiet_hours_expired')
                else:
                    Delivery.objects.filter(pk=pk, status='queued').update(scheduled_at=next_time)
                continue
            if reason:
                Delivery.objects.filter(pk=pk, status='queued').update(status='suppressed', error=reason)
                continue
            if Delivery.objects.filter(connection__chat_id=d.connection.chat_id, claimed_at__gte=timezone.now()-timedelta(minutes=1)).exclude(pk=pk).exists():
                Delivery.objects.filter(pk=pk, status='queued').update(scheduled_at=timezone.now()+timedelta(minutes=1))
                continue
            if not Delivery.objects.filter(pk=pk, status='queued').update(status='sending', claimed_at=timezone.now(), attempts=F('attempts')+1):
                continue
            # Refresh after claim; opt-outs/role changes during queue wait take effect.
            d.refresh_from_db()
            reason = eligibility(d, timezone.now())
            if reason:
                Delivery.objects.filter(pk=pk, status='sending').update(status='suppressed', error=reason)
                continue
            try:
                result = transport.send(d.connection.chat_id, d.text, keyboard(d))
            except Exception:
                result = {'status': 'unknown', 'error': 'transport_outcome_unknown'}
            status = result['status']
            values = {'status': status, 'error': result.get('error', '')}
            if status == 'accepted':
                values.update(accepted_at=timezone.now(), message_id=result.get('message_id'))
            if status == 'queued':
                if d.attempts >= 5:
                    values.update(status='failed', error='retry_exhausted')
                else:
                    values['scheduled_at'] = timezone.now()+timedelta(seconds=result.get('retry_after', 120)*min(d.attempts, 5))
            if values['error'] == 'unreachable':
                Connection.objects.filter(pk=d.connection_id).update(reachable=False)
            Delivery.objects.filter(pk=pk, status='sending').update(**values)
            sent += 1
        for campaign in Campaign.objects.filter(status__in=['queued', 'running']):
            if not campaign.deliveries.filter(status__in=['queued', 'sending']).exists():
                campaign.status = 'completed'
                campaign.save(update_fields=['status'])
                for c in Connection.objects.filter(connected=True, manager_reports=True, appointment=None, user__role='admin'):
                    enqueue(c, f'campaign_report:{campaign.pk}:{c.pk}', 'manager', f'کمپین «{campaign.name}» پایان یافت. نتایج پذیرش و خطا در پنل موجود است.', expires_at=timezone.now()+timedelta(days=1))
            elif campaign.status == 'queued':
                campaign.status = 'running'
                campaign.save(update_fields=['status'])
        return {'processed': sent}
    finally:
        Config.objects.filter(pk=1, worker_lease=lease_until).update(worker_lease=None, heartbeat=timezone.now())
