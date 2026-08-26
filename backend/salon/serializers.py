from rest_framework import serializers
from .models import Appointment, Employee, Service

class ServiceSerializer(serializers.ModelSerializer):
    employees = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = "__all__"

    def get_employees(self, obj):
        return [{"id": employee.id, "name": employee.user.get_full_name(), "specialty": employee.specialty} for employee in obj.employees.filter(is_active=True)]


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = Employee
        fields = ("id", "name", "specialty", "is_active", "services")

class AppointmentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(write_only=True, required=False)
    customer_phone = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "employee", "service", "date", "start_time", "end_time", "price", "status", "notes", "created_at", "customer_name", "customer_phone")
        read_only_fields = ("customer", "price", "end_time")
    def validate(self, attrs):
        service, employee = attrs["service"], attrs["employee"]
        if not service.is_active or not employee.is_active or not employee.services.filter(pk=service.pk).exists():
            raise serializers.ValidationError("این متخصص این خدمت را ارائه نمی‌دهد.")
        if attrs["start_time"].minute % 15:
            raise serializers.ValidationError("زمان شروع باید مضربی از ۱۵ دقیقه باشد.")
        return attrs

    def create(self, validated_data):
        from .models import User
        name = validated_data.pop("customer_name", "مشتری آنلاین")
        phone = validated_data.pop("customer_phone", "")
        request = self.context["request"]
        customer = request.user if request.user.is_authenticated else None
        if customer is None:
            username = f"guest_{phone or 'online'}_{validated_data['date'].strftime('%Y%m%d%H%M%S')}"
            customer = User.objects.create_user(username=username, first_name=name, phone=phone)
        return Appointment.objects.create(customer=customer, **validated_data)