from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from decimal import Decimal
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
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")
    account_status = models.CharField(max_length=20, choices=ACCOUNT_STATUS_CHOICES, default="active")
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.is_staff = self.role in {"employee", "admin"}
        if kwargs.get("update_fields") is not None:
            kwargs["update_fields"] = set(kwargs["update_fields"]) | {"is_staff"}
        super().save(*args, **kwargs)


class CustomerProfile(SoftDeleteModel):
    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="customer_profile")
    notes = models.TextField(blank=True)
    profile_photo = models.ImageField(upload_to="profiles/", blank=True)
    tags = models.TextField(blank=True)
    no_show_count = models.PositiveIntegerField(default=0)
    last_visit = models.DateField(null=True, blank=True)

    def clean(self):
        if self.user_id and self.user.role != "customer":
            raise ValidationError("CustomerProfile requires a customer-role user.")


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
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="services")
    name = models.CharField(max_length=120)
    persian_name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    price = models.PositiveIntegerField()
    duration = models.PositiveIntegerField(help_text="Duration in minutes")
    is_active = models.BooleanField(default=True)
    is_bookable = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ("name",)

    def delete(self, using=None, keep_parents=False):
        self.is_deleted = True
        self.save(update_fields=("is_deleted",))

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
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)


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
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="time_off")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_time_off")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_time_off")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)


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
        return sum(item.price_snapshot for item in self.items.all())

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
        return "paid" if self.remaining_total == 0 else "partially_paid"


class AppointmentItem(models.Model):
    COMPLETION_CHOICES = [("pending", "Pending"), ("in_progress", "In progress"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointment_items")
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="appointment_items")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    price_snapshot = models.PositiveIntegerField()
    duration_snapshot = models.PositiveIntegerField()
    notes = models.TextField(blank=True)
    completion_status = models.CharField(max_length=20, choices=COMPLETION_CHOICES, default="pending")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="created_appointment_items")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="updated_appointment_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("employee", "date", "completion_status"), name="apptitem_emp_date_status")]

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.price_snapshot = self.service.price
            self.duration_snapshot = self.service.duration
        return super().save(*args, **kwargs)

    def set_completion_status(self, status, changed_by=None, reason=""):
        if status not in dict(self.COMPLETION_CHOICES):
            raise ValidationError("Invalid appointment item status.")
        from django.db import transaction
        with transaction.atomic():
            appointment = Appointment.objects.select_for_update().get(pk=self.appointment_id)
            self.completion_status = status
            self.updated_by = changed_by
            self.save(update_fields=("completion_status", "updated_by", "updated_at"))
            if status == "completed":
                EmployeeCommission.objects.get_or_create(
                    appointment_item=self,
                    defaults={
                        "base_amount": self.price_snapshot,
                        "commission_rate_snapshot": self.employee.commission_rate,
                        "commission_amount": int(Decimal(self.price_snapshot) * self.employee.commission_rate / Decimal("100")),
                        "created_by": changed_by,
                        "updated_by": changed_by,
                    },
                )
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

    class Meta:
        indexes = [models.Index(fields=("status", "paid_at"), name="payment_status_paid_idx")]
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_amount_positive")]

    def mark_paid(self, changed_by=None):
        if self.status not in {"pending", "failed"}:
            raise ValidationError("Payment cannot transition to paid from this state.")
        self.status = "paid"
        self.paid_at = timezone.now()
        self.updated_by = changed_by
        self.save(update_fields=("status", "paid_at", "updated_by", "updated_at"))

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
