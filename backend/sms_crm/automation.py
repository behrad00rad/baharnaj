"""Reconcile committed appointment facts into uniquely keyed SMS work."""
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from salon.models import Appointment, AppointmentStatusHistory
from .models import SmsConfig, SmsDelivery
from .provider_settings import provider_settings
from .services import appointment_snapshot, recipient_for, render_template, sms_parts

EVENTS = {"pending": "booking_received", "confirmed": "booking_confirmed", "cancelled": "booking_cancelled"}


def enqueue(appointment, kind, key, *, when=None, expires=None, snapshot=None):
    now = timezone.now()
    phone = recipient_for(appointment, now)
    if not phone:
        return None
    start, values, version = snapshot or appointment_snapshot(appointment)
    if not start:
        return None
    text, template_version = render_template(kind, values)
    delivery, created = SmsDelivery.objects.get_or_create(key=key, defaults={
        "user": appointment.customer.user, "recipient": phone, "kind": kind, "text": text,
        "template_version": template_version, "body_id": provider_settings().body_ids.get(kind, ""),
        "appointment": appointment, "schedule_version": version, "scheduled_at": when or now,
        "expires_at": expires, "parts": sms_parts(text),
    })
    return delivery if created else None


def reconcile_appointment(appointment_id, *, now=None):
    now = now or timezone.now()
    appointment = Appointment.objects.select_related("customer__user").filter(pk=appointment_id).first()
    if not appointment:
        return 0
    config = SmsConfig.solo()
    start, values, version = appointment_snapshot(appointment)
    SmsDelivery.objects.filter(appointment=appointment, kind="appointment_reminder", status="queued").exclude(schedule_version=version).update(status="cancelled", error="obsolete_schedule")
    if appointment.status not in {"pending", "confirmed"}:
        SmsDelivery.objects.filter(appointment=appointment, kind="appointment_reminder", status="queued").update(status="cancelled", error="appointment_inactive")
    if not start or not recipient_for(appointment, now):
        return 0
    created = 0
    recent = now - timedelta(hours=1)
    if appointment.created_at >= recent and "booking_received" in config.enabled_events:
        created += bool(enqueue(appointment, "booking_received", f"sms:received:{appointment.pk}", expires=appointment.created_at + timedelta(hours=1)))
    for history in AppointmentStatusHistory.objects.filter(appointment=appointment, changed_at__gte=recent).order_by("pk"):
        kind = "booking_rescheduled" if "تغییر زمان" in history.reason else EVENTS.get(history.status)
        if kind and kind != "booking_received" and kind in config.enabled_events:
            created += bool(enqueue(appointment, kind, f"sms:event:{history.pk}:{kind}", expires=history.changed_at + timedelta(hours=1)))
    if appointment.status in {"pending", "confirmed"}:
        for hours in config.reminder_hours:
            when = start - timedelta(hours=hours)
            if when >= appointment.created_at and when >= now - timedelta(minutes=5) and when < start:
                created += bool(enqueue(appointment, "appointment_reminder", f"sms:reminder:{appointment.pk}:{version}:{hours}", when=when, expires=min(start, when + timedelta(minutes=15)), snapshot=(start, values, version)))
    return created


def safe_after_commit(appointment_id):
    def callback():
        try:
            reconcile_appointment(appointment_id)
        except Exception:
            # The periodic worker reconciles committed records again.
            import logging
            logging.getLogger(__name__).exception("SMS reconciliation failed", extra={"appointment_id": appointment_id})
    transaction.on_commit(callback)


def reconcile_recent(now=None):
    now = now or timezone.now()
    local_day = timezone.localtime(now).date()
    ids = Appointment.objects.filter(Q(items__date__gte=local_day - timedelta(days=1), items__date__lte=local_day + timedelta(days=8)) | Q(updated_at__gte=now - timedelta(hours=1))).distinct().values_list("pk", flat=True)
    for appointment_id in ids.iterator():
        reconcile_appointment(appointment_id, now=now)
