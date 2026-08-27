from datetime import datetime, date as date_type, time, timedelta
from uuid import uuid4

from rest_framework import serializers
from .models import Appointment, AppointmentService, Employee, Service, Transaction, User, WorkRecord, WorkingHour

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
    services = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True), many=True, required=False)
    service_assignments = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "employee", "service", "services", "service_assignments", "date", "start_time", "end_time", "price", "status", "notes", "created_at", "customer_name", "customer_phone")
        read_only_fields = ("customer", "price", "end_time")
    def validate(self, attrs):
        service = attrs.get("service")
        assignments = attrs.get("service_assignments")
        selected_services = attrs.get("services") or ([service] if service else [])
        employee = attrs.get("employee")
        if assignments:
            try:
                assignment_ids = [(int(item["service"]), int(item["employee"])) for item in assignments]
                assignment_services = list(Service.objects.filter(pk__in=[item[0] for item in assignment_ids], is_active=True))
                assignment_employees = {item.id: item for item in Employee.objects.filter(pk__in=[item[1] for item in assignment_ids], is_active=True)}
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("خدمت و متخصص هر ردیف معتبر نیست.")
            if len(assignment_ids) != len(set(item[0] for item in assignment_ids)) or len(assignment_services) != len(assignment_ids) or any(item[1] not in assignment_employees or not assignment_employees[item[1]].services.filter(pk=item[0]).exists() for item in assignment_ids):
                raise serializers.ValidationError("این متخصص این خدمت را ارائه نمی‌دهد.")
            selected_services = assignment_services
            employee = assignment_employees[assignment_ids[0][1]]
            attrs["employee"] = employee
            attrs["service"] = next(item for item in selected_services if item.id == assignment_ids[0][0])
        elif not selected_services or not employee or not employee.is_active or employee.services.filter(pk__in=[item.pk for item in selected_services]).count() != len(selected_services):
            raise serializers.ValidationError("این متخصص این خدمت را ارائه نمی‌دهد.")
        attrs["service"] = service or selected_services[0]
        if attrs["date"] < date_type.today():
            raise serializers.ValidationError("تاریخ نوبت نمی‌تواند در گذشته باشد.")
        if attrs["start_time"].minute % 15:
            raise serializers.ValidationError("زمان شروع باید مضربی از ۱۵ دقیقه باشد.")
        if attrs["start_time"] < time(8) or attrs["start_time"] >= time(20):
            raise serializers.ValidationError("ساعت شروع باید بین ۰۸:۰۰ و ۲۰:۰۰ باشد.")
        duration = sum(item.duration for item in selected_services)
        if (datetime.combine(attrs["date"], attrs["start_time"]) + timedelta(minutes=duration)).time() > time(20):
            raise serializers.ValidationError("مدت نوبت نباید از ساعت ۲۰:۰۰ عبور کند.")
        return attrs

    def create(self, validated_data):
        from .models import User
        name = validated_data.pop("customer_name", "مشتری آنلاین")
        phone = validated_data.pop("customer_phone", "")
        request = self.context["request"]
        customer = validated_data.pop("customer", None)
        assignments = validated_data.pop("service_assignments", None)
        selected_services = validated_data.pop("services", None) or [validated_data["service"]]
        service = validated_data["service"]
        validated_data.setdefault("price", sum(item.price for item in selected_services))
        validated_data.setdefault("end_time", (datetime.combine(validated_data["date"], validated_data["start_time"]) + timedelta(minutes=sum(item.duration for item in selected_services))).time())
        customer = customer or (request.user if request.user.is_authenticated else None)
        if customer is None:
            username = f"guest_{phone or 'online'}_{validated_data['date'].strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}"
            customer = User.objects.create_user(username=username, first_name=name, phone=phone)
        appointment = Appointment.objects.create(customer=customer, **validated_data)
        if assignments:
            AppointmentService.objects.bulk_create([
                AppointmentService(appointment=appointment, service_id=int(item["service"]), employee_id=int(item["employee"]))
                for item in assignments
            ])
        else:
            AppointmentService.objects.bulk_create([AppointmentService(appointment=appointment, service=item, employee=appointment.employee) for item in selected_services])
        return appointment