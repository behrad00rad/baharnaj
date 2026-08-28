from datetime import date

from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Appointment, AppointmentItem, CustomerProfile, EmployeeCommission, EmployeeProfile, EmployeeService, Payment, Refund, Service, ServiceCategory, TimeOff, User, WorkingSchedule


class AppointmentItemSchemaTests(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="customer")
        self.customer_profile = CustomerProfile.objects.create(user=self.customer)
        employee_user = User.objects.create_user(username="employee", role="employee")
        self.employee = EmployeeProfile.objects.create(user=employee_user, is_active=True)
        category = ServiceCategory.objects.create(name="Hair")
        self.service = Service.objects.create(category=category, name="Cut", persian_name="Cut", price=800, duration=60)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        self.appointment = Appointment.objects.create(customer=self.customer_profile, created_by=self.customer)

    def make_item(self, start="09:00", end="10:00"):
        return AppointmentItem.objects.create(
            appointment=self.appointment, service=self.service, employee=self.employee,
            date=date(2026, 8, 29), start_time=start, end_time=end,
        )

    def test_item_snapshots_are_not_recalculated(self):
        item = self.make_item()
        self.assertEqual((item.price_snapshot, item.duration_snapshot), (800, 60))
        self.service.price = 1200
        self.service.duration = 90
        self.service.save()
        item.notes = "updated"
        item.save()
        item.refresh_from_db()
        self.assertEqual((item.price_snapshot, item.duration_snapshot), (800, 60))

    def test_database_rejects_overlapping_items(self):
        self.make_item()
        with self.assertRaises(IntegrityError):
            self.make_item(start="09:30", end="10:30")

    def test_soft_delete_hides_service(self):
        self.service.delete()
        self.assertFalse(Service.objects.filter(pk=self.service.pk).exists())
        self.assertTrue(Service.all_objects.filter(pk=self.service.pk).exists())

    def test_status_method_writes_history(self):
        self.appointment.set_status("confirmed", changed_by=self.customer, reason="approved")
        self.assertEqual(self.appointment.status_history.count(), 1)
        self.assertEqual(self.appointment.status_history.get().reason, "approved")

    def test_role_is_source_of_truth_for_staff(self):
        user = User.objects.create_user(username="manager", role="admin", is_staff=False)
        self.assertTrue(user.is_staff)
        user.role = "customer"
        user.save()
        user.refresh_from_db()
        self.assertFalse(user.is_staff)

    def test_login_returns_access_token_and_http_only_refresh_cookie(self):
        user = User.objects.create_user(username="login-user", password="correct-password", role="admin")
        response = self.client.post("/api/v1/auth/token/", {"username": user.username, "password": "correct-password"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "admin")
        self.assertNotIn("refresh", response.data)
        self.assertTrue(response.cookies["baharnaj_refresh"]["httponly"])

    @override_settings(TIME_ZONE="Asia/Tehran")
    def test_availability_does_not_depend_on_client_timezone(self):
        from .models import WorkingSchedule
        WorkingSchedule.objects.create(employee=self.employee, weekday=5, start_time="09:00", end_time="20:00")
        client = APIClient()
        query = {"service": self.service.pk, "employee": self.employee.pk, "date": "2026-08-29"}
        tehran = client.get("/api/v1/availability/", query, HTTP_X_TIMEZONE="Asia/Tehran").data["slots"]
        tokyo = client.get("/api/v1/availability/", query, HTTP_X_TIMEZONE="Asia/Tokyo").data["slots"]
        self.assertEqual(tehran, tokyo)

    def test_working_hour_violation_is_rejected(self):
        from rest_framework.test import APIRequestFactory
        from .serializers import AppointmentItemSerializer
        serializer = AppointmentItemSerializer(data={"appointment": self.appointment.pk, "service": self.service.pk, "employee": self.employee.pk, "date": "2026-08-29", "start_time": "08:00", "end_time": "09:00"})
        self.assertFalse(serializer.is_valid())

    def test_time_off_and_schedule_exception_enforcement(self):
        WorkingSchedule.objects.create(employee=self.employee, weekday=5, start_time="09:00", end_time="20:00")
        TimeOff.objects.create(employee=self.employee, start_date=date(2026, 8, 29), end_date=date(2026, 8, 29))
        from .serializers import AppointmentItemSerializer
        serializer = AppointmentItemSerializer(data={"appointment": self.appointment.pk, "service": self.service.pk, "employee": self.employee.pk, "date": "2026-08-29", "start_time": "10:00", "end_time": "11:00"})
        self.assertFalse(serializer.is_valid())

    def test_role_permissions_and_employee_isolation(self):
        from rest_framework.test import APIClient
        other_user = User.objects.create_user(username="other", role="employee")
        other = EmployeeProfile.objects.create(user=other_user)
        EmployeeService.objects.create(employee=other, service=self.service)
        other_appointment = Appointment.objects.create(customer=self.customer_profile)
        AppointmentItem.objects.create(appointment=other_appointment, service=self.service, employee=other, date=date(2026, 8, 30), start_time="09:00", end_time="10:00")
        client = APIClient(); client.force_authenticate(self.employee.user)
        response = client.get("/api/v1/employee/appointment-items/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(other_appointment.pk, [item["appointment"] for item in response.data])
        client.force_authenticate(self.customer)
        self.assertEqual(client.get("/api/v1/admin/statistics/").status_code, 403)

    def test_commission_calculation_and_payment_refund_transitions(self):
        item = self.make_item()
        commission = EmployeeCommission.objects.create(appointment_item=item, commission_rate_snapshot=10, commission_amount=80)
        self.assertEqual(commission.commission_amount, 80)
        payment = Payment.objects.create(appointment=self.appointment, amount=800)
        payment.mark_paid(self.customer); self.assertEqual(payment.status, "paid")
        refund = Refund.objects.create(payment=payment, amount=800)
        refund.complete(self.customer)
        self.assertEqual(payment.status, "refunded")

    def test_reschedule_revalidates_and_cancellation_history(self):
        WorkingSchedule.objects.create(employee=self.employee, weekday=5, start_time="09:00", end_time="20:00")
        item = self.make_item()
        item.date = date(2026, 8, 29); item.start_time = "11:00"; item.end_time = "12:00"; item.full_clean(); item.save()
        self.assertFalse(AppointmentItem.objects.filter(start_time="09:00").exists())
        self.appointment.set_status("cancelled", changed_by=self.customer, reason="customer request")
        self.assertEqual(self.appointment.status_history.get().reason, "customer request")
