"""Small, single entry point for Firebase Admin initialisation and delivery."""
import json
import logging

from django.conf import settings
from django.utils import timezone

from .models import FirebaseDevice

logger = logging.getLogger(__name__)


def _firebase_app():
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        logger.warning("FCM delivery skipped: firebase-admin is not installed")
        return None
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass
    try:
        if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
            credential = credentials.Certificate(json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON))
        elif settings.FIREBASE_SERVICE_ACCOUNT_FILE:
            credential = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_FILE)
        else:
            credential = credentials.ApplicationDefault()
        options = {"projectId": settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else None
        return firebase_admin.initialize_app(credential, options)
    except Exception:
        logger.warning("FCM delivery skipped: Firebase Admin could not be initialized")
        return None


def send_fcm_notification(notification):
    """Best-effort multi-device FCM delivery; never raises into business workflows."""
    app = _firebase_app()
    if not app:
        return
    try:
        from firebase_admin import exceptions, messaging
    except ImportError:
        return
    data = {"notification_id": str(notification.pk), "type": notification.type, "title": notification.title, "body": notification.message, "target_url": notification.target_url if notification.target_url.startswith("/") else "/"}
    for device in notification.recipient.firebase_devices.filter(is_active=True).iterator():
        try:
            messaging.send(messaging.Message(data=data, token=device.token), app=app)
            FirebaseDevice.objects.filter(pk=device.pk).update(last_seen_at=timezone.now())
        except (messaging.UnregisteredError, messaging.SenderIdMismatchError, exceptions.InvalidArgumentError):
            FirebaseDevice.objects.filter(pk=device.pk).update(is_active=False)
            logger.info("Disabled invalid FCM registration", extra={"notification_id": notification.pk, "device_id": device.pk})
        except Exception:
            logger.warning("FCM delivery failed", extra={"notification_id": notification.pk, "device_id": device.pk})
