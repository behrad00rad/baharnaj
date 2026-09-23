"""Administrator-only SMS controls. Provider credentials never enter serializers."""
from datetime import datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.views.decorators.debug import sensitive_variables
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from salon.models import AdminActionLog
from salon.permissions import IsAdmin
from salon.permissions import IsCustomer
from .models import ALLOWED_VARIABLES, DEFAULT_TEMPLATES, SmsConfig, SmsConsentLog, SmsDelivery, SmsPreference, SmsProviderSettings, SmsTemplate
from .serializers import SmsConfigSerializer, SmsTemplateSerializer
from .services import clean_phone, mask_phone, runtime, sms_parts
from .provider_settings import SetupInput, provider_settings, public_setup, save_setup
from .transport import MelipayamakTransport, MockSmsTransport


def audit(request, action, details=None):
    AdminActionLog.objects.create(actor=request.user, action=action, model_name="SmsConfig", object_id="1", details=details or {})


def public_config(config):
    state = runtime(config)
    provider = public_setup()
    return {
        **SmsConfigSerializer(config).data,
        "environment_enabled": settings.SMS_ENABLED,
        "dry_run": state["dry_run"],
        "configured": state["configured"],
        "verified": state["verified"],
        "live_ready": state["live_ready"],
        "can_activate_live": bool(settings.SMS_ENABLED and not settings.SMS_DRY_RUN and state["configured"] and config.last_provider_verification and config.last_provider_verification >= timezone.now() - timedelta(days=1)),
        "credentials_configured": state["credentials"],
        "sender": provider["sender"],
        "body_ids_configured": list(state["body_ids"]),
        "provider_source": provider["source"],
        "credentials_readable": provider["credentials_readable"],
        "heartbeat": config.heartbeat,
        "last_provider_verification": config.last_provider_verification,
        "provider_display": config.provider_display,
    }


class AdminSmsView(APIView):
    permission_classes = (IsAdmin,)


class SetupView(AdminSmsView):
    def get(self, request):
        return Response(public_setup(), headers={"Cache-Control": "no-store"})

    @sensitive_variables()
    def patch(self, request):
        if not request.is_secure() and not settings.DEBUG:
            raise PermissionDenied("اطلاعات پیامک را فقط از نشانی امن HTTPS ذخیره کنید.")
        serializer = SetupInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = save_setup(serializer.validated_data)
        audit(request, "sms_setup", {"fields": [name for name in serializer.validated_data if name not in {"revision", "username", "password", "body_ids"}], "username_changed": bool(serializer.validated_data.get("username")), "password_changed": bool(serializer.validated_data.get("password")), "body_id_kinds": list(serializer.validated_data.get("body_ids", {}))})
        return Response(public_setup(row), headers={"Cache-Control": "no-store"})


class OverviewView(AdminSmsView):
    def get(self, request):
        config = SmsConfig.solo()
        counts = dict(SmsDelivery.objects.values_list("status").annotate(total=Count("pk")))
        reminders = list(SmsDelivery.objects.filter(kind="appointment_reminder", status="queued", scheduled_at__gte=timezone.now()).order_by("scheduled_at").values("id", "scheduled_at", "appointment_id")[:10])
        return Response({"config": public_config(config), "counts": counts, "next_reminders": reminders})


class ConfigView(AdminSmsView):
    def get(self, request):
        return Response(public_config(SmsConfig.solo()), headers={"Cache-Control": "no-store"})

    def patch(self, request):
        config = SmsConfig.solo()
        serializer = SmsConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_mode = serializer.validated_data.get("mode", config.mode)
        if new_mode != config.mode and request.data.get("confirm") is not True:
            return Response({"detail": "تغییر حالت نیاز به تأیید صریح دارد."}, status=400)
        if new_mode == "live" and new_mode != config.mode:
            state = runtime(config)
            if not settings.SMS_ENABLED or settings.SMS_DRY_RUN or not state["configured"] or not state["verified"] or config.last_provider_verification < timezone.now() - timedelta(days=1):
                return Response({"detail": "ارسال واقعی نیاز به تنظیمات کامل، بررسی اخیر و فعال‌سازی محیط دارد."}, status=400)
        serializer.save()
        audit(request, "sms_config_update", {"fields": list(serializer.validated_data)})
        return Response(public_config(config), headers={"Cache-Control": "no-store"})


class VerifyView(AdminSmsView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "sms_verify"

    def post(self, request):
        config = SmsConfig.solo()
        state = runtime(config)
        if not state["configured"]:
            return Response({"detail": "نام کاربری، گذرواژه و شماره فرستنده یا شناسه‌های الگو لازم است."}, status=400)
        # Credit verification is read-only and can run while sending is disabled.
        provider_row = SmsProviderSettings.objects.filter(pk=1).first()
        revision = provider_row.revision if provider_row else 0
        result = MelipayamakTransport(provider=provider_settings(provider_row)).get_credit()
        if result.get("status") != "ok":
            audit(request, "sms_verify_failed", {"code": result.get("error", "provider_error")})
            return Response({"detail": "بررسی ارائه‌دهنده ناموفق بود.", "code": result.get("error", "provider_error")}, status=502)
        with transaction.atomic():
            locked = SmsProviderSettings.objects.select_for_update().filter(pk=1).first()
            if (locked.revision if locked else 0) != revision:
                return Response({"detail": "تنظیمات در هنگام بررسی تغییر کرد؛ دوباره بررسی کنید."}, status=409)
            config.last_provider_verification = timezone.now()
            config.provider_display = "Melipayamak"
            config.save(update_fields=("last_provider_verification", "provider_display"))
        audit(request, "sms_verified")
        return Response({"verified": True, "credit": result["credit"]}, headers={"Cache-Control": "no-store"})


class DiagnosticsView(AdminSmsView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "sms_verify"

    def post(self, request, operation):
        if operation not in {"credit", "numbers"}:
            return Response(status=404)
        state = runtime()
        if not state["credentials"]:
            return Response({"detail": "ابتدا اطلاعات ورود ارائه‌دهنده را ذخیره کنید."}, status=400)
        transport = MelipayamakTransport()
        result = transport.get_credit() if operation == "credit" else transport.get_sender_numbers()
        audit(request, f"sms_{operation}_refresh")
        if result.get("status") != "ok":
            return Response({"detail": "دریافت اطلاعات ارائه‌دهنده ناموفق بود.", "code": result.get("error", "provider_error")}, status=502)
        return Response({"credit": result["credit"]} if operation == "credit" else {"numbers": result["numbers"]}, headers={"Cache-Control": "no-store"})


class TestView(AdminSmsView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "sms_test"

    def post(self, request):
        phone = clean_phone(request.data.get("phone"))
        if not phone or phone != clean_phone(request.user.phone):
            return Response({"detail": "شماره آزمایشی باید شماره ثبت‌شده مدیر باشد."}, status=400)
        if request.data.get("confirm") is not True:
            return Response({"detail": "ارسال آزمایشی نیاز به تأیید صریح دارد."}, status=400)
        config = SmsConfig.solo()
        state = runtime(config)
        if not state["enabled"]:
            return Response({"detail": "حالت پیامک خاموش است."}, status=400)
        if not state["dry_run"] and not state["live_ready"]:
            return Response({"detail": "ارسال واقعی آماده نیست."}, status=400)
        if not state["dry_run"] and not provider_settings().sender:
            return Response({"detail": "برای پیام آزمایشی واقعی شماره فرستنده لازم است."}, status=400)
        now = timezone.now()
        local_day = now.astimezone(ZoneInfo("Asia/Tehran")).date()
        day_start = datetime.combine(local_day, time.min, tzinfo=ZoneInfo("Asia/Tehran"))
        if SmsDelivery.objects.filter(claimed_at__gte=now - timedelta(minutes=1)).count() >= settings.SMS_MAX_PER_MINUTE or SmsDelivery.objects.filter(claimed_at__gte=day_start, claimed_at__lt=day_start + timedelta(days=1)).count() >= config.daily_limit:
            return Response({"detail": "سقف ارسال پیامک تکمیل شده است."}, status=429)
        message = "پیام آزمایشی بهارناژ؛ این پیام فقط برای بررسی سامانه ارسال شده است."
        delivery = SmsDelivery.objects.create(key=f"sms:test:{uuid4().hex}", user=request.user, recipient=phone, kind="test", text=message, parts=sms_parts(message), status="claimed", claimed_at=timezone.now(), attempts=1)
        transport = MockSmsTransport() if state["dry_run"] else MelipayamakTransport()
        result = transport.send_text(phone, provider_settings().sender, message)
        delivery.status = result.get("status") if result.get("status") in SmsDelivery.STATUSES else "unknown"
        delivery.provider_id = str(result.get("provider_id", ""))[:80]
        delivery.provider_code = str(result.get("provider_code", ""))[:40]
        delivery.error = str(result.get("error", ""))[:80]
        delivery.accepted_at = timezone.now() if delivery.status == "accepted" else None
        delivery.failed_at = timezone.now() if delivery.status == "failed" else None
        delivery.save(update_fields=("status", "provider_id", "provider_code", "error", "accepted_at", "failed_at", "updated_at"))
        audit(request, "sms_test", {"status": delivery.status, "recipient": mask_phone(phone)})
        return Response({"status": delivery.status, "recipient": mask_phone(phone), "id": delivery.pk}, status=status.HTTP_201_CREATED)


class PreferenceView(APIView):
    permission_classes = (IsCustomer,)

    def get(self, request):
        preference, _ = SmsPreference.objects.get_or_create(user=request.user)
        return Response({"appointments": preference.appointments, "marketing": preference.marketing, "birthday": preference.birthday, "loyalty": preference.loyalty, "care": preference.care, "suppressed_until": preference.suppressed_until})

    def patch(self, request):
        if set(request.data) != {"appointments"} or type(request.data["appointments"]) is not bool:
            return Response({"detail": "فقط انتخاب دریافت پیام‌های نوبت قابل تغییر است."}, status=400)
        preference, _ = SmsPreference.objects.get_or_create(user=request.user)
        before = preference.appointments
        preference.appointments = request.data["appointments"]
        preference.source = "customer_account"
        preference.save(update_fields=("appointments", "source", "updated_at"))
        if before != preference.appointments:
            SmsConsentLog.objects.create(user=request.user, source="customer_account", changes={"appointments": {"from": before, "to": preference.appointments}})
            if not preference.appointments:
                SmsDelivery.objects.filter(user=request.user, status="queued").update(status="cancelled", error="sms_opt_out")
        return self.get(request)


class TemplateView(AdminSmsView):
    def get(self, request):
        saved = {item.kind: item for item in SmsTemplate.objects.all()}
        body_ids = provider_settings().body_ids
        return Response({"allowed_variables": sorted(ALLOWED_VARIABLES), "templates": [{"kind": kind, "text": saved[kind].text if kind in saved else text, "version": saved[kind].version if kind in saved else 1, "parts": sms_parts(saved[kind].text if kind in saved else text), "pattern_configured": bool(body_ids.get(kind))} for kind, text in DEFAULT_TEMPLATES.items()]})

    def patch(self, request, kind):
        if kind not in DEFAULT_TEMPLATES:
            return Response(status=404)
        template, _ = SmsTemplate.objects.get_or_create(kind=kind, defaults={"text": DEFAULT_TEMPLATES[kind]})
        serializer = SmsTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(request, "sms_template_update", {"kind": kind, "version": template.version})
        return Response(serializer.data)


class DeliveryView(AdminSmsView):
    def get(self, request):
        queryset = SmsDelivery.objects.order_by("-created_at")
        for field in ("status", "kind"):
            value = request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        if request.query_params.get("appointment", "").isdigit():
            queryset = queryset.filter(appointment_id=request.query_params["appointment"])
        if request.query_params.get("date"):
            queryset = queryset.filter(created_at__date=request.query_params["date"])
        if request.query_params.get("phone", "").isdigit():
            queryset = queryset.filter(recipient__endswith=request.query_params["phone"][-4:])
        page = max(1, min(10000, int(request.query_params.get("page", "1")) if request.query_params.get("page", "1").isdigit() else 1))
        rows = list(queryset[(page - 1) * 25:page * 25])
        return Response({"count": queryset.count(), "page": page, "results": [{"id": row.pk, "kind": row.kind, "status": row.status, "recipient": mask_phone(row.recipient), "appointment": row.appointment_id, "scheduled_at": row.scheduled_at, "created_at": row.created_at, "accepted_at": row.accepted_at, "delivered_at": row.delivered_at, "error": row.error, "parts": row.parts} for row in rows]})
