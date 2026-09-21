from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from decimal import Decimal
import re
import uuid


def generate_confirmation_code():
    return uuid.uuid4().hex[:10]


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class SoftDeleteModel(models.Model):
    is_deleted = models.BooleanField(default=False)
    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        self.is_deleted = True
        self.save(update_fields=("is_deleted",))


class User(AbstractUser):
    # AbstractUser preserves Django auth/admin compatibility while roles stay explicit.
    ROLE_CHOICES = [("customer", "Customer"), ("employee", "Employee"), ("admin", "Admin")]
    ACCOUNT_STATUS_CHOICES = [("active", "Active"), ("suspended", "Suspended"), ("closed", "Closed")]
    phone = models.CharField(max_length=20, blank=True)
    normalized_phone = models.CharField(max_length=11, null=True, blank=True, db_index=True)
    is_guest = models.BooleanField(default=False)
    identity_conflict = models.BooleanField(default=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")
    account_status = models.CharField(max_length=20, choices=ACCOUNT_STATUS_CHOICES, default="active")
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        compact = re.sub(r"[\s-]", "", self.phone or "")
        if compact.startswith("+98"):
            compact = "0" + compact[3:]
        elif compact.startswith("0098"):
            compact = "0" + compact[4:]
        self.normalized_phone = compact if re.fullmatch(r"09\d{9}", compact) else None
        if self.role == "customer" and (self.username.startswith(("guest_", "employee_guest_")) or not self.has_usable_password()):
            self.is_guest = True
        self.is_staff = self.role in {"employee", "admin"}
        if kwargs.get("update_fields") is not None:
            kwargs["update_fields"] = set(kwargs["update_fields"]) | {"is_staff", "normalized_phone", "is_guest"}
        super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("normalized_phone",),
                condition=models.Q(role="customer", is_guest=False, account_status="active", normalized_phone__isnull=False),
                name="unique_active_customer_login_phone",
            ),
        ]


class Notification(models.Model):
    TYPE_CHOICES = [
        ("appointment_created", "Appointment created"),
        ("appointment_assigned", "Appointment assigned"),
        ("appointment_rescheduled", "Appointment rescheduled"),
        ("appointment_cancelled", "Appointment cancelled"),
        ("appointment_updated", "Appointment updated"),
        ("payment_reported", "Payment reported"),
        ("payment_confirmed", "Payment confirmed"),
        ("payment_rejected", "Payment rejected"),
        ("customer_account", "Customer account"),
        ("leave_reviewed", "Leave reviewed"),
    ]

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    title = models.CharField(max_length=160)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    target_url = models.CharField(max_length=255, blank=True)
    appointment = models.ForeignKey("Appointment", on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications")
    payment = models.ForeignKey("Payment", on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications")
    dedupe_key = models.CharField(max_length=255, unique=True, null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("recipient", "is_read", "created_at"), name="notif_recipient_read_idx")]


class PushSubscription(models.Model):
    """Deprecated storage only. All delivery and registration now use FirebaseDevice.

    Retained to avoid destroying historical subscriptions during the FCM rollout.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-last_used_at",)


class FirebaseDevice(models.Model):
    """An FCM registration token for one browser/device (users may have many)."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="firebase_devices")
    token = models.TextField(unique=True)
    device_label = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-last_seen_at",)


class CustomerProfile(SoftDeleteModel):
    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="customer_profile")
    notes = models.TextField(blank=True)
    birthday = models.DateField(null=True, blank=True)
    neighborhood = models.CharField(max_length=120, blank=True)
    service_preferences = models.TextField(blank=True)
    profile_photo = models.ImageField(upload_to="profiles/", blank=True)
    tags = models.TextField(blank=True)
    no_show_count = models.PositiveIntegerField(default=0)
    last_visit = models.DateField(null=True, blank=True)

    def clean(self):
        if self.user_id and self.user.role != "customer":
            raise ValidationError("CustomerProfile requires a customer-role user.")


class CustomerCommunicationPreference(models.Model):
    customer = models.OneToOneField(CustomerProfile, on_delete=models.CASCADE, related_name="communication_preferences")
    operational_reminders = models.BooleanField(default=True)
    promotional_messages = models.BooleanField(default=False)
    push_enabled = models.BooleanField(default=False)
    email_enabled = models.BooleanField(default=False)
    sms_enabled = models.BooleanField(default=False)
    telegram_enabled = models.BooleanField(default=False)
    consent_source = models.CharField(max_length=80, blank=True)
    consent_version = models.CharField(max_length=40, blank=True)
    consented_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class CustomerLegalAcceptance(models.Model):
    SOURCE_CHOICES = [("signup", "Standalone signup"), ("booking", "Booking account creation")]
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name="legal_acceptances")
    terms_version = models.CharField(max_length=40)
    privacy_version = models.CharField(max_length=40)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    accepted_at = models.DateTimeField(default=timezone.now)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ("-accepted_at",)
        constraints = [models.UniqueConstraint(fields=("customer", "terms_version", "privacy_version", "source"), name="unique_customer_legal_acceptance")]


class CustomerIdentityClaim(models.Model):
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name="identity_claims")
    legacy_customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name="claimed_identity_records")
    appointment = models.ForeignKey("Appointment", on_delete=models.PROTECT, related_name="identity_claims")
    verification_method = models.CharField(max_length=40, default="confirmation_code")
    claimed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("customer", "legacy_customer"), name="unique_customer_identity_claim")]


class CustomerAccountDeletionRequest(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name="deletion_requests")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    reason = models.CharField(max_length=500, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="processed_deletion_requests")
    processing_notes = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)


class CustomerMutationRequest(models.Model):
    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name="mutation_requests")
    appointment = models.ForeignKey("Appointment", on_delete=models.CASCADE, related_name="customer_mutations")
    action = models.CharField(max_length=20)
    idempotency_key = models.CharField(max_length=100)
    response_status = models.PositiveSmallIntegerField(default=200)
    response_body = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("customer", "appointment", "action", "idempotency_key"), name="unique_customer_mutation")]


class EmployeeProfile(SoftDeleteModel):
    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="employee_profile")
    specialty = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    profile_photo = models.ImageField(upload_to="profiles/", blank=True)

    def clean(self):
        if self.user_id and self.user.role != "employee":
            raise ValidationError("EmployeeProfile requires an employee-role user.")


class AccountLogin(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_history")
    logged_in_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    succeeded = models.BooleanField(default=True)


class AdminActionLog(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="admin_actions")
    action = models.CharField(max_length=40)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=64)
    changed_at = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)


class ServiceCategory(models.Model):
    name = models.CharField(max_length=120, unique=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)


class Service(models.Model):
    PRICING_CHOICES = [(value, value) for value in ("FIXED", "STARTING_FROM", "RANGE", "CONSULTATION", "VARIABLE")]
    pricing_type = models.CharField(max_length=20, choices=PRICING_CHOICES, default="FIXED")
    minimum_price = models.PositiveIntegerField(null=True, blank=True)
    maximum_price = models.PositiveIntegerField(null=True, blank=True)
    pricing_note = models.TextField(blank=True)

    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="services")
    name = models.CharField(max_length=120)
    persian_name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=320, blank=True)
    # Generated once and kept stable so service URLs do not change when a display
    # name is edited. Admins can deliberately set a clearer Latin slug if needed.
    slug = models.SlugField(max_length=160, unique=True, blank=True, db_index=False)
    seo_title = models.CharField(max_length=160, blank=True)
    seo_description = models.TextField(blank=True)
    price = models.PositiveIntegerField(default=0)
    duration = models.PositiveIntegerField(help_text="Duration in minutes")
    is_active = models.BooleanField(default=True)
    is_bookable = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ("name",)

    def clean(self):
        errors = {}
        if self.pricing_type not in dict(self.PRICING_CHOICES):
            errors["pricing_type"] = "نوع قیمت معتبر نیست."
        if self.pricing_type == "FIXED" and (self.price is None or self.price < 0):
            errors["price"] = "قیمت ثابت باید صفر یا بیشتر باشد."
        if self.pricing_type in {"STARTING_FROM", "RANGE"} and self.minimum_price is None:
            errors["minimum_price"] = "حداقل قیمت را وارد کنید."
        if self.minimum_price is not None and self.minimum_price < 0:
            errors["minimum_price"] = "قیمت نمی‌تواند منفی باشد."
        if self.pricing_type == "RANGE" and (self.maximum_price is None or (self.minimum_price is not None and self.maximum_price < self.minimum_price)):
            errors["maximum_price"] = "حداکثر قیمت باید حداقل برابر قیمت شروع باشد."
        if self.pricing_type == "VARIABLE" and not self.pricing_note.strip():
            errors["pricing_note"] = "نحوه تعیین قیمت را توضیح دهید."
        if errors:
            raise ValidationError(errors)

    def appointment_price_fields(self):
        """Freeze catalog information once, including for bulk-created bookings."""
        catalog = {"pricing_type": self.pricing_type, "price": self.price if self.pricing_type == "FIXED" else None,
                   "minimum_price": self.minimum_price if self.pricing_type in {"STARTING_FROM", "RANGE", "VARIABLE"} else None,
                   "maximum_price": self.maximum_price if self.pricing_type == "RANGE" else None, "pricing_note": self.pricing_note}
        return {"price_snapshot": self.price if self.pricing_type == "FIXED" else (catalog["minimum_price"] or 0),
                "catalog_pricing_snapshot": catalog, "duration_snapshot": self.duration}

    def delete(self, using=None, keep_parents=False):
        self.is_deleted = True
        self.save(update_fields=("is_deleted",))

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name, allow_unicode=False) or "service"
            candidate = base_slug
            suffix = 2
            while Service.all_objects.exclude(pk=self.pk).filter(slug=candidate).exists():
                candidate = f"{base_slug}-{suffix}"
                suffix += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.persian_name


class EmployeeService(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="service_links")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="employee_links")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("employee", "service"), name="unique_employee_service")]


class ServiceImage(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="services/")
    image_url = models.URLField(max_length=500, blank=True)
    alt_text = models.CharField(max_length=220, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)


class BlogCategory(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, allow_unicode=True, blank=True)
    description = models.CharField(max_length=320, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "blog categories"

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.split())
        if not self.slug:
            base = slugify(self.name, allow_unicode=True) or f"category-{uuid.uuid4().hex[:8]}"
            candidate = base
            suffix = 2
            while BlogCategory.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
                candidate = f"{base}-{suffix}"
                suffix += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class BlogTag(models.Model):
    name = models.CharField(max_length=80, unique=True)
    normalized_name = models.CharField(max_length=80, unique=True, editable=False)
    slug = models.SlugField(max_length=100, unique=True, allow_unicode=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    @staticmethod
    def normalize(value):
        return " ".join((value or "").split()).casefold().replace("ي", "ی").replace("ك", "ک")

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.split())
        self.normalized_name = self.normalize(self.name)
        if not self.slug:
            base = slugify(self.name, allow_unicode=True) or f"tag-{uuid.uuid4().hex[:8]}"
            candidate = base
            suffix = 2
            while BlogTag.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
                candidate = f"{base}-{suffix}"
                suffix += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class BlogPost(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_SCHEDULED = "scheduled"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_SCHEDULED, "Scheduled"),
        (STATUS_ARCHIVED, "Archived"),
    )

    title = models.CharField(max_length=220)
    slug = models.SlugField(max_length=240, unique=True, allow_unicode=True, blank=True)
    excerpt = models.CharField(max_length=500, blank=True)
    content = models.JSONField(default=list, blank=True)
    cover_image = models.ImageField(upload_to="blog/covers/", blank=True)
    cover_alt_text = models.CharField(max_length=220, blank=True)
    category = models.ForeignKey(BlogCategory, on_delete=models.PROTECT, related_name="posts", null=True, blank=True)
    tags = models.ManyToManyField(BlogTag, related_name="posts", blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="blog_posts")
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_publish_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    seo_title = models.CharField(max_length=160, blank=True)
    seo_description = models.CharField(max_length=320, blank=True)
    og_image = models.ImageField(upload_to="blog/social/", blank=True)
    is_featured = models.BooleanField(default=False)
    related_services = models.ManyToManyField(Service, related_name="blog_posts", blank=True)

    class Meta:
        ordering = ("-published_at", "-created_at")
        indexes = (
            models.Index(fields=("status", "published_at"), name="blog_status_pub_idx"),
            models.Index(fields=("status", "scheduled_publish_at"), name="blog_status_sched_idx"),
        )

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title, allow_unicode=True) or f"article-{uuid.uuid4().hex[:8]}"
            candidate = base
            suffix = 2
            while BlogPost.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
                candidate = f"{base}-{suffix}"
                suffix += 1
            self.slug = candidate
        if self.status == self.STATUS_PUBLISHED and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    @property
    def is_public(self):
        return self.status == self.STATUS_PUBLISHED or (
            self.status == self.STATUS_SCHEDULED
            and self.scheduled_publish_at
            and self.scheduled_publish_at <= timezone.now()
        )

    def __str__(self):
        return self.title


class BlogMedia(models.Model):
    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name="media")
    image = models.ImageField(upload_to="blog/content/")
    alt_text = models.CharField(max_length=220)
    caption = models.CharField(max_length=320, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "id")


class BlogPostRevision(models.Model):
    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name="revisions")
    editor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="blog_revisions")
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class WorkingSchedule(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="working_schedules")
    weekday = models.PositiveSmallIntegerField(choices=[(day, str(day)) for day in range(7)])
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_working_schedules")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_working_schedules")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("employee", "weekday"), name="unique_employee_weekday")]


class ScheduleException(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="schedule_exceptions")
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    is_working = models.BooleanField(default=False)
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_schedule_exceptions")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_schedule_exceptions")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)


class TimeOff(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected"), ("withdrawn", "Withdrawn")]
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="time_off")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    review_notes = models.CharField(max_length=500, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_time_off")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_time_off")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_time_off")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def clean(self):
        if self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date cannot be before start date."})


class SalonClosure(models.Model):
    KIND_CHOICES = [("holiday", "Holiday"), ("maintenance", "Maintenance"), ("private_event", "Private event"), ("other", "Other")]
    start_date = models.DateField()
    end_date = models.DateField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="holiday")
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_salon_closures")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="updated_salon_closures")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("start_date",)

    def clean(self):
        if self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date cannot be before start date."})


class Appointment(SoftDeleteModel):
    STATUS_CHOICES = [("pending", "Pending"), ("confirmed", "Confirmed"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name="appointments")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_appointments")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_appointments")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    confirmation_code = models.CharField(max_length=32, unique=True, default=generate_confirmation_code)

    def set_status(self, status, changed_by=None, reason=""):
        if status not in dict(self.STATUS_CHOICES):
            raise ValidationError("Invalid appointment status.")
        if self.status == status and not reason:
            return
        self.status = status
        self.updated_by = changed_by
        from django.db import transaction
        with transaction.atomic():
            self.save(update_fields=("status", "updated_by", "updated_at"))
            AppointmentStatusHistory.objects.create(appointment=self, status=status, changed_by=changed_by, reason=reason, created_by=changed_by, updated_by=changed_by)

    @property
    def appointment_total(self):
        # The known agreed subtotal; never substitute a catalog estimate.
        return sum(item.effective_price for item in self.items.all())

    @property
    def has_unresolved_prices(self):
        return any(not item.is_price_final for item in self.items.all())

    def require_final_prices(self):
        if self.has_unresolved_prices:
            raise ValidationError("ابتدا قیمت نهایی همه سرویس‌های نوبت را مشخص کنید.")

    @property
    def paid_total(self):
        return sum(payment.amount for payment in self.payments.all() if payment.status in {"paid", "refunded"})

    @property
    def refunded_total(self):
        return sum(refund.amount for payment in self.payments.all() for refund in payment.refunds.all() if refund.status == "completed")

    @property
    def net_paid(self):
        return max(self.paid_total - self.refunded_total, 0)

    @property
    def remaining_total(self):
        return max(self.appointment_total - self.net_paid, 0)

    @property
    def payment_status(self):
        if self.refunded_total and self.net_paid == 0:
            return "refunded"
        if self.refunded_total:
            return "partially_refunded"
        if self.net_paid == 0:
            return "unpaid"
        return "paid" if self.remaining_total == 0 and not self.has_unresolved_prices else "partially_paid"


class AppointmentItem(models.Model):
    COMPLETION_CHOICES = [("pending", "Pending"), ("in_progress", "In progress"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointment_items")
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="appointment_items")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    price_snapshot = models.PositiveIntegerField()
    catalog_pricing_snapshot = models.JSONField(default=dict, blank=True)
    final_price = models.PositiveIntegerField(null=True, blank=True)
    discount_amount = models.PositiveIntegerField(default=0, editable=False)
    discount_applied = models.BooleanField(default=False, editable=False)
    duration_snapshot = models.PositiveIntegerField()
    notes = models.TextField(blank=True)
    completion_status = models.CharField(max_length=20, choices=COMPLETION_CHOICES, default="pending")
    completed_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_appointment_items")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_appointment_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("employee", "date", "completion_status"), name="apptitem_emp_date_status")]

    def save(self, *args, **kwargs):
        if self.completion_status == "completed" and self.completed_at is None:
            self.completed_at = timezone.now()
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = set(kwargs["update_fields"]) | {"completed_at"}
        if self._state.adding:
            for field, value in self.service.appointment_price_fields().items():
                setattr(self, field, value)
        return super().save(*args, **kwargs)

    @property
    def pricing_type(self):
        # Empty JSON means a historical fixed snapshot, regardless of today's catalog.
        return self.catalog_pricing_snapshot.get("pricing_type", "FIXED")

    @property
    def is_price_final(self):
        return self.pricing_type == "FIXED" or self.final_price is not None

    @property
    def effective_price(self):
        base = self.price_snapshot if self.pricing_type == "FIXED" else (self.final_price or 0)
        return max(base - self.discount_amount, 0)

    @property
    def price_status(self):
        return "final" if self.is_price_final else ("estimated" if self.catalog_pricing_snapshot.get("minimum_price") is not None else "unresolved")

    def ensure_commission(self, actor=None):
        if self.completion_status != "completed" or not self.is_price_final:
            return
        # Keep fixed-service behavior. Variable commissions wait for confirmed settlement.
        if self.pricing_type != "FIXED" and (self.appointment.has_unresolved_prices or self.appointment.remaining_total > 0 or self.appointment.net_paid <= 0):
            return
        EmployeeCommission.objects.get_or_create(appointment_item=self, defaults={
            "base_amount": self.effective_price, "commission_rate_snapshot": self.employee.commission_rate,
            "commission_amount": int(Decimal(self.effective_price) * self.employee.commission_rate / Decimal("100")),
            "created_by": actor, "updated_by": actor,
        })

    def set_completion_status(self, status, changed_by=None, reason=""):
        if status not in dict(self.COMPLETION_CHOICES):
            raise ValidationError("Invalid appointment item status.")
        from django.db import transaction
        with transaction.atomic():
            appointment = Appointment.objects.select_for_update().get(pk=self.appointment_id)
            self.refresh_from_db(fields=("price_snapshot", "catalog_pricing_snapshot", "final_price", "discount_amount", "discount_applied"))
            if status == "completed" and not self.is_price_final:
                raise ValidationError("ابتدا قیمت نهایی این سرویس را مشخص کنید.")
            self.completion_status = status
            self.updated_by = changed_by
            self.save(update_fields=("completion_status", "updated_by", "updated_at"))
            if status == "completed":
                self.ensure_commission(changed_by)
            sibling_statuses = appointment.items.exclude(pk=self.pk).values_list("completion_status", flat=True)
            if status == "completed":
                appointment_status = "completed" if all(value == "completed" for value in sibling_statuses) else "confirmed"
            elif status == "cancelled":
                appointment_status = "cancelled" if all(value == "cancelled" for value in sibling_statuses) else "confirmed"
            else:
                appointment_status = "confirmed"
            appointment.set_status(appointment_status, changed_by=changed_by, reason=reason)


class BookingHold(models.Model):
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def active(self):
        return self.expires_at > timezone.now()


class BookingHoldItem(models.Model):
    hold = models.ForeignKey(BookingHold, on_delete=models.CASCADE, related_name="items")
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()


class WaitlistEntry(models.Model):
    service = models.ForeignKey(Service, on_delete=models.PROTECT)
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, null=True, blank=True)
    date = models.DateField()
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=20)
    notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AppointmentStatusHistory(models.Model):
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="status_history")
    status = models.CharField(max_length=20, choices=Appointment.STATUS_CHOICES)
    changed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_status_history")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_status_history")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Appointment status history is append-only.")
        return super().save(*args, **kwargs)


class AuditedModel(models.Model):
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="%(class)s_created")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="%(class)s_updated")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Payment(AuditedModel):
    STATUS_CHOICES = [("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed"), ("refunded", "Refunded")]
    METHOD_CHOICES = [("cash", "Cash"), ("card", "Card"), ("bank_transfer", "Bank transfer"), ("online", "Online"), ("other", "Other")]
    appointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, related_name="payments")
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="cash")
    paid_at = models.DateTimeField(null=True, blank=True)
    provider_reference = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_payments")
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("status", "paid_at"), name="payment_status_paid_idx")]
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_amount_positive")]

    def mark_paid(self, changed_by=None):
        if self.status not in {"pending", "failed"}:
            raise ValidationError("Payment cannot transition to paid from this state.")
        self.appointment.require_final_prices()
        self.status = "paid"
        self.paid_at = timezone.now()
        self.updated_by = changed_by
        self.reviewed_by = changed_by
        self.reviewed_at = timezone.now()
        self.save(update_fields=("status", "paid_at", "updated_by", "reviewed_by", "reviewed_at", "updated_at"))
        for item in self.appointment.items.select_related("service", "employee"):
            item.ensure_commission(changed_by)

    def refund(self, changed_by=None):
        if self.status != "paid":
            raise ValidationError("Only paid payments can be refunded.")
        self.status = "refunded"
        self.updated_by = changed_by
        self.save(update_fields=("status", "updated_by", "updated_at"))


class Transaction(AuditedModel):
    TYPE_CHOICES = [("payment", "Payment"), ("commission", "Commission"), ("expense", "Expense"), ("refund", "Refund")]
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.PositiveIntegerField()
    appointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, null=True, blank=True, related_name="transactions")
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, null=True, blank=True, related_name="transactions")
    description = models.CharField(max_length=255, blank=True)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Financial transactions are append-only.")
        return super().save(*args, **kwargs)


class EmployeeCommission(AuditedModel):
    appointment_item = models.ForeignKey(AppointmentItem, on_delete=models.PROTECT, related_name="commissions")
    commission_rate_snapshot = models.DecimalField(max_digits=5, decimal_places=2)
    base_amount = models.PositiveIntegerField(default=0)
    commission_amount = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=[("pending", "Pending"), ("approved", "Approved"), ("paid", "Paid")], default="pending")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("appointment_item",), name="unique_item_commission")]
        indexes = [models.Index(fields=("status", "created_at"), name="commission_status_date_idx")]


class Refund(AuditedModel):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    amount = models.PositiveIntegerField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=[("pending", "Pending"), ("completed", "Completed")], default="pending")

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="refund_amount_positive")]

    def complete(self, changed_by=None):
        if self.status != "pending":
            raise ValidationError("Refund is already completed.")
        completed = self.payment.refunds.filter(status="completed").exclude(pk=self.pk).aggregate(total=models.Sum("amount"))["total"] or 0
        if self.payment.status not in {"paid", "refunded"} or completed + self.amount > self.payment.amount:
            raise ValidationError("Refund exceeds the refundable payment amount.")
        from django.db import transaction
        with transaction.atomic():
            self.status = "completed"
            self.updated_by = changed_by
            self.save(update_fields=("status", "updated_by", "updated_at"))
            Transaction.objects.create(type="refund", amount=self.amount, appointment=self.payment.appointment, payment=self.payment, description=self.reason, created_by=changed_by, updated_by=changed_by)
            if completed + self.amount == self.payment.amount:
                self.payment.status = "refunded"
                self.payment.updated_by = changed_by
                self.payment.save(update_fields=("status", "updated_by", "updated_at"))


class GalleryAsset(models.Model):
    title = models.CharField(max_length=160, blank=True)
    category = models.ForeignKey("GalleryCategory", on_delete=models.PROTECT, related_name="assets", null=True, blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    image = models.ImageField(upload_to="gallery/", blank=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "-created_at")


class GalleryCategory(models.Model):
    name = models.CharField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Promotion(models.Model):
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)


class HomepageSection(models.Model):
    key = models.SlugField(unique=True)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)


class SalonSettings(models.Model):
    singleton_id = models.PositiveSmallIntegerField(default=1, unique=True, editable=False)
    salon_name = models.CharField(max_length=160, default="Baharnaj")
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        self.singleton_id = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        return cls.objects.get_or_create(singleton_id=1)[0]
