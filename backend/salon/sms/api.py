from datetime import timedelta
from uuid import uuid4
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from salon.models import CustomerProfile, Service, ServiceCategory, EmployeeProfile
from salon.permissions import IsAdmin
from .models import SMSCampaign, SMSAutomation, SMSDelivery, SMSSettings
from .audience import customer_data, audience, public_row
from .phone import normalize_phone
from .templates import VARIABLES, render
from .providers import get_provider, ProviderUnavailable
from .service import (configuration, provider_state, campaign_preview, confirm_campaign,
    campaign_report, set_consent)


def validation_error(exc):
    raise serializers.ValidationError({'detail': str(exc)}) from exc


class SegmentSerializer(serializers.Serializer):
    service = serializers.IntegerField(min_value=1, required=False)
    category = serializers.IntegerField(min_value=1, required=False)
    employee = serializers.IntegerField(min_value=1, required=False)
    inactive_days = serializers.IntegerField(min_value=1, max_value=3650, required=False)
    min_visits = serializers.IntegerField(min_value=0, required=False)
    min_spend = serializers.IntegerField(min_value=0, required=False)
    new_days = serializers.IntegerField(min_value=1, max_value=3650, required=False)
    visited_after = serializers.DateField(required=False)
    visited_before = serializers.DateField(required=False)

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError('فیلتر مخاطبان معتبر نیست.')
        for key, model in (('service', Service), ('category', ServiceCategory), ('employee', EmployeeProfile)):
            if attrs.get(key) and not model.objects.filter(pk=attrs[key]).exists():
                raise serializers.ValidationError('سرویس، دسته یا متخصص پیدا نشد.')
        if attrs.get('visited_after') and attrs.get('visited_before') and attrs['visited_after'] > attrs['visited_before']:
            raise serializers.ValidationError('بازه تاریخ معتبر نیست.')
        return {k: v.isoformat() if hasattr(v, 'isoformat') else v for k, v in attrs.items()}


class TemplateValidation:
    def validate_segment(self, value):
        serializer = SegmentSerializer(data=value)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def validate(self, attrs):
        def value(key, default=''):
            return attrs.get(key, getattr(self.instance, key, default))
        service = value('service', None)
        dynamic_service = value('kind') == 'service_reminder' or value('kind').startswith('appointment_')
        context = {'first_name': 'مشتری', 'service_name': service.name if service else ('سرویس' if dynamic_service else ''),
            'booking_link': value('booking_link') or configuration().booking_link,
            'discount_code': value('discount_code'), 'salon_name': configuration().salon_name}
        if value('kind').startswith('appointment_'):
            context.update(appointment_date='1405-01-01', appointment_time='10:00')
        try:
            render(value('message'), context)
        except ValueError as exc:
            validation_error(exc)
        return attrs


class CampaignSerializer(TemplateValidation, serializers.ModelSerializer):
    report = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = SMSCampaign
        fields = ('id', 'name', 'message', 'segment', 'service', 'discount_code', 'booking_link', 'status',
            'created_by', 'created_by_name', 'created_at', 'scheduled_at', 'report')
        read_only_fields = ('status', 'created_by', 'created_at', 'scheduled_at')

    def get_report(self, obj):
        return campaign_report(obj)


class AutomationSerializer(TemplateValidation, serializers.ModelSerializer):
    next_expected_run = serializers.SerializerMethodField()

    class Meta:
        model = SMSAutomation
        fields = '__all__'
        read_only_fields = ('last_run',)

    def get_next_expected_run(self, obj):
        config = configuration()
        if obj.enabled and config.last_worker_at and config.last_worker_at > timezone.now() - timedelta(minutes=3):
            return config.last_worker_at + timedelta(minutes=1)
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        value = lambda k, default=None: attrs.get(k, getattr(self.instance, k, default))
        if not 1 <= value('interval_days', 30) <= 3650 or not 1 <= value('hours_before', 24) <= 168:
            raise serializers.ValidationError('فاصله روز یا ساعت معتبر نیست.')
        if value('kind') == 'service_reminder' and not (value('service') or value('category')):
            raise serializers.ValidationError('برای یادآوری ترمیم، سرویس یا دسته را انتخاب کنید.')
        if self.instance and 'kind' in attrs and attrs['kind'] != self.instance.kind:
            raise serializers.ValidationError('برای نوع متفاوت، قانون جدید بسازید.')
        return attrs


class DeliverySerializer(serializers.ModelSerializer):
    attempts = serializers.SerializerMethodField()

    class Meta:
        model = SMSDelivery
        fields = '__all__'

    def get_attempts(self, obj):
        return list(obj.attempts.values('created_at', 'status', 'failure_reason', 'provider_message_id'))


class CampaignViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = CampaignSerializer
    queryset = SMSCampaign.objects.select_related('service', 'created_by').order_by('-created_at')
    http_method_names = ('get', 'post', 'patch', 'head', 'options')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            obj = SMSCampaign.objects.select_for_update().get(pk=self.get_object().pk)
            if obj.status != 'draft':
                raise serializers.ValidationError('فقط پیش‌نویس قابل ویرایش است.')
            serializer = self.get_serializer(obj, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        try:
            entries, fingerprint = campaign_preview(self.get_object())
        except ValueError as exc:
            validation_error(exc)
        return Response({'recipient_count': len(entries), 'total_parts': sum(e['parts'] for e in entries),
            'audience': entries[:50], 'confirmation_token': signing.dumps(fingerprint, salt='sms-preview'), 'variables': VARIABLES})

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        serializer = ConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            campaign = confirm_campaign(self.get_object().pk, serializer.validated_data['confirmation_token'], serializer.validated_data.get('scheduled_at'))
        except (ValueError, ProviderUnavailable) as exc:
            validation_error(exc)
        return Response(self.get_serializer(campaign).data)

    @action(detail=True, methods=['post'], url_path='test-send')
    def test_send(self, request, pk=None):
        campaign = self.get_object()
        try:
            get_provider()
            phone = normalize_phone(request.data.get('phone'))
            message = render(campaign.message, {'first_name': request.user.first_name or 'مدیر',
                'service_name': campaign.service.name if campaign.service else '', 'salon_name': configuration().salon_name,
                'booking_link': campaign.booking_link or configuration().booking_link, 'discount_code': campaign.discount_code})
        except (ValueError, ProviderUnavailable) as exc:
            validation_error(exc)
        delivery = SMSDelivery.objects.create(phone=phone, message='[آزمایش] ' + message, kind='test', dedupe_key='test:' + uuid4().hex)
        return Response(DeliverySerializer(delivery).data, status=201)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        with transaction.atomic():
            obj = SMSCampaign.objects.select_for_update().get(pk=self.get_object().pk)
            if obj.status in ('completed', 'cancelled'):
                return Response(self.get_serializer(obj).data)
            obj.status = 'cancelled'
            obj.save(update_fields=('status',))
            obj.deliveries.filter(status='queued').update(status='cancelled', failure_reason='توقف توسط مدیر')
        return Response(self.get_serializer(obj).data)


class ConfirmSerializer(serializers.Serializer):
    confirmation_token = serializers.CharField()
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)


class AutomationViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = AutomationSerializer
    queryset = SMSAutomation.objects.select_related('service', 'category').order_by('id')
    http_method_names = ('get', 'post', 'patch', 'head', 'options')


class DeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = DeliverySerializer

    def get_queryset(self):
        qs = SMSDelivery.objects.prefetch_related('attempts')
        for field in ('campaign', 'customer', 'status', 'kind'):
            value = self.request.query_params.get(field)
            if value:
                if field in ('campaign', 'customer') and not value.isdigit():
                    raise serializers.ValidationError('شناسه معتبر نیست.')
                qs = qs.filter(**{field: value})
        return qs


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SMSSettings
        exclude = ('id',)
        read_only_fields = ('last_worker_at',)

    def validate_manager_phone(self, value):
        try:
            return normalize_phone(value) if value else ''
        except ValueError as exc:
            validation_error(exc)

    def validate(self, attrs):
        val = lambda k: attrs.get(k, getattr(self.instance, k))
        if not 0 <= val('daily_summary_hour') <= 23 or not 1 <= val('batch_size') <= 100:
            raise serializers.ValidationError('ساعت باید بین ۰ تا ۲۳ و اندازه دسته بین ۱ تا ۱۰۰ باشد.')
        if any(val(k) for k in ('daily_summary_enabled', 'campaign_summary_enabled', 'failure_alert_enabled')) and not val('manager_phone'):
            raise serializers.ValidationError('شماره مدیر را وارد کنید.')
        return attrs


class SettingsView(APIView):
    permission_classes = (IsAdmin,)

    def get(self, request):
        config = configuration()
        return Response({'settings': SettingsSerializer(config).data, 'provider': provider_state(), 'variables': VARIABLES,
            'worker_running': bool(config.last_worker_at and config.last_worker_at > timezone.now() - timedelta(minutes=3))})

    def patch(self, request):
        serializer = SettingsSerializer(configuration(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self.get(request)


class AudienceView(APIView):
    permission_classes = (IsAdmin,)

    def post(self, request):
        serializer = SegmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = audience(serializer.validated_data)
        return Response({'count': len(rows), 'customers': [public_row(r) for r in rows[:100]]})


class CustomerCRMView(APIView):
    permission_classes = (IsAdmin,)

    def get(self, request, pk=None):
        rows = customer_data()
        if pk:
            row = next((r for r in rows if r['id'] == pk), None)
            if not row:
                return Response(status=404)
            return Response({**public_row(row), 'opted_out_at': row['customer'].marketing_opted_out_at,
                'sms_history': DeliverySerializer(row['customer'].sms_history.prefetch_related('attempts')[:100], many=True).data,
                'consent_history': list(row['customer'].sms_consent_events.values('allowed', 'evidence', 'created_at'))})
        query = request.query_params.get('search', '').strip().lower()
        rows = [r for r in rows if query in r['name'].lower() or query in r['phone']]
        return Response({'count': len(rows), 'results': [public_row(r) for r in rows[:100]]})

    def patch(self, request, pk):
        customer = get_object_or_404(CustomerProfile, pk=pk)
        serializer = CustomerPreferencesSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            if 'marketing_sms_allowed' in data:
                try:
                    customer = set_consent(customer, data['marketing_sms_allowed'], request.user, data.get('evidence', ''))
                except ValueError as exc:
                    validation_error(exc)
            if 'birth_date' in data:
                customer.birth_date = data['birth_date']
                customer.save(update_fields=('birth_date',))
        return self.get(request, pk)


class CustomerPreferencesSerializer(serializers.Serializer):
    marketing_sms_allowed = serializers.BooleanField(required=False)
    birth_date = serializers.DateField(required=False, allow_null=True)
    evidence = serializers.CharField(required=False, max_length=500, allow_blank=True)

    def validate_birth_date(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError('تاریخ تولد نمی‌تواند در آینده باشد.')
        return value


class OwnPreferencesView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request):
        customer = get_object_or_404(CustomerProfile, user=request.user)
        serializer = CustomerPreferencesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if 'marketing_sms_allowed' in serializer.validated_data:
                customer = set_consent(customer, serializer.validated_data['marketing_sms_allowed'], request.user, 'انتخاب در حساب مشتری', self_service=True)
            if 'birth_date' in serializer.validated_data:
                customer.birth_date = serializer.validated_data['birth_date']
                customer.save(update_fields=('birth_date',))
        return Response({'marketing_sms_allowed': customer.marketing_sms_allowed, 'birth_date': customer.birth_date})


class OptOutView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        try:
            data = signing.loads(request.data.get('token', ''), salt='sms-optout')
            customer = CustomerProfile.objects.select_related('user').get(pk=data['customer'], user__phone=data['phone'])
        except (signing.BadSignature, CustomerProfile.DoesNotExist, KeyError, TypeError):
            raise serializers.ValidationError('لینک معتبر نیست؛ برای لغو پیامک با سالن تماس بگیرید.')
        set_consent(customer, False, None, 'لغو توسط مشتری از لینک پیامک')
        return Response({'detail': 'پیامک تبلیغاتی برای شما غیرفعال شد. پیام‌های مربوط به نوبت جدا هستند.'})
