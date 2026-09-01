from datetime import datetime, time, timedelta
from django.utils import timezone
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from .models import (
    AccountLogin, AdminActionLog, Appointment, AppointmentItem, CustomerProfile, EmployeeProfile,
    EmployeeService, GalleryAsset, Payment, Service, ServiceCategory, ServiceImage,
    BookingHold, BookingHoldItem, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule,
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
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "name", "specialty", "is_active", "profile_photo", "profile_photo_url")
        extra_kwargs = {"profile_photo": {"write_only": True, "required": False}}

    def get_profile_photo_url(self, obj):
        return absolute_gallery_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

    def validate_profile_photo(self, value):
        if isinstance(value, str):
            raise serializers.ValidationError("لطفاً یک فایل تصویر جدید انتخاب کنید.")
        return validate_image_upload(value)


class EmployeeSelfProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "name", "bio", "profile_photo", "profile_photo_url")
        read_only_fields = ("id", "name")
        extra_kwargs = {"profile_photo": {"write_only": True, "required": False}}

    def get_profile_photo_url(self, obj):
        return absolute_gallery_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

    def validate_profile_photo(self, value):
        if isinstance(value, str):
            raise serializers.ValidationError("لطفاً یک فایل تصویر جدید انتخاب کنید.")
        return validate_image_upload(value)


class EmployeePasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("رمز عبور فعلی صحیح نیست.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "تکرار رمز عبور جدید مطابقت ندارد."})
        try:
            password_validation.validate_password(attrs["new_password"], self.context["request"].user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": list(error.messages)}) from error
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=("password",))
        return user


class AdminEmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    profile_photo_url = serializers.SerializerMethodField()
    services = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True, is_bookable=True), many=True, required=False, write_only=True)
    service_ids = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "user", "name", "specialty", "bio", "commission_rate", "is_active", "profile_photo", "profile_photo_url", "services", "service_ids")
        extra_kwargs = {"profile_photo": {"write_only": True, "required": False}}

    def get_profile_photo_url(self, obj):
        return absolute_gallery_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

    def validate_profile_photo(self, value):
        if isinstance(value, str):
            raise serializers.ValidationError("لطفاً یک فایل تصویر جدید انتخاب کنید.")
        return validate_image_upload(value)

    def get_service_ids(self, obj):
        return list(obj.service_links.filter(is_active=True).values_list("service_id", flat=True))

    def update(self, instance, validated_data):
        services = validated_data.pop("services", None)
        employee = super().update(instance, validated_data)
        if services is not None:
            EmployeeService.objects.filter(employee=employee).delete()
            EmployeeService.objects.bulk_create([EmployeeService(employee=employee, service=service) for service in services])
        return employee


class AdminEmployeeCreateSerializer(AdminEmployeeSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    username = serializers.CharField(required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    name = serializers.CharField(required=False, write_only=True, allow_blank=True)
    phone = serializers.CharField(required=False, write_only=True, allow_blank=True)

    class Meta(AdminEmployeeSerializer.Meta):
        fields = AdminEmployeeSerializer.Meta.fields + ("username", "password", "phone")

    def validate(self, attrs):
        user = attrs.get("user")
        username = attrs.get("username")
        password = attrs.get("password")
        if user and username:
            raise serializers.ValidationError({"user": "یک کاربر موجود انتخاب کنید یا نام کاربری جدید وارد کنید، نه هر دو."})
        if not user and not username:
            raise serializers.ValidationError({"username": "نام کاربری جدید یا یک کاربر موجود الزامی است."})
        if username:
            if not password:
                raise serializers.ValidationError({"password": "رمز عبور برای کاربر جدید الزامی است."})
            if User.objects.filter(username=username).exists():
                raise serializers.ValidationError({"username": "این نام کاربری قبلاً استفاده شده است."})
        if user:
            if user.role != "employee":
                raise serializers.ValidationError({"user": "فقط حساب‌های با نقش متخصص قابل انتساب هستند."})
            if EmployeeProfile.objects.filter(user=user).exists():
                raise serializers.ValidationError({"user": "برای این حساب، پروفایل متخصص وجود دارد."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        services = validated_data.pop("services", [])
        user = validated_data.pop("user", None)
        username = validated_data.pop("username", None)
        password = validated_data.pop("password", None)
        name = validated_data.pop("name", "")
        phone = validated_data.pop("phone", "")
        is_active = validated_data.get("is_active", True)
        if user is None:
            user = User.objects.create_user(username=username, password=password, first_name=name, phone=phone, role="employee", is_active=is_active)
        else:
            changes = []
            if name:
                user.first_name = name
                changes.append("first_name")
            if phone:
                user.phone = phone
                changes.append("phone")
            if user.is_active != is_active:
                user.is_active = is_active
                changes.append("is_active")
            if changes:
                user.save(update_fields=changes)
        employee = EmployeeProfile.objects.create(user=user, **validated_data)
        EmployeeService.objects.bulk_create([EmployeeService(employee=employee, service=service) for service in services])
        return employee

    def to_representation(self, instance):
        return AdminEmployeeSerializer(instance, context=self.context).data


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ("id", "name", "is_active")


class AdminCustomerOptionSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ("id", "name", "phone")


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
    service_name = serializers.CharField(source="service.persian_name", read_only=True)
    employee_name = serializers.SerializerMethodField()
    status = serializers.CharField(source="completion_status", read_only=True)

    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name() or obj.employee.user.username

    class Meta:
        model = AppointmentItem
        fields = ("id", "service", "service_name", "employee", "employee_name", "date", "start_time", "end_time", "price_snapshot", "duration_snapshot", "notes", "completion_status", "status")
        read_only_fields = ("id", "price_snapshot", "duration_snapshot")

    def validate(self, attrs):
        service = attrs.get("service", self.instance.service if self.instance else None)
        employee = attrs.get("employee", self.instance.employee if self.instance else None)
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.role == "employee" and employee.user_id != request.user.id:
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
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    hold_token = serializers.UUIDField(write_only=True, required=False)
    create_account = serializers.BooleanField(write_only=True, required=False, default=False)
    account_password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "items", "status", "notes", "created_by", "updated_by", "created_at", "updated_at", "confirmation_code", "customer_name", "customer_phone", "hold_token", "create_account", "account_password")
        read_only_fields = ("id", "customer", "created_by", "updated_by", "created_at", "updated_at")

    def get_customer_name(self, obj):
        return obj.customer.user.get_full_name() or obj.customer.user.username

    def get_customer_phone(self, obj):
        return obj.customer.user.phone

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("حداقل یک خدمت برای نوبت الزامی است.")
        first_date = items[0]["date"]
        for position, item in enumerate(items):
            start = datetime.combine(first_date, item["start_time"])
            if item["date"] != first_date or datetime.combine(first_date, item["end_time"]) - start != timedelta(minutes=item["service"].duration):
                raise serializers.ValidationError("هر خدمت باید در همان تاریخ و به اندازه مدت خدمت زمان‌بندی شود.")
            if position and item["start_time"] != items[position - 1]["end_time"]:
                raise serializers.ValidationError("خدمات انتخاب‌شده باید پشت سر هم زمان‌بندی شوند.")
        return items

    def validate_customer_phone(self, value):
        return validate_phone(value)

    def create(self, validated_data):
        item_data = validated_data.pop("items")
        hold_token = validated_data.pop("hold_token", None)
        create_account = validated_data.pop("create_account", False)
        account_password = validated_data.pop("account_password", None)
        name = self.initial_data.get("customer_name", "مشتری آنلاین")
        phone = self.initial_data.get("customer_phone", "")
        request = self.context.get("request")
        customer = request.user if request and request.user.is_authenticated else None
        if customer is None:
            customer = User.objects.create_user(username=f"guest_{phone or 'online'}_{uuid4().hex[:10]}", first_name=name, phone=phone)
        if create_account and account_password:
            customer.username = phone
            customer.set_password(account_password)
            customer.save(update_fields=("username", "password"))
        customer_profile, _ = CustomerProfile.objects.get_or_create(user=customer)
        hold = BookingHold.objects.filter(token=hold_token, expires_at__gt=timezone.now()).first() if hold_token else None
        held_items = {(item.employee_id, item.service_id, item.date, item.start_time, item.end_time) for item in hold.items.all()} if hold else set()
        submitted_items = {(item["employee"].pk, item["service"].pk, item["date"], item["start_time"], item["end_time"]) for item in item_data}
        if not hold or (hold.owner_id and hold.owner_id != customer.pk) or submitted_items != held_items:
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
        BookingHold.objects.filter(token=hold_token).delete()
        from .notifications import send_booking_confirmation
        send_booking_confirmation(appointment)
        return appointment


class AdminAppointmentCreateSerializer(serializers.ModelSerializer):
    items = AppointmentItemSerializer(many=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=CustomerProfile.objects.all(), required=False)
    customer_name = serializers.CharField(required=False, write_only=True, allow_blank=False)
    customer_phone = serializers.CharField(required=False, write_only=True, allow_blank=False)
    payment_status = serializers.ChoiceField(choices=Payment.STATUS_CHOICES, write_only=True, required=False)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "customer_name", "customer_phone", "items", "notes", "status", "payment_status")
        read_only_fields = ("id",)

    def validate(self, attrs):
        if not attrs.get("customer") and not (attrs.get("customer_name") and attrs.get("customer_phone")):
            raise serializers.ValidationError({"customer": "یک مشتری انتخاب کنید یا نام و شماره مشتری جدید را وارد کنید."})
        return attrs

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("حداقل یک خدمت برای نوبت الزامی است.")
        first_date = items[0]["date"]
        for position, item in enumerate(items):
            start = datetime.combine(first_date, item["start_time"])
            if item["date"] != first_date or datetime.combine(first_date, item["end_time"]) - start != timedelta(minutes=item["service"].duration):
                raise serializers.ValidationError("هر خدمت باید در همان تاریخ و به اندازه مدت خدمت زمان‌بندی شود.")
            if position and item["start_time"] != items[position - 1]["end_time"]:
                raise serializers.ValidationError("خدمات انتخاب‌شده باید پشت سر هم زمان‌بندی شوند.")
        return items

    def create(self, validated_data):
        items = validated_data.pop("items")
        payment_status = validated_data.pop("payment_status", None)
        customer = validated_data.pop("customer", None)
        customer_name = validated_data.pop("customer_name", None)
        customer_phone = validated_data.pop("customer_phone", None)
        actor = self.context["request"].user
        if customer is None:
            phone = validate_phone(customer_phone)
            user, created = User.objects.get_or_create(username=f"admin_guest_{phone}", defaults={"first_name": customer_name, "phone": phone, "role": "customer"})
            if not created:
                user.first_name = customer_name
                user.phone = phone
                user.save(update_fields=("first_name", "phone"))
            customer, _ = CustomerProfile.objects.get_or_create(user=user)
        appointment = Appointment.objects.create(customer=customer, created_by=actor, updated_by=actor, **validated_data)
        AppointmentItem.objects.bulk_create([AppointmentItem(appointment=appointment, created_by=actor, updated_by=actor, price_snapshot=item["service"].price, duration_snapshot=item["service"].duration, **item) for item in items])
        if payment_status:
            Payment.objects.create(appointment=appointment, amount=sum(item["service"].price for item in items), status=payment_status, created_by=actor, updated_by=actor)
        return appointment

    def to_representation(self, instance):
        return AppointmentSerializer(instance, context=self.context).data


class AdminAppointmentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ("status",)


class BookingHoldItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingHoldItem
        fields = ("employee", "service", "date", "start_time", "end_time")


class BookingHoldSerializer(serializers.ModelSerializer):
    items = BookingHoldItemSerializer(many=True)

    class Meta:
        model = BookingHold
        fields = ("token", "items", "expires_at")
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
    def validate(self, attrs):
        employee = attrs.get("employee") or getattr(self.instance, "employee", None)
        request = self.context.get("request")
        if employee is None and request and request.user.is_authenticated and request.user.role == "employee":
            employee = request.user.employee_profile

        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})

        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        if employee and weekday is not None:
            conflicts = WorkingSchedule.objects.filter(employee=employee, weekday=weekday)
            if self.instance:
                conflicts = conflicts.exclude(pk=self.instance.pk)
            if conflicts.exists():
                raise serializers.ValidationError({"weekday": "A working schedule already exists for this weekday."})
        return attrs

    class Meta:
        model = WorkingSchedule
        fields = "__all__"


class EmployeeWorkingScheduleSerializer(WorkingScheduleSerializer):
    class Meta(WorkingScheduleSerializer.Meta):
        read_only_fields = ("employee", "created_by", "updated_by", "created_at", "updated_at")


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
