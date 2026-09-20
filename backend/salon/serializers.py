from datetime import datetime, time, timedelta
from django.utils import timezone
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum
from rest_framework import serializers

from .models import (
    AccountLogin, AdminActionLog, Appointment, AppointmentItem, CustomerProfile, EmployeeCommission, EmployeeProfile,
    EmployeeService, GalleryAsset, GalleryCategory, Payment, Refund, Service, ServiceCategory, ServiceImage,
    BlogCategory, BlogMedia, BlogPost, BlogPostRevision, BlogTag, BookingHold, BookingHoldItem, FirebaseDevice,
    Notification, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule,
    CustomerCommunicationPreference, CustomerAccountDeletionRequest,
)
from .validators import validate_no_employee_overlap
from .security import validate_image_upload, validate_phone


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "type", "title", "message", "is_read", "created_at", "read_at", "target_url", "appointment", "payment")
        read_only_fields = fields


class CustomerProfileSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    first_name = serializers.CharField(source="user.first_name", required=False, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    account_status = serializers.CharField(source="user.account_status", read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ("id", "display_name", "first_name", "last_name", "phone", "email", "birthday", "neighborhood", "service_preferences", "account_status")
        read_only_fields = ("id", "display_name", "phone", "email", "account_status")

    def get_display_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def validate_neighborhood(self, value):
        return value.strip()

    def validate_service_preferences(self, value):
        return value.strip()

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user
        for field in ("first_name", "last_name"):
            if field in user_data:
                setattr(user, field, user_data[field].strip())
        if user_data:
            user.save(update_fields=("first_name", "last_name"))
        return super().update(instance, validated_data)


class CustomerPreferenceSerializer(serializers.ModelSerializer):
    available_channels = serializers.SerializerMethodField()

    class Meta:
        model = CustomerCommunicationPreference
        fields = ("operational_reminders", "promotional_messages", "push_enabled", "email_enabled", "sms_enabled", "telegram_enabled", "available_channels", "consent_source", "consent_version", "consented_at", "withdrawn_at")
        read_only_fields = ("available_channels", "consent_source", "consent_version", "consented_at", "withdrawn_at")

    def get_available_channels(self, obj):
        from django.conf import settings
        return {"push": bool(getattr(settings, "FIREBASE_SERVICE_ACCOUNT_CONFIGURED", False)), "email": bool(getattr(settings, "EMAIL_HOST", "")), "sms": False, "telegram": False}

class CustomerAppointmentSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    confirmation_code = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    date = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    payment_status = serializers.CharField(read_only=True)
    capabilities = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    def _items(self, obj):
        return list(obj.items.all())

    def get_date(self, obj):
        item = self._items(obj)[0] if self._items(obj) else None
        return item.date.isoformat() if item else None

    def get_start_time(self, obj):
        item = self._items(obj)[0] if self._items(obj) else None
        return item.start_time.strftime("%H:%M") if item else None

    def get_end_time(self, obj):
        items = self._items(obj)
        return max((item.end_time for item in items), default=None).strftime("%H:%M") if items else None

    def get_services(self, obj):
        return [{"id": item.service_id, "employee_id": item.employee_id, "name": item.service.persian_name, "specialist": item.employee.user.get_full_name() or item.employee.user.username, "duration": item.duration_snapshot, "price": item.effective_price if item.is_price_final else None, "price_status": item.price_status} for item in self._items(obj)]

    def get_price(self, obj):
        items = self._items(obj)
        if any(not item.is_price_final for item in items):
            return {"status": "unresolved", "amount": None}
        return {"status": "final", "amount": obj.appointment_total}

    def get_capabilities(self, obj):
        policy_configured = bool(getattr(settings, "CUSTOMER_APPOINTMENT_POLICY_CONFIGURED", False))
        eligible = obj.status in {"pending", "confirmed"}
        return {"can_cancel": policy_configured and eligible, "can_reschedule": policy_configured and eligible, "policy_code": "policy_not_configured" if not policy_configured else ("eligible" if eligible else "status_not_eligible"), "policy_message": "برای تغییر یا لغو این نوبت با سالن تماس بگیرید." if not policy_configured or not eligible else "تغییرات طبق سیاست سالن انجام می‌شود."}

    def get_payments(self, obj):
        return [{"id": payment.pk, "amount": payment.amount, "status": payment.status, "payment_method": payment.payment_method, "paid_at": payment.paid_at, "refunded_total": sum(refund.amount for refund in payment.refunds.all() if refund.status == "completed")} for payment in obj.payments.all()]


class CustomerDeletionRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAccountDeletionRequest
        fields = ("id", "status", "reason", "requested_at", "processed_at")
        read_only_fields = ("id", "status", "requested_at", "processed_at")


class FirebaseDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = FirebaseDevice
        fields = ("token", "device_label", "is_active", "last_seen_at")
        read_only_fields = ("is_active", "last_seen_at")

    def validate_token(self, value):
        if not value.strip():
            raise serializers.ValidationError("شناسه دستگاه الزامی است.")
        return value


def absolute_media_url(request, value):
    if not value or value.startswith(("http://", "https://")):
        return value
    if settings.PUBLIC_BACKEND_URL:
        return f"{settings.PUBLIC_BACKEND_URL}/{value.lstrip('/')}"
    return request.build_absolute_uri(value) if request else value


class ServiceSerializer(serializers.ModelSerializer):
    employees = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Service
        fields = "__all__"

    def to_internal_value(self, data):
        data = data.copy()
        mode = data.get("pricing_type", self.instance.pricing_type if self.instance else "FIXED")
        if mode not in {"STARTING_FROM", "RANGE", "VARIABLE"}:
            data.pop("minimum_price", None)
        if mode != "RANGE":
            data.pop("maximum_price", None)
        if mode != "FIXED" and data.get("price") in ("", None):
            data.pop("price", None)
        if mode == "VARIABLE" and data.get("minimum_price") == "":
            data["minimum_price"] = None
        return super().to_internal_value(data)

    def validate(self, attrs):
        from django.core.exceptions import ValidationError as ModelValidationError
        mode = attrs.get("pricing_type", self.instance.pricing_type if self.instance else "FIXED")
        if mode == "FIXED" and not self.instance and "price" not in attrs:
            raise serializers.ValidationError({"price": "قیمت ثابت را وارد کنید."})
        if mode not in {"STARTING_FROM", "RANGE", "VARIABLE"}:
            attrs["minimum_price"] = None
        if mode != "RANGE":
            attrs["maximum_price"] = None
        values = {field: attrs.get(field, getattr(self.instance, field, default)) for field, default in
                  [("pricing_type", "FIXED"), ("price", 0), ("minimum_price", None), ("maximum_price", None), ("pricing_note", "")]}
        try:
            Service(**values).clean()
        except ModelValidationError as error:
            raise serializers.ValidationError(error.message_dict)
        return attrs

    def get_employees(self, obj):
        return [{"id": link.employee_id, "name": link.employee.user.get_full_name(), "specialty": link.employee.specialty}
                for link in obj.employee_links.all()
                if link.is_active
                if link.employee.is_active and not link.employee.is_deleted]

    def get_images(self, obj):
        request = self.context.get("request")
        return [
            {
                "id": image.id,
                "image_url": absolute_media_url(request, image.image.url if image.image else image.image_url),
                "display_order": image.display_order,
                "alt_text": image.alt_text,
            }
            for image in sorted((item for item in obj.images.all() if item.is_active), key=lambda item: (item.display_order, item.id))
        ]


class GalleryAssetSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    category = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = GalleryAsset
        fields = ("id", "title", "category", "image", "image_url", "description", "display_order")
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def validate_image(self, value):
        return validate_image_upload(value)

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image.url if obj.image else obj.image_url)


class GalleryCategorySerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = GalleryCategory
        fields = ("id", "name", "is_active", "display_order")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("نام دسته‌بندی نمی‌تواند خالی باشد.")
        duplicate = GalleryCategory.objects.filter(name__iexact=value)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError("این دسته‌بندی قبلاً ثبت شده است.")
        return value


class AdminGalleryAssetSerializer(GalleryAssetSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=GalleryCategory.objects.filter(is_active=True))
    category_name = serializers.CharField(source="category.name", read_only=True)
    is_published = serializers.BooleanField(required=False, default=True)

    class Meta(GalleryAssetSerializer.Meta):
        fields = GalleryAssetSerializer.Meta.fields + ("category_name", "is_published")


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    profile_photo_url = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "name", "specialty", "bio", "services", "is_active", "profile_photo", "profile_photo_url")
        extra_kwargs = {"profile_photo": {"write_only": True, "required": False}}

    def get_profile_photo_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

    def validate_profile_photo(self, value):
        if isinstance(value, str):
            raise serializers.ValidationError("لطفاً یک فایل تصویر جدید انتخاب کنید.")
        return validate_image_upload(value)

    def get_services(self, obj):
        return [
            {"id": link.service_id, "name": link.service.persian_name, "slug": link.service.slug}
            for link in obj.service_links.all()
            if link.is_active and link.service.is_active and link.service.is_bookable
        ]


class EmployeeSelfProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = ("id", "name", "bio", "profile_photo", "profile_photo_url")
        read_only_fields = ("id", "name")
        extra_kwargs = {"profile_photo": {"write_only": True, "required": False}}

    def get_profile_photo_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

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


class CustomerPasswordChangeSerializer(EmployeePasswordChangeSerializer):
    """Customer password changes use the same strong validation as staff."""


class CustomerRegistrationSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    accept_terms = serializers.BooleanField(write_only=True)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate(self, attrs):
        if not attrs["accept_terms"]:
            raise serializers.ValidationError({"accept_terms": "پذیرش قوانین و حریم خصوصی الزامی است."})
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "تکرار رمز عبور مطابقت ندارد."})
        phone = attrs["phone"]
        login_accounts = [user for user in User.objects.filter(Q(username=phone) | Q(phone=phone)) if user.has_usable_password()]
        if login_accounts:
            raise serializers.ValidationError({"phone": "برای این شماره حسابی وجود دارد؛ وارد حساب شوید."})
        if User.objects.filter(email__iexact=attrs["email"]).exclude(email="").exists():
            raise serializers.ValidationError({"email": "این ایمیل قبلاً برای حساب دیگری ثبت شده است."})
        candidate = User(username=phone, phone=phone, email=attrs["email"], first_name=attrs["first_name"], last_name=attrs.get("last_name", ""), role="customer")
        try:
            password_validation.validate_password(attrs["password"], candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("password_confirm")
        validated_data.pop("accept_terms")
        password = validated_data.pop("password")
        phone = validated_data["phone"]
        user = User.objects.create_user(username=phone, password=password, role="customer", **validated_data)
        CustomerProfile.objects.create(user=user)
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
        return absolute_media_url(self.context.get("request"), obj.profile_photo.url if obj.profile_photo else "")

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


class ServiceAdminSerializer(ServiceSerializer):
    pass


class ServiceImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceImage
        fields = "__all__"
        extra_kwargs = {"image": {"write_only": True}}

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image.url if obj.image else obj.image_url)

    def validate_image(self, value):
        return validate_image_upload(value)


class BlogCategorySerializer(serializers.ModelSerializer):
    post_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = BlogCategory
        fields = ("id", "name", "slug", "description", "is_active", "post_count", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

    def validate_name(self, value):
        value = " ".join(value.split())
        duplicate = BlogCategory.objects.filter(name__iexact=value)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if not value or duplicate.exists():
            raise serializers.ValidationError("این دسته‌بندی قبلاً ثبت شده یا نام آن خالی است.")
        return value


class BlogTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogTag
        fields = ("id", "name", "slug", "created_at")
        read_only_fields = ("created_at",)

    def validate_name(self, value):
        value = " ".join(value.split())
        normalized = BlogTag.normalize(value)
        duplicate = BlogTag.objects.filter(normalized_name=normalized)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if not value or duplicate.exists():
            raise serializers.ValidationError("این برچسب قبلاً ثبت شده یا نام آن خالی است.")
        return value


class BlogMediaSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = BlogMedia
        fields = ("id", "post", "image", "image_url", "alt_text", "caption", "display_order", "created_at")
        read_only_fields = ("created_at",)
        extra_kwargs = {"image": {"write_only": True}}

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image.url if obj.image else "")

    def validate_image(self, value):
        return validate_image_upload(value)

    def validate_alt_text(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("متن جایگزین تصویر الزامی است.")
        return value


ALLOWED_BLOG_BLOCKS = {"heading", "paragraph", "list", "quote", "separator", "image", "callout", "service", "cta"}


def validate_blog_content(value):
    if not isinstance(value, list):
        raise serializers.ValidationError("محتوای مقاله باید مجموعه‌ای از بلوک‌های مرتب باشد.")
    if len(value) > 300:
        raise serializers.ValidationError("تعداد بلوک‌های مقاله بیش از حد مجاز است.")
    cleaned = []
    for index, block in enumerate(value):
        if not isinstance(block, dict) or block.get("type") not in ALLOWED_BLOG_BLOCKS:
            raise serializers.ValidationError(f"بلوک شماره {index + 1} معتبر نیست.")
        block_type = block["type"]
        item = {"type": block_type}
        if block_type in {"heading", "paragraph", "quote"}:
            item["text"] = str(block.get("text", ""))[:10000]
        if block_type == "heading":
            item["level"] = int(block.get("level", 2)) if str(block.get("level", 2)).isdigit() else 2
            item["level"] = min(3, max(2, item["level"]))
        if block_type == "list":
            raw_items = block.get("items", [])
            if not isinstance(raw_items, list):
                raise serializers.ValidationError(f"فهرست شماره {index + 1} معتبر نیست.")
            item["style"] = "ordered" if block.get("style") == "ordered" else "bullet"
            item["items"] = [str(text)[:1000] for text in raw_items[:100]]
        if block_type == "image":
            try:
                item["media_id"] = int(block.get("media_id"))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"تصویر بلوک شماره {index + 1} معتبر نیست.")
        if block_type == "callout":
            item["title"] = str(block.get("title", ""))[:220]
            item["text"] = str(block.get("text", ""))[:3000]
            item["tone"] = block.get("tone") if block.get("tone") in {"tip", "note", "warning"} else "note"
        if block_type == "service":
            try:
                item["service_id"] = int(block.get("service_id"))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"سرویس بلوک شماره {index + 1} معتبر نیست.")
        if block_type == "cta":
            item["title"] = str(block.get("title", ""))[:220]
            item["text"] = str(block.get("text", ""))[:1000]
            raw_ids = block.get("service_ids", [])
            item["service_ids"] = [int(identifier) for identifier in raw_ids if str(identifier).isdigit()][:20]
        cleaned.append(item)
    return cleaned


class BlogPostListSerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()
    category = BlogCategorySerializer(read_only=True)
    author_name = serializers.SerializerMethodField()
    tags = BlogTagSerializer(many=True, read_only=True)

    class Meta:
        model = BlogPost
        fields = ("id", "title", "slug", "excerpt", "cover_image_url", "cover_alt_text", "category", "tags", "author_name", "published_at", "scheduled_publish_at", "updated_at", "is_featured")

    def get_cover_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.cover_image.url if obj.cover_image else "")

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username


class BlogPostDetailSerializer(BlogPostListSerializer):
    media = BlogMediaSerializer(many=True, read_only=True)
    related_services = serializers.SerializerMethodField()
    og_image_url = serializers.SerializerMethodField()
    related_articles = serializers.SerializerMethodField()

    class Meta(BlogPostListSerializer.Meta):
        fields = BlogPostListSerializer.Meta.fields + ("content", "seo_title", "seo_description", "og_image_url", "media", "related_services", "related_articles", "created_at")

    def get_og_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.og_image.url if obj.og_image else "")

    def get_related_services(self, obj):
        block_ids = {
            block.get("service_id") for block in obj.content if block.get("type") == "service"
        }
        block_ids.update(
            identifier
            for block in obj.content if block.get("type") == "cta"
            for identifier in block.get("service_ids", [])
        )
        queryset = Service.objects.filter(Q(pk__in=block_ids) | Q(pk__in=obj.related_services.values("pk")), is_active=True).distinct()
        return ServiceSerializer(queryset, many=True, context=self.context).data

    def get_related_articles(self, obj):
        related = self.context.get("related_articles", [])
        return BlogPostListSerializer(related, many=True, context=self.context).data


class AdminBlogPostListSerializer(BlogPostListSerializer):
    category_detail = BlogCategorySerializer(source="category", read_only=True)

    class Meta(BlogPostListSerializer.Meta):
        fields = BlogPostListSerializer.Meta.fields + ("category_detail", "status")


class AdminBlogPostSerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()
    og_image_url = serializers.SerializerMethodField()
    category_detail = BlogCategorySerializer(source="category", read_only=True)
    tag_details = BlogTagSerializer(source="tags", many=True, read_only=True)
    media = BlogMediaSerializer(many=True, read_only=True)
    author_name = serializers.SerializerMethodField()
    related_service_details = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("id", "title", "slug", "excerpt", "content", "cover_image", "cover_image_url", "cover_alt_text", "category", "category_detail", "tags", "tag_details", "status", "author", "author_name", "published_at", "scheduled_publish_at", "created_at", "updated_at", "seo_title", "seo_description", "og_image", "og_image_url", "is_featured", "related_services", "related_service_details", "media")
        read_only_fields = ("author", "status", "published_at", "created_at", "updated_at")
        extra_kwargs = {
            "cover_image": {"write_only": True, "required": False},
            "og_image": {"write_only": True, "required": False},
        }

    def get_cover_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.cover_image.url if obj.cover_image else "")

    def get_og_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.og_image.url if obj.og_image else "")

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def get_related_service_details(self, obj):
        return BlogPostDetailSerializer(context=self.context).get_related_services(obj)

    def validate_cover_image(self, value):
        return validate_image_upload(value)

    def validate_og_image(self, value):
        return validate_image_upload(value)

    def validate_content(self, value):
        return validate_blog_content(value)

    def validate(self, attrs):
        next_status = attrs.get("status", getattr(self.instance, "status", BlogPost.STATUS_DRAFT))
        scheduled_at = attrs.get("scheduled_publish_at", getattr(self.instance, "scheduled_publish_at", None))
        if next_status == BlogPost.STATUS_SCHEDULED and not scheduled_at:
            raise serializers.ValidationError({"scheduled_publish_at": "زمان انتشار برای مقاله زمان‌بندی‌شده الزامی است."})
        if next_status == BlogPost.STATUS_SCHEDULED and scheduled_at and scheduled_at <= timezone.now():
            raise serializers.ValidationError({"scheduled_publish_at": "زمان انتشار باید در آینده باشد."})
        content = attrs.get("content", getattr(self.instance, "content", []))
        image_ids = {block.get("media_id") for block in content if block.get("type") == "image"}
        if image_ids and self.instance:
            owned_ids = set(self.instance.media.filter(pk__in=image_ids).values_list("pk", flat=True))
            if image_ids != owned_ids:
                raise serializers.ValidationError({"content": "یکی از تصاویر به این مقاله تعلق ندارد."})
        service_ids = {
            block.get("service_id") for block in content if block.get("type") == "service"
        }
        service_ids.update(
            identifier
            for block in content if block.get("type") == "cta"
            for identifier in block.get("service_ids", [])
        )
        if service_ids and Service.objects.filter(pk__in=service_ids, is_active=True).count() != len(service_ids):
            raise serializers.ValidationError({"content": "یکی از سرویس‌های داخل مقاله معتبر یا فعال نیست."})
        return attrs

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        BlogPostRevision.objects.create(
            post=instance,
            editor=self.context["request"].user,
            snapshot={
                "title": instance.title,
                "slug": instance.slug,
                "excerpt": instance.excerpt,
                "content": instance.content,
                "status": instance.status,
                "seo_title": instance.seo_title,
                "seo_description": instance.seo_description,
            },
        )
        return super().update(instance, validated_data)


class AppointmentItemSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.persian_name", read_only=True)
    employee_name = serializers.SerializerMethodField()
    pricing_type = serializers.CharField(read_only=True)
    price_status = serializers.CharField(read_only=True)
    is_price_final = serializers.BooleanField(read_only=True)
    effective_price = serializers.IntegerField(read_only=True)
    status = serializers.CharField(source="completion_status", read_only=True)

    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name() or obj.employee.user.username

    class Meta:
        model = AppointmentItem
        fields = ("id", "service", "service_name", "employee", "employee_name", "date", "start_time", "end_time", "price_snapshot", "catalog_pricing_snapshot", "final_price", "discount_amount", "discount_applied", "pricing_type", "price_status", "is_price_final", "effective_price", "duration_snapshot", "notes", "completion_status", "status")
        read_only_fields = ("id", "price_snapshot", "catalog_pricing_snapshot", "final_price", "discount_amount", "discount_applied", "duration_snapshot", "completion_status", "status")

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
    account_password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    account_password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    account_accept_terms = serializers.BooleanField(write_only=True, required=False, default=False)
    has_unresolved_prices = serializers.BooleanField(read_only=True)
    appointment_total = serializers.IntegerField(read_only=True)
    paid_total = serializers.IntegerField(read_only=True)
    refunded_total = serializers.IntegerField(read_only=True)
    net_paid = serializers.IntegerField(read_only=True)
    remaining_total = serializers.IntegerField(read_only=True)
    payment_status = serializers.CharField(read_only=True)
    payments = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = ("id", "customer", "items", "status", "notes", "created_by", "updated_by", "created_at", "updated_at", "confirmation_code", "customer_name", "customer_phone", "hold_token", "create_account", "account_password", "account_password_confirm", "account_email", "account_accept_terms", "appointment_total", "has_unresolved_prices", "paid_total", "refunded_total", "net_paid", "remaining_total", "payment_status", "payments", "status_history")
        read_only_fields = ("id", "customer", "created_by", "updated_by", "created_at", "updated_at")

    def get_customer_name(self, obj):
        return obj.customer.user.get_full_name() or obj.customer.user.username

    def get_customer_phone(self, obj):
        return obj.customer.user.phone

    def get_payments(self, obj):
        return [
            {
                "id": payment.id,
                "amount": payment.amount,
                "payment_method": payment.payment_method,
                "status": payment.status,
                "paid_at": payment.paid_at,
                "provider_reference": payment.provider_reference,
                "notes": payment.notes,
                "refunded_total": sum(refund.amount for refund in payment.refunds.all() if refund.status == "completed"),
                "refunds": [
                    {
                        "id": refund.id,
                        "amount": refund.amount,
                        "reason": refund.reason,
                        "status": refund.status,
                        "created_at": refund.created_at,
                    }
                    for refund in payment.refunds.all()
                ],
            }
            for payment in obj.payments.all()
        ]

    def get_status_history(self, obj):
        return [
            {
                "id": entry.id,
                "status": entry.status,
                "reason": entry.reason,
                "changed_at": entry.changed_at,
                "changed_by": entry.changed_by_id,
                "changed_by_name": (entry.changed_by.get_full_name() or entry.changed_by.username) if entry.changed_by else "سیستم",
                "changed_by_role": entry.changed_by.role if entry.changed_by else "system",
            }
            for entry in obj.status_history.all()
        ]

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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        authenticated = bool(request and request.user.is_authenticated)
        if authenticated and request.user.role != "customer":
            raise serializers.ValidationError("فقط مشتری می‌تواند از این مسیر نوبت شخصی ثبت کند.")
        name = str(self.initial_data.get("customer_name", "")).strip()
        raw_phone = self.initial_data.get("customer_phone", "")
        if authenticated:
            attrs["_customer_name"] = request.user.get_full_name() or request.user.username
            attrs["_customer_phone"] = request.user.phone
            if attrs.get("create_account"):
                raise serializers.ValidationError({"create_account": "شما هم‌اکنون وارد حساب خود هستید."})
            return attrs
        if not name:
            raise serializers.ValidationError({"customer_name": "نام و نام خانوادگی الزامی است."})
        try:
            phone = validate_phone(raw_phone)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"customer_phone": error.detail}) from error
        attrs["_customer_name"], attrs["_customer_phone"] = name, phone
        if attrs.get("create_account"):
            password = attrs.get("account_password", "")
            if not password:
                raise serializers.ValidationError({"account_password": "برای ساخت حساب، رمز عبور الزامی است."})
            if password != attrs.get("account_password_confirm"):
                raise serializers.ValidationError({"account_password_confirm": "تکرار رمز عبور مطابقت ندارد."})
            if not attrs.get("account_email"):
                raise serializers.ValidationError({"account_email": "ایمیل برای بازیابی حساب الزامی است."})
            if not attrs.get("account_accept_terms"):
                raise serializers.ValidationError({"account_accept_terms": "پذیرش قوانین و حریم خصوصی الزامی است."})
            login_accounts = [user for user in User.objects.filter(Q(username=phone) | Q(phone=phone)) if user.has_usable_password()]
            if login_accounts:
                raise serializers.ValidationError({"customer_phone": "برای این شماره حسابی وجود دارد؛ ابتدا وارد حساب شوید."})
            if User.objects.filter(email__iexact=attrs["account_email"]).exclude(email="").exists():
                raise serializers.ValidationError({"account_email": "این ایمیل قبلاً ثبت شده است."})
            candidate = User(username=phone, phone=phone, email=attrs["account_email"], first_name=name, role="customer")
            try:
                password_validation.validate_password(password, candidate)
            except DjangoValidationError as error:
                raise serializers.ValidationError({"account_password": list(error.messages)}) from error
        return attrs

    def create(self, validated_data):
        item_data = validated_data.pop("items")
        hold_token = validated_data.pop("hold_token", None)
        create_account = validated_data.pop("create_account", False)
        account_password = validated_data.pop("account_password", None)
        validated_data.pop("account_password_confirm", None)
        account_email = validated_data.pop("account_email", "")
        validated_data.pop("account_accept_terms", None)
        name = validated_data.pop("_customer_name")
        phone = validated_data.pop("_customer_phone")
        request = self.context.get("request")
        customer = request.user if request and request.user.is_authenticated else None
        if customer is None:
            customer = User.objects.create_user(username=f"guest_{phone or 'online'}_{uuid4().hex[:10]}", first_name=name, phone=phone)
        if create_account and account_password:
            customer.username = phone
            customer.email = account_email
            customer.set_password(account_password)
            customer.save(update_fields=("username", "email", "password"))
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
                **item["service"].appointment_price_fields(),
                **item,
            )
            for item in item_data
        ])
        BookingHold.objects.filter(token=hold_token).delete()
        from .notifications import send_booking_confirmation
        send_booking_confirmation(appointment)
        return appointment


class EmployeeAppointmentSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    payment_status = serializers.CharField(read_only=True)

    class Meta:
        model = Appointment
        fields = ("id", "items", "status", "notes", "customer_name", "customer_phone", "payment_status")

    def get_items(self, obj):
        request = self.context.get("request")
        items = getattr(obj, "employee_items", None)
        if items is None:
            items = obj.items.filter(employee__user=request.user)
        return AppointmentItemSerializer(items, many=True, context=self.context).data

    def get_customer_name(self, obj):
        return obj.customer.user.get_full_name() or obj.customer.user.username

    def get_customer_phone(self, obj):
        return obj.customer.user.phone


class EmployeeSelfBookingSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=CustomerProfile.objects.all(), required=False)
    customer_name = serializers.CharField(required=False, allow_blank=False)
    customer_phone = serializers.CharField(required=False, allow_blank=False)
    services = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True, is_bookable=True), many=True)
    date = serializers.DateField()
    start_time = serializers.TimeField()
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("customer") and not (attrs.get("customer_name") and attrs.get("customer_phone")):
            raise serializers.ValidationError({"customer": "یک مشتری را انتخاب کنید یا نام و شماره مشتری جدید را وارد کنید."})
        if attrs["date"] < timezone.localdate():
            raise serializers.ValidationError({"date": "تاریخ نوبت نمی‌تواند در گذشته باشد."})
        employee = self.context["request"].user.employee_profile
        start = datetime.combine(attrs["date"], attrs["start_time"])
        item_data = []
        for service in attrs["services"]:
            end = start + timedelta(minutes=service.duration)
            serializer = AppointmentItemSerializer(
                data={"service": service.pk, "employee": employee.pk, "date": attrs["date"], "start_time": start.time(), "end_time": end.time()},
                context=self.context,
            )
            serializer.is_valid(raise_exception=True)
            item_data.append(serializer.validated_data)
            start = end
        attrs["items"] = item_data
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        customer = validated_data.pop("customer", None)
        name = validated_data.pop("customer_name", "")
        phone = validated_data.pop("customer_phone", "")
        services = validated_data.pop("services")
        validated_data.pop("date")
        validated_data.pop("start_time")
        item_data = validated_data.pop("items")
        if customer is None:
            phone = validate_phone(phone)
            user = User.objects.filter(phone=phone, role="customer").first()
            if user is None:
                user = User.objects.create_user(username=f"employee_guest_{phone}_{uuid4().hex[:8]}", first_name=name, phone=phone, role="customer")
            elif name and user.get_full_name() != name:
                user.first_name = name
                user.save(update_fields=("first_name",))
            customer, _ = CustomerProfile.objects.get_or_create(user=user)
        appointment = Appointment.objects.create(customer=customer, created_by=request.user, updated_by=request.user, **validated_data)
        AppointmentItem.objects.bulk_create([
            AppointmentItem(appointment=appointment, created_by=request.user, updated_by=request.user, **item["service"].appointment_price_fields(), **item)
            for item in item_data
        ])
        return appointment


class AdminAppointmentCreateSerializer(serializers.ModelSerializer):
    items = AppointmentItemSerializer(many=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=CustomerProfile.objects.all(), required=False)
    customer_name = serializers.CharField(required=False, write_only=True, allow_blank=False)
    customer_phone = serializers.CharField(required=False, write_only=True, allow_blank=False)

    class Meta:
        model = Appointment
        fields = ("id", "customer", "customer_name", "customer_phone", "items", "notes", "status")
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
        AppointmentItem.objects.bulk_create([AppointmentItem(appointment=appointment, created_by=actor, updated_by=actor, **item["service"].appointment_price_fields(), **item) for item in items])
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
    customer_name = serializers.CharField(source="appointment.customer.user.get_full_name", read_only=True)
    reporter_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    payment_method = serializers.CharField(source="payment.payment_method", read_only=True)
    payment_status = serializers.CharField(source="payment.status", read_only=True)

    class Meta:
        model = Transaction
        fields = "__all__"
        read_only_fields = tuple(field.name for field in Transaction._meta.fields)


class PaymentSerializer(serializers.ModelSerializer):
    has_unresolved_prices = serializers.BooleanField(source="appointment.has_unresolved_prices", read_only=True)
    refunded_total = serializers.SerializerMethodField()
    refundable_total = serializers.SerializerMethodField()
    reporter_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    customer_name = serializers.CharField(source="appointment.customer.user.get_full_name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.get_full_name", read_only=True)
    appointment_items = serializers.SerializerMethodField()
    refunds = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = ("status", "paid_at", "created_by", "updated_by", "reviewed_by", "reviewed_at", "created_at", "updated_at")

    def get_refunded_total(self, obj):
        return sum(refund.amount for refund in obj.refunds.all() if refund.status == "completed")

    def get_refundable_total(self, obj):
        return max(obj.amount - self.get_refunded_total(obj), 0)

    def get_appointment_items(self, obj):
        return [
            {"id": item.id, "service": item.service.persian_name, "employee": item.employee.user.get_full_name() or item.employee.user.username}
            for item in obj.appointment.items.all()
        ]

    def get_refunds(self, obj):
        return [{"id": refund.id, "amount": refund.amount, "reason": refund.reason, "status": refund.status, "created_at": refund.created_at} for refund in obj.refunds.all()]

    def validate(self, attrs):
        appointment = attrs.get("appointment", self.instance.appointment if self.instance else None)
        if appointment and appointment.has_unresolved_prices:
            raise serializers.ValidationError("ابتدا قیمت نهایی همه سرویس‌های نوبت را مشخص کنید.")
        amount = attrs.get("amount", 0)
        if amount <= 0:
            raise serializers.ValidationError({"amount": "مبلغ پرداخت باید بیشتر از صفر باشد."})
        if appointment and amount > appointment.remaining_total:
            raise serializers.ValidationError({"amount": "مبلغ پرداخت از مانده نوبت بیشتر است."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        actor = self.context["request"].user
        appointment = Appointment.objects.select_for_update().get(pk=validated_data["appointment"].pk)
        if appointment.has_unresolved_prices:
            raise serializers.ValidationError("ابتدا قیمت نهایی همه سرویس‌های نوبت را مشخص کنید.")
        if validated_data["amount"] > appointment.remaining_total:
            raise serializers.ValidationError({"amount": "مبلغ پرداخت از مانده نوبت بیشتر است."})
        validated_data["appointment"] = appointment
        payment = Payment.objects.create(status="paid", paid_at=timezone.now(), created_by=actor, updated_by=actor, **validated_data)
        Transaction.objects.create(type="payment", amount=payment.amount, appointment=payment.appointment, payment=payment, description=payment.notes, created_by=actor, updated_by=actor)
        for item in appointment.items.select_related("service", "employee"):
            item.ensure_commission(actor)
        return payment


class EmployeePaymentReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("amount", "payment_method", "notes")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("مبلغ پرداخت باید بیشتر از صفر باشد.")
        return value


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = "__all__"
        read_only_fields = ("status", "created_by", "updated_by", "created_at", "updated_at")

    def validate(self, attrs):
        payment = attrs.get("payment")
        amount = attrs.get("amount", 0)
        refunded = sum(refund.amount for refund in payment.refunds.filter(status="completed")) if payment else 0
        if amount <= 0:
            raise serializers.ValidationError({"amount": "مبلغ بازپرداخت باید بیشتر از صفر باشد."})
        if not payment or payment.status not in {"paid", "refunded"} or amount > payment.amount - refunded:
            raise serializers.ValidationError({"amount": "مبلغ بازپرداخت از مانده قابل استرداد بیشتر است."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        actor = self.context["request"].user
        payment = Payment.objects.select_for_update().get(pk=validated_data["payment"].pk)
        refunded = payment.refunds.filter(status="completed").aggregate(total=Sum("amount"))["total"] or 0
        if validated_data["amount"] > payment.amount - refunded:
            raise serializers.ValidationError({"amount": "مبلغ بازپرداخت از مانده قابل استرداد بیشتر است."})
        validated_data["payment"] = payment
        refund = Refund.objects.create(created_by=actor, updated_by=actor, **validated_data)
        refund.complete(changed_by=actor)
        return refund


class EmployeeCommissionSerializer(serializers.ModelSerializer):
    employee = serializers.IntegerField(source="appointment_item.employee_id", read_only=True)
    employee_name = serializers.CharField(source="appointment_item.employee.user.get_full_name", read_only=True)
    service_name = serializers.CharField(source="appointment_item.service.persian_name", read_only=True)

    class Meta:
        model = EmployeeCommission
        fields = ("id", "appointment_item", "employee", "employee_name", "service_name", "base_amount", "commission_rate_snapshot", "commission_amount", "status", "created_at")
        read_only_fields = fields


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
