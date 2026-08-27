from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
\tROLE_CHOICES = [("customer", "Customer"), ("employee", "Employee"), ("admin", "Admin")]
\tphone = models.CharField(max_length=20, blank=True)
\trole = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")


class Service(models.Model):
\tname = models.CharField(max_length=120)
\tpersian_name = models.CharField(max_length=120)
\tdescription = models.TextField(blank=True)
\tcategory = models.CharField(max_length=80, blank=True)
\tprice = models.PositiveIntegerField()
\tduration = models.PositiveIntegerField(help_text="Duration in minutes")
\timage = models.URLField(blank=True)
\tis_active = models.BooleanField(default=True)

\tdef __str__(self):
\t\treturn self.persian_name


class GalleryItem(models.Model):
\ttitle = models.CharField(max_length=160, blank=True)
\tcategory = models.CharField(max_length=80, blank=True)
\timage_url = models.URLField(max_length=500, blank=True)
\timage = models.ImageField(upload_to="gallery/", blank=True)
\tdescription = models.TextField(blank=True)
\torder = models.PositiveIntegerField(default=0)
\tis_published = models.BooleanField(default=True)
\tcreated_at = models.DateTimeField(auto_now_add=True)

\tclass Meta:
\t\tordering = ["order", "-created_at"]


class Expertise(models.Model):
\tname = models.CharField(max_length=120)
\tpersian_name = models.CharField(max_length=120)
\tcategory = models.CharField(max_length=80, blank=True)
\tis_active = models.BooleanField(default=True)

\tclass Meta:
\t\tconstraints = [
\t\t\tmodels.UniqueConstraint(fields=("name", "persian_name"), name="unique_expertise_name")
\t\t]
\t\tordering = ["persian_name", "name"]

\tdef __str__(self):
\t\treturn self.persian_name or self.name


class Employee(models.Model):
\tuser = models.OneToOneField(User, on_delete=models.PROTECT, related_name="employee_profile")
\tspecialty = models.CharField(max_length=120, blank=True)
\texpertise = models.ManyToManyField(
\t\tExpertise,
\t\tthrough="EmployeeExpertise",
\t\trelated_name="employees",
\t\tblank=True,
\t)
\tcommission_value = models.DecimalField(max_digits=5, decimal_places=2, default=0)
\tservices = models.ManyToManyField(Service, related_name="employees", blank=True)
\tis_active = models.BooleanField(default=True)


class EmployeeExpertise(models.Model):
\temployee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="expertise_links")
\texpertise = models.ForeignKey(Expertise, on_delete=models.PROTECT, related_name="employee_links")
\tyears_experience = models.PositiveSmallIntegerField(null=True, blank=True)
\tis_primary = models.BooleanField(default=False)

\tclass Meta:
\t\tconstraints = [
\t\t\tmodels.UniqueConstraint(fields=("employee", "expertise"), name="unique_employee_expertise")
\t\t]
\t\tordering = ["-is_primary", "expertise__persian_name"]


class WorkingHour(models.Model):
\temployee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="working_hours")
\tweekday = models.PositiveSmallIntegerField(choices=[(day, str(day)) for day in range(7)])
\tstart_time = models.TimeField()
\tend_time = models.TimeField()
\tis_active = models.BooleanField(default=True)

\tclass Meta:
\t\tconstraints = [models.UniqueConstraint(fields=("employee", "weekday"), name="unique_employee_weekday")]
\t\tordering = ["weekday", "start_time"]


class Appointment(models.Model):
\tSTATUS_CHOICES = [("pending", "Pending"), ("confirmed", "Confirmed"), ("completed", "Completed"), ("cancelled", "Cancelled")]
\tcustomer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="appointments", null=True)
\temployee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="appointments")
\tservice = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointments")
\tservices = models.ManyToManyField(Service, through="AppointmentService", related_name="multi_service_appointments", blank=True)
\tdate = models.DateField()
\tstart_time = models.TimeField()
\tend_time = models.TimeField()
\tprice = models.PositiveIntegerField()
\tstatus = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
\tnotes = models.TextField(blank=True)
\tcreated_at = models.DateTimeField(auto_now_add=True)

\tclass Meta:
\t\tordering = ["date", "start_time"]


class AppointmentService(models.Model):
\tappointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="service_assignments")
\tservice = models.ForeignKey(Service, on_delete=models.PROTECT)
\temployee = models.ForeignKey(Employee, on_delete=models.PROTECT)
\tunit_price = models.PositiveIntegerField(null=True, blank=True, help_text="Price captured when the appointment was booked")
\tduration_minutes = models.PositiveIntegerField(null=True, blank=True, help_text="Duration captured when the appointment was booked")
\tnotes = models.TextField(blank=True)
\tstatus = models.CharField(max_length=20, choices=Appointment.STATUS_CHOICES, default="pending")

\tclass Meta:
\t\tconstraints = [models.UniqueConstraint(fields=("appointment", "service"), name="unique_appointment_service")]


class WorkRecord(models.Model):
\temployee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="work_records")
\tappointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, related_name="work_records")
\tappointment_service = models.OneToOneField(AppointmentService, on_delete=models.PROTECT, related_name="work_record", null=True, blank=True)
\tservice = models.ForeignKey(Service, on_delete=models.PROTECT)
\tprice = models.PositiveIntegerField()
\tcommission = models.PositiveIntegerField(default=0)
\tcompleted_at = models.DateTimeField(auto_now_add=True)
\tnotes = models.TextField(blank=True)


class Transaction(models.Model):
\tTYPE_CHOICES = [("payment", "Payment"), ("commission", "Commission"), ("expense", "Expense"), ("refund", "Refund")]
\ttype = models.CharField(max_length=20, choices=TYPE_CHOICES)
\tamount = models.PositiveIntegerField()
\tappointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, null=True, blank=True)
\tdescription = models.CharField(max_length=255, blank=True)
\tcreated_at = models.DateTimeField(auto_now_add=True)
