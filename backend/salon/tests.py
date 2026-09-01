import json
import base64
import tempfile
from datetime import date, timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Appointment, AppointmentItem, CustomerProfile, EmployeeCommission, EmployeeProfile, EmployeeService, GalleryAsset, GalleryCategory, Payment, Refund, Service, ServiceCategory, TimeOff, Transaction, User, WorkingSchedule


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
        self.assertEqual(revenue.data["total"], self.service.price)
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
        self.assertEqual(month.data["statuses"]["pending"], 2)
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
        booking_date = date(2026, 8, 31)
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
