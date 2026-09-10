"""Booking hooks only enqueue database work; transport never runs in a request."""
import hashlib
import json
import logging
from django.db import transaction
from django.utils import timezone
from salon.models import Appointment
from .models import SMSAutomation
from .audience import customer_data, matches
from .tasks import queue_rule

logger = logging.getLogger(__name__)


def event_key(appointment, kind):
    state = {'status': appointment.status, 'items': list(appointment.items.order_by('pk').values_list('pk', 'service_id', 'date', 'start_time', 'end_time', 'completion_status'))}
    digest = hashlib.sha256(json.dumps(state, default=str, sort_keys=True).encode()).hexdigest()
    return f'event:{appointment.pk}:{kind}:{digest}'


def queue_event(appointment_id, kind):
    rules = list(SMSAutomation.objects.filter(enabled=True, kind=kind).select_related('service'))
    if not rules:
        return
    appointment = Appointment.objects.select_related('customer__user').get(pk=appointment_id)
    customer = appointment.customer
    if customer.is_deleted or not customer.user.is_active or customer.user.account_status != 'active':
        return
    items = list(appointment.items.select_related('service').order_by('date', 'start_time'))
    row = next((r for r in customer_data() if r['id'] == customer.pk), None)
    for rule in rules:
        applicable = [i for i in items if (not rule.service_id or rule.service_id == i.service_id) and (not rule.category_id or rule.category_id == i.service.category_id)]
        if not applicable or not row or not matches(row, rule.segment):
            continue
        queue_rule(rule, customer, event_key(appointment, kind), applicable[0].service, appointment.pk)
        SMSAutomation.objects.filter(pk=rule.pk).update(last_run=timezone.now())


def schedule_event(appointment, kind):
    def safe_enqueue():
        try:
            queue_event(appointment.pk, kind)
        except Exception:
            # The committed booking/payment can never be rolled back by SMS failures.
            logger.exception('SMS event enqueue failed', extra={'appointment_id': appointment.pk, 'kind': kind})
    transaction.on_commit(safe_enqueue)
