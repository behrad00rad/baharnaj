import json
import base64
import hashlib
import hmac
import struct
import tempfile
from datetime import date, time, timedelta
from unittest.mock import patch
from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Appointment, AppointmentItem, CustomerProfile, EmployeeCommission, EmployeeProfile, EmployeeService, GalleryAsset, GalleryCategory, Payment, Refund, Service, ServiceCategory, ServiceImage, TimeOff, Transaction, User, WorkingSchedule


@override_settings(SITE_URL="https://baharnaj.ir")
class SeoEndpointTests(TestCase):
    def setUp(self):
        category = ServiceCategory.objects.create(name="Nails")
        self.service = Service.objects.create(
            category=category,
            name="nail-extension",
            persian_name="اکستنشن ناخن",
            price=800,
            duration=60,
        )

    def test_service_slug_is_stable_and_public_sitemap_uses_it(self):
        original_slug = self.service.slug
        self.service.persian_name = "اکستنشن ناخن ژل"
        self.service.save()
        self.service.refresh_from_db()
        self.assertEqual(self.service.slug, original_slug)

        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertEqual(sitemap["Content-Type"], "application/xml; charset=utf-8")
        self.assertIn(f"https://baharnaj.ir/services/{original_slug}", sitemap.content.decode())

    def test_robots_advertises_production_sitemap_and_excludes_private_areas(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()
        self.assertEqual(response.status_code, 200)
        self.assertIn("Sitemap: https://baharnaj.ir/sitemap.xml", content)
        self.assertIn("Disallow: /admin/", content)
        self.assertIn("Disallow: /employee/", content)


class FinalTouchesTests(TestCase):
    def setUp(self):
        self.category = ServiceCategory.objects.create(name="Nail")
        self.service = Service.objects.create(category=self.category, name="manicure", persian_name="مانیکور", short_description="معرفی واقعی سرویس", description="متن کامل سرویس", price=1000, duration=60)
        employee_user = User.objects.create_user(username="specialist", first_name="سارا", role="employee")
        self.employee = EmployeeProfile.objects.create(user=employee_user, specialty="ناخن", bio="معرفی عمومی متخصص", commission_rate=20, is_active=True)
        EmployeeService.objects.create(employee=self.employee, service=self.service)
        customer_user = User.objects.create_user(username="customer-final", first_name="مشتری")
        customer = CustomerProfile.objects.create(user=customer_user)
        self.appointment = Appointment.objects.create(customer=customer, status="confirmed")
        self.item = AppointmentItem.objects.create(appointment=self.appointment, service=self.service, employee=self.employee, date=timezone.localdate(), start_time="10:00", end_time="11:00")

    def test_service_article_and_public_bio_come_from_backend(self):
        ServiceImage.objects.create(service=self.service, image_url="https://cdn.example.test/manicure.jpg", alt_text="نمونه مانیکور", is_active=True)
        detail = self.client.get(f"/api/v1/services/{self.service.slug}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["short_description"], "معرفی واقعی سرویس")
        self.assertEqual(detail.data["images"][0]["alt_text"], "نمونه مانیکور")
        employees = self.client.get("/api/v1/employees/")
        self.assertEqual(employees.data[0]["bio"], "معرفی عمومی متخصص")
        self.assertEqual(employees.data[0]["services"][0]["slug"], self.service.slug)

    def test_admin_cannot_delete_service_category_that_is_in_use(self):
        admin = User.objects.create_user(username="category-admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.delete(
            f"/api/v1/admin/service-categories/{self.category.pk}/", secure=True
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(ServiceCategory.objects.filter(pk=self.category.pk).exists())
        self.assertIn("سرویس", response.data["detail"])

    def test_admin_can_update_employee_name_and_phone(self):
        admin = User.objects.create_user(username="employee-editor", role="admin")
        employee_user = User.objects.create_user(
            username="employee-contact", first_name="نام قبلی", phone="09110000000", role="employee"
        )
        employee = EmployeeProfile.objects.create(user=employee_user, specialty="ناخن")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.patch(
            f"/api/v1/admin/employees/{employee.pk}/",
            {"user": employee_user.pk, "name": "نام جدید", "phone": "09112223344"},
            format="multipart",
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        employee_user.refresh_from_db()
        self.assertEqual(employee_user.first_name, "نام جدید")
        self.assertEqual(employee_user.phone, "09112223344")
        self.assertEqual(response.data["name"], "نام جدید")
        self.assertEqual(response.data["phone"], "09112223344")

    def test_admin_can_change_only_own_account_credentials(self):
        admin = User.objects.create_user(username="secure-admin", password="old-admin-password", role="admin")
        client = APIClient()
        client.force_authenticate(admin)

        account = client.get("/api/v1/admin/account/", secure=True)
        renamed = client.patch("/api/v1/admin/account/", {"username": "updated-admin", "current_password": "old-admin-password"}, format="json", secure=True)
        changed_password = client.post("/api/v1/admin/account/password/", {"current_password": "old-admin-password", "new_password": "new-admin-password", "new_password_confirm": "new-admin-password"}, format="json", secure=True)

        self.assertEqual(account.status_code, 200)
        self.assertEqual(account.data["username"], "secure-admin")
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(changed_password.status_code, 200)
        admin.refresh_from_db()
        self.assertEqual(admin.username, "updated-admin")
        self.assertTrue(admin.check_password("new-admin-password"))

    def test_pending_reports_reduce_partial_reportable_balance(self):
        client = APIClient()
        client.force_authenticate(self.employee.user)
        endpoint = f"/api/v1/employee/appointments/{self.appointment.pk}/payments/"
        first = client.post(endpoint, {"amount": 400, "payment_method": "cash"}, format="json")
        self.assertEqual(first.status_code, 201)
        summary = client.get(endpoint)
        self.assertEqual(summary.data["pending_total"], 400)
        self.assertEqual(summary.data["reportable_total"], 600)
        self.assertEqual(client.post(endpoint, {"amount": 700, "payment_method": "cash"}, format="json").status_code, 400)
        self.assertEqual(client.post(endpoint, {"amount": 600, "payment_method": "card"}, format="json").status_code, 201)
        self.assertEqual(client.post(endpoint, {"amount": 1, "payment_method": "cash"}, format="json").status_code, 400)

    def test_employee_cancellation_actor_reason_and_time_reach_admin(self):
        client = APIClient()
        client.force_authenticate(self.employee.user)
        response = client.post(f"/api/v1/employee/appointment-items/{self.item.pk}/action/", {"status": "cancel", "reason": "عدم امکان حضور"}, format="json")
        self.assertEqual(response.status_code, 200)
        admin = User.objects.create_user(username="admin-final", role="admin")
        client.force_authenticate(admin)
        detail = client.get(f"/api/v1/admin/appointments/{self.appointment.pk}/")
        cancellation = detail.data["status_history"][-1]
        self.assertEqual(cancellation["reason"], "عدم امکان حضور")
        self.assertEqual(cancellation["changed_by_name"], "سارا")
        self.assertEqual(cancellation["changed_by_role"], "employee")
        self.assertTrue(cancellation["changed_at"])

    def test_finance_overview_uses_existing_payment_refund_and_commission_records(self):
        self.item.set_completion_status("completed", changed_by=self.employee.user)
        payment = Payment.objects.create(appointment=self.appointment, amount=1000, status="paid", payment_method="card", paid_at=timezone.now(), created_by=self.employee.user, updated_by=self.employee.user)
        refund = Refund.objects.create(payment=payment, amount=100, reason="اصلاح پرداخت", created_by=self.employee.user, updated_by=self.employee.user)
        refund.complete(changed_by=self.employee.user)
        admin = User.objects.create_user(username="finance-admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)
        current = timezone.localdate().isoformat()
        response = client.get("/api/v1/admin/revenue/", {"period": "custom", "start_date": current, "end_date": current, "employee": self.employee.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["received"], 1000)
        self.assertEqual(response.data["refunded"], 100)
        self.assertEqual(response.data["net_revenue"], 900)
        self.assertEqual(response.data["service_revenue"], 1000)
        self.assertEqual(response.data["commission_total"], 200)


class FinanceAnalyticsTests(TestCase):
    def setUp(self):
        category = ServiceCategory.objects.create(name="زیبایی")
        nails = Service.objects.create(category=category, name="nails", persian_name="ناخن", price=600, duration=60)
        makeup = Service.objects.create(category=category, name="makeup", persian_name="میکاپ", price=400, duration=60)
        first_user = User.objects.create_user(username="finance-one", first_name="سارا", role="employee")
        second_user = User.objects.create_user(username="finance-two", first_name="مینا", role="employee")
        self.first = EmployeeProfile.objects.create(user=first_user, specialty="ناخن", commission_rate=10, is_active=True)
        self.second = EmployeeProfile.objects.create(user=second_user, specialty="میکاپ", commission_rate=10, is_active=True)
        customer_user = User.objects.create_user(username="finance-customer", first_name="مشتری")
        customer = CustomerProfile.objects.create(user=customer_user)
        self.appointment = Appointment.objects.create(customer=customer, status="confirmed")
        self.first_item = AppointmentItem.objects.create(appointment=self.appointment, service=nails, employee=self.first, date=timezone.localdate(), start_time="10:00", end_time="11:00")
        self.second_item = AppointmentItem.objects.create(appointment=self.appointment, service=makeup, employee=self.second, date=timezone.localdate(), start_time="11:00", end_time="12:00")
        self.first_item.set_completion_status("completed", changed_by=first_user)
        self.second_item.set_completion_status("completed", changed_by=second_user)
        self.payment = Payment.objects.create(appointment=self.appointment, amount=500, status="paid", payment_method="card", paid_at=timezone.now(), created_by=first_user, updated_by=first_user)
        Transaction.objects.create(type="payment", amount=500, appointment=self.appointment, payment=self.payment, created_by=first_user, updated_by=first_user)
        refund = Refund.objects.create(payment=self.payment, amount=100, reason="اصلاح", created_by=first_user, updated_by=first_user)
        refund.complete(changed_by=first_user)
        Payment.objects.create(appointment=self.appointment, amount=100, status="pending", payment_method="cash", created_by=first_user, updated_by=first_user)
        self.admin = User.objects.create_user(username="finance-owner", role="admin")
        self.current = timezone.localdate().isoformat()

    def test_admin_grouping_metrics_and_paid_service_shares(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        expected_dates = {
            "daily": timezone.localdate().isoformat(),
            "weekly": (timezone.localdate() - timedelta(days=timezone.localdate().weekday())).isoformat(),
            "monthly": timezone.localdate().replace(day=1).isoformat(),
        }
        for grouping in ("daily", "weekly", "monthly"):
            response = client.get("/api/v1/admin/revenue/", {"period": "custom", "start_date": self.current, "end_date": self.current, "group_by": grouping})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["series"][0]["revenue"], 400)
            self.assertEqual(response.data["series"][0]["payments"], 1)
            self.assertEqual(response.data["series"][0]["appointments"], 1)
            self.assertEqual(response.data["series"][0]["commission"], 100)
            self.assertEqual(response.data["series"][0]["average_payment"], 500)
            self.assertEqual(response.data["series"][0]["date"], expected_dates[grouping])
        self.assertEqual(response.data["services"][0]["name"], "ناخن")
        self.assertEqual(response.data["services"][0]["revenue"], 300)
        self.assertEqual(response.data["services"][0]["share"], 60.0)
        self.assertEqual(client.get("/api/v1/admin/revenue/", {"period": "custom", "start_date": self.current, "end_date": self.current, "group_by": "yearly"}).status_code, 400)

    def test_admin_employee_detail_uses_allocated_confirmed_money(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.get(f"/api/v1/admin/employees/{self.first.pk}/finance/", {"period": "custom", "start_date": self.current, "end_date": self.current, "group_by": "daily"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["employee"]["name"], "سارا")
        self.assertEqual(response.data["received"], 300)
        self.assertEqual(response.data["refunded"], 60)
        self.assertEqual(response.data["net_revenue"], 240)
        self.assertEqual(response.data["commission_total"], 60)
        self.assertEqual(response.data["pending_reports"], 60)
        self.assertEqual(response.data["payments_count"], 1)
        self.assertEqual(response.data["services"][0]["name"], "ناخن")
        self.assertTrue(response.data["transactions"])
        self.assertTrue(response.data["appointments"])
        self.assertTrue(response.data["services_performed"])

    def test_employee_report_is_self_only_and_admin_detail_is_forbidden(self):
        client = APIClient()
        client.force_authenticate(self.first.user)
        response = client.get("/api/v1/employee/earnings/", {"period": "custom", "start_date": self.current, "end_date": self.current, "group_by": "weekly", "employee": self.second.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["employee"]["id"], self.first.pk)
        self.assertEqual(response.data["received"], 300)
        self.assertEqual(response.data["services"][0]["name"], "ناخن")
        self.assertNotContains(response, "میکاپ")
        self.assertEqual(client.get(f"/api/v1/admin/employees/{self.second.pk}/finance/", {"period": "day"}).status_code, 403)
        customer = User.objects.create_user(username="finance-outsider", role="customer")
        client.force_authenticate(customer)
        self.assertEqual(client.get("/api/v1/employee/earnings/", {"period": "day"}).status_code, 403)
        self.assertEqual(client.get("/api/v1/admin/revenue/", {"period": "day"}).status_code, 403)


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

    def test_admin_totp_requires_a_second_factor_and_accepts_recovery_code(self):
        user = User.objects.create_user(username="totp-admin", password="correct-password", role="admin")
        client = APIClient()
        client.force_authenticate(user)
        setup = client.post("/api/v1/admin/account/two-factor/setup/", {"current_password": "correct-password"}, format="json", secure=True)
        self.assertEqual(setup.status_code, 200)
        secret = setup.data["manual_key"]
        counter = int(timezone.now().timestamp() // 30)
        digest = hmac.new(base64.b32decode(secret + "=" * (-len(secret) % 8)), struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = digest[-1] & 15
        code = str(((digest[offset] & 127) << 24 | digest[offset + 1] << 16 | digest[offset + 2] << 8 | digest[offset + 3]) % 1_000_000).zfill(6)
        confirmed = client.post("/api/v1/admin/account/two-factor/confirm/", {"code": code}, format="json", secure=True)
        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.data["enabled"])
        recovery_code = confirmed.data["recovery_codes"][0]

        login = self.client.post("/api/v1/auth/token/", {"username": user.username, "password": "correct-password"}, secure=True)
        self.assertEqual(login.status_code, 202)
        self.assertTrue(login.data["two_factor_required"])
        verified = self.client.post("/api/v1/auth/token/verify-2fa/", {"two_factor_token": login.data["two_factor_token"], "code": recovery_code}, secure=True)
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.data["role"], "admin")
        self.assertTrue(verified.cookies["baharnaj_refresh"]["httponly"])

    def test_refresh_with_deleted_user_clears_stale_cookie(self):
        user = User.objects.create_user(username="deleted-user", password="correct-password")
        login = self.client.post("/api/v1/auth/token/", {"username": user.username, "password": "correct-password"})
        self.assertEqual(login.status_code, 200)
        user.delete()

        response = self.client.post("/api/v1/auth/token/refresh/")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies[settings.REFRESH_COOKIE_NAME]["max-age"], 0)

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
        TimeOff.objects.create(employee=self.employee, start_date=date(2026, 8, 29), end_date=date(2026, 8, 29), status="approved")
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

    def test_employee_appointments_can_be_filtered_by_selected_date(self):
        other_appointment = Appointment.objects.create(customer=self.customer_profile)
        AppointmentItem.objects.create(appointment=self.appointment, service=self.service, employee=self.employee, date=date(2026, 8, 30), start_time="09:00", end_time="10:00")
        AppointmentItem.objects.create(appointment=other_appointment, service=self.service, employee=self.employee, date=date(2026, 8, 31), start_time="09:00", end_time="10:00")
        client = APIClient()
        client.force_authenticate(self.employee.user)

        first_day = client.get("/api/v1/employee/appointments/?date=2026-08-30")
        second_day = client.get("/api/v1/employee/appointments/?date=2026-08-31")

        self.assertEqual([item["id"] for item in first_day.data], [self.appointment.pk])
        self.assertEqual([item["id"] for item in second_day.data], [other_appointment.pk])
        range_response = client.get("/api/v1/employee/appointments/?start=2026-08-30&end=2026-08-31")
        self.assertEqual({item["id"] for item in range_response.data}, {self.appointment.pk, other_appointment.pk})

    def test_employee_statistics_returns_the_selected_next_appointment_item(self):
        earlier_item = AppointmentItem.objects.create(
            appointment=self.appointment, service=self.service, employee=self.employee,
            date=date(2026, 8, 29), start_time="09:00", end_time="10:00",
        )
        next_item = AppointmentItem.objects.create(
            appointment=self.appointment, service=self.service, employee=self.employee,
            date=date(2026, 8, 29), start_time="14:00", end_time="15:00",
        )
        client = APIClient()
        client.force_authenticate(self.employee.user)

        with patch("salon.views.timezone.localdate", return_value=date(2026, 8, 29)), patch("salon.views.timezone.localtime", return_value=timezone.make_aware(timezone.datetime(2026, 8, 29, 12, 0))):
            response = client.get("/api/v1/employee/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["next_appointment"]["id"], self.appointment.pk)
        self.assertEqual(response.data["next_appointment_item"]["id"], next_item.pk)
        self.assertNotEqual(response.data["next_appointment_item"]["id"], earlier_item.pk)

    def test_employee_statistics_returns_next_appointment_on_a_future_date(self):
        next_item = AppointmentItem.objects.create(
            appointment=self.appointment, service=self.service, employee=self.employee,
            date=date(2026, 8, 30), start_time="09:00", end_time="10:00",
        )
        client = APIClient()
        client.force_authenticate(self.employee.user)

        with patch("salon.views.timezone.localdate", return_value=date(2026, 8, 29)), patch("salon.views.timezone.localtime", return_value=timezone.make_aware(timezone.datetime(2026, 8, 29, 18, 0))):
            response = client.get("/api/v1/employee/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["next_appointment"]["id"], self.appointment.pk)
        self.assertEqual(response.data["next_appointment_item"]["id"], next_item.pk)

    def test_employee_cannot_complete_another_employees_item(self):
        other_user = User.objects.create_user(username="other-completion", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user)
        other_item = AppointmentItem.objects.create(
            appointment=self.appointment,
            service=self.service,
            employee=other_employee,
            date=date(2026, 8, 29),
            start_time="09:00",
            end_time="10:00",
        )
        client = APIClient()
        client.force_authenticate(self.employee.user)

        response = client.post(f"/api/v1/employee/appointment-items/{other_item.pk}/action/", {"status": "complete"}, format="json")

        self.assertEqual(response.status_code, 404)
        other_item.refresh_from_db()
        self.assertEqual(other_item.completion_status, "pending")

    def test_employee_schedule_is_scoped_and_validated(self):
        other_user = User.objects.create_user(username="schedule-other", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user)
        other_schedule = WorkingSchedule.objects.create(employee=other_employee, weekday=1, start_time="09:00", end_time="17:00")
        client = APIClient()
        client.force_authenticate(self.employee.user)

        response = client.post("/api/v1/employee/schedule/", {"employee": other_employee.pk, "weekday": 1, "start_time": "09:00", "end_time": "17:00", "is_active": True})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["employee"], self.employee.pk)
        own_schedule = response.data["id"]
        schedule_data = client.get("/api/v1/employee/schedule/").data
        schedules = schedule_data["results"] if "results" in schedule_data else schedule_data
        self.assertEqual(schedules[0]["employee"], self.employee.pk)
        self.assertEqual(client.patch(f"/api/v1/employee/schedule/{own_schedule}/", {"is_active": False}).status_code, 200)
        self.assertEqual(client.get(f"/api/v1/employee/schedule/{other_schedule.pk}/").status_code, 404)

        duplicate = client.post("/api/v1/employee/schedule/", {"weekday": 1, "start_time": "10:00", "end_time": "18:00", "is_active": True})
        self.assertEqual(duplicate.status_code, 400)
        invalid_range = client.post("/api/v1/employee/schedule/", {"weekday": 2, "start_time": "18:00", "end_time": "09:00", "is_active": True})
        self.assertEqual(invalid_range.status_code, 400)
        self.assertEqual(client.delete(f"/api/v1/employee/schedule/{own_schedule}/").status_code, 204)

    def test_admin_can_filter_working_schedules_by_employee(self):
        admin = User.objects.create_user(username="schedule-admin", role="admin")
        other_user = User.objects.create_user(username="other-schedule", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user)
        own_schedule = WorkingSchedule.objects.create(employee=self.employee, weekday=0, start_time="09:00", end_time="17:00")
        WorkingSchedule.objects.create(employee=other_employee, weekday=0, start_time="10:00", end_time="18:00")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.get(f"/api/v1/admin/working-schedules/?employee={self.employee.pk}")
        schedules = response.data["results"] if "results" in response.data else response.data

        self.assertEqual(response.status_code, 200)
        self.assertEqual([schedule["id"] for schedule in schedules], [own_schedule.pk])

    def test_employee_profile_does_not_expose_or_update_admin_specialty(self):
        self.employee.specialty = "Hair color"
        self.employee.save()
        client = APIClient()
        client.force_authenticate(self.employee.user)

        response = client.patch("/api/v1/employee/profile/", {"specialty": "Cutting", "bio": "Updated profile"})

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("specialty", response.data)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.specialty, "Hair color")
        self.assertEqual(self.employee.bio, "Updated profile")

    def test_employee_profile_accepts_multipart_photo(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import RequestFactory
        from django.views.static import serve
        client = APIClient()
        client.force_authenticate(self.employee.user)
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = client.patch(
                "/api/v1/employee/profile/",
                {"profile_photo": SimpleUploadedFile("profile.png", png, content_type="image/png")},
                format="multipart",
            )

            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data["profile_photo_url"].startswith("http://testserver/media/profiles/"))
            image_path = urlsplit(response.data["profile_photo_url"]).path.removeprefix(settings.MEDIA_URL)
            image_response = serve(RequestFactory().get(response.data["profile_photo_url"]), image_path, document_root=media_root)
            self.assertEqual(image_response.status_code, 200)
            self.assertEqual(image_response["Content-Type"], "image/png")

        self.employee.refresh_from_db()
        self.assertTrue(self.employee.profile_photo.name.startswith("profiles/"))

    def test_gallery_upload_returns_public_backend_and_retrievable_media(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import RequestFactory
        from django.views.static import serve
        admin = User.objects.create_user(username="media-admin", role="admin")
        category = GalleryCategory.objects.create(name="مو")
        other_category = GalleryCategory.objects.create(name="ناخن")
        client = APIClient()
        client.force_authenticate(admin)
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")

        with tempfile.TemporaryDirectory() as media_root, override_settings(
            MEDIA_ROOT=media_root,
            PUBLIC_BACKEND_URL="https://your-backend-domain.example.com",
        ):
            created = client.post(
                "/api/v1/admin/gallery/",
                {"title": "New upload", "category": category.pk, "image": SimpleUploadedFile("gallery.png", png, content_type="image/png")},
                format="multipart",
            )
            self.assertEqual(created.status_code, 201)
            self.assertTrue(created.data["image_url"].startswith("https://your-backend-domain.example.com/media/gallery/"))
            updated = client.patch(f"/api/v1/admin/gallery/{created.data['id']}/", {"category": other_category.pk}, format="json")
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.data["category_name"], "ناخن")

            public_item = client.get("/api/v1/gallery/").data[0]
            self.assertEqual(public_item["category"], "ناخن")
            image_path = urlsplit(public_item["image_url"]).path.removeprefix(settings.MEDIA_URL)
            image_response = serve(RequestFactory().get(public_item["image_url"]), image_path, document_root=media_root)
            self.assertEqual(image_response.status_code, 200)
            self.assertEqual(image_response["Content-Type"], "image/png")

    def test_gallery_preserves_existing_absolute_image_url(self):
        category = GalleryCategory.objects.create(name="میکاپ")
        GalleryAsset.objects.create(title="External", category=category, image_url="https://cdn.example.com/gallery.jpg")
        response = APIClient().get("/api/v1/gallery/")
        self.assertEqual(response.data[0]["image_url"], "https://cdn.example.com/gallery.jpg")

    def test_gallery_categories_are_unique_and_admin_managed(self):
        admin = User.objects.create_user(username="gallery-admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)

        created = client.post("/api/v1/admin/gallery-categories/", {"name": "  ناخن  ", "display_order": 2})
        duplicate = client.post("/api/v1/admin/gallery-categories/", {"name": "ناخن"})
        public = APIClient().get("/api/v1/gallery/categories/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["name"], "ناخن")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(public.data[0]["name"], "ناخن")

    def test_admin_can_delete_gallery_category_without_deleting_assets(self):
        admin = User.objects.create_user(username="gallery-delete-admin", role="admin")
        category = GalleryCategory.objects.create(name="رنگ مو")
        asset = GalleryAsset.objects.create(title="نمونه", category=category, image_url="https://cdn.example.test/example.jpg")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.delete(f"/api/v1/admin/gallery-categories/{category.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(GalleryCategory.objects.filter(pk=category.pk).exists())
        asset.refresh_from_db()
        self.assertIsNone(asset.category)

    def test_employee_can_change_only_own_password(self):
        self.employee.user.set_password("old-password-8472")
        self.employee.user.save()
        client = APIClient()
        client.force_authenticate(self.employee.user)

        wrong = client.post("/api/v1/employee/password/", {"current_password": "wrong", "new_password": "new-password-8472", "new_password_confirm": "new-password-8472"})
        self.assertEqual(wrong.status_code, 400)
        changed = client.post("/api/v1/employee/password/", {"current_password": "old-password-8472", "new_password": "new-password-8472", "new_password_confirm": "new-password-8472"})

        self.assertEqual(changed.status_code, 200)
        self.employee.user.refresh_from_db()
        self.assertFalse(self.employee.user.check_password("old-password-8472"))
        self.assertTrue(self.employee.user.check_password("new-password-8472"))

    def test_admin_employee_creation_contract(self):
        admin = User.objects.create_user(username="admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)
        new_employee = client.post("/api/v1/admin/employees/", {"username": "new-stylist", "password": "safe-password", "name": "New Stylist", "phone": "09121234567", "commission_rate": "15.50", "is_active": True, "services": [self.service.pk]}, format="json")
        self.assertEqual(new_employee.status_code, 201)
        self.assertEqual(new_employee.data["commission_rate"], "15.50")
        self.assertEqual(new_employee.data["service_ids"], [self.service.pk])
        self.assertEqual(User.objects.get(username="new-stylist").role, "employee")
        login = self.client.post("/api/v1/auth/token/", {"username": "new-stylist", "password": "safe-password"})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["role"], "employee")

        existing_user = User.objects.create_user(username="eligible", role="employee")
        existing_employee = client.post("/api/v1/admin/employees/", {"user": existing_user.pk, "name": "Existing Stylist", "commission_rate": "20.00"}, format="json")
        self.assertEqual(existing_employee.status_code, 201)
        self.assertEqual(existing_employee.data["user"], existing_user.pk)
        self.assertEqual(client.patch(f"/api/v1/admin/employees/{existing_employee.data['id']}/", {"services": [self.service.pk]}, format="json").data["service_ids"], [self.service.pk])
        self.assertIn(existing_employee.data["id"], [employee["id"] for employee in client.get(f"/api/v1/employees/?service={self.service.pk}").data])

        for role in ("customer", "admin"):
            ineligible_user = User.objects.create_user(username=f"{role}-user", role=role)
            response = client.post("/api/v1/admin/employees/", {"user": ineligible_user.pk}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("user", response.data)
        duplicate = client.post("/api/v1/admin/employees/", {"username": "new-stylist", "password": "safe-password"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("username", duplicate.data)

    def test_admin_appointments_filter_create_and_revenue(self):
        admin = User.objects.create_user(username="calendar-admin", role="admin")
        booking_date = timezone.localdate() + timedelta(days=7)
        WorkingSchedule.objects.create(employee=self.employee, weekday=booking_date.weekday(), start_time="09:00", end_time="20:00")
        client = APIClient()
        client.force_authenticate(admin)
        response = client.post("/api/v1/admin/appointments/", {"customer": self.customer_profile.pk, "status": "confirmed", "notes": "admin booking", "items": [{"service": self.service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "10:00", "end_time": "11:00"}]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["items"][0]["service"], self.service.pk)
        self.assertEqual(response.data["status"], "confirmed")
        appointments = client.get(f"/api/v1/admin/appointments/?start_date={booking_date}&end_date={booking_date}&status=confirmed&employee={self.employee.pk}&service={self.service.pk}")
        self.assertEqual([item["id"] for item in appointments.data], [response.data["id"]])
        payment = client.post("/api/v1/admin/payments/", {"appointment": response.data["id"], "amount": self.service.price, "payment_method": "card"}, format="json")
        self.assertEqual(payment.status_code, 201)
        revenue = client.get(f"/api/v1/admin/revenue/?period=day&date={timezone.localdate()}")
        self.assertEqual(revenue.status_code, 200)
        self.assertEqual(revenue.data["service_revenue"], 0)
        update = client.patch(f"/api/v1/admin/appointments/{response.data['id']}/", {"status": "completed"}, format="json")
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data["status"], "completed")

    def test_admin_statistics_use_real_tehran_date_ranges(self):
        current = timezone.localdate()
        self.appointment.status = "pending"
        self.appointment.save(update_fields=("status",))
        AppointmentItem.objects.create(appointment=self.appointment, service=self.service, employee=self.employee, date=current, start_time="09:00", end_time="10:00")
        completed = Appointment.objects.create(customer=self.customer_profile, status="completed")
        AppointmentItem.objects.create(appointment=completed, service=self.service, employee=self.employee, date=current, start_time="10:00", end_time="11:00")
        admin = User.objects.create_user(username="stats-admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.get("/api/v1/admin/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["today"], {"appointments": 2, "pending": 1, "confirmed": 0, "completed": 1, "cancelled": 0})
        self.assertEqual(response.data["week"]["appointments"], 2)
        self.assertEqual(response.data["month"]["appointments"], 2)
        self.assertEqual(response.data["top_services"][0]["appointments"], 2)
        self.assertTrue(response.data["revenue_available"])
        self.assertEqual(response.data["revenue"], {"today": 0, "week": 0, "month": 0})

    def test_admin_can_create_sequential_services_for_assigned_employee(self):
        admin = User.objects.create_user(username="multi-admin", role="admin")
        second_service = Service.objects.create(category=self.service.category, name="Color", persian_name="Color", price=1200, duration=60)
        EmployeeService.objects.create(employee=self.employee, service=second_service)
        booking_date = date(2026, 8, 31)
        WorkingSchedule.objects.create(employee=self.employee, weekday=booking_date.weekday(), start_time="09:00", end_time="20:00")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post("/api/v1/admin/appointments/", {"customer": self.customer_profile.pk, "items": [{"service": self.service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "10:00", "end_time": "11:00"}, {"service": second_service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "11:00", "end_time": "12:00"}]}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["items"]), 2)
        self.assertEqual(response.data["appointment_total"], 2000)
        self.assertEqual([(item["start_time"], item["end_time"]) for item in response.data["items"]], [("10:00:00", "11:00:00"), ("11:00:00", "12:00:00")])

    def test_completed_item_creates_one_snapshotted_commission(self):
        item = self.make_item()
        self.employee.commission_rate = 10
        self.employee.save(update_fields=("commission_rate",))
        other_user = User.objects.create_user(username="commission-specialist", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user, commission_rate=20)
        EmployeeService.objects.create(employee=other_employee, service=self.service)
        other_item = AppointmentItem.objects.create(
            appointment=self.appointment,
            service=self.service,
            employee=other_employee,
            date=item.date,
            start_time="10:00",
            end_time="11:00",
        )

        item.set_completion_status("completed", changed_by=self.employee.user)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, "confirmed")
        other_item.set_completion_status("completed", changed_by=other_user)
        item.set_completion_status("completed", changed_by=self.employee.user)

        self.assertEqual(EmployeeCommission.objects.filter(appointment_item=item).count(), 1)
        self.assertEqual(EmployeeCommission.objects.filter(appointment_item__appointment=self.appointment).count(), 2)
        client = APIClient()
        client.force_authenticate(self.employee.user)
        employee_appointment = client.get("/api/v1/employee/appointments/").data[0]
        self.assertEqual([row["employee"] for row in employee_appointment["items"]], [self.employee.pk])
        completed_again = client.post(f"/api/v1/employee/appointment-items/{item.pk}/action/", {"status": "complete", "notes": "کار انجام شد"}, format="json")
        self.assertEqual(completed_again.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(EmployeeCommission.objects.filter(appointment_item=item).count(), 1)
        self.assertEqual(client.get("/api/v1/admin/commissions/").status_code, 403)
        commission = EmployeeCommission.objects.get(appointment_item=item)
        other_commission = EmployeeCommission.objects.get(appointment_item=other_item)
        self.assertEqual(commission.base_amount, 800)
        self.assertEqual(commission.commission_rate_snapshot, 10)
        self.assertEqual(commission.commission_amount, 80)
        self.assertEqual((other_commission.base_amount, other_commission.commission_rate_snapshot, other_commission.commission_amount), (800, 20, 160))

        self.service.price = 1200
        self.service.save(update_fields=("price",))
        self.employee.commission_rate = 25
        self.employee.save(update_fields=("commission_rate",))
        commission.refresh_from_db()
        self.assertEqual((commission.base_amount, commission.commission_rate_snapshot, commission.commission_amount), (800, 10, 80))

    def test_partial_payments_refunds_and_transactions_are_derived(self):
        self.make_item()
        admin = User.objects.create_user(username="finance-admin", role="admin")
        client = APIClient()
        client.force_authenticate(admin)

        first = client.post("/api/v1/admin/payments/", {"appointment": self.appointment.pk, "amount": 300, "payment_method": "cash"}, format="json")
        second = client.post("/api/v1/admin/payments/", {"appointment": self.appointment.pk, "amount": 500, "payment_method": "card"}, format="json")
        excessive = client.post("/api/v1/admin/payments/", {"appointment": self.appointment.pk, "amount": 1}, format="json")

        self.assertEqual((first.status_code, second.status_code, excessive.status_code), (201, 201, 400))
        appointment = client.get(f"/api/v1/admin/appointments/{self.appointment.pk}/")
        self.assertEqual((appointment.data["appointment_total"], appointment.data["paid_total"], appointment.data["remaining_total"], appointment.data["payment_status"]), (800, 800, 0, "paid"))

        refund = client.post("/api/v1/admin/refunds/", {"payment": first.data["id"], "amount": 200, "reason": "اصلاح مبلغ"}, format="json")
        excessive_refund = client.post("/api/v1/admin/refunds/", {"payment": first.data["id"], "amount": 101}, format="json")
        self.assertEqual((refund.status_code, excessive_refund.status_code), (201, 400))
        appointment = client.get(f"/api/v1/admin/appointments/{self.appointment.pk}/")
        self.assertEqual((appointment.data["refunded_total"], appointment.data["net_paid"], appointment.data["remaining_total"], appointment.data["payment_status"]), (200, 600, 200, "partially_refunded"))
        dashboard = client.get("/api/v1/admin/statistics/")
        self.assertEqual(dashboard.data["revenue"]["today"], 600)
        self.assertEqual(Transaction.objects.filter(appointment=self.appointment, type="payment").count(), 2)
        self.assertEqual(Transaction.objects.filter(appointment=self.appointment, type="refund").count(), 1)

        transaction = Transaction.objects.filter(appointment=self.appointment).first()
        transaction.description = "tampered"
        with self.assertRaises(ValidationError):
            transaction.save()

    def test_employee_payment_report_requires_assignment_and_admin_review(self):
        item = self.make_item()
        admin = User.objects.create_user(username="review-admin", role="admin")
        employee_client = APIClient()
        employee_client.force_authenticate(self.employee.user)

        report = employee_client.post(
            f"/api/v1/employee/appointments/{self.appointment.pk}/payments/",
            {"amount": 500, "payment_method": "cash", "notes": "دریافت نقدی"},
            format="json",
        )

        self.assertEqual(report.status_code, 201)
        payment = Payment.objects.get(pk=report.data["id"])
        self.assertEqual((payment.status, payment.created_by, payment.amount), ("pending", self.employee.user, 500))
        self.assertEqual(Transaction.objects.filter(payment=payment).count(), 0)
        history = employee_client.get(f"/api/v1/employee/appointments/{self.appointment.pk}/payments/")
        self.assertEqual(history.data["remaining_total"], 800)

        admin_client = APIClient()
        admin_client.force_authenticate(admin)
        confirmed = admin_client.post(f"/api/v1/admin/payments/{payment.pk}/confirm/", format="json")
        self.assertEqual(confirmed.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual((payment.status, payment.reviewed_by), ("paid", admin))
        self.assertEqual(self.appointment.remaining_total, 300)
        self.assertEqual(Transaction.objects.filter(payment=payment, type="payment").count(), 1)
        self.assertEqual(EmployeeCommission.objects.count(), 0)

        rejected = employee_client.post(
            f"/api/v1/employee/appointments/{self.appointment.pk}/payments/",
            {"amount": 300, "payment_method": "card"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 201)
        rejected_payment = Payment.objects.get(pk=rejected.data["id"])
        self.assertEqual(admin_client.post(f"/api/v1/admin/payments/{rejected_payment.pk}/reject/", format="json").status_code, 200)
        rejected_payment.refresh_from_db()
        self.assertEqual(rejected_payment.status, "failed")
        self.assertEqual(self.appointment.remaining_total, 300)
        self.assertEqual(Transaction.objects.filter(payment=rejected_payment).count(), 0)

        other_user = User.objects.create_user(username="unrelated-reporter", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user)
        other_appointment = Appointment.objects.create(customer=self.customer_profile)
        AppointmentItem.objects.create(appointment=other_appointment, service=self.service, employee=other_employee, date=item.date, start_time="10:00", end_time="11:00")
        denied = employee_client.post(f"/api/v1/employee/appointments/{other_appointment.pk}/payments/", {"amount": 100, "payment_method": "cash"}, format="json")
        self.assertEqual(denied.status_code, 404)

    def test_employee_self_booking_forces_own_assignment_and_validates_schedule(self):
        booking_date = timezone.localdate() + timedelta(days=1)
        WorkingSchedule.objects.create(employee=self.employee, weekday=booking_date.weekday(), start_time="09:00", end_time="20:00")
        second_service = Service.objects.create(category=self.service.category, name="Color", persian_name="Color", price=1200, duration=30)
        EmployeeService.objects.create(employee=self.employee, service=second_service)
        other_user = User.objects.create_user(username="other-booker", role="employee")
        other_employee = EmployeeProfile.objects.create(user=other_user)
        restricted_service = Service.objects.create(category=self.service.category, name="Nails", persian_name="Nails", price=600, duration=30)
        EmployeeService.objects.create(employee=other_employee, service=restricted_service)
        client = APIClient()
        client.force_authenticate(self.employee.user)
        payload = {"customer_name": "مشتری تلفنی", "customer_phone": "09121234567", "services": [self.service.pk, second_service.pk], "date": str(booking_date), "start_time": "10:00", "notes": "رزرو تلفنی", "employee": other_employee.pk}

        response = client.post("/api/v1/employee/appointments/create/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.created_by, self.employee.user)
        self.assertEqual(list(appointment.items.values_list("employee_id", flat=True)), [self.employee.pk, self.employee.pk])
        self.assertEqual(list(appointment.items.values_list("start_time", "end_time")), [(time(10), time(11)), (time(11), time(11, 30))])
        self.assertEqual(list(appointment.items.values_list("price_snapshot", "duration_snapshot")), [(800, 60), (1200, 30)])
        self.assertEqual(Payment.objects.count(), 0)
        self.assertEqual(EmployeeCommission.objects.count(), 0)
        self.assertEqual(client.post("/api/v1/employee/appointments/create/", {**payload, "services": [restricted_service.pk], "start_time": "12:00"}, format="json").status_code, 400)
        self.assertEqual(client.post("/api/v1/employee/appointments/create/", {**payload, "services": [self.service.pk], "start_time": "10:30"}, format="json").status_code, 400)
        TimeOff.objects.create(employee=self.employee, start_date=booking_date, end_date=booking_date, status="approved")
        self.assertEqual(client.post("/api/v1/employee/appointments/create/", {**payload, "services": [self.service.pk], "start_time": "13:00"}, format="json").status_code, 400)

    def test_employee_earnings_periods_use_snapshots_commissions_and_payment_status(self):
        today = timezone.localdate()
        WorkingSchedule.objects.create(employee=self.employee, weekday=today.weekday(), start_time="09:00", end_time="20:00")
        current_item = AppointmentItem.objects.create(appointment=self.appointment, service=self.service, employee=self.employee, date=today, start_time="10:00", end_time="11:00", price_snapshot=800, duration_snapshot=60, completion_status="completed")
        EmployeeCommission.objects.create(appointment_item=current_item, base_amount=800, commission_rate_snapshot=10, commission_amount=80)
        Payment.objects.create(appointment=self.appointment, amount=800, status="paid")
        month_appointment = Appointment.objects.create(customer=self.customer_profile)
        month_date = today.replace(day=1 if today.day > 1 else 2)
        month_item = AppointmentItem.objects.create(appointment=month_appointment, service=self.service, employee=self.employee, date=month_date, start_time="12:00", end_time="13:00", price_snapshot=500, duration_snapshot=60, completion_status="completed")
        EmployeeCommission.objects.create(appointment_item=month_item, base_amount=500, commission_rate_snapshot=10, commission_amount=50)
        Payment.objects.create(appointment=month_appointment, amount=500, status="pending")
        other_appointment = Appointment.objects.create(customer=self.customer_profile)
        older_item = AppointmentItem.objects.create(appointment=other_appointment, service=self.service, employee=self.employee, date=today - timedelta(days=40), start_time="10:00", end_time="11:00", price_snapshot=1200, duration_snapshot=60, completion_status="completed")
        EmployeeCommission.objects.create(appointment_item=older_item, base_amount=1200, commission_rate_snapshot=20, commission_amount=240)
        Payment.objects.create(appointment=other_appointment, amount=1200, status="pending")
        isolated_user = User.objects.create_user(username="isolated-earner", role="employee")
        isolated_employee = EmployeeProfile.objects.create(user=isolated_user)
        EmployeeService.objects.create(employee=isolated_employee, service=self.service)
        isolated_appointment = Appointment.objects.create(customer=self.customer_profile)
        isolated_item = AppointmentItem.objects.create(appointment=isolated_appointment, service=self.service, employee=isolated_employee, date=today, start_time="14:00", end_time="15:00", completion_status="completed")
        EmployeeCommission.objects.create(appointment_item=isolated_item, base_amount=800, commission_rate_snapshot=50, commission_amount=400)
        client = APIClient()
        client.force_authenticate(self.employee.user)

        day = client.get("/api/v1/employee/earnings/?period=day")
        month = client.get("/api/v1/employee/earnings/?period=month")

        self.assertEqual(day.data["completed_services"], 1)
        self.assertEqual(day.data["employee_commission"], 80)
        self.assertEqual(day.data["items"][0]["base_amount"], 800)
        self.assertEqual(day.data["items"][0]["payment_status"], "paid")
        self.assertEqual(month.data["completed_services"], 2)
        self.assertEqual(month.data["employee_commission"], 130)
        self.assertEqual(
            next(status["value"] for status in month.data["statuses"] if status["status"] == "pending"),
            2,
        )
        self.assertNotEqual(day.data["employee_commission"], month.data["employee_commission"])

    def test_reschedule_revalidates_and_cancellation_history(self):
        WorkingSchedule.objects.create(employee=self.employee, weekday=5, start_time="09:00", end_time="20:00")
        item = self.make_item()
        item.date = date(2026, 8, 29); item.start_time = "11:00"; item.end_time = "12:00"; item.full_clean(); item.save()
        self.assertFalse(AppointmentItem.objects.filter(start_time="09:00").exists())
        self.appointment.set_status("cancelled", changed_by=self.customer, reason="customer request")
        self.assertEqual(self.appointment.status_history.get().reason, "customer request")

    def test_multi_service_booking_hold_and_confirmation_contract(self):
        second_service = Service.objects.create(category=self.service.category, name="Color", persian_name="Color", price=1200, duration=60)
        EmployeeService.objects.create(employee=self.employee, service=second_service)
        booking_date = date(2026, 9, 21)
        WorkingSchedule.objects.create(employee=self.employee, weekday=booking_date.weekday(), start_time="09:00", end_time="20:00")
        items = [
            {"service": self.service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "10:00", "end_time": "11:00"},
            {"service": second_service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "11:00", "end_time": "12:00"},
        ]
        client = APIClient()
        client.force_authenticate(self.customer)
        availability = client.get("/api/v1/availability/", {"date": str(booking_date), "items": json.dumps([{key: item[key] for key in ("service", "employee")} for item in items])})
        self.assertIn("10:00", availability.data["slots"])
        hold_response = client.post("/api/v1/booking-holds/", {"items": items}, format="json")
        self.assertEqual(hold_response.status_code, 201)
        self.assertEqual(len(hold_response.data["items"]), 2)

        overreach = client.post("/api/v1/appointments/", {"hold_token": hold_response.data["token"], "items": [*items, {"service": self.service.pk, "employee": self.employee.pk, "date": str(booking_date), "start_time": "12:00", "end_time": "13:00"}]}, format="json")
        self.assertEqual(overreach.status_code, 400)
        other_user = User.objects.create_user(username="other-booker")
        client.force_authenticate(other_user)
        self.assertEqual(client.post("/api/v1/appointments/", {"hold_token": hold_response.data["token"], "items": items}, format="json").status_code, 400)

        client.force_authenticate(self.customer)
        response = client.post("/api/v1/appointments/", {"hold_token": hold_response.data["token"], "items": items}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual([(item["start_time"], item["end_time"]) for item in response.data["items"]], [("10:00:00", "11:00:00"), ("11:00:00", "12:00:00")])
        self.assertEqual(sum(item["price_snapshot"] for item in response.data["items"]), 2000)
        self.assertEqual(response.data["customer_name"], "customer")
        self.assertEqual(response.data["customer_phone"], "")
        self.assertEqual(response.data["items"][0]["service_name"], "Cut")
        self.assertEqual(response.data["items"][0]["employee_name"], "employee")
        self.assertEqual(response.data["items"][0]["completion_status"], "pending")
        self.assertEqual(response.data["items"][0]["status"], "pending")

        expired_items = [{**item, "start_time": f"{14 + index:02}:00", "end_time": f"{15 + index:02}:00"} for index, item in enumerate(items)]
        expired_hold = client.post("/api/v1/booking-holds/", {"items": expired_items}, format="json")
        self.assertEqual(expired_hold.status_code, 201)
        from .models import BookingHold
        BookingHold.objects.filter(token=expired_hold.data["token"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        client.force_authenticate(other_user)
        self.assertEqual(client.post("/api/v1/booking-holds/", {"items": expired_items}, format="json").status_code, 201)

        guest_items = [{**item, "start_time": f"{16 + index:02}:00", "end_time": f"{17 + index:02}:00"} for index, item in enumerate(items)]
        client.force_authenticate(user=None)
        guest_hold = client.post("/api/v1/booking-holds/", {"items": guest_items}, format="json")
        self.assertEqual(guest_hold.status_code, 201)
        guest_booking = client.post("/api/v1/appointments/", {"customer_name": "Guest", "customer_phone": "09121234567", "hold_token": guest_hold.data["token"], "items": guest_items}, format="json")
        self.assertEqual(guest_booking.status_code, 201)
        self.assertEqual(guest_booking.data["customer_name"], "Guest")
