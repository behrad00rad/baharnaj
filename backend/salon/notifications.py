import json
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Notification, PushSubscription, User

logger = logging.getLogger(__name__)


def _send_push(notification_id):
    notification = Notification.objects.filter(pk=notification_id).first()
    if not notification or not all((settings.WEB_PUSH_VAPID_PRIVATE_KEY, settings.WEB_PUSH_VAPID_PUBLIC_KEY, settings.WEB_PUSH_CONTACT)):
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("Web Push is configured but pywebpush is unavailable")
        return
    payload = json.dumps({"title": notification.title, "body": notification.message, "target_url": notification.target_url or "/"}, ensure_ascii=False)
    for subscription in notification.recipient.push_subscriptions.filter(is_active=True):
        try:
            webpush(
                subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
                data=payload,
                vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.WEB_PUSH_CONTACT},
                ttl=300,
            )
            PushSubscription.objects.filter(pk=subscription.pk).update(last_used_at=timezone.now())
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                PushSubscription.objects.filter(pk=subscription.pk).update(is_active=False)
            logger.warning("Web Push delivery failed", extra={"notification_id": notification.pk, "status_code": status_code})
        except Exception:
            logger.exception("Unexpected Web Push delivery failure", extra={"notification_id": notification.pk})


def _safe_send_push(notification_id):
    try:
        _send_push(notification_id)
    except Exception:
        logger.exception("Web Push dispatch failed", extra={"notification_id": notification_id})


def notify_users(recipients, *, type, title, message, target_url="", appointment=None, payment=None, dedupe_key=None):
    """Persist one notification per recipient, then attempt optional push after commit."""
    notifications = []
    recipient_ids = {recipient.pk for recipient in recipients if recipient and recipient.pk}
    for recipient_id in recipient_ids:
        values = {"recipient_id": recipient_id, "type": type, "title": title, "message": message, "target_url": target_url, "appointment": appointment, "payment": payment}
        if dedupe_key:
            notification, created = Notification.objects.get_or_create(dedupe_key=f"{dedupe_key}:user:{recipient_id}", defaults=values)
        else:
            notification, created = Notification.objects.create(**values), True
        notifications.append(notification)
        if created:
            transaction.on_commit(lambda notification_id=notification.pk: _safe_send_push(notification_id))
    return notifications


def admin_users():
    return User.objects.filter(role="admin", account_status="active", is_active=True)


def appointment_employee_users(appointment):
    return User.objects.filter(
        employee_profile__appointment_items__appointment=appointment,
        employee_profile__is_active=True, employee_profile__is_deleted=False,
        account_status="active", is_active=True,
    ).distinct()


def notify_appointment_created(appointment, actor=None):
    first_item = appointment.items.order_by("date", "start_time").first()
    when = f"{first_item.date} ساعت {first_item.start_time.strftime('%H:%M')}" if first_item else ""
    employees = list(appointment_employee_users(appointment))
    if actor and actor.role == "employee":
        employees = [user for user in employees if user.pk != actor.pk]
    notify_users(employees, type="appointment_assigned", title="نوبت جدید", message=f"یک نوبت جدید برای {when} به شما اختصاص یافت.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:assigned")
    if not actor or actor.role != "admin":
        notify_users(admin_users(), type="appointment_created", title="نوبت جدید", message="یک نوبت جدید ثبت شده است.", target_url=f"/admin/appointments?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:admin-created")


def notify_appointment_rescheduled(appointment):
    first_item = appointment.items.order_by("date", "start_time").first()
    when = f"{first_item.date} ساعت {first_item.start_time.strftime('%H:%M')}" if first_item else "زمان جدید"
    notify_users(appointment_employee_users(appointment), type="appointment_rescheduled", title="تغییر زمان نوبت", message=f"زمان نوبت به {when} تغییر کرد.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment)


def notify_appointment_cancelled(appointment, actor=None):
    recipients = [user for user in appointment_employee_users(appointment) if not actor or user.pk != actor.pk]
    notify_users(recipients, type="appointment_cancelled", title="لغو نوبت", message="یک نوبت اختصاص‌یافته به شما لغو شد.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:cancelled")


def notify_payment_reported(payment):
    notify_users(admin_users(), type="payment_reported", title="گزارش پرداخت جدید", message="یک پرداخت ثبت‌شده توسط کارمند نیاز به بررسی دارد.", target_url=f"/admin/finance?payment={payment.pk}", appointment=payment.appointment, payment=payment, dedupe_key=f"payment:{payment.pk}:reported")


def notify_payment_reviewed(payment, confirmed):
    reporter = payment.created_by
    if not reporter or reporter.role != "employee":
        return
    event = "confirmed" if confirmed else "rejected"
    notify_users([reporter], type=f"payment_{event}", title="تأیید گزارش پرداخت" if confirmed else "رد گزارش پرداخت", message="گزارش پرداخت شما تأیید شد." if confirmed else "گزارش پرداخت شما رد شد.", target_url=f"/employee/calendar?appointment={payment.appointment_id}", appointment=payment.appointment, payment=payment, dedupe_key=f"payment:{payment.pk}:{event}")


def send_booking_confirmation(appointment):
    """Legacy booking hook retained as the authoritative public-booking event."""
    notify_appointment_created(appointment, actor=appointment.created_by)


def send_appointment_reminder(appointment):
    logger.info("Appointment reminder queued", extra={"appointment_id": appointment.pk})
