import re


def normalize_phone(value):
    value = str(value or '').translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
    value = re.sub(r'[\s()\-]', '', value)
    for prefix in ('+98', '0098', '98'):
        if value.startswith(prefix):
            value = '0' + value[len(prefix):]
            break
    if not re.fullmatch(r'09[0-9]{9}', value):
        raise ValueError('شماره موبایل معتبر نیست.')
    return value


def phone_variants(value):
    phone = normalize_phone(value)
    return (phone, '+98' + phone[1:], '98' + phone[1:], '0098' + phone[1:])
