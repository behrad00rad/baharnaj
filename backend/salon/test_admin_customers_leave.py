import json
from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Appointment, AppointmentItem, CustomerProfile, EmployeeProfile, EmployeeService, Notification, Payment, Service, ServiceCategory, TimeOff, User, WorkingSchedule


class AdminCustomerManagementTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="customer-list-admin", role="admin")
        self.customer_user = User.objects.create_user(username="customer-list", first_name="مریم", last_name="احمدی", phone="09121234567", role="customer")
        self.customer = CustomerProfile.objects.create(user=self.customer_user, notes="مشتری قدیمی", no_show_count=2)
        category = ServiceCategory.objects.create(name="Customers")
        service = Service.objects.create(category=category, name="customer-service", persian_name="خدمت", price=500, duration=60)
        employee_user = User.objects.create_user(username="customer-list-employee", role="employee")
        employee = EmployeeProfile.objects.create(user=employee_user, is_active=True)
        appointment = Appointment.objects.create(customer=self.customer, status="confirmed")
        AppointmentItem.objects.create(appointment=appointment, service=service, employee=employee, date=timezone.localdate() + timedelta(days=3), start_time=time(10), end_time=time(11))
        Payment.objects.create(appointment=appointment, amount=500, status="paid", payment_method="cash", paid_at=timezone.now(), created_by=self.admin, updated_by=self.admin)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_customer_endpoint_excludes_staff_and_returns_operational_summary(self):
        response = self.client.get("/api/v1/admin/customers/", {"q": "0912"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        customer = response.data["results"][0]
        self.assertEqual(customer["name"], "مریم احمدی")
        self.assertEqual(customer["total_spending"], 500)
        self.assertEqual(customer["appointment_count"], 1)
        self.assertEqual(customer["no_show_count"], 2)
        self.assertTrue(customer["upcoming_visit"])

    def test_admin_can_update_internal_customer_notes(self):
        response = self.client.patch(f"/api/v1/admin/customers/{self.customer.pk}/", {"notes": "نیازمند تماس قبل از نوبت", "tags": "VIP"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.notes, "نیازمند تماس قبل از نوبت")
        self.assertEqual(self.customer.tags, "VIP")


class EmployeeLeaveApprovalTests(TestCase):
    def setUp(self):
        category = ServiceCategory.objects.create(name="Leave")
        self.service = Service.objects.create(category=category, name="leave-service", persian_name="خدمت", price=500, duration=60)
        self.employee_user = User.objects.create_user(username="leave-employee", role="employee", first_name="سارا")
        self.employee = EmployeeProfile.objects.create(user=self.employee_user, is_active=True)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        self.leave_date = timezone.localdate() + timedelta(days=14)
        WorkingSchedule.objects.create(employee=self.employee, weekday=self.leave_date.weekday(), start_time=time(9), end_time=time(17), is_active=True)
        self.admin = User.objects.create_user(username="leave-admin", role="admin")
        self.client = APIClient()
        self.items = json.dumps([{"service": self.service.pk, "employee": self.employee.pk}])

    def request_leave(self):
        self.client.force_authenticate(self.employee_user)
        return self.client.post("/api/v1/employee/time-off/", {"start_date": self.leave_date.isoformat(), "end_date": self.leave_date.isoformat(), "reason": "کار شخصی"}, format="json")

    def test_pending_leave_does_not_block_until_admin_approves(self):
        requested = self.request_leave()
        self.assertEqual(requested.status_code, 201, requested.data)
        self.assertEqual(requested.data["status"], "pending")
        self.client.force_authenticate(None)
        before = self.client.get("/api/v1/availability/", {"date": self.leave_date.isoformat(), "items": self.items})
        self.assertEqual(before.data["status"], "available")
        self.client.force_authenticate(self.admin)
        approved = self.client.post(f"/api/v1/admin/time-off/{requested.data['id']}/approve/", {"review_notes": "تأیید مدیر"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.client.force_authenticate(None)
        after = self.client.get("/api/v1/availability/", {"date": self.leave_date.isoformat(), "items": self.items})
        self.assertEqual(after.data["status"], "unavailable")
        self.assertTrue(Notification.objects.filter(recipient=self.employee_user, type="leave_reviewed").exists())

    def test_employee_can_withdraw_only_a_pending_request(self):
        requested = self.request_leave()
        withdrawn = self.client.delete(f"/api/v1/employee/time-off/{requested.data['id']}/")
        self.assertEqual(withdrawn.status_code, 200)
        self.assertEqual(withdrawn.data["status"], "withdrawn")
        self.assertTrue(TimeOff.objects.filter(pk=requested.data["id"], status="withdrawn").exists())

    def test_admin_cannot_approve_leave_over_active_appointments(self):
        requested = self.request_leave()
        customer_user = User.objects.create_user(username="leave-customer", role="customer")
        appointment = Appointment.objects.create(customer=CustomerProfile.objects.create(user=customer_user), status="confirmed")
        AppointmentItem.objects.create(appointment=appointment, service=self.service, employee=self.employee, date=self.leave_date, start_time=time(10), end_time=time(11))
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/time-off/{requested.data['id']}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "appointment_conflict")
