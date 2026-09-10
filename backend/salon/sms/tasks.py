from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Sum
from salon.models import Appointment, AppointmentItem, Payment, Refund
from .models import SMSAutomation, SMSCampaign, SMSDelivery
from .audience import customer_data, audience, matches
from .phone import normalize_phone
from .templates import render, marketing_message
from .service import configuration, context_for, campaign_report, deliver_batch


def queue_rule(rule, customer, key, service=None, appointment_id=None, appointment_item=None):
    kind = 'transactional' if rule.kind.startswith('appointment_') else 'marketing'
    context = context_for(rule, customer, service)
    if appointment_id:
        first = appointment_item or AppointmentItem.objects.filter(appointment_id=appointment_id).order_by('date', 'start_time').first()
        if first:
            context.update(appointment_date=first.date.isoformat(), appointment_time=first.start_time.strftime('%H:%M'))
    message = render(rule.message, context)
    if kind == 'marketing':
        message = marketing_message(message, customer)
    return SMSDelivery.objects.get_or_create(dedupe_key=f'rule:{rule.pk}:{key}', defaults={
        'automation': rule, 'customer': customer, 'appointment_id': appointment_id,
        'phone': normalize_phone(customer.user.phone), 'message': message, 'kind': kind})


def run_automations(now=None):
    now = now or timezone.now()
    today = timezone.localtime(now).date()
    rows = customer_data()
    errors = []
    for rule in SMSAutomation.objects.filter(enabled=True).select_related('service'):
        if rule.kind.startswith('appointment_') and rule.kind != 'appointment_reminder':
            continue  # Event hooks enqueue these after the booking transaction commits.
        try:
            if rule.kind == 'appointment_reminder':
                for item in AppointmentItem.objects.filter(appointment__is_deleted=False, appointment__status__in=('pending', 'confirmed'),
                    completion_status__in=('pending', 'in_progress'), date__gte=today,
                    date__lte=today + timedelta(days=8)).select_related('appointment__customer__user', 'service'):
                    if rule.service_id and rule.service_id != item.service_id:
                        continue
                    if rule.category_id and rule.category_id != item.service.category_id:
                        continue
                    row = next((r for r in rows if r['id'] == item.appointment.customer_id), None)
                    if not row or not matches(row, rule.segment):
                        continue
                    start = timezone.make_aware(datetime.combine(item.date, item.start_time))
                    if now < start <= now + timedelta(hours=rule.hours_before):
                        queue_rule(rule, item.appointment.customer, f'item:{item.pk}:{start.isoformat()}', item.service, item.appointment_id, item)
            else:
                for row in audience(rule.segment, rows):
                    customer = row['customer']
                    if rule.kind == 'birthday':
                        if customer.birth_date and (customer.birth_date.month, customer.birth_date.day) == (today.month, today.day):
                            queue_rule(rule, customer, f'birthday:{customer.pk}:{today.year}')
                    elif rule.kind == 'inactive':
                        if row['last_visit'] and row['last_visit'] <= today - timedelta(days=rule.interval_days):
                            queue_rule(rule, customer, f'inactive:{customer.pk}:{row["last_visit"]}')
                    elif rule.kind == 'service_reminder':
                        # Latest completed cycle per applicable service; never remind for superseded work.
                        latest = {}
                        for visit in row['visits']:
                            if rule.service_id and visit['service'] != rule.service_id:
                                continue
                            if rule.category_id and visit['category'] != rule.category_id:
                                continue
                            latest[visit['service']] = visit
                        for visit in latest.values():
                            due = visit['date'] + timedelta(days=rule.interval_days)
                            if due <= today < due + timedelta(days=7):
                                item = AppointmentItem.objects.select_related('service').get(pk=visit['item'])
                                queue_rule(rule, customer, f'cycle:{item.pk}', item.service, visit['appointment'])
            rule.last_run = now
            rule.save(update_fields=('last_run',))
        except ValueError:
            errors.append(rule.pk)
    return errors


def management_message(key, message):
    config = configuration()
    if config.manager_phone:
        SMSDelivery.objects.get_or_create(dedupe_key='manager:' + key, defaults={
            'phone': normalize_phone(config.manager_phone), 'message': message, 'kind': 'management'})


def run_management(now=None):
    now = now or timezone.now()
    local = timezone.localtime(now)
    config = configuration()
    if config.daily_summary_enabled and local.hour >= config.daily_summary_hour:
        appointments = Appointment.objects.filter(items__date=local.date()).distinct()
        received = Payment.objects.filter(status__in=('paid', 'refunded'), paid_at__date=local.date()).aggregate(total=Sum('amount'))['total'] or 0
        refunded = Refund.objects.filter(status='completed', created_at__date=local.date()).aggregate(total=Sum('amount'))['total'] or 0
        management_message(f'daily:{local.date()}', f'گزارش {config.salon_name} تا ساعت {local:%H:%M}\n'
            f'{appointments.count()} نوبت\n{appointments.filter(status="cancelled").count()} لغو\n'
            f'{appointments.filter(status="completed").count()} انجام‌شده\n'
            f'دریافتی تأییدشده امروز: {received:,} تومان\nبازپرداخت امروز: {refunded:,} تومان')
    for campaign in SMSCampaign.objects.filter(status='queued'):
        report = campaign_report(campaign)
        if not report['pending']:
            SMSCampaign.objects.filter(pk=campaign.pk, status='queued').update(status='completed')
            if config.campaign_summary_enabled:
                management_message(f'campaign:{campaign.pk}', f'گزارش کمپین {campaign.name}\n'
                    f'ارسال‌شده: {report["sent"]}\nتحویل‌شده: {report["delivered"]}\nناموفق: {report["failed"]}\nنامشخص: {report["unknown"]}')
    if config.failure_alert_enabled:
        failures = SMSDelivery.objects.filter(created_at__date=local.date(), status__in=('failed', 'unknown')).exclude(kind='management').count()
        if failures:
            management_message(f'failure:{local.date()}', f'{config.salon_name}: {failures} پیامک ناموفق یا نامشخص نیاز به بررسی دارد. گزارش ارسال را ببینید.')


def tick():
    config = configuration()
    config.last_worker_at = timezone.now()
    config.save(update_fields=('last_worker_at',))
    errors = run_automations()
    run_management()
    count = deliver_batch()
    run_management()
    return count, errors
