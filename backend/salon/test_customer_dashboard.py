from datetime import date, time

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import (
    Appointment,
    AppointmentItem,
    CustomerAccountDeletionRequest,
    CustomerCommunicationPreference,
    CustomerProfile,
    EmployeeProfile,
    EmployeeService,
    Notification,
    Service,
    ServiceCategory,
    User,
)


class CustomerDashboardTests(TestCase):
    def setUp(self):
        self.customer_user = User.objects.create_user(username="customer-one", password="password123", role="customer", first_name="سارا", phone="09121234567")
        self.customer = CustomerProfile.objects.create(user=self.customer_user)
        other_user = User.objects.create_user(username="customer-two", password="password123", role="customer", phone="09129876543")
        self.other = CustomerProfile.objects.create(user=other_user)
        employee_user = User.objects.create_user(username="employee-dashboard", role="employee", first_name="مینا")
        self.employee = EmployeeProfile.objects.create(user=employee_user, is_active=True)
        category = ServiceCategory.objects.create(name="Dashboard")
        self.service = Service.objects.create(category=category, name="Consultation", persian_name="مشاوره", pricing_type="CONSULTATION", price=500, duration=60)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        self.appointment = Appointment.objects.create(customer=self.customer, status="confirmed")
        AppointmentItem.objects.create(appointment=self.appointment, service=self.service, employee=self.employee, date=date(2099, 1, 5), start_time=time(10), end_time=time(11))
        self.client = APIClient()
        self.client.force_authenticate(self.customer_user)

    def test_customer_only_ownership_and_safe_price(self):
        own = self.client.get(f"/api/v1/customer/appointments/{self.appointment.pk}/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.data["price"]["status"], "unresolved")
        self.assertIsNone(own.data["price"]["amount"])
        other_appointment = Appointment.objects.create(customer=self.other)
        denied = self.client.get(f"/api/v1/customer/appointments/{other_appointment.pk}/")
        self.assertEqual(denied.status_code, 404)

    def test_dashboard_profile_preferences_and_notifications(self):
        profile = self.client.get("/api/v1/customer/profile/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["phone"], "09121234567")
        self.assertEqual(self.client.patch("/api/v1/customer/profile/", {"neighborhood": "یوسف‌آباد", "service_preferences": "زمان صبح"}, format="json").status_code, 200)
        preferences = self.client.get("/api/v1/customer/preferences/")
        self.assertEqual(preferences.status_code, 200)
        self.assertFalse(preferences.data["promotional_messages"])
        notification = Notification.objects.create(recipient=self.customer_user, type="appointment_updated", title="به‌روزرسانی", message="نوبت شما به‌روزرسانی شد.")
        listed = self.client.get("/api/v1/customer/notifications/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]["id"], notification.pk)
        self.assertEqual(self.client.post(f"/api/v1/customer/notifications/{notification.pk}/read/").status_code, 200)

    @override_settings(CUSTOMER_APPOINTMENT_POLICY_CONFIGURED=False)
    def test_mutation_requires_configured_policy_and_idempotency_key(self):
        missing_key = self.client.post(f"/api/v1/customer/appointments/{self.appointment.pk}/cancel/", {})
        self.assertEqual(missing_key.status_code, 400)
        first = self.client.post(f"/api/v1/customer/appointments/{self.appointment.pk}/cancel/", {"idempotency_key": "cancel-1"})
        self.assertEqual(first.status_code, 409)
        repeat = self.client.post(f"/api/v1/customer/appointments/{self.appointment.pk}/cancel/", {"idempotency_key": "cancel-1"})
        self.assertEqual(repeat.status_code, 409)
        self.assertEqual(self.appointment.refresh_from_db(), None)
        self.assertEqual(self.appointment.status, "confirmed")

    def test_deletion_request_is_auditable_and_does_not_delete_appointments(self):
        self.assertEqual(self.client.post("/api/v1/customer/account/deletion-request/", {}).status_code, 400)
        response = self.client.post("/api/v1/customer/account/deletion-request/", {"confirm": True, "password": "password123", "reason": "دیگر استفاده نمی‌کنم"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(CustomerAccountDeletionRequest.objects.filter(customer=self.customer, status="pending").exists())
        self.assertTrue(Appointment.objects.filter(pk=self.appointment.pk).exists())
        self.assertEqual(self.client.post("/api/v1/customer/account/deletion-request/", {"confirm": True, "password": "password123"}, format="json").status_code, 200)

    def test_non_customer_cannot_use_customer_api(self):
        employee = User.objects.create_user(username="employee-only", password="password123", role="employee")
        self.client.force_authenticate(employee)
        self.assertEqual(self.client.get("/api/v1/customer/dashboard/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/customer/dashboard/").status_code, 401)

    def test_phone_login_accepts_iranian_forms(self):
        for phone in ("+989121234567", "00989121234567"):
            response = self.client.post("/api/v1/auth/token/", {"username": phone, "password": "password123"}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["role"], "customer")
