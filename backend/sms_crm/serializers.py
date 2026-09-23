from rest_framework import serializers

from .models import DEFAULT_TEMPLATES, SmsConfig, SmsTemplate, validate_template_text
from .services import sms_parts


class SmsConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsConfig
        fields = ("mode", "reminder_hours", "enabled_events", "template_selection", "daily_limit")

    def validate_reminder_hours(self, value):
        if not isinstance(value, list) or len(value) > 5 or any(type(hour) is not int or hour < 1 or hour > 168 for hour in value) or len(set(value)) != len(value):
            raise serializers.ValidationError("ساعت‌های یادآوری باید یکتا و بین ۱ تا ۱۶۸ باشند.")
        return sorted(value, reverse=True)

    def validate_enabled_events(self, value):
        if not isinstance(value, list) or any(event not in tuple(DEFAULT_TEMPLATES)[:4] for event in value) or len(set(value)) != len(value):
            raise serializers.ValidationError("رویدادهای انتخاب‌شده معتبر نیستند.")
        return value

    def validate_template_selection(self, value):
        if not isinstance(value, dict) or any(kind not in DEFAULT_TEMPLATES or choice not in {"default", "custom"} for kind, choice in value.items()):
            raise serializers.ValidationError("انتخاب قالب معتبر نیست.")
        return value


class SmsTemplateSerializer(serializers.ModelSerializer):
    parts = serializers.SerializerMethodField()

    class Meta:
        model = SmsTemplate
        fields = ("kind", "text", "version", "updated_at", "parts")
        read_only_fields = ("kind", "version", "updated_at", "parts")

    def validate_text(self, value):
        validate_template_text(value)
        return value

    def get_parts(self, obj):
        return sms_parts(obj.text)
