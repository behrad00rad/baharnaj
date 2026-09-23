"""One bounded run. Never hold a database lock over a provider request."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone

from .automation import reconcile_recent
from .models import SmsConfig, SmsDelivery
from .provider_settings import provider_settings
from .services import appointment_snapshot, recipient_for, runtime
from .transport import MelipayamakTransport, MockSmsTransport


def eligibility(delivery, now):
    if delivery.expires_at and delivery.expires_at <= now:
        return "expired"
    if delivery.appointment_id:
        appointment = delivery.appointment
        recipient = recipient_for(appointment, now)
        if appointment.is_deleted or not recipient or recipient != delivery.recipient:
            return "recipient_unavailable"
        if delivery.kind in {"booking_received", "booking_confirmed", "booking_rescheduled"} and appointment.status not in {"pending", "confirmed"}:
            return "appointment_inactive"
        if delivery.kind == "booking_confirmed" and appointment.status != "confirmed":
            return "confirmation_obsolete"
        if delivery.kind == "booking_cancelled" and appointment.status != "cancelled":
            return "cancellation_obsolete"
        if delivery.kind in {"booking_confirmed", "booking_rescheduled"} and appointment_snapshot(appointment)[2] != delivery.schedule_version:
            return "obsolete_schedule"
        if delivery.kind == "appointment_reminder":
            if appointment.status not in {"pending", "confirmed"} or appointment_snapshot(appointment)[2] != delivery.schedule_version:
                return "obsolete_schedule"
    return None


def run_batch(transport=None, *, generate=True, now=None):
    now = now or timezone.now()
    injected_transport = transport is not None
    config = SmsConfig.solo()
    lease = now + timedelta(minutes=10)
    if not SmsConfig.objects.filter(pk=config.pk).filter(Q(worker_lease=None) | Q(worker_lease__lt=now)).update(worker_lease=lease, heartbeat=now):
        return {"busy": True}
    processed = 0
    try:
        if generate and (settings.SMS_ENABLED or transport is not None):
            reconcile_recent(now)
        SmsDelivery.objects.filter(status="claimed", claimed_at__lt=now - timedelta(minutes=10)).update(status="unknown", error="stale_claim_outcome_unknown")
        state = runtime(config)
        if not state["enabled"] and transport is None:
            return {"disabled": True, "processed": 0}
        if not state["dry_run"] and not state["live_ready"] and transport is None:
            return {"configured": False, "processed": 0}
        transport = transport or (MockSmsTransport() if state["dry_run"] else MelipayamakTransport())
        provider = transport.provider if isinstance(transport, MelipayamakTransport) else provider_settings()
        batch = max(0, min(25, settings.SMS_BATCH_SIZE))
        minute_budget = max(0, settings.SMS_MAX_PER_MINUTE - SmsDelivery.objects.filter(claimed_at__gte=now - timedelta(minutes=1)).count())
        local_day = now.astimezone(ZoneInfo("Asia/Tehran")).date()
        day_start = datetime.combine(local_day, time.min, tzinfo=ZoneInfo("Asia/Tehran"))
        day_budget = max(0, config.daily_limit - SmsDelivery.objects.filter(claimed_at__gte=day_start, claimed_at__lt=day_start + timedelta(days=1)).count())
        limit = min(batch, minute_budget, day_budget)
        ids = list(SmsDelivery.objects.filter(status="queued", scheduled_at__lte=now).order_by("scheduled_at", "pk").values_list("pk", flat=True)[:limit])
        for pk in ids:
            current = timezone.now()
            if not SmsConfig.objects.filter(pk=config.pk, worker_lease=lease, worker_lease__gt=current).exists():
                break
            if isinstance(transport, MelipayamakTransport) and not runtime()["live_ready"]:
                break
            delivery = SmsDelivery.objects.select_related("appointment__customer__user").get(pk=pk)
            reason = eligibility(delivery, current)
            if reason:
                SmsDelivery.objects.filter(pk=pk, status="queued").update(status="expired" if reason == "expired" else "cancelled", error=reason)
                continue
            if not SmsDelivery.objects.filter(pk=pk, status="queued").update(status="claimed", claimed_at=current, attempts=F("attempts") + 1):
                continue
            delivery.refresh_from_db()
            reason = eligibility(delivery, timezone.now())
            if reason:
                SmsDelivery.objects.filter(pk=pk, status="claimed").update(status="cancelled", error=reason)
                continue
            body_id = provider.body_ids.get(delivery.kind, "") if delivery.kind != "test" else ""
            if delivery.body_id != body_id:
                delivery.body_id = body_id
                SmsDelivery.objects.filter(pk=pk, status="claimed").update(body_id=body_id)
            try:
                if isinstance(transport, MelipayamakTransport) and not delivery.body_id and not provider.sender:
                    result = {"status": "failed", "error": "sender_missing"}
                elif isinstance(transport, MelipayamakTransport) and delivery.body_id and not delivery.appointment_id:
                    result = {"status": "failed", "error": "pattern_context_missing"}
                elif delivery.body_id:
                    from .services import appointment_snapshot, pattern_values
                    values = appointment_snapshot(delivery.appointment)[1] if delivery.appointment_id else {}
                    result = transport.send_pattern(delivery.recipient, delivery.body_id, pattern_values(delivery.kind, values))
                else:
                    result = transport.send_text(delivery.recipient, provider.sender, delivery.text)
            except Exception:
                result = {"status": "unknown", "error": "transport_outcome_unknown"}
            status = result.get("status", "unknown")
            if status == "retry":
                status = "queued" if delivery.attempts < 3 else "failed"
            values = {"status": status, "error": str(result.get("error", ""))[:80], "provider_code": str(result.get("provider_code", ""))[:40]}
            if status == "queued":
                values["scheduled_at"] = timezone.now() + timedelta(minutes=2 ** delivery.attempts)
            if status == "accepted":
                values.update(accepted_at=timezone.now(), provider_id=str(result.get("provider_id", ""))[:80])
            if status == "failed":
                values["failed_at"] = timezone.now()
            SmsDelivery.objects.filter(pk=pk, status="claimed").update(**values)
            processed += 1
        poll_ids = list(SmsDelivery.objects.filter(status="accepted", provider_id__gt="", accepted_at__lt=now - timedelta(minutes=2)).filter(Q(last_polled_at=None) | Q(last_polled_at__lt=now - timedelta(minutes=5))).order_by("accepted_at").values_list("pk", flat=True)[:batch])
        if (not state["dry_run"] and state["live_ready"]) or (injected_transport and not isinstance(transport, MelipayamakTransport)):
            for pk in poll_ids:
                delivery = SmsDelivery.objects.get(pk=pk)
                try:
                    result = transport.get_delivery(delivery.provider_id)
                except Exception:
                    result = {"status": "accepted", "error": "poll_unavailable"}
                SmsDelivery.objects.filter(pk=pk, status="accepted").update(last_polled_at=timezone.now())
                status = result.get("status")
                if status in {"delivered", "failed"}:
                    SmsDelivery.objects.filter(pk=pk, status="accepted").update(status=status, provider_code=str(result.get("provider_code", ""))[:40], delivered_at=timezone.now() if status == "delivered" else None, failed_at=timezone.now() if status == "failed" else None, error=str(result.get("error", ""))[:80])
        return {"processed": processed, "polled": len(poll_ids), "remaining_budget": limit - processed}
    finally:
        SmsConfig.objects.filter(pk=config.pk, worker_lease=lease).update(worker_lease=None, heartbeat=timezone.now())
