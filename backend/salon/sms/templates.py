import math
import re
from django.conf import settings
from django.core import signing

VARIABLES = ('first_name', 'service_name', 'booking_link', 'discount_code', 'salon_name', 'appointment_date', 'appointment_time')
PATTERN = re.compile(r'{{\s*([a-z_]+)\s*}}')
# GSM default and extension alphabets; Persian uses UCS-2 (70/67 code units).
GSM = set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà')
EXT = set('^{}\\[~]|€')


def sms_size(message):
    gsm = all(c in GSM or c in EXT for c in message)
    units = sum(2 if c in EXT else 1 for c in message) if gsm else len(message.encode('utf-16-be')) // 2
    single, multi = (160, 153) if gsm else (70, 67)
    return {'characters': len(message), 'parts': 0 if not units else (1 if units <= single else math.ceil(units / multi)), 'encoding': 'GSM-7' if gsm else 'UCS-2'}


def render(template, context):
    def replace(match):
        key = match.group(1)
        if key not in VARIABLES or not context.get(key):
            raise ValueError('متغیر پیام قابل جایگزینی نیست: ' + key)
        return str(context[key])
    message = PATTERN.sub(replace, template)
    if '{{' in message or '}}' in message or not message.strip():
        raise ValueError('متن پیام یا متغیرها معتبر نیست.')
    return message


def optout_token(customer):
    return signing.dumps({'customer': customer.pk, 'phone': customer.user.phone}, salt='sms-optout', compress=True)


def marketing_message(message, customer, preview=False):
    base = settings.SMS_PUBLIC_BASE_URL.rstrip('/')
    if not base.startswith('https://'):
        if preview:
            return message + '\nلغو پیامک: [لینک پس از تنظیم نشانی عمومی سایت]'
        raise ValueError('نشانی عمومی HTTPS برای لینک لغو پیامک تنظیم نشده است.')
    return message + '\nلغو پیامک: ' + base + '/sms/preferences?token=' + optout_token(customer)
