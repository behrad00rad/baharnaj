from django.db.models import Q
from rest_framework import serializers


ACTIVE_APPOINTMENT_STATUSES = ("pending", "confirmed")


def validate_no_employee_overlap(*, employee, date, start_time, end_time, item_id=None):
    """Reject an item that overlaps an active item for the same employee and date."""
    from .models import AppointmentItem

    queryset = AppointmentItem.objects.filter(
        employee=employee,
        date=date,
        appointment__status__in=ACTIVE_APPOINTMENT_STATUSES,
        start_time__lt=end_time,
        end_time__gt=start_time,
    )
    if item_id:
        queryset = queryset.exclude(pk=item_id)
    if queryset.exists():
        raise serializers.ValidationError("این زمان قبلاً برای متخصص رزرو شده است.")
