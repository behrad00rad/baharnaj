from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    AccountLogin, Appointment, AppointmentItem, AppointmentStatusHistory, CustomerProfile,
    EmployeeProfile, EmployeeService, GalleryAsset, HomepageSection, Payment, Promotion,
    Refund, SalonSettings, ScheduleException, Service, ServiceCategory, ServiceImage,
    TimeOff, Transaction, User, WorkingSchedule,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "get_full_name", "phone", "role", "account_status", "is_active")
    list_filter = ("role", "account_status", "is_active", "is_staff")
    fieldsets = DjangoUserAdmin.fieldsets + (("Salon access", {"fields": ("phone", "role", "account_status", "last_login_ip")}),)


admin.site.register((CustomerProfile, EmployeeProfile, EmployeeService, ServiceCategory, ServiceImage))
admin.site.register((WorkingSchedule, ScheduleException, TimeOff))
admin.site.register((Appointment, AppointmentItem, AppointmentStatusHistory))
admin.site.register((Payment, Transaction, Refund))
admin.site.register((GalleryAsset, Promotion, HomepageSection, SalonSettings, AccountLogin))


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("persian_name", "name", "category", "price", "duration", "is_active", "is_bookable", "is_deleted")
    list_filter = ("category", "is_active", "is_bookable", "is_deleted")
    search_fields = ("name", "persian_name", "description")
