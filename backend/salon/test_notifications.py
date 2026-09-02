from datetime import date, time
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from .models import Appointment, AppointmentItem, CustomerProfile, EmployeeProfile, Notification, Service, ServiceCategory, User
from .notifications import notify_appointment_created, notify_users


class NotificationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="notification-admin", role="admin")
        self.employee_users = [
            User.objects.create_user(username=f"notification-employee-{index}", role="employee")
            for index in range(2)
        ]
        self.employees = [EmployeeProfile.objects.create(user=user) for user in self.employee_users]
        customer_user = User.objects.create_user(username="notification-customer")
        customer = CustomerProfile.objects.create(user=customer_user)
        category = ServiceCategory.objects.create(name="Notification services")
        services = [
            Service.objects.create(category=category, name=f"Service {index}", persian_name=f"خدمت {index}", price=1000, duration=60)
            for index in range(2)
        ]
        self.appointment = Appointment.objects.create(customer=customer, created_by=customer_user)
        for index, employee in enumerate(self.employees):
            AppointmentItem.objects.create(
                appointment=self.appointment, service=services[index], employee=employee,
                date=date(2026, 9, 5), start_time=time(9 + index), end_time=time(10 + index),
            )

    def test_appointment_event_deduplicates_multi_employee_recipients(self):
        notify_appointment_created(self.appointment, actor=self.appointment.created_by)
        notify_appointment_created(self.appointment, actor=self.appointment.created_by)

        for user in self.employee_users:
            self.assertEqual(Notification.objects.filter(recipient=user, type="appointment_assigned").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.admin, type="appointment_created").count(), 1)

    def test_notification_api_is_scoped_and_marks_read(self):
        mine = notify_users([self.employee_users[0]], type="appointment_updated", title="Mine", message="Only mine")[0]
        other = notify_users([self.employee_users[1]], type="appointment_updated", title="Other", message="Only other")[0]
        client = APIClient()
        client.force_authenticate(self.employee_users[0])

        response = client.get("/api/v1/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [mine.pk])
        self.assertEqual(client.post(f"/api/v1/notifications/{other.pk}/read/").status_code, 404)
        self.assertEqual(client.post(f"/api/v1/notifications/{mine.pk}/read/").status_code, 200)
        self.assertEqual(client.get("/api/v1/notifications/unread-count/").data["count"], 0)

    def test_employee_self_booking_does_not_notify_actor(self):
        notify_appointment_created(self.appointment, actor=self.employee_users[0])
        self.assertFalse(Notification.objects.filter(recipient=self.employee_users[0]).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.employee_users[1], type="appointment_assigned").exists())
        self.assertTrue(Notification.objects.filter(recipient=self.admin, type="appointment_created").exists())

    def test_push_failure_never_removes_or_fails_in_app_notification(self):
        with patch("salon.notifications.send_fcm_notification", side_effect=RuntimeError("provider down")):
            with self.captureOnCommitCallbacks(execute=True):
                notification = notify_users([self.employee_users[0]], type="appointment_updated", title="Saved", message="Still saved")[0]
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())

    def test_authenticated_user_can_send_test_notification(self):
        client = APIClient()
        client.force_authenticate(self.employee_users[0])
        response = client.post("/api/v1/firebase-devices/test/")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "اعلان آزمایشی بهارناژ")
        self.assertTrue(Notification.objects.filter(pk=response.data["id"], recipient=self.employee_users[0]).exists())

    def test_payment_report_and_review_notify_the_correct_roles(self):
        client = APIClient()
        client.force_authenticate(self.employee_users[0])
        response = client.post(
            f"/api/v1/employee/appointments/{self.appointment.pk}/payments/",
            {"amount": 500, "payment_method": "cash", "notes": "reported"},
        )
        self.assertEqual(response.status_code, 201)
        payment_id = response.data["id"]
        self.assertTrue(Notification.objects.filter(recipient=self.admin, type="payment_reported", payment_id=payment_id).exists())

        client.force_authenticate(self.admin)
        self.assertEqual(client.post(f"/api/v1/admin/payments/{payment_id}/confirm/").status_code, 200)
        self.assertTrue(Notification.objects.filter(recipient=self.employee_users[0], type="payment_confirmed", payment_id=payment_id).exists())

        client.force_authenticate(self.employee_users[0])
        rejected = client.post(
            f"/api/v1/employee/appointments/{self.appointment.pk}/payments/",
            {"amount": 300, "payment_method": "cash", "notes": "reject this"},
        )
        client.force_authenticate(self.admin)
        self.assertEqual(client.post(f"/api/v1/admin/payments/{rejected.data['id']}/reject/").status_code, 200)
        self.assertTrue(Notification.objects.filter(recipient=self.employee_users[0], type="payment_rejected", payment_id=rejected.data["id"]).exists())
