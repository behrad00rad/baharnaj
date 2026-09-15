import hashlib
import hmac
import json
import time
from datetime import date, datetime, timedelta, time as dt_time
from pathlib import Path
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError, PermissionDenied
from salon.models import User, CustomerProfile, ServiceCategory, Service, EmployeeProfile, Appointment, AppointmentItem, Payment, Refund
from .models import Connection, LinkToken, Delivery, Config, PointsEntry, BenefitRule, Feedback, Campaign
from .services import (issue_link, redeem, digest, preferences, disconnect, audience,
                       enqueue, render, fingerprint, issue_benefit, reserve_benefit, redeem_benefit, issue_receipt)
from .automation import birthday_today, reconcile_appointments, reconcile_points, relevant_service_exists
from .worker import run_batch, eligibility
from .transport import MockTransport, TelegramTransport


@override_settings(TELEGRAM_ENABLED=True, TELEGRAM_BOT_USERNAME='test_bot', TELEGRAM_INTEGRATION_SECRET='test-secret', TELEGRAM_DRY_RUN=True)
class TelegramTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='customer', role='customer')
        self.profile = CustomerProfile.objects.create(user=self.user)
        self.other = User.objects.create_user(username='other', role='customer')
        self.admin = User.objects.create_user(username='manager', role='admin')
        employee_user = User.objects.create_user(username='staff', role='employee')
        self.employee = EmployeeProfile.objects.create(user=employee_user)
        self.category = ServiceCategory.objects.create(name='Hair')
        self.service = Service.objects.create(name='Color', persian_name='رنگ مو', category=self.category, duration=60, price=1000)
        self.a = Appointment.objects.create(customer=self.profile, status='confirmed')
        tomorrow = timezone.localdate()+timedelta(days=2)
        self.item = AppointmentItem.objects.create(appointment=self.a, employee=self.employee, service=self.service, date=tomorrow, start_time=dt_time(14), end_time=dt_time(15), price_snapshot=1000, duration_snapshot=60)
        self.c = Connection.objects.create(scope=f'account:{self.user.pk}', user=self.user, telegram_user_id=123, chat_id=123, connected=True, appointments=True, marketing=True, care=True)
        config = Config.solo(); config.marketing_start=0; config.marketing_end=24; config.save()
        self.client = APIClient()

    def delivery(self, kind='status', **kwargs):
        kwargs.setdefault('metadata', {'event':'confirmed'})
        return enqueue(self.c, f'test:{Delivery.objects.count()}', kind, 'متن', **kwargs)

    def test_token_expiry_reuse_conflict_and_disconnect(self):
        raw = issue_link(self.c)['url'].split('=')[1]
        self.assertEqual(len(raw), 32)
        self.assertEqual(redeem(raw, 123, 123).pk, self.c.pk)
        with self.assertRaises(ValidationError): redeem(raw, 123, 123)
        raw = issue_link(self.c)['url'].split('=')[1]
        with self.assertRaises(ValidationError): redeem(raw, 456, 456)
        LinkToken.objects.filter(digest=digest(raw)).update(expires_at=timezone.now()-timedelta(seconds=1))
        with self.assertRaises(ValidationError): redeem(raw, 123, 123)
        d=self.delivery(); disconnect(self.c); d.refresh_from_db()
        self.assertEqual(d.status, 'cancelled')
        raw=issue_link(self.c)['url'].split('=')[1]
        self.assertTrue(redeem(raw, 456, 456).connected)

    def test_guest_receipt_does_not_authorize_customer_account(self):
        receipt = issue_receipt(self.a)
        response = self.client.post('/api/v1/telegram/customer/', {'action':'link','receipt':receipt, 'appointments':True}, format='json')
        self.assertEqual(response.status_code, 200)
        raw=response.data['url'].split('=')[1]
        guest=redeem(raw, 123, 123)
        self.assertEqual(guest.appointment_id, self.a.pk)
        self.assertNotEqual(guest.pk, self.c.pk)
        bad=self.client.post('/api/v1/telegram/customer/', {'action':'link','phone':'123','appointment':self.a.pk}, format='json')
        self.assertEqual(bad.status_code, 403)

    def test_cross_account_admin_denial_and_secrets(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/v1/telegram/admin/overview/').status_code, 403)
        response=self.client.get('/api/v1/telegram/customer/')
        self.assertNotEqual(response.data['id'], self.c.pk)
        self.client.force_authenticate(self.admin)
        data=self.client.get('/api/v1/telegram/admin/overview/').data
        self.assertNotIn('test-secret', str(data))
        self.assertNotIn('chat_id', self.client.get('/api/v1/telegram/admin/customers/').data['results'][0])

    def test_separate_preferences_and_no_implicit_resubscribe(self):
        preferences(self.c, {'marketing':False}, 'test')
        self.assertTrue(self.c.appointments)
        raw=issue_link(self.c)['url'].split('=')[1]; redeem(raw,123,123)
        self.c.refresh_from_db(); self.assertFalse(self.c.marketing)
        from .views import bot_action
        bot_action({'actor':123,'chat_id':123,'operation':'stop'})
        self.c.refresh_from_db(); self.assertFalse(self.c.appointments)

    def test_hmac_contract_replay_and_tampering(self):
        fixture=json.loads((Path(__file__).resolve().parents[2]/'telegram/telebothost/contract.json').read_text())
        self.assertEqual(hmac.new(fixture['secret'].encode(), ('response\n123\n'+fixture['response_payload']).encode(), hashlib.sha256).hexdigest(), fixture['response_signature'])
        text=fixture['timestamp']+'\n'+fixture['nonce']+'\n'+hashlib.sha256(fixture['body'].encode()).hexdigest()
        self.assertEqual(hmac.new(fixture['secret'].encode(),text.encode(),hashlib.sha256).hexdigest(),fixture['signature'])
        with override_settings(TELEGRAM_INTEGRATION_SECRET=fixture['secret']), patch('telegram_crm.views.time.time',return_value=int(fixture['timestamp'])):
            headers={'HTTP_X_TIMESTAMP':fixture['timestamp'],'HTTP_X_NONCE':fixture['nonce'],'HTTP_X_SIGNATURE':fixture['signature']}
            first=self.client.post('/api/v1/telegram/bot/', fixture['body'], content_type='application/json', secure=True, **headers)
            self.assertEqual(first.status_code,200)
            again=self.client.post('/api/v1/telegram/bot/', fixture['body'], content_type='application/json', secure=True, **headers)
            self.assertEqual(again.data,first.data)
            bad=self.client.post('/api/v1/telegram/bot/',fixture['body'].replace('home','stop'),content_type='application/json',secure=True,**headers)
            self.assertEqual(bad.status_code,403)

    def test_cancellation_reschedule_and_deduplication(self):
        reconcile_appointments(timezone.now()); count=Delivery.objects.count()
        reconcile_appointments(timezone.now()); self.assertEqual(count,Delivery.objects.count())
        self.item.start_time=dt_time(16); self.item.save()
        reconcile_appointments(timezone.now())
        self.assertTrue(Delivery.objects.filter(status='cancelled').exists())
        self.a.set_status('cancelled')
        reconcile_appointments(timezone.now())
        self.assertFalse(Delivery.objects.filter(kind='reminder', status='queued').exists())

    def test_worker_acceptance_and_no_resend(self):
        d=self.delivery(); transport=MockTransport({'status':'accepted','message_id':99})
        run_batch(transport,generate=False); run_batch(transport,generate=False)
        d.refresh_from_db(); self.assertEqual(d.status,'accepted'); self.assertEqual(len(transport.calls),1)

    def test_429_blocked_unknown_and_stale_claim(self):
        d=self.delivery(); run_batch(MockTransport({'status':'queued','retry_after':30,'error':'rate_limited'}),generate=False)
        d.refresh_from_db(); self.assertEqual(d.status,'queued'); self.assertGreater(d.scheduled_at,timezone.now())
        d.scheduled_at=timezone.now(); d.save()
        run_batch(MockTransport({'status':'failed','error':'unreachable'}),generate=False)
        self.c.refresh_from_db(); self.assertFalse(self.c.reachable); self.assertTrue(self.c.marketing)
        d2=self.delivery(); d2.status='sending'; d2.claimed_at=timezone.now()-timedelta(hours=1); d2.save()
        run_batch(MockTransport(),generate=False); d2.refresh_from_db(); self.assertEqual(d2.status,'unknown')

    def test_timeout_is_unknown_not_retry(self):
        with patch('telegram_crm.transport.urlopen', side_effect=TimeoutError):
            self.assertEqual(TelegramTransport().send(123,'text',[])['status'],'unknown')

    def test_caps_quiet_hours_and_unsubscribe_rechecked(self):
        self.delivery('campaign',status='accepted',accepted_at=timezone.now())
        d=self.delivery('maintenance'); d.metadata={'item':self.item.pk}; d.save()
        d=self.delivery('reactivation')
        self.assertEqual(eligibility(d,timezone.now()),'promotional_cap')
        config=Config.solo(); config.marketing_start=10; config.marketing_end=20; config.save()
        d=self.delivery('birthday'); self.c.birthday=True; self.c.save(); config.birthday_enabled=True; config.save()
        d.refresh_from_db()
        self.assertEqual(eligibility(d,datetime(2026,9,14,1,tzinfo=timezone.get_current_timezone())),'quiet_hours')
        preferences(self.c,{'appointments':False},'test')
        d=self.delivery(); transport=MockTransport(); run_batch(transport,generate=False)
        d.refresh_from_db(); self.assertEqual(d.status,'suppressed')

    def test_segment_intersections_and_maintenance_suppression(self):
        self.item.date=timezone.localdate()-timedelta(days=100); self.item.completion_status='completed'; self.item.completed_at=timezone.now()-timedelta(days=100); self.item.save()
        self.a.status='completed'; self.a.save()
        self.c.neighborhood='گلسار'; self.c.save()
        stats, recipients=audience({'service_ids':[self.service.pk],'inactive_days':90,'neighborhood':'گلسار'})
        self.assertEqual(stats['eligible'],1)
        self.assertEqual(audience({'service_ids':[self.service.pk],'neighborhood':'دیگر'})[0]['eligible'],0)
        next_a=Appointment.objects.create(customer=self.profile, status='confirmed')
        AppointmentItem.objects.create(appointment=next_a,employee=self.employee,service=self.service,date=timezone.localdate()+timedelta(days=2),start_time=dt_time(10),end_time=dt_time(11),price_snapshot=1000,duration_snapshot=60)
        self.assertTrue(relevant_service_exists(self.c,self.item))
        self.assertEqual(audience({'inactive_days':90})[0]['eligible'],0)

    def test_jalali_and_gregorian_leap_birthday_policy(self):
        self.c.birth_calendar='gregorian'; self.c.birth_month=2; self.c.birth_day=29
        self.assertTrue(birthday_today(self.c,date(2025,2,28)))
        self.assertFalse(birthday_today(self.c,date(2024,2,28)))
        self.assertTrue(birthday_today(self.c,date(2024,2,29)))
        self.c.birth_calendar='jalali'; self.c.birth_month=12; self.c.birth_day=30
        self.assertTrue(birthday_today(self.c,date(2024,3,19))) # 1402/12/29, non-leap
        self.assertTrue(birthday_today(self.c,date(2025,3,20))) # 1403/12/30

    def test_coupon_customer_binding_atomic_redemption_and_prices(self):
        rule=BenefitRule.objects.create(name='gift',enabled=True,starts_at=timezone.now()-timedelta(days=1),ends_at=timezone.now()+timedelta(days=10),percent=20)
        rule.services.add(self.service)
        b=issue_benefit(self.user,rule,'unique')
        self.assertEqual(issue_benefit(self.user,rule,'unique').pk,b.pk)
        with self.assertRaises(ValidationError): reserve_benefit(self.other,self.a,b.code)
        reserve_benefit(self.user,self.a,b.code); b.refresh_from_db()
        b=redeem_benefit(b,self.admin); self.assertEqual(b.discount,200)
        self.assertEqual(redeem_benefit(b,self.admin).discount,200)
        self.assertEqual(self.a.appointment_total,800)
        self.item.refresh_from_db();self.assertEqual(self.item.pricing_type,'FIXED');self.assertEqual(self.item.price_snapshot,1000);self.assertEqual(self.item.discount_amount,200)

    def test_points_award_idempotency_and_refund_policy(self):
        config=Config.solo(); config.points_per_toman=100; config.save()
        self.a.status='completed'; self.a.save()
        Payment.objects.create(appointment=self.a,amount=1000,status='paid')
        reconcile_points(timezone.now()); reconcile_points(timezone.now())
        self.assertEqual(PointsEntry.objects.filter(key=f'earn:{self.a.pk}').count(),1)
        self.assertEqual(PointsEntry.objects.get(key=f'earn:{self.a.pk}').delta,10)
        self.a.status='cancelled'; self.a.save()
        reconcile_points(timezone.now()); reconcile_points(timezone.now())
        self.assertEqual(sum(PointsEntry.objects.values_list('delta',flat=True)),0)

    def test_template_validation_and_missing_configuration(self):
        self.assertIn('&lt;b&gt;',render('{name}',name='<b>'))
        with self.assertRaises(ValidationError): render('{name.__class__}')
        with self.assertRaises(ValidationError): render('{name!r}')
        with override_settings(TELEGRAM_ENABLED=False):
            self.assertFalse(self.client.get('/api/v1/telegram/customer/').data['configured'])
            self.assertEqual(self.client.post('/api/v1/telegram/customer/',{'action':'link'}).status_code,503)

    def test_attribution_never_grants_ownership(self):
        campaign=Campaign.objects.create(name='x',text='x',created_by=self.admin)
        d=self.delivery('campaign',campaign=campaign)
        response=self.client.get(f'/api/v1/telegram/visit/{d.tracking}/?next=https://evil.example')
        self.assertEqual(response.status_code,302)
        self.assertTrue(response['Location'].startswith('https://baharnaj.ir/book?'))
        from .services import attach_attribution
        from .models import Attribution
        attach_attribution(self.a,str(d.tracking),self.other)
        self.assertFalse(Attribution.objects.exists())
        attach_attribution(self.a,str(d.tracking),self.user)
        self.assertEqual(Attribution.objects.count(),1)

    def test_feedback_cannot_target_another_connection(self):
        from .views import bot_action
        d=self.delivery('feedback',appointment=self.a)
        # Unlinked actors receive a public linking route, never a mutation.
        bot_action({'actor':456,'chat_id':456,'operation':f'rate:{d.pk}:5'})
        self.assertFalse(Feedback.objects.exists())


    def test_points_expiry_preserves_newer_unspent_grant(self):
        from .services import expire_points, balance
        now=timezone.now()
        old=PointsEntry.objects.create(user=self.user, key='grant:old', delta=10, reason='old', expires_at=now-timedelta(days=1))
        PointsEntry.objects.create(user=self.user,key='spent:old',delta=-10,reason='spent before expiry')
        PointsEntry.objects.create(user=self.user,key='grant:new',delta=20,reason='new',expires_at=now+timedelta(days=30))
        expire_points(self.user,now); expire_points(self.user,now)
        self.assertEqual(balance(self.user),20)
        self.assertEqual(PointsEntry.objects.get(key=f'expire:{old.pk}').delta,0)

    def test_partial_refund_reverses_points_once(self):
        config=Config.solo();config.points_per_toman=100;config.save()
        self.a.status='completed';self.a.save()
        payment=Payment.objects.create(appointment=self.a,amount=1000,status='paid')
        reconcile_points(timezone.now())
        Refund.objects.create(payment=payment,amount=100,status='completed')
        reconcile_points(timezone.now());reconcile_points(timezone.now())
        from .services import balance
        self.assertEqual(balance(self.user),0)
        self.assertEqual(PointsEntry.objects.filter(key__startswith='reverse:').count(),1)

    def test_points_notifications_consolidate_without_losing_later_events(self):
        self.c.loyalty=True;self.c.save()
        PointsEntry.objects.create(user=self.user,key='grant:one',delta=10,reason='one')
        reconcile_points(timezone.now())
        PointsEntry.objects.create(user=self.user,key='grant:two',delta=20,reason='two')
        reconcile_points(timezone.now())
        d=Delivery.objects.get(kind='loyalty'); self.assertIn('30',d.text)
        d.status='accepted';d.save()
        PointsEntry.objects.create(user=self.user,key='grant:three',delta=5,reason='three')
        reconcile_points(timezone.now())
        self.assertEqual(Delivery.objects.filter(kind='loyalty').count(),2)

    def test_birthday_gift_and_date_edit_dedup(self):
        from .automation import reconcile_optional
        from .models import Benefit
        config=Config.solo();config.birthday_enabled=True
        rule=BenefitRule.objects.create(name='birthday',enabled=True,starts_at=timezone.now()-timedelta(days=1),ends_at=timezone.now()+timedelta(days=30),fixed=100)
        rule.services.add(self.service);config.birthday_gift=rule;config.save()
        today=timezone.localdate();self.c.birth_calendar='gregorian';self.c.birth_month=today.month;self.c.birth_day=today.day;self.c.birthday=True;self.c.save()
        reconcile_optional(timezone.now());reconcile_optional(timezone.now())
        self.assertEqual(Benefit.objects.count(),1);self.assertEqual(Delivery.objects.filter(kind='birthday').count(),1)
        self.c.birth_day=1;self.c.save();reconcile_optional(timezone.now())
        self.assertEqual(Benefit.objects.count(),1)

    def test_guest_bot_only_discloses_linked_appointment(self):
        from .views import bot_action
        self.c.connected=False;self.c.save()
        guest=Connection.objects.create(scope=f'booking:{self.a.pk}',user=self.user,appointment=self.a,telegram_user_id=123,chat_id=123,connected=True)
        hidden_service=Service.objects.create(name='Hidden',persian_name='خدمت خصوصی دیگر',category=self.category,duration=30,price=100)
        hidden=Appointment.objects.create(customer=self.profile,status='confirmed')
        AppointmentItem.objects.create(appointment=hidden,service=hidden_service,employee=self.employee,date=self.item.date,start_time=dt_time(17),end_time=dt_time(18),price_snapshot=100,duration_snapshot=30)
        response=bot_action({'actor':123,'chat_id':123,'operation':'appointments'})
        self.assertIn(self.service.persian_name,response['text']);self.assertNotIn(hidden_service.persian_name,response['text'])
        response=bot_action({'actor':123,'chat_id':123,'operation':'benefits'})
        self.assertNotIn('امتیاز ثبت‌شده شما',response['text'])

    def test_campaign_confirmation_revision_pause_and_unsubscribe(self):
        self.client.force_authenticate(self.admin)
        c=Campaign.objects.create(name='campaign',text='سلام {name}',created_by=self.admin)
        path=f'/api/v1/telegram/admin/campaigns/{c.pk}/'
        self.assertEqual(self.client.post(path+'schedule/',{'confirm':True,'recipient_count':2,'revision':1},format='json').status_code,400)
        response=self.client.post(path+'schedule/',{'confirm':True,'recipient_count':1,'revision':1},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(c.deliveries.count(),1)
        self.client.post(path+'control/',{'action':'paused'},format='json')
        d=c.deliveries.get(); self.assertEqual(eligibility(d,timezone.now()),'pause')
        changed=self.client.patch(path,{'text':'نسخه تازه'},format='json')
        self.assertEqual(changed.status_code,200);self.assertNotEqual(changed.data['id'],c.pk)
        c.refresh_from_db();self.assertEqual(c.text,'سلام {name}')
        self.client.post(path+'control/',{'action':'queued'},format='json')
        preferences(self.c,{'marketing':False},'test')
        transport=MockTransport();run_batch(transport,generate=False)
        d.refresh_from_db();self.assertEqual(d.status,'suppressed');self.assertEqual(transport.calls,[])

    def test_admin_test_send_requires_verified_self_recipient(self):
        import uuid
        self.client.force_authenticate(self.admin)
        campaign=Campaign.objects.create(name='test',text='hello',created_by=self.admin)
        path=f'/api/v1/telegram/admin/campaigns/{campaign.pk}/test/'
        self.assertEqual(self.client.post(path,{'confirm':True,'request_id':str(uuid.uuid4())},format='json').status_code,404)
        manager=Connection.objects.create(scope=f'account:{self.admin.pk}',user=self.admin,connected=True,reachable=True,chat_id=456,telegram_user_id=456,manager_reports=True)
        key=str(uuid.uuid4());payload={'confirm':True,'request_id':key,'customer':self.c.pk}
        self.assertEqual(self.client.post(path,payload,format='json').status_code,200)
        self.assertEqual(self.client.post(path,payload,format='json').status_code,200)
        self.assertEqual(Delivery.objects.filter(kind='test').count(),1)
        self.assertEqual(Delivery.objects.get(kind='test').connection,manager)
        self.admin.role='employee';self.admin.save()
        d=Delivery.objects.get(kind='test');self.assertEqual(eligibility(d,timezone.now()),'role_revoked')

    def test_worker_lease_and_missing_outbound_token(self):
        config=Config.solo();config.worker_lease=timezone.now()+timedelta(minutes=5);config.save()
        transport=MockTransport();self.assertEqual(run_batch(transport,generate=False),{'busy':True})
        self.assertEqual(transport.calls,[])
        config.worker_lease=None;config.save()
        d=self.delivery()
        with override_settings(TELEGRAM_DRY_RUN=False,TELEGRAM_BOT_TOKEN=''):
            self.assertEqual(run_batch(generate=False),{'configured':False})
        d.refresh_from_db();self.assertEqual(d.status,'queued')

    def test_service_rule_pause_and_actual_completion_preview(self):
        from .models import ServiceRule
        from .automation import reconcile_optional
        self.item.date=timezone.localdate()-timedelta(days=90);self.item.completion_status='completed';self.item.save()
        self.a.status='completed';self.a.save()
        rule=ServiceRule.objects.create(service=self.service,enabled=True,interval_days=14)
        reconcile_optional(timezone.now())
        d=Delivery.objects.get(kind='maintenance')
        self.assertGreater(d.scheduled_at,timezone.now()+timedelta(days=13))
        rule.enabled=False;rule.save();self.assertEqual(eligibility(d,timezone.now()),'automation_disabled')

    def test_receipt_expiry_and_invalid_coupon_are_rejected(self):
        from .models import Receipt
        receipt=issue_receipt(self.a)
        Receipt.objects.filter(digest=digest(receipt)).update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.client.post('/api/v1/telegram/customer/',{'action':'link','receipt':receipt},format='json').status_code,403)
        self.client.force_authenticate(self.user)
        result=self.client.post('/api/v1/telegram/customer/',{'action':'reserve','appointment':self.a.pk,'code':'not-a-uuid'},format='json')
        self.assertEqual(result.status_code,400)

    def test_booking_commits_with_telegram_disabled_or_transport_failure(self):
        from salon.models import EmployeeService, WorkingSchedule
        EmployeeService.objects.create(service=self.service,employee=self.employee)
        day=timezone.localdate()+timedelta(days=7)
        WorkingSchedule.objects.create(employee=self.employee,weekday=day.weekday(),start_time=dt_time(8),end_time=dt_time(20))
        for hour, enabled in [(10,False),(12,True)]:
            with override_settings(TELEGRAM_ENABLED=enabled), patch('telegram_crm.transport.TelegramTransport.send',side_effect=TimeoutError) as send:
                hold=self.client.post('/api/v1/booking-holds/',{'items':[{'service':self.service.pk,'employee':self.employee.pk,'date':str(day),'start_time':f'{hour}:00','end_time':f'{hour+1}:00'}]},format='json')
                self.assertEqual(hold.status_code,201,hold.data)
                data={'hold_token':hold.data['token'],'customer_name':'Guest','customer_phone':'09123456789','items':[{'service':self.service.pk,'employee':self.employee.pk,'date':str(day),'start_time':f'{hour}:00','end_time':f'{hour+1}:00'}]}
                response=self.client.post('/api/v1/appointments/',data,format='json')
                self.assertEqual(response.status_code,201,response.data)
                self.assertIn('telegram_receipt',response.data)
                self.assertEqual(len(response.data['items']),1)
                send.assert_not_called()

    def test_optional_receipt_failure_does_not_roll_back_booking(self):
        from salon.models import EmployeeService, WorkingSchedule
        EmployeeService.objects.create(service=self.service,employee=self.employee)
        day=timezone.localdate()+timedelta(days=8)
        WorkingSchedule.objects.create(employee=self.employee,weekday=day.weekday(),start_time=dt_time(8),end_time=dt_time(20))
        item={'service':self.service.pk,'employee':self.employee.pk,'date':str(day),'start_time':'10:00','end_time':'11:00'}
        hold=self.client.post('/api/v1/booking-holds/',{'items':[item]},format='json')
        self.assertEqual(hold.status_code,201,hold.data)
        with patch('telegram_crm.services.issue_receipt',side_effect=RuntimeError('optional failure')):
            response=self.client.post('/api/v1/appointments/',{'items':[item],'hold_token':hold.data['token'],'customer_name':'Guest','customer_phone':'09123456789'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertIsNone(response.data['telegram_receipt'])
        self.assertTrue(Appointment.objects.filter(pk=response.data['id']).exists())

    def test_known_connection_failure_is_retryable_and_malformed_reply_unknown(self):
        import socket
        from urllib.error import URLError
        with patch('telegram_crm.transport.urlopen',side_effect=URLError(socket.gaierror('DNS unavailable'))):
            self.assertEqual(TelegramTransport().send(123,'text',[])['status'],'queued')
        from unittest.mock import MagicMock
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"ok":true,"result":{}}'
        with patch('telegram_crm.transport.urlopen',return_value=response):
            self.assertEqual(TelegramTransport().send(123,'text',[])['status'],'unknown')

    def test_disconnect_remains_available_when_integration_disabled(self):
        self.client.force_authenticate(self.user)
        with override_settings(TELEGRAM_ENABLED=False):
            response=self.client.post('/api/v1/telegram/customer/',{'action':'disconnect'},format='json')
        self.assertEqual(response.status_code,200)
        self.c.refresh_from_db();self.assertFalse(self.c.connected)

    def test_reschedule_back_regenerates_reminders_and_notes_do_not_notify(self):
        reconcile_appointments(timezone.now())
        count=Delivery.objects.count()
        self.a.notes='Internal staff note';self.a.save()
        reconcile_appointments(timezone.now());self.assertEqual(Delivery.objects.count(),count)
        original=self.item.start_time
        self.item.start_time=dt_time(16);self.item.save();reconcile_appointments(timezone.now())
        self.item.start_time=original;self.item.save();reconcile_appointments(timezone.now())
        latest=Delivery.objects.filter(kind='status').latest('pk')
        self.assertEqual(latest.metadata['event'],'rescheduled')
        self.assertEqual(latest.metadata['revision'],3)
        self.assertEqual(Delivery.objects.filter(kind='reminder',status='queued').count(),2)

    def test_admin_configuration_resource_contracts(self):
        self.client.force_authenticate(self.admin)
        config=self.client.patch('/api/v1/telegram/admin/config/',{'status_events':['confirmed'],'reminder_hours':[24,3],'marketing_start':10,'marketing_end':20},format='json')
        self.assertEqual(config.status_code,200,config.data)
        rule=self.client.post('/api/v1/telegram/admin/service-rules/',{'service':self.service.pk,'enabled':True,'interval_days':14,'aftercare':'متن تأییدشده','feedback':True},format='json')
        self.assertEqual(rule.status_code,201,rule.data)
        segment=self.client.post('/api/v1/telegram/admin/segments/',{'name':'رنگ مو','filters':{'recipe':'hair_color','service_ids':[self.service.pk]}},format='json')
        self.assertEqual(segment.status_code,201,segment.data)
        self.assertEqual(self.client.get('/api/v1/telegram/admin/automation-preview/').status_code,200)
        self.assertEqual(self.client.get('/api/v1/telegram/admin/customers/?search=گلسار').status_code,200)
        templates=self.client.get('/api/v1/telegram/admin/templates/').data['results']
        t=templates[0]
        response=self.client.patch(f'/api/v1/telegram/admin/templates/{t["id"]}/',{'text':'متن تازه {name}'},format='json')
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['version'],2)

    def test_future_offer_schedule_and_pause_recheck(self):
        from .models import Benefit
        self.client.force_authenticate(self.admin)
        future=timezone.now()+timedelta(days=2)
        rule=BenefitRule.objects.create(name='future',enabled=True,starts_at=future-timedelta(hours=1),ends_at=future+timedelta(days=2),percent=20)
        rule.services.add(self.service)
        campaign=Campaign.objects.create(name='future',text='پیشنهاد',created_by=self.admin,offer=rule,terms='۲۰ درصد برای رنگ مو',scheduled_at=future)
        response=self.client.post(f'/api/v1/telegram/admin/campaigns/{campaign.pk}/schedule/',{'confirm':True,'recipient_count':1,'revision':1},format='json')
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(Benefit.objects.count(),1)
        rule.enabled=False;rule.save();campaign.refresh_from_db()
        self.assertEqual(eligibility(campaign.deliveries.get(),future),'offer_inactive')

    def test_attribution_window_starts_at_first_visit_and_cannot_be_refreshed(self):
        from .services import attach_attribution
        from .models import Attribution
        campaign=Campaign.objects.create(name='window', text='text', created_by=self.admin)
        d=self.delivery('campaign', campaign=campaign)
        Delivery.objects.filter(pk=d.pk).update(created_at=timezone.now()-timedelta(days=30))
        self.client.get(f'/api/v1/telegram/visit/{d.tracking}/')
        attach_attribution(self.a, str(d.tracking), self.user)
        self.assertTrue(Attribution.objects.filter(appointment=self.a).exists())
        Attribution.objects.all().delete()
        old=timezone.now()-timedelta(days=8)
        Delivery.objects.filter(pk=d.pk).update(first_visited_at=old)
        self.client.get(f'/api/v1/telegram/visit/{d.tracking}/')
        d.refresh_from_db()
        self.assertEqual(d.first_visited_at, old)
        attach_attribution(self.a, str(d.tracking), self.user)
        self.assertFalse(Attribution.objects.exists())
