from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    AccountLogin, Appointment, AppointmentItem, AppointmentStatusHistory, BlogCategory, BlogMedia, BlogPost, BlogPostRevision, BlogTag, CustomerProfile,
    EmployeeProfile, EmployeeService, GalleryAsset, GalleryCategory, HomepageSection, Payment, Promotion,
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
admin.site.register((Appointment, AppointmentStatusHistory))


@admin.register(AppointmentItem)
class AppointmentItemAdmin(admin.ModelAdmin):
    # Price finalization belongs to the audited, payment-aware panel action.
    readonly_fields = ("price_snapshot", "catalog_pricing_snapshot", "final_price")
admin.site.register((Payment, Transaction, Refund))
admin.site.register((GalleryAsset, GalleryCategory, Promotion, HomepageSection, SalonSettings, AccountLogin))
admin.site.register((BlogCategory, BlogTag, BlogMedia, BlogPostRevision))


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "category", "author", "published_at", "updated_at", "is_featured")
    list_filter = ("status", "category", "is_featured", "tags")
    search_fields = ("title", "slug", "excerpt", "seo_title")
    filter_horizontal = ("tags", "related_services")
    readonly_fields = ("created_at", "updated_at", "published_at")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("persian_name", "name", "slug", "category", "price", "duration", "is_active", "is_bookable", "is_deleted")
    list_filter = ("category", "is_active", "is_bookable", "is_deleted")
    search_fields = ("name", "persian_name", "description", "slug", "seo_title")
    fields = ("category", "name", "persian_name", "short_description", "description", "slug", "seo_title", "seo_description", "pricing_type", "price", "minimum_price", "maximum_price", "pricing_note", "duration", "is_active", "is_bookable", "is_featured", "is_deleted")
