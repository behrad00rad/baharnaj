import hashlib
import hmac
import json
import time
from datetime import timedelta
from urllib.parse import urlencode
from django.conf import settings
from .integration import runtime
from django.db import transaction
from django.db.models import Count, F, Q, Sum, Case, When, Value
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from salon.permissions import IsAdmin as SalonIsAdmin
from salon.models import SalonSettings, User, Appointment, CustomerProfile, AppointmentItem, AdminActionLog
from .models import (Connection, Config, Incoming, Campaign, Delivery, Segment, Template,
                     ServiceRule, BenefitRule, Benefit, Feedback, PointsEntry, Attribution)
from .serializers import (ConnectionSerializer, ConfigSerializer, CampaignSerializer,
                          SegmentSerializer, TemplateSerializer, ServiceRuleSerializer,
                          BenefitRuleSerializer, BenefitSerializer)
from .services import (configured, resolve_scope, issue_link, preferences, disconnect,
                       redeem, digest, appointments_for, summary, balance, enqueue,
                       audience, render, PREFERENCES, DEFAULTS, issue_benefit,
                       reserve_benefit, redeem_benefit, benefit_quote)


class IsAdmin(SalonIsAdmin):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_active and request.user.account_status == 'active'


class CustomerView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'telegram_link'

    def get(self, request):
        if not configured() and not request.user.is_authenticated and not request.headers.get('X-Booking-Receipt'):
            return Response({'configured': False, 'connected': False})
        c = resolve_scope(request)
        return Response({'configured': configured(), **ConnectionSerializer(c).data})

    def post(self, request):
        if request.data.get('action') == 'link' and not configured():
            return Response({'configured': False, 'detail': 'اتصال تلگرام فعلاً در دسترس نیست.'}, status=503)
        c = resolve_scope(request)
        operation = request.data.get('action')
        if operation == 'link':
            preferences(c, {k: request.data[k] for k in PREFERENCES if k in request.data}, 'website')
            return Response(issue_link(c))
        if operation == 'disconnect':
            disconnect(c)
        elif operation == 'preferences':
            preferences(c, request.data, 'website')
        elif operation == 'reserve':
            if c.appointment_id:
                raise PermissionDenied('هدیه شخصی به ورود حساب نیاز دارد.')
            a = get_object_or_404(Appointment, pk=request.data.get('appointment'), customer__user=request.user)
            b = reserve_benefit(request.user, a, request.data.get('code'))
            return Response(BenefitSerializer(b).data)
        elif operation == 'quote':
            if c.appointment_id:
                raise PermissionDenied()
            a = get_object_or_404(Appointment, pk=request.data.get('appointment'), customer__user=request.user)
            from rest_framework import serializers
            code = serializers.UUIDField().run_validation(request.data.get('code'))
            b = get_object_or_404(Benefit, code=code, user=request.user)
            return Response(benefit_quote(b, a))
        elif operation == 'reward':
            if c.appointment_id:
                raise PermissionDenied()
            rule = get_object_or_404(BenefitRule, pk=request.data.get('rule'))
            from rest_framework import serializers
            request_id = serializers.UUIDField().run_validation(request.data.get('request_id'))
            b = issue_benefit(c.user, rule, f'points:{c.user_id}:{rule.pk}:{request_id}', spend=True)
            return Response(BenefitSerializer(b).data)
        else:
            raise ValidationError('عملیات معتبر نیست.')
        return Response(ConnectionSerializer(c).data)


class BotView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = runtime().integration_secret
        if not configured() or not secret or not request.is_secure() and not settings.DEBUG:
            raise PermissionDenied()
        if len(request.body) > 12000:
            raise ValidationError('payload_too_large')
        timestamp = request.headers.get('X-Timestamp', '')
        nonce = request.headers.get('X-Nonce', '')
        signature = request.headers.get('X-Signature', '')
        try:
            if abs(time.time()-int(timestamp)) > 300 or not 16 <= len(nonce) <= 100:
                raise ValueError()
        except ValueError:
            raise PermissionDenied()
        signed = timestamp + '\n' + nonce + '\n' + hashlib.sha256(request.body).hexdigest()
        if not hmac.compare_digest(hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest(), signature):
            raise PermissionDenied()
        data = request.data
        if data.get('chat_type') != 'private' or type(data.get('actor')) is not int or type(data.get('chat_id')) is not int or data['actor'] != data['chat_id'] or not 0 < data['actor'] < 2**52:
            raise PermissionDenied('private_chat_required')
        update_id = str(data.get('update_id', ''))
        if not update_id or len(update_id) > 90:
            raise ValidationError('update_id_required')
        body_digest = digest(json.dumps(data, sort_keys=True, ensure_ascii=False))
        with transaction.atomic():
            old = Incoming.objects.filter(update_id=update_id).first()
            if old:
                if old.body_digest != body_digest:
                    raise PermissionDenied('update_conflict')
                return signed_bot_response(update_id, old.response)
            # Timestamp + immutable update ID is the replay/idempotency key. Nonce is bound to signed body.
            if Incoming.objects.filter(created_at__gte=timezone.now()-timedelta(minutes=1), response__actor=data['actor']).count() >= 30:
                return Response({'detail': 'rate_limited'}, status=429)
            response = bot_action(data)
            response['actor'] = data['actor']
            Incoming.objects.create(update_id=update_id, body_digest=body_digest, response=response)
        return signed_bot_response(update_id, response)


def signed_bot_response(update_id, response):
    payload = json.dumps(response, ensure_ascii=False, separators=(',', ':'))
    signature = hmac.new(runtime().integration_secret.encode(), ('response\n' + update_id + '\n' + payload).encode(), hashlib.sha256).hexdigest()
    return Response({'payload': payload, 'signature': signature})


def button(text, callback=None, url=None):
    return {'text': text, **({'callback_data': callback} if callback else {'url': url})}


def bot_action(data):
    op = data.get('operation', 'home')
    actor, chat_id = data['actor'], data['chat_id']
    cs = Connection.objects.filter(connected=True, telegram_user_id=actor, chat_id=chat_id, user__is_active=True, user__account_status='active', user__role__in=['customer', 'admin'])
    # An authenticated inbound private update proves reachability, but never changes consent.
    cs.update(reachable=True)
    c = cs.filter(appointment=None).first() or cs.first()
    home = [[button('نوبت‌های من', 'appointments'), button('رزرو نوبت', url=runtime().site_url+'/book')], [button('هدیه‌ها و امتیازها', 'benefits')], [button('تنظیمات پیام‌ها', 'settings'), button('آدرس و تماس', 'contact')]]
    rows = [[button('خانه', 'home')]]
    text = 'به بهارناژ خوش آمدید. گزینه دلخواه را انتخاب کنید.'
    if op == 'confirm_link':
        c = redeem(str(data.get('token', '')), actor, chat_id, str(data.get('username', '')))
        text = 'اتصال انجام شد. انتخاب پیام‌ها را در تنظیمات بررسی کنید.'
        rows = home
    elif op in ('home', 'help'):
        rows = home
        if op == 'help':
            text = 'برای اتصال امن، از رسید رزرو یا حساب سایت وارد تلگرام شوید. /stop پیام‌های اختیاری را متوقف می‌کند. پاسخ آزاد در این ربات پشتیبانی نمی‌شود.'
    elif op == 'contact':
        salon = SalonSettings.get_solo()
        config = Config.solo()
        text = '\n'.join(filter(None, [salon.salon_name, salon.address, salon.phone, config.hours]))
        for label, url in [('نقشه', config.map_url), ('اینستاگرام', config.instagram_url), ('پشتیبانی', config.support_url)]:
            if url:
                rows.insert(0, [button(label, url=url)])
        rows.insert(0, [button('رزرو نوبت', url=runtime().site_url+'/book')])
    elif not c:
        text = 'هنوز متصل نیستید. از رسید رزرو یا حساب خود در سایت، پیوند اتصال امن بگیرید.'
        rows.insert(0, [button('اتصال از سایت', url=runtime().site_url+'/telegram')])
    elif op == 'appointments':
        # Guest chat can have several receipts; union only explicitly linked scopes.
        ids = set()
        for connection in cs:
            ids.update(appointments_for(connection).filter(status__in=['pending', 'confirmed'], items__date__gte=timezone.localdate()).values_list('id', flat=True))
        text = '\n\n'.join(summary(a) for a in Appointment.objects.filter(pk__in=ids)[:8]) or 'نوبت پیش‌رویی ثبت نشده است.'
        text = text[:3500]
        rows.insert(0, [button('پیگیری، لغو و تغییر نوبت', url=runtime().site_url+'/booking/manage')])
    elif op in ('settings', 'stop', 'marketing_off') or op.startswith('pref:'):
        if op == 'stop':
            for connection in cs:
                preferences(connection, {p: False for p in PREFERENCES if (connection.user.role == 'admin') == (p == 'manager_reports')}, 'bot_stop')
            c.refresh_from_db()
        elif op == 'marketing_off':
            for connection in cs:
                preferences(connection, {'marketing': False}, 'bot_marketing_off')
            c.refresh_from_db()
        elif op.startswith('pref:'):
            parts = op.split(':')
            if len(parts) != 3 or parts[1] not in PREFERENCES or parts[2] not in ('0', '1'):
                raise ValidationError('invalid_preference')
            for connection in cs:
                preferences(connection, {parts[1]: parts[2] == '1'}, 'bot_settings')
            c.refresh_from_db()
        text = 'تنظیمات پیام‌ها؛ هر انتخاب مستقل است. /stop همه پیام‌های اختیاری را متوقف می‌کند.'
        labels = {'appointments': 'خبر و یادآوری نوبت', 'marketing': 'پیشنهادها و تخفیف‌ها', 'birthday': 'تولد', 'loyalty': 'امتیازها', 'care': 'مراقبت و بازخورد', 'manager_reports': 'گزارش مدیریت'}
        for key, label in labels.items():
            if (c.user.role == 'admin') != (key == 'manager_reports'):
                continue
            rows.insert(0, [button(('✓ ' if getattr(c, key) else '○ ')+label, f'pref:{key}:{0 if getattr(c,key) else 1}')])
    elif op == 'benefits':
        if c.appointment_id:
            text = 'هدیه‌ها و امتیازهای حساب فقط پس از ورود و اتصال حساب در سایت نمایش داده می‌شود.'
        else:
            text = f'امتیاز ثبت‌شده شما: {balance(c.user)}\n'
            benefits = Benefit.objects.filter(user=c.user, redeemed_at=None)
            from datetime import datetime
            active = [b for b in benefits if datetime.fromisoformat(b.terms['ends_at']) > timezone.now()]
            text += '\n'.join(f'{b.rule.name}: {b.code}' for b in active[:10]) or 'هدیه فعالی ثبت نشده است.'
            rows.insert(0, [button('مدیریت هدیه‌ها', url=runtime().site_url+'/telegram')])
    elif op.startswith(('ack:', 'decline:', 'snooze:', 'rate:')):
        parts = op.split(':')
        try:
            pk = int(parts[1])
        except (ValueError, IndexError):
            raise ValidationError('invalid_action')
        d = get_object_or_404(Delivery, pk=pk, connection__in=cs)
        if d.generation != d.connection.generation:
            raise PermissionDenied()
        if parts[0] == 'ack' and d.kind == 'reminder':
            Delivery.objects.filter(pk=pk, acknowledged_at=None).update(acknowledged_at=timezone.now())
            text = 'دیدن یادآوری ثبت شد؛ وضعیت نوبت تغییری نکرد.'
        elif parts[0] == 'snooze' and d.kind == 'maintenance':
            enqueue(d.connection, f'snooze:{d.pk}', 'maintenance', d.text, appointment=d.appointment, metadata=d.metadata, scheduled_at=timezone.now()+timedelta(days=7), expires_at=timezone.now()+timedelta(days=8))
            text = 'یادآوری برای هفته بعد ثبت شد.'
        elif parts[0] in ('decline', 'rate') and d.kind in ('feedback', 'maintenance'):
            if parts[0] == 'rate':
                if d.kind != 'feedback' or len(parts) != 3 or parts[2] not in ('1','2','3','4','5'):
                    raise ValidationError('invalid_rating')
                Feedback.objects.get_or_create(connection=d.connection, appointment=d.appointment, defaults={'rating': int(parts[2])})
                if int(parts[2]) <= 2:
                    cs.update(suppressed_until=timezone.now()+timedelta(days=30))
            else:
                cs.update(suppressed_until=timezone.now()+timedelta(days=30))
                if d.kind == 'feedback':
                    Feedback.objects.get_or_create(connection=d.connection, appointment=d.appointment, defaults={'declined': True})
            text = 'انتخاب شما به‌صورت خصوصی ثبت شد.'
        else:
            raise ValidationError('invalid_action')
    else:
        raise ValidationError('unsupported_operation')
    return {'text': text[:3500], 'keyboard': rows}


class Pagination(PageNumberPagination):
    page_size = 25


class AdminBase(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    pagination_class = Pagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']


class AdminOverview(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = dict(Delivery.objects.values_list('status').annotate(n=Count('id')))
        return Response({'configured': configured(), 'dry_run': runtime().dry_run, 'token_present': bool(runtime().bot_token), 'bot_username': runtime().bot_username, 'counts': counts, 'linked': Connection.objects.filter(connected=True).count(), 'eligible': Connection.objects.filter(connected=True, reachable=True, marketing=True, user__role='customer', appointment=None).count(), 'heartbeat': Config.solo().heartbeat, 'next_jobs': list(Delivery.objects.filter(status='queued').order_by('scheduled_at').values('id', 'kind', 'scheduled_at')[:10]), 'attributed_bookings': Attribution.objects.count(), 'attributed_completed': Attribution.objects.filter(appointment__status='completed').count(), 'link_visits': Delivery.objects.aggregate(value=Sum('visits'))['value'] or 0, 'acknowledgments': Delivery.objects.filter(acknowledged_at__isnull=False).count()})


class AdminConfig(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(ConfigSerializer(Config.solo()).data)

    def patch(self, request):
        serializer = ConfigSerializer(Config.solo(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CustomerAdmin(AdminBase):
    http_method_names = ['get', 'post', 'head', 'options']

    def list(self, request):
        qs = CustomerProfile.objects.select_related('user').filter(user__role='customer').order_by('-pk')
        search = request.query_params.get('search', '')[:120]
        if search:
            qs = qs.filter(Q(user__first_name__icontains=search) | Q(user__last_name__icontains=search) | Q(user__connection__neighborhood__icontains=search)).distinct()
        if request.query_params.get('filters'):
            try:
                filters = json.loads(request.query_params['filters'])
            except (ValueError, TypeError):
                raise ValidationError('فیلتر معتبر نیست.')
            # Return matching profiles even when not eligible for messaging.
            allowed = {'service_ids', 'category_ids', 'within_days', 'inactive_days', 'neighborhood', 'never_visited', 'operator', 'recipe'}
            if set(filters) - allowed:
                raise ValidationError('فیلتر معتبر نیست.')
            _, _, matched = audience(filters, include_matches=True)
            qs = qs.filter(user_id__in=matched)
        page = self.paginate_queryset(qs)
        rows = []
        for profile in page:
            c = Connection.objects.filter(user=profile.user, appointment=None).first()
            rows.append({'id': profile.pk, 'user': profile.user_id, 'name': profile.user.get_full_name() or 'مشتری', 'appointment': None, 'connected': bool(c and c.connected), 'reachable': bool(c and c.reachable), 'marketing': bool(c and c.marketing), 'neighborhood': c.neighborhood if c else '', 'completed_visits': profile.appointments.filter(status='completed').count(), 'points_balance': balance(profile.user)})
        return self.get_paginated_response(rows)

    def retrieve(self, request, pk=None):
        profile = get_object_or_404(CustomerProfile, pk=pk, user__role='customer')
        c = Connection.objects.filter(user=profile.user, appointment=None).first()
        return Response({'id': profile.pk, 'name': profile.user.get_full_name(), 'connection': ConnectionSerializer(c).data if c else None})

    def create(self, request):
        raise PermissionDenied()

    @action(detail=True, methods=['get'])
    def points(self, request, pk=None):
        profile = get_object_or_404(CustomerProfile, pk=pk, user__role='customer')
        entries = PointsEntry.objects.filter(user=profile.user).order_by('-pk')
        page = self.paginate_queryset(entries)
        return self.get_paginated_response([{'id': e.pk, 'delta': e.delta, 'reason': e.reason, 'created_at': e.created_at, 'expires_at': e.expires_at} for e in page])

    @action(detail=True, methods=['post'])
    def neighborhood(self, request, pk=None):
        profile = get_object_or_404(CustomerProfile, pk=pk, user__role='customer')
        c, _ = Connection.objects.get_or_create(scope=f'account:{profile.user_id}', defaults={'user': profile.user})
        preferences(c, {'neighborhood': str(request.data.get('neighborhood', ''))[:120]}, 'admin_verified')
        AdminActionLog.objects.create(actor=request.user, action='telegram_neighborhood', model_name='CustomerProfile', object_id=str(profile.pk), details={'neighborhood': c.neighborhood})
        return Response({'neighborhood': c.neighborhood})


class SegmentAdmin(AdminBase):
    queryset = Segment.objects.order_by('-pk')
    serializer_class = SegmentSerializer

    @action(detail=False, methods=['post'])
    def preview(self, request):
        return Response(audience(request.data.get('filters', {}))[0])


class TemplateAdmin(AdminBase):
    queryset = Template.objects.order_by('name')
    serializer_class = TemplateSerializer

    def create(self, request):
        raise ValidationError('برای ویرایش، یکی از رویدادهای موجود را انتخاب کنید.')

    def list(self, request, *args, **kwargs):
        for name, text in DEFAULTS.items():
            Template.objects.get_or_create(name=name, defaults={'text': text})
        return super().list(request, *args, **kwargs)


class ServiceRuleAdmin(AdminBase):
    queryset = ServiceRule.objects.order_by('pk')
    serializer_class = ServiceRuleSerializer


class BenefitRuleAdmin(AdminBase):
    queryset = BenefitRule.objects.order_by('-pk')
    serializer_class = BenefitRuleSerializer

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        rule = self.get_object()
        rows = []
        def discount(amount):
            if amount is None:
                return None
            value = min(amount, rule.fixed or amount*rule.percent//100)
            return min(value, rule.maximum) if rule.maximum else value
        for service in rule.services.all():
            low = service.price if service.pricing_type == 'FIXED' else service.minimum_price
            high = service.price if service.pricing_type == 'FIXED' else service.maximum_price
            rows.append({'service': service.persian_name, 'estimated': service.pricing_type != 'FIXED', 'discount_from': discount(low), 'discount_to': discount(high)})
        return Response({'name': rule.name, 'enabled': rule.enabled, 'starts_at': rule.starts_at, 'ends_at': rule.ends_at, 'maximum': rule.maximum or rule.fixed or None, 'points_cost': rule.points_cost, 'services': rows, 'usage_limit': 1, 'stacking': False})

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        user = get_object_or_404(User, pk=request.data.get('user'), role='customer', is_active=True)
        rule = self.get_object()
        b = issue_benefit(user, rule, f'manual:{rule.pk}:{user.pk}')
        return Response(BenefitSerializer(b).data)


class BenefitAdmin(AdminBase):
    queryset = Benefit.objects.order_by('-pk')
    serializer_class = BenefitSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request):
        raise PermissionDenied()

    @action(detail=True, methods=['post'])
    def redeem(self, request, pk=None):
        if request.data.get('confirm') is not True:
            raise ValidationError('تأیید صریح لازم است.')
        return Response(BenefitSerializer(redeem_benefit(self.get_object(), request.user)).data)


class CampaignAdmin(AdminBase):
    queryset = Campaign.objects.order_by('-pk')
    serializer_class = CampaignSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != 'draft':
            # Preserve the sent revision; edits become a new draft.
            old = serializer.instance
            new = Campaign.objects.create(name=old.name, text=old.text, filters=old.filters, service=old.service, offer=old.offer, terms=old.terms, revision=old.revision+1, created_by=self.request.user)
            serializer.instance = new
        else:
            serializer.instance.revision += 1
        serializer.save()

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        c = self.get_object()
        stats, _ = audience(c.filters)
        return Response({**stats, 'text': render(c.text, name='دوست'), 'terms': c.terms, 'scheduled_at': c.scheduled_at, 'revision': c.revision, 'button_url': runtime().site_url + '/book' + ('?service=' + str(c.service_id) if c.service_id else ''), 'offer_terms': BenefitRuleSerializer(c.offer).data if c.offer_id else None})

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        if request.data.get('confirm') is not True:
            raise ValidationError('تأیید ارسال آزمایشی لازم است.')
        if not configured():
            raise ValidationError('ابتدا از تنظیمات ربات، حالت آزمایشی یا ارسال واقعی را فعال کنید.')
        c = Connection.objects.filter(user=request.user, appointment=None, connected=True, reachable=True, manager_reports=True).first()
        if c is None:
            raise NotFound('ابتدا در تنظیمات ربات، حساب مدیر را وصل و دریافت گزارش مدیریت را انتخاب کنید.')
        campaign = self.get_object()
        from rest_framework import serializers
        request_id = serializers.UUIDField().run_validation(request.data.get('request_id'))
        d = enqueue(c, f'test:{campaign.pk}:{campaign.revision}:{request.user.pk}:{request_id}', 'test', render(campaign.text, name=request.user.first_name), expires_at=timezone.now()+timedelta(minutes=15))
        return Response({'status': d.status, 'dry_run': runtime().dry_run})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def schedule(self, request, pk=None):
        c = Campaign.objects.select_for_update().get(pk=self.get_object().pk)
        stats, recipients = audience(c.filters)
        if c.status != 'draft' or request.data.get('confirm') is not True or request.data.get('recipient_count') != stats['eligible'] or request.data.get('revision') != c.revision:
            raise ValidationError('پیش‌نمایش تازه و تأیید شمار مخاطبان لازم است.')
        if c.offer_id and (not c.offer.enabled or not c.offer.starts_at <= c.scheduled_at < c.offer.ends_at or not c.terms):
            raise ValidationError('شرایط و تاریخ پیشنهاد فعال باید مشخص باشد.')
        for recipient in recipients:
            benefit = None
            if c.offer_id:
                benefit = issue_benefit(recipient.user, c.offer, f'campaign:{c.pk}:{recipient.user_id}', allow_future=True)
            enqueue(recipient, f'campaign:{c.pk}:{c.revision}:{recipient.user_id}', 'campaign', render(c.text, name=recipient.user.first_name), campaign=c, template_version=c.revision, scheduled_at=c.scheduled_at, expires_at=c.scheduled_at+timedelta(days=2), metadata={'filters': c.filters, 'terms': c.terms, 'benefit_id': benefit.pk if benefit else None})
        c.status = 'queued'
        c.save(update_fields=['status'])
        return Response({'status': c.status, **stats})

    @action(detail=True, methods=['post'])
    def control(self, request, pk=None):
        c = self.get_object()
        operation = request.data.get('action')
        if operation not in ('paused', 'cancelled', 'queued') or c.status in ('draft', 'completed', 'cancelled'):
            raise ValidationError('تغییر وضعیت مجاز نیست.')
        c.status = operation
        c.save(update_fields=['status'])
        if operation == 'cancelled':
            c.deliveries.filter(status='queued').update(status='cancelled')
        return Response({'status': c.status})

    @action(detail=True, methods=['get'])
    def results(self, request, pk=None):
        return Response(list(self.get_object().deliveries.values('status', 'error').annotate(count=Count('id'))))


class VisitView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        d = get_object_or_404(Delivery, tracking=token, campaign__isnull=False)
        Delivery.objects.filter(pk=d.pk).update(visits=F('visits')+1, first_visited_at=Case(When(first_visited_at__isnull=True, then=Value(timezone.now())), default=F('first_visited_at')))
        params = {'tg_campaign': str(d.tracking)}
        if d.campaign.service_id:
            params['service'] = d.campaign.service_id
        response = HttpResponseRedirect(runtime().site_url+'/book?'+urlencode(params))
        response['Referrer-Policy'] = 'no-referrer'
        response['Cache-Control'] = 'no-store'
        return response


class CustomerBenefits(APIView):
    def get(self, request):
        if request.user.role != 'customer' or request.user.account_status != 'active':
            raise PermissionDenied()
        benefits = Benefit.objects.filter(user=request.user).order_by('-pk')[:100]
        rules = BenefitRule.objects.filter(enabled=True, points_cost__gt=0, starts_at__lte=timezone.now(), ends_at__gt=timezone.now())
        appointments = Appointment.objects.filter(customer__user=request.user, status__in=['pending', 'confirmed']).order_by('-pk')[:30]
        return Response({'balance': balance(request.user), 'benefits': BenefitSerializer(benefits, many=True).data, 'rules': BenefitRuleSerializer(rules, many=True).data, 'appointments': [{'id': a.pk, 'summary': summary(a), 'estimated': a.has_unresolved_prices} for a in appointments]})


class ManagerRecipients(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([{'id': c.pk, 'name': c.user.get_full_name() or c.user.username, 'selected': c.manager_reports, 'reachable': c.reachable} for c in Connection.objects.filter(connected=True, appointment=None, user__role='admin', user__is_active=True, user__account_status='active').select_related('user')])

    def post(self, request):
        c = get_object_or_404(Connection, pk=request.data.get('id'), connected=True, appointment=None, user__role='admin', user__is_active=True, user__account_status='active')
        if type(request.data.get('selected')) is not bool:
            raise ValidationError('انتخاب معتبر نیست.')
        preferences(c, {'manager_reports': request.data['selected']}, 'admin_recipient_selection')
        AdminActionLog.objects.create(actor=request.user, action='telegram_manager', model_name='Connection', object_id=str(c.pk), details={'selected': c.manager_reports})
        return Response({'selected': c.manager_reports})


class AutomationPreview(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from datetime import datetime, time as day_time
        from .services import TEHRAN
        previews = []
        for rule in ServiceRule.objects.select_related('service'):
            latest = AppointmentItem.objects.filter(service=rule.service, completion_status='completed').order_by('-completed_at').first()
            next_run = datetime.combine(timezone.localtime(latest.completed_at or latest.updated_at, TEHRAN).date()+timedelta(days=rule.interval_days), day_time(10), tzinfo=TEHRAN) if latest and rule.interval_days else None
            previews.append({'id': rule.pk, 'service': rule.service.persian_name, 'enabled': rule.enabled, 'next_preview': next_run, 'interval_days': rule.interval_days})
        config = Config.solo()
        return Response({'service_rules': previews, 'birthday_enabled': config.birthday_enabled, 'reactivation_enabled': config.reactivation_enabled, 'points_enabled': bool(config.points_per_toman), 'timezone': 'Asia/Tehran', 'note': 'پیش‌نمایش از آخرین سرویس انجام‌شده؛ رضایت، نوبت پیش‌رو، سقف و ساعات مجاز هنگام ارسال دوباره بررسی می‌شوند.'})


class AdminSetup(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from .integration import public_setup
        return Response(public_setup(), headers={'Cache-Control': 'no-store'})

    def patch(self, request):
        from .integration import SetupInput, save_setup, public_setup
        if not request.is_secure() and not settings.DEBUG:
            raise PermissionDenied('اطلاعات ربات را فقط از نشانی امن HTTPS ذخیره کنید.')
        serializer = SetupInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = save_setup(serializer.validated_data)
        AdminActionLog.objects.create(actor=request.user, action='telegram_setup', model_name='IntegrationSettings', object_id='1', details={'mode': row.mode, 'fields': [k for k in serializer.validated_data if k not in ['revision', 'confirm_live']]})
        return Response(public_setup(), headers={'Cache-Control': 'no-store'})

    def post(self, request):
        from .integration import verify_saved_bot, public_setup
        from django.core.cache import cache
        if request.data.get('action') != 'verify':
            raise ValidationError('عملیات معتبر نیست.')
        if not cache.add(f'telegram-verify:{request.user.pk}', True, 10):
            return Response({'detail': 'ده ثانیه صبر کنید و دوباره بررسی کنید.'}, status=429)
        verify_saved_bot()
        AdminActionLog.objects.create(actor=request.user, action='telegram_verify', model_name='IntegrationSettings', object_id='1', details={'verified': True})
        return Response(public_setup(), headers={'Cache-Control': 'no-store'})
