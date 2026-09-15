"""Periodic reconciliation reads committed business records; no booking network hooks."""
from datetime import datetime, timedelta, time
import calendar
import jdatetime
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from salon.models import Appointment, AppointmentItem, AppointmentStatusHistory, User
from .models import Connection, Config, Delivery, ServiceRule, PointsEntry, Benefit
from .services import (TEHRAN, enqueue, fingerprint, summary, template, issue_benefit,
                       audience, balance, expire_points, appointment_revision, schedule_fingerprint)


def birthday_today(c, today):
    d = jdatetime.date.fromgregorian(date=today) if c.birth_calendar == 'jalali' else today
    day = c.birth_day
    if c.birth_calendar == 'jalali' and c.birth_month == 12 and day == 30 and not d.isleap():
        day = 29
    if c.birth_calendar == 'gregorian' and c.birth_month == 2 and day == 29 and not calendar.isleap(d.year):
        day = 28
    return (d.month, d.day) == (c.birth_month, day)


def relevant_service_exists(c, item):
    qs = AppointmentItem.objects.filter(appointment__customer__user=c.user, service_id=item.service_id, appointment__is_deleted=False)
    return qs.filter(completion_status='completed', completed_at__gt=item.completed_at or item.updated_at).exists() or qs.filter(appointment__status__in=['pending', 'confirmed'], date__gte=timezone.localtime(timezone.now(), TEHRAN).date()).exists()


def reconcile_appointments(now):
    config = Config.solo()
    for c in Connection.objects.filter(connected=True, appointments=True, user__role='customer', user__is_active=True):
        if c.appointment_id and Connection.objects.filter(user=c.user, appointment=None, connected=True, chat_id=c.chat_id, appointments=True).exists():
            continue
        qs = Appointment.objects.filter(customer__user=c.user).prefetch_related('items__service')
        if c.appointment_id:
            qs = qs.filter(pk=c.appointment_id)
        for a in qs:
            version = fingerprint(a)
            revision = appointment_revision(a)
            schedule = schedule_fingerprint(a)
            Delivery.objects.filter(connection=c, appointment=a, kind__in=['reminder', 'status'], status='queued').exclude(appointment_version=version).update(status='cancelled', error='obsolete_version')
            first = a.items.exclude(completion_status='cancelled').order_by('date', 'start_time').first() or a.items.order_by('date', 'start_time').first()
            if not first:
                continue
            start = datetime.combine(first.date, first.start_time, tzinfo=TEHRAN)
            previous = Delivery.objects.filter(connection=c, appointment=a, kind='status').order_by('-pk').first()
            if not previous or previous.appointment_version != version:
                event = 'rescheduled' if previous and a.status in ('pending', 'confirmed') and previous.metadata.get('schedule') != schedule else a.status
                if event in config.status_events and (start > now or a.updated_at > now-timedelta(hours=1)):
                    text, tv = template(event, summary=summary(a))
                    enqueue(c, f'status:{c.pk}:{c.generation}:{a.pk}:{revision}:{version}', 'status', text, appointment=a, appointment_version=version, template_version=tv, expires_at=now+timedelta(hours=1), metadata={'status': a.status, 'event': event, 'schedule': schedule, 'revision': revision})
            if a.status not in ('pending', 'confirmed'):
                continue
            for hours in config.reminder_hours:
                when = start-timedelta(hours=hours)
                # Never manufacture overdue reminders for late bookings or downtime.
                if when < a.created_at or when < now-timedelta(minutes=5):
                    continue
                text, tv = template('reminder', summary=summary(a))
                enqueue(c, f'reminder:{c.pk}:{c.generation}:{a.pk}:{revision}:{version}:{hours}', 'reminder', text, appointment=a, appointment_version=version, template_version=tv, scheduled_at=when, expires_at=min(start, when+timedelta(minutes=15)))


def reconcile_points(now):
    config = Config.solo()
    if config.points_per_toman:
        for a in Appointment.objects.filter(status='completed').select_related('customer__user'):
            with transaction.atomic():
                User.objects.select_for_update().get(pk=a.customer.user_id)
                key = f'earn:{a.pk}'
                if not a.has_unresolved_prices and a.payment_status == 'paid' and a.net_paid > 0:
                    PointsEntry.objects.get_or_create(key=key, defaults={'user_id': a.customer.user_id, 'delta': a.net_paid//config.points_per_toman, 'reason': 'نوبت انجام‌شده و تسویه‌شده', 'expires_at': now+timedelta(days=config.points_expiry_days)})
    # Reversal remains active even after earning is disabled: full reversal on any refund/cancellation.
    for entry in PointsEntry.objects.filter(key__startswith='earn:'):
        a = Appointment.all_objects.get(pk=int(entry.key.split(':')[1]))
        if a.status == 'cancelled' or a.refunded_total:
            PointsEntry.objects.get_or_create(key=f'reverse:{entry.pk}', defaults={'user': entry.user, 'delta': -entry.delta - (PointsEntry.objects.filter(key=f'expire:{entry.pk}').aggregate(n=Sum('delta'))['n'] or 0), 'reason': 'برگشت امتیاز بابت لغو یا بازپرداخت'})
    for user in User.objects.filter(pointsentry__delta__gt=0, pointsentry__expires_at__lte=now).distinct():
        expire_points(user, now)
    for c in Connection.objects.filter(connected=True, loyalty=True, appointment=None, user__role='customer'):
        known = set()
        pending = None
        for d in Delivery.objects.filter(connection=c, kind='loyalty').order_by('pk'):
            known.update(d.metadata.get('entries', []))
            if d.status == 'queued':
                pending = d
        fresh = list(PointsEntry.objects.filter(user=c.user).exclude(pk__in=known).order_by('pk'))
        if not fresh:
            continue
        ids = (pending.metadata.get('entries', []) if pending else []) + [e.pk for e in fresh]
        delta = PointsEntry.objects.filter(pk__in=ids).aggregate(total=Sum('delta'))['total'] or 0
        text, tv = template('loyalty', points=delta)
        if pending:
            Delivery.objects.filter(pk=pending.pk, status='queued').update(text=text, metadata={'entries': ids})
        else:
            enqueue(c, f'points:{c.pk}:{fresh[0].pk}', 'loyalty', text, template_version=tv, scheduled_at=now+timedelta(minutes=5), expires_at=now+timedelta(days=2), metadata={'entries': ids})


def reconcile_optional(now):
    config = Config.solo()
    today = timezone.localtime(now, TEHRAN).date()
    for c in Connection.objects.filter(connected=True, appointment=None, user__role='customer', user__is_active=True):
        if config.birthday_enabled and c.birthday and c.birth_month and birthday_today(c, today) and not Delivery.objects.filter(connection__user=c.user, kind='birthday', created_at__gt=now-timedelta(days=364)).exists():
            # Use Gregorian year independent of changing the customer's chosen calendar/date.
            key = f'birthday:{c.user_id}:{today.year}'
            text, tv = template('birthday', name=c.user.first_name)
            if config.birthday_gift_id:
                from rest_framework.exceptions import ValidationError
                try:
                    b = issue_benefit(c.user, config.birthday_gift, key)
                    text += f' هدیه واقعی شما در بخش هدیه‌ها ثبت شد: {b.rule.name}'
                except ValidationError:
                    pass
            enqueue(c, key, 'birthday', text, template_version=tv, expires_at=datetime.combine(today+timedelta(days=1), time(), tzinfo=TEHRAN))
        if not c.care:
            continue
        for rule in ServiceRule.objects.filter(enabled=True).select_related('service'):
            item = AppointmentItem.objects.filter(appointment__customer__user=c.user, completion_status='completed', service=rule.service).order_by('-completed_at', '-pk').first()
            if not item:
                continue
            if rule.interval_days:
                when = datetime.combine(timezone.localtime(item.completed_at or item.updated_at, TEHRAN).date()+timedelta(days=rule.interval_days), time(10), tzinfo=TEHRAN)
                if when >= now-timedelta(days=1) and not relevant_service_exists(c, item):
                    text, tv = template('maintenance', service=rule.service.persian_name)
                    enqueue(c, f'maintenance:{c.pk}:{item.pk}', 'maintenance', text, template_version=tv, appointment=item.appointment, scheduled_at=when, expires_at=when+timedelta(days=2), metadata={'item': item.pk, 'service': item.service_id})
            if (item.completed_at or item.updated_at) < now-timedelta(days=1):
                continue
            if rule.aftercare:
                enqueue(c, f'care:{c.pk}:{item.pk}', 'care', rule.aftercare, appointment=item.appointment, expires_at=now+timedelta(days=1), metadata={'item': item.pk, 'service': item.service_id})
            if rule.feedback:
                text, tv = template('feedback')
                enqueue(c, f'feedback:{c.pk}:{item.appointment_id}', 'feedback', text, appointment=item.appointment, template_version=tv, scheduled_at=now+timedelta(hours=2), expires_at=now+timedelta(days=2))
    if config.reactivation_enabled:
        _, recipients = audience({'inactive_days': config.reactivation_days})
        for c in recipients:
            last = AppointmentItem.objects.filter(appointment__customer__user=c.user, completion_status='completed').order_by('-completed_at', '-pk').first()
            text, tv = template('reactivation')
            enqueue(c, f'reactivation:{c.pk}:{last.pk}', 'reactivation', text, template_version=tv, expires_at=now+timedelta(days=1))


def reconcile_managers(now):
    config = Config.solo()
    local = timezone.localtime(now, TEHRAN)
    if local.hour < 10:
        return
    today = local.date()
    for c in Connection.objects.filter(connected=True, manager_reports=True, user__role='admin', user__is_active=True, user__account_status='active', appointment=None):
        if config.manager_daily:
            count = Appointment.objects.filter(items__date=today, status__in=['pending', 'confirmed']).distinct().count()
            enqueue(c, f'manager_daily:{c.pk}:{today}', 'manager', f'برنامه امروز: {count} نوبت. جزئیات در پنل مدیریت.', expires_at=now+timedelta(hours=12))
        if config.manager_cancellations:
            report_date = today-timedelta(days=1)
            count = AppointmentStatusHistory.objects.filter(status='cancelled', changed_at__date=report_date).count()
            enqueue(c, f'manager_cancel:{c.pk}:{today}', 'manager', f'لغوها بر اساس تاریخ رویداد در روز {jdatetime.date.fromgregorian(date=report_date).strftime("%Y/%m/%d")}: {count}.', expires_at=now+timedelta(hours=12))
        if config.manager_failures:
            count = Delivery.objects.filter(status__in=['failed', 'unknown'], claimed_at__gte=now-timedelta(days=1)).count()
            enqueue(c, f'manager_fail:{c.pk}:{today}', 'manager', f'خطاها و نتیجه‌های نامشخص ۲۴ ساعت گذشته: {count}.', expires_at=now+timedelta(hours=12))


def reconcile():
    now = timezone.now()
    reconcile_appointments(now)
    reconcile_points(now)
    reconcile_optional(now)
    reconcile_managers(now)
