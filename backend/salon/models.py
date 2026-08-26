from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
	ROLE_CHOICES = [("customer", "Customer"), ("employee", "Employee"), ("admin", "Admin")]
	phone = models.CharField(max_length=20, blank=True)
	role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")

class Service(models.Model):
	name = models.CharField(max_length=120)
	persian_name = models.CharField(max_length=120)
	description = models.TextField(blank=True)
	category = models.CharField(max_length=80, blank=True)
	price = models.PositiveIntegerField()
	duration = models.PositiveIntegerField(help_text="Duration in minutes")
	image = models.URLField(blank=True)
	is_active = models.BooleanField(default=True)
	def __str__(self):
		return self.persian_name

class Employee(models.Model):
	user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="employee_profile")
	specialty = models.CharField(max_length=120, blank=True)
	commission_value = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	services = models.ManyToManyField(Service, related_name="employees", blank=True)
	is_active = models.BooleanField(default=True)

class WorkingHour(models.Model):
	employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="working_hours")
	weekday = models.PositiveSmallIntegerField(choices=[(day, str(day)) for day in range(7)])
	start_time = models.TimeField()
	end_time = models.TimeField()
	is_active = models.BooleanField(default=True)

	class Meta:
		constraints = [models.UniqueConstraint(fields=("employee", "weekday"), name="unique_employee_weekday")]
		ordering = ["weekday", "start_time"]

class Appointment(models.Model):
	STATUS_CHOICES = [("pending", "Pending"), ("confirmed", "Confirmed"), ("completed", "Completed"), ("cancelled", "Cancelled")]
	customer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="appointments", null=True)
	employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="appointments")
	service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointments")
	date = models.DateField()
	start_time = models.TimeField()
	end_time = models.TimeField()
	price = models.PositiveIntegerField()
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
	notes = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	class Meta:
		ordering = ["date", "start_time"]

class WorkRecord(models.Model):
	employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="work_records")
	appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name="work_record")
	service = models.ForeignKey(Service, on_delete=models.PROTECT)
	price = models.PositiveIntegerField()
	commission = models.PositiveIntegerField(default=0)
	completed_at = models.DateTimeField(auto_now_add=True)
	notes = models.TextField(blank=True)

class Transaction(models.Model):
	TYPE_CHOICES = [("payment", "Payment"), ("commission", "Commission"), ("expense", "Expense"), ("refund", "Refund")]
	type = models.CharField(max_length=20, choices=TYPE_CHOICES)
	amount = models.PositiveIntegerField()
	appointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, null=True, blank=True)
	description = models.CharField(max_length=255, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
from django.db import models

# Create your models here.
