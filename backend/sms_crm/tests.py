from datetime import datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import requests
from django.core.exceptions import ValidationError
from django.db import transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from salon.models import Appointment, AppointmentItem, AppointmentStatusHistory, CustomerProfile, EmployeeProfile, Service, ServiceCategory, User
from .automation import reconcile_appointment, safe_after_commit
from .models import SmsConfig, SmsConsentLog, SmsDelivery, SmsPreference, SmsProviderSettings, SmsTemplate
from .provider_settings import provider_settings
from .services import clean_phone, pattern_values, sms_parts
from .transport import MelipayamakTransport, MockSmsTransport
from .worker import run_batch


TEHRAN = ZoneInfo("Asia/Tehran")


@override_settings(SMS_ENABLED=True, SMS_DRY_RUN=True, SMS_BATCH_SIZE=25, SMS_MAX_PER_MINUTE=20)
class SmsTests(TestCase):
    def setUp(self):
        self.customer_user = User.objects.create_user(username="sms-customer", role="customer", first_name="مریم", phone="09121234567")
        self.customer = CustomerProfile.objects.create(user=self.customer_user)
        self.admin = User.objects.create_user(username="sms-manager", role="admin", phone="09129876543")
        self.employee = EmployeeProfile.objects.create(user=User.objects.create_user(username="sms-worker", role="employee"))
        self.service = Service.objects.create(category=ServiceCategory.objects.create(name="SMS"), name="Hair", persian_name="رنگ مو", duration=60, price=1000)
        self.appointment = Appointment.objects.create(customer=self.customer, status="pending")
        start = timezone.now().astimezone(TEHRAN) + timedelta(days=2)
        self.item = AppointmentItem.objects.create(appointment=self.appointment, employee=self.employee, service=self.service, date=start.date(), start_time=time(12), end_time=time(13), duration_snapshot=60)
        self.config = SmsConfig.solo()
        self.config.mode = "test"
        self.config.save()

    def test_safe_defaults_and_kill_switch(self):
        self.assertFalse(SmsPreference.objects.create(user=self.customer_user).marketing)
        with override_settings(SMS_ENABLED=False):
            self.assertTrue(run_batch(generate=False)["disabled"])
        self.assertEqual(run_batch(generate=False)["processed"], 0)
        self.assertEqual(SmsDelivery.objects.count(), 0)

    def test_normalization_and_invalid_suppression(self):
        self.assertEqual(clean_phone("+98 912-1234567"), "09121234567")
        self.assertIsNone(clean_phone("123"))
        self.customer_user.phone = "bad"
        self.customer_user.save(update_fields=("phone",))
        self.assertEqual(reconcile_appointment(self.appointment.pk), 0)
        self.assertEqual(pattern_values("booking_received", {"first_name": "مریم|نام"})[0], "مریم نام")

    def test_template_validation_and_parts(self):
        self.assertEqual(sms_parts("a" * 160), 1)
        self.assertEqual(sms_parts("سلام" * 20), 2)
        with self.assertRaises(ValidationError):
            SmsTemplate.objects.create(kind="booking_received", text="{first_name.__class__}")
        template = SmsTemplate.objects.create(kind="booking_received", text="{first_name} سلام")
        self.assertEqual(template.version, 1)
        template.text = "{first_name} عزیز"
        template.save()
        self.assertEqual(template.version, 2)
        self.config.template_selection = {"booking_received": "default"}
        self.config.save(update_fields=("template_selection",))
        from .services import render_template
        rendered, version = render_template("booking_received", {"first_name": "مریم", "service_names": "رنگ مو"})
        self.assertIn("درخواست نوبتت", rendered)
        self.assertEqual(version, 1)

    def test_events_deduplicate_and_reminders(self):
        reconcile_appointment(self.appointment.pk)
        reconcile_appointment(self.appointment.pk)
        self.assertEqual(SmsDelivery.objects.filter(kind="booking_received").count(), 1)
        self.assertEqual(SmsDelivery.objects.filter(kind="appointment_reminder").count(), 2)
        self.appointment.set_status("confirmed")
        reconcile_appointment(self.appointment.pk)
        self.assertEqual(SmsDelivery.objects.filter(kind="booking_confirmed").count(), 1)
        self.item.date += timedelta(days=1)
        self.item.save(update_fields=("date",))
        history = AppointmentStatusHistory.objects.create(appointment=self.appointment, status="confirmed", reason="تغییر زمان توسط مدیر")
        reconcile_appointment(self.appointment.pk)
        self.assertTrue(SmsDelivery.objects.filter(kind="appointment_reminder", status="cancelled").exists())
        self.assertTrue(SmsDelivery.objects.filter(kind="booking_rescheduled", key=f"sms:event:{history.pk}:booking_rescheduled").exists())
        self.appointment.set_status("cancelled")
        reconcile_appointment(self.appointment.pk)
        self.assertTrue(SmsDelivery.objects.filter(kind="booking_cancelled").exists())
        self.assertFalse(SmsDelivery.objects.filter(kind="appointment_reminder", status="queued").exists())
        self.assertEqual(run_batch(generate=False)["processed"], 1)
        self.assertTrue(SmsDelivery.objects.filter(kind="booking_confirmed", status="cancelled").exists())

    def test_preference_suppression(self):
        SmsPreference.objects.create(user=self.customer_user, appointments=False)
        reconcile_appointment(self.appointment.pk)
        self.assertFalse(SmsDelivery.objects.exists())

    def test_customer_opt_out_cancels_queue_and_records_consent(self):
        reconcile_appointment(self.appointment.pk)
        client = APIClient()
        client.force_authenticate(self.customer_user)
        self.assertEqual(client.patch("/api/v1/sms/preferences/", {"marketing": True}, format="json").status_code, 400)
        response = client.patch("/api/v1/sms/preferences/", {"appointments": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["appointments"])
        self.assertFalse(SmsDelivery.objects.filter(status="queued").exists())
        self.assertEqual(SmsConsentLog.objects.count(), 1)

    def test_worker_simulation_lease_batch_and_expiry(self):
        reconcile_appointment(self.appointment.pk)
        self.assertEqual(run_batch(generate=False)["processed"], 1)
        self.assertEqual(SmsDelivery.objects.get(kind="booking_received").status, "simulated")
        self.config.worker_lease = timezone.now() + timedelta(minutes=1)
        self.config.save(update_fields=("worker_lease",))
        self.assertTrue(run_batch(generate=False)["busy"])
        self.config.worker_lease = None
        self.config.save(update_fields=("worker_lease",))
        for number in range(2):
            SmsDelivery.objects.create(key=f"batch:{number}", recipient=self.customer_user.phone, kind="test", text="test")
        with override_settings(SMS_BATCH_SIZE=1):
            self.assertEqual(run_batch(generate=False)["processed"], 1)
        self.assertEqual(SmsDelivery.objects.filter(key__startswith="batch:", status="queued").count(), 1)

    def test_transport_outcomes_and_no_network(self):
        reconcile_appointment(self.appointment.pk)
        delivery = SmsDelivery.objects.get(kind="booking_received")
        with patch("requests.sessions.Session.post", side_effect=AssertionError("network called")):
            run_batch(generate=False)
        self.assertEqual(SmsDelivery.objects.get(pk=delivery.pk).status, "simulated")
        results = ["accepted", "failed", "retry", "unknown"]
        for index, result in enumerate(results):
            SmsDelivery.objects.create(key=f"test:{index}", recipient="09121234567", kind="test", text="test", status="queued")
            mock = MockSmsTransport({"status": result, "provider_id": "123"})
            run_batch(transport=mock, generate=False)
            actual = SmsDelivery.objects.get(key=f"test:{index}").status
            self.assertEqual(actual, {"accepted": "accepted", "failed": "failed", "retry": "queued", "unknown": "unknown"}[result])
            if result == "retry":
                SmsDelivery.objects.filter(key=f"test:{index}").update(status="failed")
        SmsDelivery.objects.filter(key="test:0").update(accepted_at=timezone.now() - timedelta(minutes=3))
        run_batch(transport=MockSmsTransport(), generate=False)
        self.assertEqual(SmsDelivery.objects.get(key="test:0").status, "delivered")

    def test_dry_run_never_fakes_a_previous_live_delivery(self):
        delivery = SmsDelivery.objects.create(
            key="accepted-before-dry-run", recipient=self.customer_user.phone,
            kind="test", text="test", status="accepted", provider_id="12345",
            accepted_at=timezone.now() - timedelta(minutes=10),
        )
        with patch("requests.sessions.Session.post", side_effect=AssertionError("network called")):
            run_batch(generate=False)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, "accepted")
        self.assertIsNone(delivery.last_polled_at)

    def test_transport_ambiguous_timeout(self):
        session = type("Session", (), {"post": lambda *args, **kwargs: (_ for _ in ()).throw(requests.ReadTimeout())})()
        self.assertEqual(MelipayamakTransport(session).send_text("09121234567", "sender", "test")["status"], "unknown")

    def test_provider_adapter_validates_responses_without_network(self):
        class Response:
            status_code = 200
            def json(self):
                return {"RetStatus": 1, "Value": "12345"}
        class Session:
            def __init__(self):
                self.calls = []
            def post(self, url, **kwargs):
                self.calls.append((url, kwargs))
                return Response()
        session = Session()
        adapter = MelipayamakTransport(session)
        self.assertEqual(adapter.send_pattern("09121234567", "42", ["مریم", "رنگ مو"])["status"], "accepted")
        self.assertEqual(session.calls[0][1]["timeout"], (3, 8))
        self.assertEqual(session.calls[0][1]["data"]["text"], "مریم|رنگ مو")
        self.assertEqual(adapter.get_delivery("12345")["status"], "accepted")

    def test_rate_daily_and_live_activation_guards(self):
        reconcile_appointment(self.appointment.pk)
        self.config.daily_limit = 0
        self.config.save(update_fields=("daily_limit",))
        self.assertEqual(run_batch(generate=False)["processed"], 0)
        client = APIClient(); client.force_authenticate(self.admin)
        self.assertEqual(client.post("/api/v1/sms/admin/test/", {"phone": self.admin.phone, "confirm": True}, format="json").status_code, 429)
        self.assertEqual(client.patch("/api/v1/sms/admin/config/", {"mode": "live", "confirm": True}, format="json").status_code, 400)
        with override_settings(SMS_DRY_RUN=False, MELIPAYAMAK_USERNAME="", MELIPAYAMAK_PASSWORD=""):
            self.assertEqual(client.patch("/api/v1/sms/admin/config/", {"mode": "live", "confirm": True}, format="json").status_code, 400)
        with override_settings(SMS_DRY_RUN=False, MELIPAYAMAK_USERNAME="user", MELIPAYAMAK_PASSWORD="password", MELIPAYAMAK_SENDER="", MELIPAYAMAK_BODY_IDS={}):
            self.assertEqual(client.patch("/api/v1/sms/admin/config/", {"mode": "live", "confirm": True}, format="json").status_code, 400)
        self.config.daily_limit = 100
        self.config.save(update_fields=("daily_limit",))
        SmsDelivery.objects.create(key="rate-used", recipient=self.admin.phone, kind="test", text="test", status="simulated", claimed_at=timezone.now())
        with override_settings(SMS_MAX_PER_MINUTE=1):
            self.assertEqual(run_batch(generate=False)["processed"], 0)

    def test_admin_permissions_masking_and_test(self):
        client = APIClient()
        client.force_authenticate(self.customer_user)
        self.assertEqual(client.get("/api/v1/sms/admin/overview/").status_code, 403)
        client.force_authenticate(self.admin)
        self.assertEqual(client.get("/api/v1/sms/admin/overview/").status_code, 200)
        self.assertEqual(client.post("/api/v1/sms/admin/test/", {"phone": self.customer_user.phone, "confirm": True}, format="json").status_code, 400)
        response = client.post("/api/v1/sms/admin/test/", {"phone": self.admin.phone, "confirm": True}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "simulated")
        report = client.get("/api/v1/sms/admin/deliveries/").data
        self.assertNotIn(self.admin.phone, str(report))
        self.assertNotIn("MELIPAYAMAK_PASSWORD", str(client.get("/api/v1/sms/admin/config/").data))

    def test_admin_can_save_encrypted_provider_settings_without_secret_readback(self):
        client = APIClient()
        client.force_authenticate(self.customer_user)
        self.assertEqual(client.patch("/api/v1/sms/admin/setup/", {"revision": 0, "username": "account", "password": "private-pass"}, format="json", secure=True).status_code, 403)
        client.force_authenticate(self.admin)
        with patch("requests.sessions.Session.post", side_effect=AssertionError("provider contacted during save")):
            response = client.patch("/api/v1/sms/admin/setup/", {"revision": 0, "username": "account", "password": "private-pass", "sender": "50001234", "body_ids": {"booking_received": "456"}}, format="json", secure=True)
        self.assertEqual(response.status_code, 200, response.data)
        row = SmsProviderSettings.objects.get(pk=1)
        self.assertNotIn("account", row.username_ciphertext)
        self.assertNotIn("private-pass", row.password_ciphertext)
        self.assertEqual(provider_settings().username, "account")
        self.assertEqual(provider_settings().password, "private-pass")
        self.assertEqual(provider_settings().body_ids["booking_received"], "456")
        class PanelSession:
            def post(self, url, **kwargs):
                self.data = kwargs["data"]
                return type("Reply", (), {"status_code": 200, "json": lambda self: {"RetStatus": 1, "Value": "1000"}})()
        session = PanelSession()
        self.assertEqual(MelipayamakTransport(session).get_credit()["status"], "ok")
        self.assertEqual(session.data["username"], "account")
        self.assertEqual(session.data["password"], "private-pass")
        reconcile_appointment(self.appointment.pk)
        self.assertEqual(SmsDelivery.objects.get(kind="booking_received").body_id, "456")
        self.assertNotIn("private-pass", str(response.data))
        self.assertNotIn("account", str(response.data))
        self.assertEqual(response.data["body_ids_configured"], ["booking_received"])
        self.assertEqual(client.patch("/api/v1/sms/admin/setup/", {"revision": 0, "sender": "50009999"}, format="json", secure=True).status_code, 400)
        unchanged = client.patch("/api/v1/sms/admin/setup/", {"revision": 1, "username": "", "password": "", "sender": "50009999"}, format="json", secure=True)
        self.assertEqual(unchanged.status_code, 200)
        self.assertEqual(provider_settings().password, "private-pass")
        self.assertEqual(provider_settings().sender, "50009999")
        removed = client.patch("/api/v1/sms/admin/setup/", {"revision": 2, "clear_body_ids": ["booking_received"]}, format="json", secure=True)
        self.assertEqual(removed.status_code, 200)
        self.assertNotIn("booking_received", provider_settings().body_ids)

    def test_provider_change_disables_live_and_invalid_cipher_fails_closed(self):
        client = APIClient(); client.force_authenticate(self.admin)
        self.assertEqual(client.patch("/api/v1/sms/admin/setup/", {"revision": 0, "username": "account", "password": "private-pass", "sender": "50001234"}, format="json", secure=True).status_code, 200)
        self.config.mode = "live"
        self.config.last_provider_verification = timezone.now()
        self.config.save(update_fields=("mode", "last_provider_verification"))
        self.assertEqual(client.patch("/api/v1/sms/admin/setup/", {"revision": 1, "password": "new-pass"}, format="json", secure=True).status_code, 200)
        self.config.refresh_from_db()
        self.assertEqual(self.config.mode, "off")
        self.assertIsNone(self.config.last_provider_verification)
        SmsProviderSettings.objects.filter(pk=1).update(password_ciphertext="invalid")
        with override_settings(MELIPAYAMAK_USERNAME="env-account", MELIPAYAMAK_PASSWORD="env-pass"):
            self.assertFalse(provider_settings().credentials)
            self.assertFalse(client.get("/api/v1/sms/admin/setup/").data["credentials_readable"])
            self.assertFalse(client.get("/api/v1/sms/admin/config/").data["configured"])

    def test_saved_credentials_verify_read_only_while_dry_run(self):
        client = APIClient(); client.force_authenticate(self.admin)
        self.assertEqual(client.patch("/api/v1/sms/admin/setup/", {"revision": 0, "username": "account", "password": "private-pass", "sender": "50001234"}, format="json", secure=True).status_code, 200)
        with patch("sms_crm.views.MelipayamakTransport.get_credit", return_value={"status": "ok", "credit": 1000}) as credit:
            response = client.post("/api/v1/sms/admin/verify/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        credit.assert_called_once()
        self.config.refresh_from_db()
        self.assertEqual(self.config.mode, "off")
        self.assertIsNotNone(self.config.last_provider_verification)


@override_settings(SMS_ENABLED=True, SMS_DRY_RUN=True)
class CommitTests(TransactionTestCase):
    def test_reconcile_happens_only_after_commit(self):
        user = User.objects.create_user(username="commit-customer", role="customer", phone="09121234567")
        customer = CustomerProfile.objects.create(user=user)
        employee = EmployeeProfile.objects.create(user=User.objects.create_user(username="commit-employee", role="employee"))
        service = Service.objects.create(category=ServiceCategory.objects.create(name="Commit"), name="Cut", duration=60, price=100)
        config = SmsConfig.solo(); config.mode = "test"; config.save()
        with transaction.atomic():
            appointment = Appointment.objects.create(customer=customer)
            future = timezone.now().astimezone(TEHRAN) + timedelta(days=2)
            AppointmentItem.objects.create(appointment=appointment, employee=employee, service=service, date=future.date(), start_time=time(12), end_time=time(13))
            safe_after_commit(appointment.pk)
            self.assertEqual(SmsDelivery.objects.count(), 0)
        self.assertTrue(SmsDelivery.objects.filter(kind="booking_received").exists())
