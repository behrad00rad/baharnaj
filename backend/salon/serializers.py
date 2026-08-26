from datetime import datetime, timedelta

from rest_framework import serializers
from .models import Appointment, Employee, Service, Transaction, User, WorkRecord, WorkingHour

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


class EmployeeAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ("id", "user", "specialty", "commission_value", "is_active", "services")


class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "phone", "role", "is_active", "is_staff")


class ServiceAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = "__all__"


class WorkingHourSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkingHour
        fields = "__all__"


class WorkRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkRecord
        fields = "__all__"
        read_only_fields = ("employee", "service", "price", "commission", "completed_at")

    def create(self, validated_data):
        appointment = validated_data["appointment"]
        validated_data.setdefault("employee", appointment.employee)
        validated_data.setdefault("service", appointment.service)
        validated_data.setdefault("price", appointment.price)
        validated_data["commission"] = round(validated_data["price"] * float(validated_data["employee"].commission_value) / 100)
        appointment.status = "completed"
        appointment.save(update_fields=("status",))
        return super().create(validated_data)


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = "__all__"

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
        customer = validated_data.pop("customer", None)
        service = validated_data["service"]
        validated_data.setdefault("price", service.price)
        validated_data.setdefault("end_time", (datetime.combine(validated_data["date"], validated_data["start_time"]) + timedelta(minutes=service.duration)).time())
        customer = customer or (request.user if request.user.is_authenticated else None)
        if customer is None:
            username = f"guest_{phone or 'online'}_{validated_data['date'].strftime('%Y%m%d%H%M%S')}"
            customer = User.objects.create_user(username=username, first_name=name, phone=phone)
        return Appointment.objects.create(customer=customer, **validated_data)