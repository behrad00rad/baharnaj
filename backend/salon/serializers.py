from rest_framework import serializers
from .models import Appointment, Service

class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = "__all__"

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = "__all__"
        read_only_fields = ("customer", "price", "end_time")
    def validate(self, attrs):
        service, employee = attrs["service"], attrs["employee"]
        if not service.is_active or not employee.is_active or not employee.services.filter(pk=service.pk).exists():
            raise serializers.ValidationError("این متخصص این خدمت را ارائه نمی‌دهد.")
        if attrs["start_time"].minute % 15:
            raise serializers.ValidationError("زمان شروع باید مضربی از ۱۵ دقیقه باشد.")
        return attrs