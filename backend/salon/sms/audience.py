from collections import Counter
from datetime import timedelta
from django.utils import timezone
from salon.models import Appointment, AppointmentItem, CustomerProfile, Payment, Refund
from .phone import normalize_phone


def customer_data():
    """Independent queries avoid multiplying payment totals by service joins."""
    rows = {c.pk: {'customer': c, 'id': c.pk, 'name': c.user.get_full_name() or c.user.username,
        'phone': c.user.phone, 'total_appointments': 0, 'completed_appointments': 0,
        'total_confirmed_spend': 0, 'total_visits': 0, 'last_visit': None, 'last_appointment': None,
        'services': Counter(), 'specialists': Counter(), 'visits': [],
        'marketing_sms_allowed': c.marketing_sms_allowed, 'birth_date': c.birth_date}
        for c in CustomerProfile.objects.select_related('user').filter(user__role='customer')}
    for a in Appointment.objects.values('id', 'customer_id', 'status'):
        if a['customer_id'] in rows:
            row = rows[a['customer_id']]
            row['total_appointments'] += 1
            row['completed_appointments'] += a['status'] == 'completed'
    appointment_customers = dict(Appointment.objects.values_list('id', 'customer_id'))
    for item in AppointmentItem.objects.filter(appointment__is_deleted=False).select_related('service', 'employee__user').order_by('date', 'id'):
        row = rows.get(appointment_customers.get(item.appointment_id))
        if not row:
            continue
        row['last_appointment'] = item.date
        if item.completion_status == 'completed' and item.date <= timezone.localdate():
            row['last_visit'] = item.date
            row['services'][item.service.persian_name or item.service.name] += 1
            row['specialists'][item.employee.user.get_full_name() or item.employee.user.username] += 1
            row['visits'].append({'date': item.date, 'service': item.service_id, 'category': item.service.category_id, 'employee': item.employee_id, 'item': item.pk, 'appointment': item.appointment_id})
    for cid, amount in Payment.objects.filter(status__in=('paid', 'refunded'), appointment__is_deleted=False).values_list('appointment__customer_id', 'amount'):
        if cid in rows:
            rows[cid]['total_confirmed_spend'] += amount
    for cid, amount in Refund.objects.filter(status='completed', payment__appointment__is_deleted=False).values_list('payment__appointment__customer_id', 'amount'):
        if cid in rows:
            rows[cid]['total_confirmed_spend'] -= amount
    for row in rows.values():
        row['total_visits'] = len({visit['appointment'] for visit in row['visits']})
    return list(rows.values())


def matches(row, segment):
    visits = row['visits']
    for key in ('service', 'category', 'employee'):
        if segment.get(key):
            visits = [v for v in visits if v[key] == int(segment[key])]
    for key, op in (('visited_after', lambda a, b: a >= b), ('visited_before', lambda a, b: a <= b)):
        if segment.get(key):
            visits = [v for v in visits if op(v['date'].isoformat(), str(segment[key]))]
    if any(segment.get(k) for k in ('service', 'category', 'employee', 'visited_after', 'visited_before')) and not visits:
        return False
    last = row['last_visit']
    if segment.get('inactive_days') and (not last or last > timezone.localdate() - timedelta(days=int(segment['inactive_days']))):
        return False
    if row['completed_appointments'] < int(segment.get('min_visits', 0)):
        return False
    if row['total_confirmed_spend'] < int(segment.get('min_spend', 0)):
        return False
    if segment.get('new_days') and row['customer'].user.date_joined.date() < timezone.localdate() - timedelta(days=int(segment['new_days'])):
        return False
    return True


def audience(segment, rows=None, marketing=True):
    rows = customer_data() if rows is None else rows
    blocked = set()
    if marketing:
        from django.db.models import Q
        for phone in CustomerProfile.all_objects.filter(Q(marketing_sms_allowed=False) | Q(marketing_opted_out_at__isnull=False)).values_list('user__phone', flat=True):
            try:
                blocked.add(normalize_phone(phone))
            except ValueError:
                pass
    found, seen = [], set()
    for row in rows:
        try:
            phone = normalize_phone(row['phone'])
        except ValueError:
            continue
        if phone in blocked or phone in seen or not matches(row, segment):
            continue
        if not row['customer'].user.is_active or row['customer'].user.account_status != 'active':
            continue
        seen.add(phone)
        found.append(row)
    return found


def public_row(row):
    return {**{k: v for k, v in row.items() if k not in ('customer', 'visits', 'services', 'specialists')},
        'favorite_services': row['services'].most_common(5), 'favorite_specialists': row['specialists'].most_common(3)}
