from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django import forms
from .models import Appointment, Employee, GalleryItem, Service, Transaction, User, WorkRecord, WorkingHour


class SalonUserCreationForm(UserCreationForm):
	class Meta:
		model = User
		fields = ("username", "first_name", "last_name", "email", "phone", "role", "is_staff", "is_active")


class SalonUserChangeForm(UserChangeForm):
	class Meta:
		model = User
		fields = "__all__"


class EmployeeAdminForm(forms.ModelForm):
	class Meta:
		model = Employee
		fields = "__all__"

	def save(self, commit=True):
		employee = super().save(commit=False)
		employee.user.role = "employee"
		employee.user.save(update_fields=("role",))
		if commit:
			employee.save()
			self.save_m2m()
		return employee


class EmployeeInline(admin.StackedInline):
	model = Employee
	form = EmployeeAdminForm
	extra = 0


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
	form = SalonUserChangeForm
	add_form = SalonUserCreationForm
	inlines = (EmployeeInline,)
	list_display = ("username", "get_full_name", "phone", "role", "is_active", "is_staff")
	list_filter = ("role", "is_active", "is_staff")
	search_fields = ("username", "first_name", "last_name", "email", "phone")
	fieldsets = DjangoUserAdmin.fieldsets + (("Salon access", {"fields": ("phone", "role")}),)
	add_fieldsets = DjangoUserAdmin.add_fieldsets + (("Salon access", {"fields": ("first_name", "last_name", "email", "phone", "role", "is_staff", "is_active")}),)


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
	list_display = ("persian_name", "name", "category", "price", "duration", "is_active")
	list_filter = ("category", "is_active")
	search_fields = ("name", "persian_name", "description")
	list_editable = ("price", "duration", "is_active")

@admin.register(GalleryItem)
class GalleryItemAdmin(admin.ModelAdmin):
	list_display = ("title", "category", "order", "is_published")
	list_filter = ("category", "is_published")
	list_editable = ("order", "is_published")
	fields = ("title", "category", "image", "image_url", "description", "order", "is_published")
	readonly_fields = ("image_url",)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
	form = EmployeeAdminForm
	list_display = ("user", "specialty", "commission_value", "is_active")
	list_filter = ("is_active", "services")
	search_fields = ("user__username", "user__first_name", "user__last_name", "specialty")
	filter_horizontal = ("services",)


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
	list_display = ("date", "start_time", "customer", "employee", "service", "price", "status")
	list_filter = ("status", "date", "service", "employee")
	search_fields = ("customer__username", "customer__first_name", "customer__last_name", "customer__phone", "notes")
	date_hierarchy = "date"
	list_editable = ("status",)
	readonly_fields = ("created_at",)


@admin.register(WorkRecord)
class WorkRecordAdmin(admin.ModelAdmin):
	list_display = ("completed_at", "employee", "service", "price", "commission", "appointment")
	list_filter = ("service", "employee", "completed_at")
	search_fields = ("employee__user__username", "employee__user__first_name", "employee__user__last_name", "notes")
	date_hierarchy = "completed_at"
	readonly_fields = ("completed_at",)


@admin.register(WorkingHour)
class WorkingHourAdmin(admin.ModelAdmin):
	list_display = ("employee", "weekday", "start_time", "end_time", "is_active")
	list_filter = ("weekday", "is_active", "employee")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
	list_display = ("created_at", "type", "amount", "appointment", "description")
	list_filter = ("type", "created_at")
	search_fields = ("description", "appointment__customer__username", "appointment__customer__phone")
	date_hierarchy = "created_at"
	readonly_fields = ("created_at",)
from django.contrib import admin

# Register your models here.
