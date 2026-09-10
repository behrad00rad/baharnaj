"""Adapters must return acceptance, never infer delivery from HTTP success."""
from dataclasses import dataclass
from django.conf import settings
from django.utils.module_loading import import_string


class ProviderUnavailable(Exception):
    pass


class Rejected(Exception):
    """Definitive rejection: provider guarantees the message was not accepted."""


@dataclass
class SendResult:
    message_id: str
    delivered: bool = False


class SMSProvider:
    development_only = False

    def __init__(self, *, api_key, sender):
        self.api_key, self.sender = api_key, sender

    def send(self, *, phone, message, idempotency_key):
        """Return SendResult; use bounded timeouts. Ambiguous errors must NOT be Rejected."""
        raise NotImplementedError


def get_provider():
    path = settings.SMS_PROVIDER
    if not path:
        raise ProviderUnavailable('ارائه‌دهنده پیامک پیکربندی نشده است.')
    try:
        cls = import_string(path)
        if not issubclass(cls, SMSProvider):
            raise TypeError
        if cls.development_only and not (settings.DEBUG and settings.SMS_ALLOW_TEST_PROVIDER):
            raise ProviderUnavailable('ارائه‌دهنده آزمایشی در محیط عملیاتی مجاز نیست.')
        if not cls.development_only and not (settings.SMS_API_KEY and settings.SMS_SENDER_NUMBER):
            raise ProviderUnavailable('اطلاعات اتصال پیامک کامل نیست.')
        return cls(api_key=settings.SMS_API_KEY, sender=settings.SMS_SENDER_NUMBER)
    except ProviderUnavailable:
        raise
    except Exception as exc:
        raise ProviderUnavailable('آداپتور پیامک قابل استفاده نیست.') from exc
