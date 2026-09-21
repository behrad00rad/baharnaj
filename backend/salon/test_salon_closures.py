import json
from datetime import time, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    Appointment,
    AppointmentItem,
    CustomerProfile,
    EmployeeProfile,
    EmployeeService,
    SalonClosure,
    Service,
    ServiceCategory,
    User,
    WorkingSchedule,
)


class SalonClosureTests(TestCase):
    def setUp(self):
        category = ServiceCategory.objects.create(name="Closure tests")
        self.service = Service.objects.create(
            category=category, name="closure-cut", persian_name="کوتاهی", price=500, duration=60,
        )
        employee_user = User.objects.create_user(username="closure-employee", role="employee")
        self.employee = EmployeeProfile.objects.create(user=employee_user, is_active=True)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        self.booking_date = timezone.localdate() + timedelta(days=14)
        WorkingSchedule.objects.create(
            employee=self.employee, weekday=self.booking_date.weekday(), start_time=time(9), end_time=time(17), is_active=True,
        )
        self.admin = User.objects.create_user(username="closure-admin", password="admin-password", role="admin")
        self.client = APIClient()
        self.items_query = json.dumps([{"service": self.service.pk, "employee": self.employee.pk}])

    def create_closure(self, reason="تعطیلات رسمی"):
        return SalonClosure.objects.create(
            start_date=self.booking_date, end_date=self.booking_date, reason=reason,
            created_by=self.admin, updated_by=self.admin,
        )

    def test_admin_can_manage_closures_and_overlaps_are_rejected(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "start_date": self.booking_date.isoformat(),
            "end_date": self.booking_date.isoformat(),
            "kind": "holiday",
            "reason": "تعطیلات رسمی",
        }
        created = self.client.post("/api/v1/admin/closures/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["reason"], "تعطیلات رسمی")
        duplicate = self.client.post("/api/v1/admin/closures/", payload, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/admin/closures/{created.data['id']}/").status_code, 204)

    def test_non_admin_cannot_manage_closures(self):
        response = self.client.post("/api/v1/admin/closures/", {
            "start_date": self.booking_date.isoformat(), "end_date": self.booking_date.isoformat(), "kind": "holiday",
        }, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_public_availability_and_calendar_explain_closure(self):
        self.create_closure()
        response = self.client.get("/api/v1/availability/", {"date": self.booking_date.isoformat(), "items": self.items_query})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "holiday")
        self.assertEqual(response.data["slots"], [])
        self.assertEqual(response.data["reason"], "تعطیلات رسمی")
        calendar = self.client.get("/api/v1/availability/calendar/", {
            "start": self.booking_date.isoformat(), "end": self.booking_date.isoformat(), "items": self.items_query,
        })
        self.assertEqual(calendar.status_code, 200, calendar.data)
        self.assertEqual(calendar.data["dates"][0]["status"], "holiday")
        self.assertEqual(calendar.data["dates"][0]["reason"], "تعطیلات رسمی")

    def test_booking_hold_is_rejected_on_a_closure(self):
        self.create_closure("ظرفیت سالن تکمیل است")
        item = {
            "service": self.service.pk, "employee": self.employee.pk, "date": self.booking_date.isoformat(),
            "start_time": "10:00", "end_time": "11:00",
        }
        response = self.client.post("/api/v1/booking-holds/", {"items": [item]}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "salon_closed")
        self.assertIn("ظرفیت سالن تکمیل است", response.data["detail"])

    def test_calendar_marks_a_day_with_no_remaining_slot_as_full(self):
        customer_user = User.objects.create_user(username="full-day-customer", role="customer")
        appointment = Appointment.objects.create(customer=CustomerProfile.objects.create(user=customer_user), status="confirmed")
        AppointmentItem.objects.create(
            appointment=appointment, service=self.service, employee=self.employee,
            date=self.booking_date, start_time=time(9), end_time=time(17),
        )
        response = self.client.get("/api/v1/availability/calendar/", {
            "start": self.booking_date.isoformat(), "end": self.booking_date.isoformat(), "items": self.items_query,
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["dates"][0]["status"], "full")
        self.assertEqual(response.data["dates"][0]["slots_count"], 0)

    @override_settings(CUSTOMER_APPOINTMENT_POLICY_CONFIGURED=True)
    def test_customer_cannot_reschedule_to_a_closure(self):
        customer_user = User.objects.create_user(username="closure-customer", role="customer", phone="09120000001")
        customer = CustomerProfile.objects.create(user=customer_user)
        original_date = self.booking_date + timedelta(days=1)
        appointment = Appointment.objects.create(customer=customer, status="confirmed")
        AppointmentItem.objects.create(
            appointment=appointment, service=self.service, employee=self.employee,
            date=original_date, start_time=time(10), end_time=time(11),
        )
        self.create_closure()
        self.client.force_authenticate(customer_user)
        response = self.client.post(
            f"/api/v1/customer/appointments/{appointment.pk}/reschedule/",
            {"date": self.booking_date.isoformat(), "start_time": "10:00", "idempotency_key": "closed-date"},
            format="json",
        )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "salon_closed")
