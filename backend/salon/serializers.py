from datetime import datetime, time, timedelta
from django.utils import timezone
from uuid import uuid4

from django.conf import settings
from rest_framework import serializers

from .models import (
    AccountLogin, AdminActionLog, Appointment, AppointmentItem, CustomerProfile, EmployeeProfile,
    EmployeeService, GalleryAsset, Payment, Service, ServiceCategory, ServiceImage,
    BookingHold, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule,
)
from .validators import validate_no_employee_overlap
from .security import validate_image_upload, validate_phone


def absolute_gallery_url(request, value):
    if not value or not value.startswith("/"):
        return value
    if settings.PUBLIC_BACKEND_URL:
        return f"{settings.PUBLIC_BACKEND_URL}{value}"
    return request.build_absolute_uri(value) if request else value


class ServiceSerializer(serializers.ModelSerializer):
    employees = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = "__all__"

    def get_employees(self, obj):
        return [{"id": link.employee_id, "name": link.employee.user.get_full_name(), "specialty": link.employee.specialty}
                for link in obj.employee_links.filter(is_active=True).select_related("employee__user")
                if link.employee.is_active and not link.employee.is_deleted]


class GalleryAssetSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = GalleryAsset
        fields = ("id", "title", "category", "image", "image_url", "description", "display_order")
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def validate_image(self, value):
        return validate_image_upload(value)

    def get_image_url(self, obj):
        return absolute_gallery_url(self.context.get("request"), obj.image.url if obj.image else obj.image_url)


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = EmployeeProfile
        fields = ("id", "name", "specialty", "is_active", "profile_photo")

    def validate_profile_photo(self, value):
        return validate_image_upload(value)


class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "phone", "role", "account_status", "is_active", "is_staff")


class ServiceAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = "__all__"


class ServiceImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceImage
        fields = "__all__"

    def validate_image(self, value):
        return validate_image_upload(value)


class AppointmentItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentItem
        fields = ("id", "service", "employee", "date", "start_time", "end_time", "price_snapshot", "duration_snapshot", "notes", "completion_status")
        read_only_fields = ("id", "price_snapshot", "duration_snapshot")

    def validate(self, attrs):
        service = attrs.get("service", self.instance.service if self.instance else None)
        employee = attrs.get("employee", self.instance.employee if self.instance else None)
        request = self.context.get("request")
        if request and request.user.role == "employee" and employee.user_id != request.user.id:
            raise serializers.ValidationError("هر متخصص فقط می‌تواند ردیف‌های خودش را مدیریت کند.")
        if not service.is_active or not service.is_bookable or not EmployeeService.objects.filter(employee=employee, service=service, is_active=True).exists():
            raise serializers.ValidationError("این متخصص این خدمت را ارائه نمی‌دهد.")
        appointment_date = attrs.get("date", self.instance.date if self.instance else None)
        start_time = attrs.get("start_time", self.instance.start_time if self.instance else None)
        end_time = attrs.get("end_time", self.instance.end_time if self.instance else None)
        if not employee.working_schedules.filter(weekday=appointment_date.weekday(), is_active=True, start_time__lte=start_time, end_time__gte=end_time).exists():
            raise serializers.ValidationError("زمان انتخاب‌شده خارج از ساعات کاری متخصص است.")
        if employee.time_off.filter(start_date__lte=appointment_date, end_date__gte=appointment_date).exists():
            raise serializers.ValidationError("متخصص در این تاریخ در دسترس نیست.")
        validate_no_employee_overlap(
            employee=employee, date=appointment_date, start_time=start_time, end_time=end_time,
            item_id=self.instance.pk if self.instance else None,
        )
        return attrs


class AppointmentSerializer(serializers.ModelSerializer):
    items = AppointmentItemSerializer(many=True)
    customer_name = serializers.CharField(write_only=True, required=False)
    customer_phone = serializers.CharField(write_only=True, required=False)
    hold_token = serializers.UUIDField(write_only=True, required=False)
    create_account = serializers.BooleanField(write_only=True, required=False, default=False)
    account_password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "items", "status", "notes", "created_by", "updated_by", "created_at", "updated_at", "confirmation_code", "customer_name", "customer_phone", "hold_token", "create_account", "account_password")
        read_only_fields = ("id", "customer", "created_by", "updated_by", "created_at", "updated_at")

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("حداقل یک خدمت برای نوبت الزامی است.")
        for position, item in enumerate(items):
            for other in items[position + 1:]:
                if item["employee"] != other["employee"] or item["date"] != other["date"]:
                    continue
                if item["start_time"] < other["end_time"] and item["end_time"] > other["start_time"]:
                    raise serializers.ValidationError("ردیف‌های نوبت برای یک متخصص هم‌پوشانی دارند.")
        return items

    def validate_customer_phone(self, value):
        return validate_phone(value)

    def create(self, validated_data):
        item_data = validated_data.pop("items")
        hold_token = validated_data.pop("hold_token", None)
        create_account = validated_data.pop("create_account", False)
        account_password = validated_data.pop("account_password", None)
        name = validated_data.pop("customer_name", "مشتری آنلاین")
        phone = validated_data.pop("customer_phone", "")
        request = self.context.get("request")
        customer = request.user if request and request.user.is_authenticated else None
        if customer is None:
            customer = User.objects.create_user(username=f"guest_{phone or 'online'}_{uuid4().hex[:10]}", first_name=name, phone=phone)
        if create_account and account_password:
            customer.username = phone
            customer.set_password(account_password)
            customer.save(update_fields=("username", "password"))
        customer_profile, _ = CustomerProfile.objects.get_or_create(user=customer)
        if hold_token:
            hold = BookingHold.objects.filter(token=hold_token, expires_at__gt=timezone.now()).first()
            if not hold or not any(item["employee"] == hold.employee and item["service"] == hold.service and item["date"] == hold.date and item["start_time"] == hold.start_time for item in item_data):
                raise serializers.ValidationError("این زمان دیگر در اختیار شما نیست.")
        appointment = Appointment.objects.create(customer=customer_profile, created_by=customer, **validated_data)
        AppointmentItem.objects.bulk_create([
            AppointmentItem(
                appointment=appointment,
                created_by=customer,
                updated_by=customer,
                price_snapshot=item["service"].price,
                duration_snapshot=item["service"].duration,
                **item,
            )
            for item in item_data
        ])
        if hold_token:
            BookingHold.objects.filter(token=hold_token).delete()
        from .notifications import send_booking_confirmation
        send_booking_confirmation(appointment)
        return appointment


class BookingHoldSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingHold
        fields = ("token", "employee", "service", "date", "start_time", "end_time", "expires_at")
        read_only_fields = ("token", "expires_at")


class WaitlistEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = WaitlistEntry
        fields = "__all__"
        read_only_fields = ("notified_at", "created_at")


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"


class EmployeeServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeService
        fields = "__all__"


class WorkingScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkingSchedule
        fields = "__all__"


class TimeOffSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOff
        fields = "__all__"
        read_only_fields = ("employee", "created_by", "updated_by", "created_at", "updated_at")


class AdminActionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminActionLog
        fields = "__all__"
        read_only_fields = ("id", "actor", "changed_at")
