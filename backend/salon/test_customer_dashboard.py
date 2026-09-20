from datetime import date, time, timedelta

from django.test import TestCase, override_settings
from django.core.cache import cache
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
    WorkingSchedule,
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

    def tearDown(self):
        cache.clear()
        super().tearDown()

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

    def test_customer_registration_login_and_logout_lifecycle(self):
        self.client.force_authenticate(None)
        payload = {
            "first_name": "مریم",
            "last_name": "احمدی",
            "phone": "+989351234567",
            "email": "maryam@example.com",
            "password": "R8!vQ2#zK7mP",
            "password_confirm": "R8!vQ2#zK7mP",
            "accept_terms": True,
        }
        registered = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(registered.status_code, 201)
        self.assertEqual(registered.data["role"], "customer")
        self.assertIn("baharnaj_refresh", registered.cookies)
        user = User.objects.get(username="09351234567")
        self.assertTrue(hasattr(user, "customer_profile"))
        duplicate = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(duplicate.status_code, 400)
        logged_in = self.client.post("/api/v1/auth/token/", {"username": "00989351234567", "password": payload["password"]}, format="json")
        self.assertEqual(logged_in.status_code, 200)
        logged_out = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(logged_out.status_code, 204)
        self.assertEqual(logged_out.cookies["baharnaj_refresh"]["max-age"], 0)

    def test_login_skips_older_guest_record_with_same_phone(self):
        phone = "09127776655"
        User.objects.create_user(username="guest_old", phone=phone, role="customer")
        User.objects.create_user(username=phone, phone=phone, password="Strong-login-8472", role="customer")
        self.client.force_authenticate(None)
        response = self.client.post("/api/v1/auth/token/", {"username": phone, "password": "Strong-login-8472"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_customer_can_change_password(self):
        response = self.client.post("/api/v1/customer/password/", {
            "current_password": "password123",
            "new_password": "New-strong-pass-8472",
            "new_password_confirm": "New-strong-pass-8472",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.check_password("New-strong-pass-8472"))

    @override_settings(CUSTOMER_APPOINTMENT_POLICY_CONFIGURED=True)
    def test_guest_lookup_and_cancellation_use_the_same_endpoint(self):
        self.client.force_authenticate(None)
        credentials = {"phone": self.customer_user.phone, "confirmation_code": self.appointment.confirmation_code}
        lookup = self.client.post("/api/v1/customer/booking/", credentials, format="json")
        self.assertEqual(lookup.status_code, 200)
        self.assertTrue(lookup.data["customer_capabilities"]["can_cancel"])
        cancelled = self.client.patch("/api/v1/customer/booking/", {**credentials, "cancel": True}, format="json")
        self.assertEqual(cancelled.status_code, 200)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, "cancelled")


class BookingAccountCreationTests(TestCase):
    def setUp(self):
        category = ServiceCategory.objects.create(name="Account booking")
        self.service = Service.objects.create(category=category, name="account-cut", persian_name="کوتاهی", price=500, duration=60)
        employee_user = User.objects.create_user(username="account-employee", role="employee")
        self.employee = EmployeeProfile.objects.create(user=employee_user, is_active=True)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        self.booking_date = date.today() + timedelta(days=14)
        WorkingSchedule.objects.create(employee=self.employee, weekday=self.booking_date.weekday(), start_time=time(9), end_time=time(17), is_active=True)
        self.client = APIClient()

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def test_booking_can_create_and_sign_into_a_validated_customer_account(self):
        item = {"service": self.service.pk, "employee": self.employee.pk, "date": self.booking_date.isoformat(), "start_time": "10:00", "end_time": "11:00"}
        hold = self.client.post("/api/v1/booking-holds/", {"items": [item]}, format="json")
        self.assertEqual(hold.status_code, 201)
        response = self.client.post("/api/v1/appointments/", {
            "customer_name": "سارا رضایی",
            "customer_phone": "+989121112233",
            "hold_token": hold.data["token"],
            "items": [item],
            "create_account": True,
            "account_email": "sara@example.com",
            "account_password": "Secure-booking-8472",
            "account_password_confirm": "Secure-booking-8472",
            "account_accept_terms": True,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["account_created"])
        self.assertEqual(response.data["role"], "customer")
        self.assertIn("baharnaj_refresh", response.cookies)
        account = User.objects.get(username="09121112233")
        self.assertEqual(account.email, "sara@example.com")
        self.assertTrue(account.check_password("Secure-booking-8472"))
        self.assertTrue(account.customer_profile.appointments.filter(pk=response.data["id"]).exists())

    def test_logged_in_customer_booking_accepts_hidden_account_fields_as_blank(self):
        customer_user = User.objects.create_user(username="logged-in-customer", phone="09123334455", password="Existing-pass-8472", role="customer")
        CustomerProfile.objects.create(user=customer_user)
        self.client.force_authenticate(customer_user)
        item = {"service": self.service.pk, "employee": self.employee.pk, "date": self.booking_date.isoformat(), "start_time": "10:00", "end_time": "11:00"}
        hold = self.client.post("/api/v1/booking-holds/", {"items": [item]}, format="json")
        self.assertEqual(hold.status_code, 201)
        response = self.client.post("/api/v1/appointments/", {
            "customer_name": "",
            "customer_phone": "",
            "hold_token": hold.data["token"],
            "items": [item],
            "create_account": False,
            "account_email": "",
            "account_password": "",
            "account_password_confirm": "",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.customer.user, customer_user)
