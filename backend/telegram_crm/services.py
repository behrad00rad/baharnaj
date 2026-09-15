import hashlib
import html
import secrets
import string
import jdatetime
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from django.conf import settings
from .integration import runtime
from django.db import transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from salon.models import Appointment, AppointmentItem, AdminActionLog
from .models import (Connection, ConsentLog, LinkToken, Receipt, Config, Delivery,
                     Template, Benefit, PointsEntry, Attribution)

TEHRAN = ZoneInfo('Asia/Tehran')
PREFERENCES = ('appointments', 'marketing', 'birthday', 'loyalty', 'care', 'manager_reports')
DEFAULTS = {
    'pending': 'درخواست نوبت شما دریافت شد. {summary}',
    'confirmed': 'نوبت شما تأیید شد. {summary}',
    'cancelled': 'نوبت شما لغو شد. {summary}',
    'rescheduled': 'زمان نوبت شما تغییر کرد. {summary}',
    'reminder': 'یادآوری نوبت بهارناژ: {summary}',
    'birthday': '{name} عزیز، تولدتان مبارک. از همراهی شما خوشحالیم. ✨',
    'maintenance': 'اگر به نوبت تازه برای {service} نیاز دارید، زمان‌های رزرو را ببینید.',
    'feedback': 'از تجربه این نوبت چقدر راضی بودید؟ پاسخ شما خصوصی می‌ماند.',
    'loyalty': 'تغییر امتیاز باشگاه شما: {points} امتیاز.',
    'reactivation': 'اگر مایل به نوبت تازه هستید، زمان‌های رزرو بهارناژ در دسترس است.',
}


def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def configured():
    current = runtime()
    return bool(current.enabled and current.bot_username and current.integration_secret and (current.dry_run or current.bot_token))


def render(text, **values):
    try:
        for _, field, spec, conversion in string.Formatter().parse(text):
            if field is not None and (field not in {'name', 'summary', 'service', 'points'} or spec or conversion):
                raise ValueError()
        result = text.format(**{k: html.escape(str(values.get(k) or ('دوست' if k == 'name' else ''))) for k in ('name', 'summary', 'service', 'points')})
    except (ValueError, KeyError, IndexError):
        raise ValidationError('متغیر متن معتبر نیست.')
    # Templates are plain text. Escape only substituted values; no arbitrary HTML.
    if len(result) > 3500:
        raise ValidationError('متن بیش از حد طولانی است.')
    return result


def template(template_name, **values):
    obj = Template.objects.filter(name=template_name).first()
    return render(obj.text if obj else DEFAULTS[template_name], **values), obj.version if obj else 1


def issue_receipt(appointment):
    raw = secrets.token_urlsafe(32)
    Receipt.objects.create(digest=digest(raw), appointment=appointment, expires_at=timezone.now() + timedelta(days=7))
    return raw


def resolve_scope(request):
    raw = request.data.get('receipt') or request.headers.get('X-Booking-Receipt', '')
    if raw:
        receipt = Receipt.objects.select_related('appointment__customer').filter(digest=digest(raw), expires_at__gt=timezone.now()).first()
        if not receipt:
            raise PermissionDenied('مجوز رسید منقضی شده یا معتبر نیست.')
        a = receipt.appointment
        return Connection.objects.get_or_create(scope=f'booking:{a.pk}', defaults={'user_id': a.customer.user_id, 'appointment': a})[0]
    if not request.user.is_authenticated or not request.user.is_active or request.user.account_status != 'active':
        raise PermissionDenied('وارد حساب خود شوید یا از رسید معتبر استفاده کنید.')
    if request.user.role not in {'customer', 'admin'}:
        raise PermissionDenied()
    return Connection.objects.get_or_create(scope=f'account:{request.user.pk}', defaults={'user': request.user})[0]


def issue_link(connection):
    raw = secrets.token_urlsafe(24)
    with transaction.atomic():
        LinkToken.objects.filter(connection=connection, used_at=None).update(used_at=timezone.now())
        LinkToken.objects.create(connection=connection, digest=digest(raw), expires_at=timezone.now() + timedelta(minutes=10))
    return {'url': f'https://t.me/{runtime().bot_username}?start={raw}', 'expires_in': 600}


@transaction.atomic
def redeem(raw, actor, chat_id, username=''):
    token = LinkToken.objects.select_for_update().filter(digest=digest(raw), expires_at__gt=timezone.now(), used_at=None).first()
    if not token:
        raise ValidationError('پیوند منقضی شده یا قبلاً استفاده شده است. از سایت پیوند تازه بگیرید.')
    c = Connection.objects.select_for_update().get(pk=token.connection_id)
    if not c.user.is_active or c.user.account_status != 'active' or c.user.role not in {'customer', 'admin'}:
        raise PermissionDenied('این حساب اجازه اتصال ندارد.')
    if c.connected and (c.chat_id != chat_id or c.telegram_user_id != actor):
        raise ValidationError('این حساب به گفت‌وگوی دیگری متصل است. ابتدا در سایت قطع اتصال کنید.')
    if Connection.objects.filter(connected=True, chat_id=chat_id).exclude(user_id=c.user_id).exists():
        raise ValidationError('این گفت‌وگو به حساب دیگری متصل است.')
    if not LinkToken.objects.filter(pk=token.pk, used_at=None).update(used_at=timezone.now()):
        raise ValidationError('پیوند قبلاً استفاده شده است.')
    c.telegram_user_id, c.chat_id, c.username = actor, chat_id, username[:64]
    c.connected, c.reachable = True, True
    c.save()
    # Consent is never reset on return or relink.
    return c


def preferences(c, data, source):
    changes = {}
    for key in PREFERENCES:
        if key in data:
            if type(data[key]) is not bool:
                raise ValidationError('انتخاب پیام باید بله یا خیر باشد.')
            if key == 'manager_reports' and (c.appointment_id or c.user.role != 'admin'):
                raise PermissionDenied()
            if c.user.role == 'admin' and key != 'manager_reports' and data[key]:
                raise ValidationError('حساب مدیر فقط گزارش مدیریتی دریافت می‌کند.')
            if getattr(c, key) != data[key]:
                changes[key] = {'from': getattr(c, key), 'to': data[key]}
                setattr(c, key, data[key])
    if 'neighborhood' in data:
        changes['neighborhood'] = {'from': c.neighborhood, 'to': str(data['neighborhood'])[:120]}
        c.neighborhood = str(data['neighborhood'])[:120]
    if 'birth_month' in data or 'birth_day' in data or 'birth_calendar' in data:
        month, day = data.get('birth_month', c.birth_month), data.get('birth_day', c.birth_day)
        calendar = data.get('birth_calendar', c.birth_calendar)
        if month is not None or day is not None:
            if calendar not in ('jalali', 'gregorian') or type(month) is not int or type(day) is not int or not 1 <= month <= 12:
                raise ValidationError('تاریخ تولد معتبر نیست.')
            maximum = ([31]*6 + [30]*6)[month-1] if calendar == 'jalali' else [31,29,31,30,31,30,31,31,30,31,30,31][month-1]
            if not 1 <= day <= maximum:
                raise ValidationError('روز تولد معتبر نیست.')
        changes['birthday_date'] = {'from': [c.birth_month, c.birth_day, c.birth_calendar], 'to': [month, day, calendar]}
        c.birth_month, c.birth_day, c.birth_calendar = month, day, calendar
    if not changes and source == 'website' and not ConsentLog.objects.filter(connection=c).exists():
        changes = {key: {'from': None, 'to': getattr(c, key)} for key in PREFERENCES if key in data}
    with transaction.atomic():
        c.save()
        if changes:
            ConsentLog.objects.create(connection=c, source=source, changes=changes)


@transaction.atomic
def disconnect(c):
    targets = Connection.objects.filter(pk=c.pk) if c.appointment_id else Connection.objects.filter(user=c.user)
    ids = list(targets.values_list('pk', flat=True))
    targets.update(connected=False, generation=F('generation')+1)
    LinkToken.objects.filter(connection_id__in=ids, used_at=None).update(used_at=timezone.now())
    Delivery.objects.filter(connection_id__in=ids, status='queued').update(status='cancelled', error='disconnected')
    ConsentLog.objects.bulk_create([ConsentLog(connection_id=pk, source='disconnect', changes={'connected': False}) for pk in ids])
    c.refresh_from_db()


def appointments_for(c):
    qs = Appointment.objects.filter(customer__user=c.user)
    return qs.filter(pk=c.appointment_id) if c.appointment_id else qs


def schedule_fingerprint(a):
    rows = [(i.pk, i.service_id, i.employee_id, str(i.date), str(i.start_time), str(i.end_time), i.completion_status == 'cancelled') for i in a.items.order_by('pk')]
    return digest(str(rows))


def fingerprint(a):
    return digest(a.status + ':' + schedule_fingerprint(a))


def appointment_revision(a):
    from .models import AppointmentRevision
    state = fingerprint(a)
    with transaction.atomic():
        record, created = AppointmentRevision.objects.select_for_update().get_or_create(appointment=a, defaults={'fingerprint': state})
        if not created and record.fingerprint != state:
            record.fingerprint = state
            record.revision += 1
            record.save(update_fields=['fingerprint', 'revision'])
    return record.revision


def summary(a):
    return '؛ '.join(f"{i.service.persian_name}، {jdatetime.date.fromgregorian(date=i.date).strftime('%Y/%m/%d')} ساعت {i.start_time:%H:%M}{' (لغوشده)' if i.completion_status == 'cancelled' else ''}" for i in a.items.select_related('service').order_by('date', 'start_time'))


def enqueue(c, key, kind, text, **kwargs):
    return Delivery.objects.get_or_create(key=key, defaults={'connection': c, 'generation': c.generation, 'kind': kind, 'text': text, **kwargs})[0]


def audience(filters, include_matches=False, only_user=None):
    allowed = {'service_ids', 'category_ids', 'within_days', 'inactive_days', 'neighborhood', 'never_visited', 'operator', 'recipe'}
    if not isinstance(filters, dict) or set(filters) - allowed:
        raise ValidationError('فیلتر مخاطبان معتبر نیست.')
    if filters.get('operator', 'AND') not in {'AND', 'OR'}:
        raise ValidationError('عملگر نامعتبر است.')
    for key in ('service_ids', 'category_ids'):
        if key in filters and (not isinstance(filters[key], list) or len(filters[key]) > 100 or any(type(i) is not int or i < 1 for i in filters[key])):
            raise ValidationError('شناسه سرویس معتبر نیست.')
    for key in ('within_days', 'inactive_days'):
        if key in filters and (type(filters[key]) is not int or not 1 <= filters[key] <= 3650):
            raise ValidationError('بازه روز معتبر نیست.')
    if filters.get('recipe') not in (None, 'hair_color', 'nails'):
        raise ValidationError('دستور گروه معتبر نیست.')
    if filters.get('recipe') and not (filters.get('service_ids') or filters.get('category_ids')):
        raise ValidationError('ابتدا سرویس یا دسته‌بندی کاتالوگ را برای این گروه انتخاب کنید.')
    today = timezone.localtime(timezone.now(), TEHRAN).date()
    matches, eligible, exclusions, reachable = [], [], {}, 0
    # Evaluate customer identities once, never duplicate overlapping segments/chats.
    from salon.models import CustomerProfile
    profiles = CustomerProfile.objects.select_related('user').filter(user__is_active=True, user__account_status='active', user__role='customer')
    if only_user is not None:
        profiles = profiles.filter(user_id=only_user)
    for profile in profiles:
        visits = AppointmentItem.objects.filter(appointment__customer=profile, completion_status='completed', appointment__is_deleted=False)
        upcoming = AppointmentItem.objects.filter(appointment__customer=profile, appointment__is_deleted=False, appointment__status__in=['pending', 'confirmed'], date__gte=today)
        c = Connection.objects.filter(user=profile.user, appointment=None).first()
        conditions = []
        if filters.get('service_ids') or filters.get('category_ids'):
            relevant = visits
            if filters.get('service_ids'):
                relevant = relevant.filter(service_id__in=filters['service_ids'])
            if filters.get('category_ids'):
                relevant = relevant.filter(service__category_id__in=filters['category_ids'])
            relevant = relevant.filter(completed_at__date__gte=today-timedelta(days=filters.get('within_days', 365)))
            conditions.append(relevant.exists())
        if filters.get('inactive_days'):
            conditions.append(visits.exists() and not visits.filter(completed_at__date__gt=today-timedelta(days=filters['inactive_days'])).exists() and not upcoming.exists())
        if 'neighborhood' in filters:
            conditions.append((c.neighborhood if c else '') == filters['neighborhood'])
        if filters.get('never_visited'):
            conditions.append(not visits.exists())
        if conditions and not (all(conditions) if filters.get('operator', 'AND') == 'AND' else any(conditions)):
            continue
        matches.append(profile.user_id)
        reason = None
        if not c or not c.connected:
            reason = 'unlinked'
        elif not c.reachable:
            reason = 'unreachable'
        else:
            reachable += 1
            if not c.marketing:
                reason = 'no_consent'
            elif c.suppressed_until and c.suppressed_until > timezone.now():
                reason = 'followup_suppression'
            elif Delivery.objects.filter(connection__user=c.user, kind__in=['campaign', 'reactivation', 'maintenance'], status__in=['accepted', 'unknown']).filter(Q(accepted_at__gt=timezone.now()-timedelta(days=Config.solo().cap_days)) | Q(status='unknown', claimed_at__gt=timezone.now()-timedelta(days=Config.solo().cap_days))).exists():
                reason = 'cap'
        if reason:
            exclusions[reason] = exclusions.get(reason, 0) + 1
        else:
            eligible.append(c)
    result = ({'total': len(matches), 'reachable': reachable, 'eligible': len(eligible), 'exclusions': exclusions}, eligible)
    return (*result, matches) if include_matches else result


def balance(user):
    return PointsEntry.objects.filter(user=user).aggregate(value=Sum('delta'))['value'] or 0


@transaction.atomic
def issue_benefit(user, rule, key, spend=False, allow_future=False):
    from salon.models import User
    User.objects.select_for_update().get(pk=user.pk)
    existing = Benefit.objects.filter(key=key).first()
    if existing:
        return existing
    if not rule.enabled or timezone.now() >= rule.ends_at or (not allow_future and timezone.now() < rule.starts_at):
        raise ValidationError('این هدیه فعال نیست.')
    if spend:
        expire_points(user, timezone.now())
        if not rule.points_cost or balance(user) < rule.points_cost:
            raise ValidationError('امتیاز کافی نیست.')
        PointsEntry.objects.create(user=user, key=f'redeem:{key}', delta=-rule.points_cost, reason=rule.name)
    return Benefit.objects.create(user=user, rule=rule, key=key, terms={'starts_at': rule.starts_at.isoformat(), 'ends_at': rule.ends_at.isoformat(), 'services': list(rule.services.values_list('id', flat=True)), 'percent': rule.percent, 'fixed': rule.fixed, 'maximum': rule.maximum, 'stacking': False, 'usage_limit': 1})


@transaction.atomic
def reserve_benefit(user, appointment, code):
    from rest_framework import serializers
    code = serializers.UUIDField().run_validation(code)
    appointment = Appointment.objects.select_for_update().get(pk=appointment.pk)
    b = Benefit.objects.select_for_update().filter(code=code, user=user).first()
    if not b or appointment.customer.user_id != user.pk or b.redeemed_at or (b.reserved_for_id and b.reserved_for_id != appointment.pk):
        raise ValidationError('هدیه معتبر نیست یا قبلاً استفاده شده است.')
    now = timezone.now()
    if not datetime.fromisoformat(b.terms['starts_at']) <= now < datetime.fromisoformat(b.terms['ends_at']):
        raise ValidationError('مهلت هدیه معتبر نیست.')
    if not appointment.items.filter(service_id__in=b.terms['services']).exists():
        raise ValidationError('سرویس مشمول هدیه نیست.')
    if Benefit.objects.filter(reserved_for=appointment).exclude(pk=b.pk).exists():
        raise ValidationError('هدیه دیگری برای این نوبت رزرو شده است؛ هدیه‌ها قابل تجمیع نیستند.')
    if appointment.status not in ('pending', 'confirmed'):
        raise ValidationError('نوبت فعال نیست.')
    b.reserved_for = appointment
    b.save()
    return b


@transaction.atomic
def redeem_benefit(b, actor):
    """Apply once to the existing item effective-price calculation, before any payment. No second totals engine."""
    b = Benefit.objects.select_for_update().get(pk=b.pk)
    if b.redeemed_at:
        return b
    a = Appointment.objects.select_for_update().get(pk=b.reserved_for_id)
    if actor.role != 'admin' or a.status not in ('pending', 'confirmed') or a.payments.exists() or a.has_unresolved_prices:
        raise ValidationError('اعمال هدیه پیش از پرداخت و پس از تعیین قیمت نهایی مجاز است.')
    if not b.rule.enabled or not datetime.fromisoformat(b.terms['starts_at']) <= timezone.now() < datetime.fromisoformat(b.terms['ends_at']):
        raise ValidationError('هدیه فعال نیست.')
    items = list(a.items.select_for_update().filter(service_id__in=b.terms['services']).order_by('pk'))
    if any(i.completion_status == 'completed' for i in items):
        raise ValidationError('هدیه باید پیش از انجام سرویس اعمال شود.')
    total = sum(i.effective_price for i in items)
    discount = min(total, b.terms['fixed'] or total*b.terms['percent']//100)
    if b.terms['maximum']:
        discount = min(discount, b.terms['maximum'])
    remaining = discount
    audit = []
    for i in items:
        old = i.effective_price
        reduction = min(old, remaining)
        remaining -= reduction
        if i.discount_applied:
            raise ValidationError('هدیه دیگری قبلاً اعمال شده است.')
        i.discount_amount, i.discount_applied = reduction, True
        i.save(update_fields=['discount_amount', 'discount_applied', 'updated_at'])
        audit.append({'item': i.pk, 'before': old, 'after': old-reduction})
    b.discount, b.redeemed_at = discount, timezone.now()
    b.save()
    AdminActionLog.objects.create(actor=actor, action='coupon_redeemed', model_name='Benefit', object_id=str(b.pk), details={'items': audit, 'discount': discount})
    return b


def attach_attribution(appointment, raw, user):
    if not raw or not user.is_authenticated or appointment.customer.user_id != user.pk:
        return
    try:
        d = Delivery.objects.filter(tracking=raw, connection__user=user, campaign__isnull=False, first_visited_at__gte=timezone.now()-timedelta(days=Config.solo().attribution_days)).first()
    except Exception as error:
        # Invalid tracking never affects booking. Only parse errors should be ignored.
        from django.core.exceptions import ValidationError as DjangoValidationError
        if not isinstance(error, (ValueError, DjangoValidationError)):
            raise
        return
    if d:
        Attribution.objects.get_or_create(appointment=appointment, defaults={'delivery': d})


def point_lots(user):
    """Reconstruct FIFO unspent grants from immutable entries, retaining refund debt."""
    lots, debt = {}, 0
    for entry in PointsEntry.objects.filter(user=user).order_by('pk'):
        if entry.delta > 0:
            paid_debt = min(debt, entry.delta)
            debt -= paid_debt
            lots[entry.pk] = entry.delta-paid_debt
            continue
        amount = -entry.delta
        if entry.key.startswith(('expire:', 'reverse:')):
            target = int(entry.key.split(':')[1])
            use = min(lots.get(target, 0), amount)
            lots[target] = lots.get(target, 0)-use
            amount -= use
        for pk in lots:
            if amount <= 0:
                break
            use = min(lots[pk], amount)
            lots[pk] -= use
            amount -= use
        debt += max(amount, 0)
    return lots


@transaction.atomic
def expire_points(user, now):
    from salon.models import User
    User.objects.select_for_update().get(pk=user.pk)
    for entry in PointsEntry.objects.filter(user=user, delta__gt=0, expires_at__lte=now).order_by('pk'):
        if PointsEntry.objects.filter(key=f'expire:{entry.pk}').exists():
            continue
        amount = point_lots(user).get(entry.pk, 0)
        PointsEntry.objects.get_or_create(key=f'expire:{entry.pk}', defaults={'user': user, 'delta': -amount, 'reason': 'انقضای امتیاز استفاده‌نشده'})


def benefit_quote(benefit, appointment):
    if benefit.user_id != appointment.customer.user_id:
        raise PermissionDenied()
    items = list(appointment.items.filter(service_id__in=benefit.terms['services']))
    if not items:
        raise ValidationError('سرویس مشمول هدیه نیست.')
    estimated = any(not item.is_price_final for item in items)
    unknown = any(not item.is_price_final and item.catalog_pricing_snapshot.get('minimum_price') is None for item in items)
    total = sum(item.effective_price if item.is_price_final else (item.catalog_pricing_snapshot.get('minimum_price') or 0) for item in items)
    amount = min(total, benefit.terms['fixed'] or total*benefit.terms['percent']//100)
    if benefit.terms['maximum']:
        amount = min(amount, benefit.terms['maximum'])
    return {'estimated': estimated, 'amount': None if unknown else amount, 'terms': benefit.terms}
