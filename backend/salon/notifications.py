import logging
import jdatetime

from django.db import transaction

from .firebase import send_fcm_notification
from .models import Notification, User

logger = logging.getLogger(__name__)


def _jalali_appointment_time(item):
    if not item:
        return ""
    date = jdatetime.date.fromgregorian(date=item.date).strftime("%Y/%m/%d")
    return f"{date} ساعت {item.start_time.strftime('%H:%M')}"


def _safe_send_push(notification_id):
    try:
        notification = Notification.objects.filter(pk=notification_id).first()
        if notification:
            send_fcm_notification(notification)
    except Exception:
        logger.exception("FCM dispatch failed", extra={"notification_id": notification_id})


def notify_users(recipients, *, type, title, message, target_url="", appointment=None, payment=None, dedupe_key=None):
    """Persist the authoritative notification, then dispatch FCM after commit."""
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
    when = _jalali_appointment_time(first_item)
    employees = list(appointment_employee_users(appointment))
    if actor and actor.role == "employee":
        employees = [user for user in employees if user.pk != actor.pk]
    notify_users(employees, type="appointment_assigned", title="نوبت جدید", message=f"یک نوبت جدید برای {when} به شما اختصاص یافت.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:assigned")
    if not actor or actor.role != "admin":
        notify_users(admin_users(), type="appointment_created", title="نوبت جدید", message="یک نوبت جدید ثبت شده است.", target_url=f"/admin/appointments?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:admin-created")


def notify_appointment_rescheduled(appointment, actor=None):
    first_item = appointment.items.order_by("date", "start_time").first()
    when = _jalali_appointment_time(first_item) or "زمان جدید"
    notify_users(appointment_employee_users(appointment), type="appointment_rescheduled", title="تغییر زمان نوبت", message=f"زمان نوبت به {when} تغییر کرد.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment)

    if not actor or getattr(actor, "role", None) != "admin":
        notify_users(admin_users(), type="appointment_rescheduled", title="تغییر زمان نوبت", message="زمان یک نوبت تغییر کرد.", target_url=f"/admin/appointments?appointment={appointment.pk}", appointment=appointment)
    customer = appointment.customer.user
    if not actor or customer.pk != getattr(actor, "pk", None):
        notify_users([customer], type="appointment_rescheduled", title="زمان نوبت تغییر کرد", message=f"زمان نوبت شما به {when} تغییر کرد.", target_url=f"/account/appointments/{appointment.pk}", appointment=appointment)


def notify_appointment_cancelled(appointment, actor=None, item=None):
    if item and appointment.status != "cancelled":
        # A single service cancellation must reach admins even if the booking continues.
        if not actor or getattr(actor, "role", None) != "admin":
            notify_users(admin_users(), type="appointment_cancelled", title="لغو سرویس نوبت", message="یک سرویس از نوبت لغو شد.", target_url=f"/admin/appointments?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:admin-cancelled")
        employee = item.employee.user
        if not actor or employee.pk != actor.pk:
            notify_users([employee], type="appointment_cancelled", title="لغو سرویس نوبت", message="یک سرویس اختصاص‌یافته به شما لغو شد.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment-item:{item.pk}:cancelled")
        customer = appointment.customer.user
        if not actor or customer.pk != getattr(actor, "pk", None):
            notify_users([customer], type="appointment_cancelled", title="تغییر در نوبت", message="یکی از خدمات نوبت شما لغو شد.", target_url=f"/account/appointments/{appointment.pk}", appointment=appointment, dedupe_key=f"appointment-item:{item.pk}:customer-cancelled")
        return
    recipients = [user for user in appointment_employee_users(appointment) if not actor or user.pk != actor.pk]
    notify_users(recipients, type="appointment_cancelled", title="لغو نوبت", message="یک نوبت اختصاص‌یافته به شما لغو شد.", target_url=f"/employee/calendar?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:cancelled")

    if not actor or getattr(actor, "role", None) != "admin":
        notify_users(admin_users(), type="appointment_cancelled", title="لغو نوبت", message="یک نوبت لغو شد.", target_url=f"/admin/appointments?appointment={appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:admin-cancelled")
    customer = appointment.customer.user
    if not actor or customer.pk != getattr(actor, "pk", None):
        notify_users([customer], type="appointment_cancelled", title="نوبت لغو شد", message="نوبت شما لغو شد.", target_url=f"/account/appointments/{appointment.pk}", appointment=appointment, dedupe_key=f"appointment:{appointment.pk}:customer-cancelled")


def notify_customer_status(appointment):
    labels = {"pending": "در انتظار تأیید", "confirmed": "تأیید شده", "completed": "انجام شده", "cancelled": "لغو شده"}
    notify_users(
        [appointment.customer.user],
        type="appointment_updated",
        title="وضعیت نوبت به‌روزرسانی شد",
        message=f"وضعیت نوبت شما: {labels.get(appointment.status, appointment.status)}.",
        target_url=f"/account/appointments/{appointment.pk}",
        appointment=appointment,
        dedupe_key=f"appointment:{appointment.pk}:customer-status:{appointment.status}",
    )


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
