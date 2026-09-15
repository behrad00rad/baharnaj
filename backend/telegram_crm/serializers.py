from rest_framework import serializers
from .models import Config, Campaign, Segment, Template, ServiceRule, BenefitRule, Benefit, Connection
from .services import render, audience


class ConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = Config
        exclude = ['worker_lease']
        read_only_fields = ['id', 'heartbeat']

    def validate(self, data):
        start = data.get('marketing_start', getattr(self.instance, 'marketing_start', 10))
        end = data.get('marketing_end', getattr(self.instance, 'marketing_end', 20))
        if not 0 <= start < end <= 24:
            raise serializers.ValidationError('ساعت شروع باید پیش از پایان باشد.')
        events = data.get('status_events', [])
        if not isinstance(events, list) or any(e not in ['pending', 'confirmed', 'rescheduled', 'cancelled'] for e in events):
            raise serializers.ValidationError('رویداد نوبت معتبر نیست.')
        hours = data.get('reminder_hours', [])
        if not isinstance(hours, list) or len(hours) > 5 or any(type(x) is not int or not 1 <= x <= 168 for x in hours) or len(set(hours)) != len(hours):
            raise serializers.ValidationError('حداکثر پنج زمان یادآوری بین ۱ و ۱۶۸ ساعت وارد کنید.')
        for key in ['cap_days', 'attribution_days', 'points_expiry_days', 'reactivation_days']:
            if key in data and not 1 <= data[key] <= 3650:
                raise serializers.ValidationError('بازه روز باید بین ۱ و ۳۶۵۰ باشد.')
        for key in ['map_url', 'support_url', 'instagram_url']:
            if data.get(key) and not data[key].startswith('https://'):
                raise serializers.ValidationError('پیوند باید HTTPS باشد.')
        return data


class CampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = '__all__'
        read_only_fields = ['status', 'revision', 'created_by', 'created_at']

    def validate_text(self, value):
        render(value)
        return value

    def validate_filters(self, value):
        audience(value)
        return value


class SegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Segment
        fields = '__all__'

    def validate_filters(self, value):
        audience(value)
        return value


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = '__all__'
        read_only_fields = ['version', 'name']

    def validate_text(self, value):
        render(value)
        return value

    def update(self, instance, data):
        data['version'] = instance.version+1
        return super().update(instance, data)


class ServiceRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRule
        fields = '__all__'

    def validate(self, data):
        if data.get('enabled') and not any(data.get(k, getattr(self.instance, k, None)) for k in ['interval_days', 'aftercare', 'feedback']):
            raise serializers.ValidationError('حداقل یک پیگیری را تنظیم کنید.')
        return data


class BenefitRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = BenefitRule
        fields = '__all__'

    def validate(self, data):
        get = lambda k, default=None: data.get(k, getattr(self.instance, k, default))
        if get('starts_at') >= get('ends_at') or not 0 <= get('percent', 0) <= 100 or bool(get('percent', 0)) == bool(get('fixed', 0)):
            raise serializers.ValidationError('تاریخ و یکی از درصد یا مبلغ ثابت را مشخص کنید.')
        if 'services' in data and not data['services']:
            raise serializers.ValidationError('سرویس‌های مشمول را انتخاب کنید.')
        return data


class BenefitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Benefit
        fields = '__all__'


class ConnectionSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = Connection
        exclude = ['telegram_user_id', 'chat_id']

    def get_name(self, obj):
        return obj.user.get_full_name() or 'مشتری'
