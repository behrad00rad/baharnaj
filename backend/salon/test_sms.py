from datetime import datetime, time, timedelta
from unittest.mock import patch
from django.core import signing
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from salon.models import User, CustomerProfile, Service, ServiceCategory, EmployeeProfile, Appointment, AppointmentItem, Payment, Refund
from salon.sms.models import SMSCampaign, SMSAutomation, SMSDelivery, SMSAttempt
from salon.sms.audience import audience, customer_data
from salon.sms.phone import normalize_phone
from salon.sms.providers import SMSProvider, SendResult, Rejected, ProviderUnavailable, get_provider
from salon.sms.service import configuration, campaign_preview, confirm_campaign, deliver_batch, set_consent, campaign_report
from salon.sms.tasks import run_automations, run_management
from salon.sms.templates import optout_token, render, sms_size


class DevelopmentProvider(SMSProvider):
    development_only = True
    def send(self, **kwargs):
        return SendResult('development-only')


class TransportStub:
    development_only = False
    def __init__(self, results=None):
        self.results = iter(results or [])
        self.calls = []
    def send(self, **kwargs):
        self.calls.append(kwargs)
        result = next(self.results, SendResult(str(len(self.calls))))
        if isinstance(result, Exception):
            raise result
        return result


@override_settings(SMS_PUBLIC_BASE_URL='https://example.test')
class SMSCRMTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='sms-admin', role='admin')
        self.employee_user = User.objects.create_user(username='sms-employee', role='employee')
        self.employee = EmployeeProfile.objects.create(user=self.employee_user)
        self.customer = self.customer_for('09111111111', 'مینا')
        self.second = self.customer_for('09222222222', 'سارا')
        self.category = ServiceCategory.objects.create(name='مو')
        self.service = Service.objects.create(name='Hair', persian_name='رنگ مو', category=self.category, price=1000, duration=60)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        configuration()
        self.stub = TransportStub()
        self.provider_patch = patch('salon.sms.service.get_provider', return_value=self.stub)
        self.provider_patch.start()
        self.addCleanup(self.provider_patch.stop)

    def customer_for(self, phone, name, allowed=True):
        user = User.objects.create_user(username=phone, phone=phone, first_name=name)
        return CustomerProfile.objects.create(user=user, marketing_sms_allowed=allowed)

    def visit(self, customer=None, days=100, completed=True):
        appointment = Appointment.objects.create(customer=customer or self.customer, status='completed' if completed else 'confirmed')
        item = AppointmentItem.objects.create(appointment=appointment, service=self.service, employee=self.employee,
            date=timezone.localdate()-timedelta(days=days), start_time=time(9), end_time=time(10), completion_status='completed' if completed else 'pending')
        return appointment, item

    def campaign(self, **kwargs):
        return SMSCampaign.objects.create(name='بازگشت', message='سلام {{first_name}}، {{salon_name}}', created_by=self.admin, **kwargs)

    def confirm(self, campaign, scheduled=None):
        _, fingerprint = campaign_preview(campaign)
        return confirm_campaign(campaign.pk, signing.dumps(fingerprint, salt='sms-preview'), scheduled)

    def test_phone_normalization(self):
        for number in ['09111111111','+989111111111','989111111111','00989111111111','۰۹۱۱۱۱۱۱۱۱۱','+98 911-111-1111']:
            self.assertEqual(normalize_phone(number),'09111111111')
        for number in ('0911','01133333333','phone',''):
            with self.assertRaises(ValueError): normalize_phone(number)

    def test_segmentation_uses_completed_service_and_inactivity(self):
        self.visit()
        self.visit(self.second, days=2)
        never = self.customer_for('09333333333','بدون مراجعه')
        self.visit(never, days=120, completed=False)
        rows = audience({'service':self.service.pk,'category':self.category.pk,'employee':self.employee.pk,'inactive_days':90})
        self.assertEqual([r['id'] for r in rows],[self.customer.pk])
        self.assertEqual(audience({'inactive_days':180}),[])
        self.assertEqual(audience({'visited_after':timezone.localdate().isoformat()}),[])

    def test_spending_does_not_multiply_by_items_and_deducts_refunds(self):
        appointment,item=self.visit()
        AppointmentItem.objects.create(appointment=appointment,service=self.service,employee=self.employee,date=item.date,start_time=time(11),end_time=time(12),completion_status='completed')
        payment=Payment.objects.create(appointment=appointment,amount=1000,status='paid',paid_at=timezone.now())
        Payment.objects.create(appointment=appointment,amount=9000,status='pending')
        Refund.objects.create(payment=payment,amount=200,status='completed')
        row=next(r for r in customer_data() if r['id']==self.customer.pk)
        self.assertEqual(row['total_confirmed_spend'],800)
        self.assertEqual(row['completed_appointments'],1)
        self.assertEqual(audience({'min_spend':801}),[])
        self.assertEqual(len(audience({'min_spend':800,'min_visits':1})),1)

    def test_optout_and_duplicate_legacy_phone_block_audience(self):
        duplicate = self.customer_for('+989111111111','تکراری',allowed=False)
        self.assertEqual([r['id'] for r in audience({})],[self.second.pk])
        duplicate.delete()
        self.assertEqual([r['id'] for r in audience({})],[self.second.pk])
        self.assertFalse(CustomerProfile.objects.create(user=User.objects.create_user(username='new')).marketing_sms_allowed)

    def test_campaign_api_preview_confirmation_and_deduplication(self):
        response=self.client.post('/api/v1/admin/sms/campaigns/',{'name':'کمپین','message':'سلام {{first_name}}','segment':{}},format='json')
        self.assertEqual(response.status_code,201,response.data)
        pk=response.data['id']
        preview=self.client.post(f'/api/v1/admin/sms/campaigns/{pk}/preview/')
        self.assertEqual(preview.data['recipient_count'],2)
        self.assertIn('لغو پیامک',preview.data['audience'][0]['message'])
        for _ in range(2):
            response=self.client.post(f'/api/v1/admin/sms/campaigns/{pk}/confirm/',{'confirmation_token':preview.data['confirmation_token']})
            self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(SMSDelivery.objects.count(),2)
        self.assertEqual(self.client.patch(f'/api/v1/admin/sms/campaigns/{pk}/',{'message':'دیگر'}).status_code,400)
        deliver_batch();deliver_batch()
        self.assertEqual(len(self.stub.calls),2)
        self.assertEqual(SMSAttempt.objects.count(),2)

    def test_audience_changes_invalidate_confirmation(self):
        campaign=self.campaign()
        _,fingerprint=campaign_preview(campaign)
        set_consent(self.customer,False,self.admin,'درخواست مشتری')
        with self.assertRaises(ValueError):
            confirm_campaign(campaign.pk,signing.dumps(fingerprint,salt='sms-preview'))
        self.assertFalse(SMSDelivery.objects.exists())

    def test_scheduled_campaign_waits_and_keeps_audience_snapshot(self):
        c=self.confirm(self.campaign(),timezone.now()+timedelta(hours=2))
        self.customer_for('09333333333','جدید')
        deliver_batch()
        self.assertEqual(len(self.stub.calls),0)
        SMSCampaign.objects.filter(pk=c.pk).update(scheduled_at=timezone.now()-timedelta(seconds=1))
        deliver_batch()
        self.assertEqual(len(self.stub.calls),2)

    def test_optout_rechecked_after_queueing(self):
        c=self.confirm(self.campaign())
        CustomerProfile.objects.filter(pk=self.customer.pk).update(marketing_sms_allowed=False)
        deliver_batch()
        self.assertEqual(len(self.stub.calls),1)
        self.assertEqual(c.deliveries.get(customer=self.customer).status,'cancelled')

    def test_partial_failure_and_unknown_are_not_retried(self):
        self.customer_for('09333333333','سوم')
        self.stub.results=iter([SendResult('ok'),Rejected('secret must not leak'),TimeoutError('secret')])
        c=self.confirm(self.campaign())
        deliver_batch();deliver_batch()
        report=campaign_report(c)
        self.assertEqual((report['sent'],report['failed'],report['unknown'],report['delivered']),(1,1,1,0))
        self.assertEqual(len(self.stub.calls),3)
        self.assertFalse(SMSDelivery.objects.filter(failure_reason__contains='secret').exists())

    def test_missing_provider_leaves_queue_pending(self):
        self.confirm(self.campaign())
        with patch('salon.sms.service.get_provider',side_effect=ProviderUnavailable('not configured')):
            with self.assertRaises(ProviderUnavailable): deliver_batch()
        self.assertEqual(SMSDelivery.objects.filter(status='queued').count(),2)
        self.assertFalse(SMSAttempt.objects.exists())

    @override_settings(SMS_PROVIDER='', SMS_API_KEY='', SMS_SENDER_NUMBER='')
    def test_provider_disabled_and_development_guard(self):
        with self.assertRaises(ProviderUnavailable):get_provider()
        with override_settings(SMS_PROVIDER='salon.test_sms.DevelopmentProvider',DEBUG=False,SMS_ALLOW_TEST_PROVIDER=True):
            with self.assertRaises(ProviderUnavailable):get_provider()
        with override_settings(SMS_PROVIDER='salon.test_sms.DevelopmentProvider',DEBUG=True,SMS_ALLOW_TEST_PROVIDER=True):
            self.assertTrue(get_provider().development_only)

    def test_development_results_cannot_claim_real_delivery(self):
        self.confirm(self.campaign())
        self.stub.development_only=True
        deliver_batch()
        self.assertFalse(SMSDelivery.objects.filter(status__in=('sent','delivered')).exists())
        self.assertTrue(all('آزمایشی' in d.failure_reason for d in SMSDelivery.objects.all()))

    def test_template_validation_and_character_count(self):
        for text in ('سلام {{unknown}}','{{service_name}}','{{broken',''):
            response=self.client.post('/api/v1/admin/sms/campaigns/',{'name':'خطا','message':text,'segment':{}},format='json')
            self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(sms_size('س'*70)['parts'],1)
        self.assertEqual(sms_size('س'*71)['parts'],2)
        self.assertEqual(sms_size('a'*160)['parts'],1)
        self.assertEqual(sms_size('^'*81)['parts'],2)
        with self.assertRaises(ValueError):render('{{first_name}}',{'first_name':'{{unsafe}}'})

    def test_test_send_queued_separately(self):
        c=self.campaign()
        with patch('salon.sms.api.get_provider',return_value=self.stub):
            response=self.client.post(f'/api/v1/admin/sms/campaigns/{c.pk}/test-send/',{'phone':'+989111111111'})
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['status'],'queued')
        self.assertEqual(response.data['kind'],'test')
        self.assertEqual(c.deliveries.count(),0)

    def test_birthday_once_per_year_with_real_date(self):
        today=timezone.localdate()
        self.customer.birth_date=today.replace(year=today.year-25)
        self.customer.save()
        rule=SMSAutomation.objects.create(name='تولد',kind='birthday',enabled=True,message='تولد مبارک {{first_name}}')
        run_automations();run_automations()
        self.assertEqual(SMSDelivery.objects.filter(automation=rule).count(),1)
        next_year=timezone.now().replace(year=timezone.now().year+1)
        run_automations(next_year)
        self.assertEqual(SMSDelivery.objects.filter(automation=rule).count(),2)

    def test_service_reminder_configurable_timing_and_cycle_dedupe(self):
        self.visit(days=28)
        rule=SMSAutomation.objects.create(name='ترمیم',kind='service_reminder',enabled=True,message='ترمیم {{service_name}}',service=self.service,interval_days=29)
        run_automations()
        self.assertFalse(SMSDelivery.objects.exists())
        rule.interval_days=28;rule.save()
        run_automations();run_automations()
        self.assertEqual(SMSDelivery.objects.count(),1)
        self.visit(days=1)
        run_automations()
        self.assertEqual(SMSDelivery.objects.count(),1)

    def test_inactivity_once_per_last_visit(self):
        self.visit(days=100)
        SMSAutomation.objects.create(name='بازگشت',kind='inactive',enabled=True,message='سلام',interval_days=90)
        run_automations();run_automations()
        self.assertEqual(SMSDelivery.objects.count(),1)

    def test_appointment_reminders_ignore_marketing_consent_but_not_rescheduling(self):
        self.customer.marketing_sms_allowed=False;self.customer.save()
        appointment,item=self.visit(days=-1,completed=False)
        rule=SMSAutomation.objects.create(name='نوبت',kind='appointment_reminder',enabled=True,message='یادآوری {{service_name}}',hours_before=48)
        run_automations();run_automations()
        self.assertEqual(SMSDelivery.objects.count(),1)
        item.start_time=time(12);item.end_time=time(13);item.save()
        deliver_batch()
        self.assertEqual(SMSDelivery.objects.get().status,'cancelled')
        run_automations();deliver_batch()
        self.assertEqual(SMSDelivery.objects.filter(status='sent').count(),1)

    def test_daily_and_campaign_management_summary_deduplication(self):
        config=configuration();config.manager_phone='09999999999';config.daily_summary_enabled=True;config.daily_summary_hour=0;config.campaign_summary_enabled=True;config.save()
        appointment,item=self.visit(days=0)
        Payment.objects.create(appointment=appointment,amount=1234,status='paid',paid_at=timezone.now())
        self.confirm(self.campaign());deliver_batch()
        run_management();run_management()
        rows=SMSDelivery.objects.filter(kind='management')
        self.assertEqual(rows.count(),2)
        summary=rows.get(dedupe_key__startswith='manager:daily:')
        self.assertIn('1,234',summary.message)
        self.assertNotIn(self.customer.user.phone,summary.message)

    def test_optout_link_and_admin_cannot_bypass(self):
        token=optout_token(self.customer)
        self.client.force_authenticate(None)
        response=self.client.post('/api/v1/sms/opt-out/',{'token':token})
        self.assertEqual(response.status_code,200,response.data)
        self.client.force_authenticate(self.admin)
        response=self.client.patch(f'/api/v1/admin/sms/customers/{self.customer.pk}/',{'marketing_sms_allowed':True,'evidence':'ادعا'})
        self.assertEqual(response.status_code,400)
        self.client.force_authenticate(self.customer.user)
        response=self.client.patch('/api/v1/customer/sms-preferences/',{'marketing_sms_allowed':True})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.customer.sms_consent_events.count(),2)

    def test_admin_only_endpoints_and_history_readonly(self):
        c=self.confirm(self.campaign())
        pk=c.deliveries.first().pk
        for user in (self.employee_user,self.customer.user,None):
            self.client.force_authenticate(user)
            for url in ('settings/','campaigns/','automations/','deliveries/','customers/'):
                self.assertIn(self.client.get('/api/v1/admin/sms/'+url).status_code,(401,403))
            self.assertIn(self.client.post('/api/v1/admin/sms/audience/',{}).status_code,(401,403))
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(f'/api/v1/admin/sms/deliveries/{pk}/',{'status':'delivered'}).status_code,405)

    def test_audience_preview_and_invalid_filters(self):
        self.visit()
        response=self.client.post('/api/v1/admin/sms/audience/',{'service':self.service.pk,'inactive_days':90},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['count'],1)
        for data in ({'location':'تهران'},{'inactive_days':-1},{'service':99999}):
            self.assertEqual(self.client.post('/api/v1/admin/sms/audience/',data,format='json').status_code,400)

    def test_customer_history_and_birthday_validation(self):
        self.visit();self.confirm(self.campaign())
        response=self.client.get(f'/api/v1/admin/sms/customers/{self.customer.pk}/')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(len(response.data['sms_history']),1)
        self.assertEqual(response.data['completed_appointments'],1)
        response=self.client.patch(f'/api/v1/admin/sms/customers/{self.customer.pk}/',{'birth_date':str(timezone.localdate()+timedelta(days=1))})
        self.assertEqual(response.status_code,400)

    def test_transactional_lifecycle_events_queue_after_commit_and_dedupe(self):
        from salon.sms.events import schedule_event, queue_event
        appointment,item=self.visit(days=-2,completed=False)
        self.customer.marketing_sms_allowed=False;self.customer.save()
        for kind in ('appointment_created','appointment_confirmed','appointment_changed','appointment_cancelled'):
            SMSAutomation.objects.create(name=kind,kind=kind,enabled=True,message='نوبت {{service_name}} {{appointment_date}} {{appointment_time}}')
        with self.captureOnCommitCallbacks(execute=True):
            schedule_event(appointment,'appointment_created')
            self.assertFalse(SMSDelivery.objects.exists())
        queue_event(appointment.pk,'appointment_created')
        self.assertEqual(SMSDelivery.objects.count(),1)
        deliver_batch()
        self.assertEqual(SMSDelivery.objects.get().status,'sent')
        queue_event(appointment.pk,'appointment_confirmed');deliver_batch()
        item.start_time=time(12);item.end_time=time(13);item.save()
        queue_event(appointment.pk,'appointment_changed');deliver_batch()
        appointment.set_status('cancelled')
        queue_event(appointment.pk,'appointment_cancelled');deliver_batch()
        self.assertEqual(SMSDelivery.objects.filter(status='sent').count(),4)
        self.assertTrue(all(d.kind=='transactional' for d in SMSDelivery.objects.all()))

    def test_sms_enqueue_failure_cannot_rollback_booking(self):
        from salon.sms.events import schedule_event
        appointment,item=self.visit(days=-2,completed=False)
        with patch('salon.sms.events.queue_event',side_effect=RuntimeError('test failure')):
            with self.assertLogs('salon.sms.events',level='ERROR'):
                with self.captureOnCommitCallbacks(execute=True):
                    appointment.notes='committed booking'
                    appointment.save()
                    schedule_event(appointment,'appointment_created')
        appointment.refresh_from_db()
        self.assertEqual(appointment.notes,'committed booking')

    def test_stale_claim_marked_unknown_without_resending(self):
        self.confirm(self.campaign())
        d=SMSDelivery.objects.first()
        SMSDelivery.objects.filter(pk=d.pk).update(status='sending',claimed_at=timezone.now()-timedelta(minutes=15))
        attempt=SMSAttempt.objects.create(delivery=d)
        deliver_batch()
        d.refresh_from_db();attempt.refresh_from_db()
        self.assertEqual(d.status,'unknown')
        self.assertEqual(attempt.status,'unknown')
        self.assertEqual(len(self.stub.calls),1)

    def test_admin_booking_reuses_international_phone_customer(self):
        from salon.models import EmployeeService, WorkingSchedule
        day=timezone.localdate()+timedelta(days=5)
        EmployeeService.objects.create(employee=self.employee,service=self.service)
        WorkingSchedule.objects.create(employee=self.employee,weekday=day.weekday(),start_time=time(8),end_time=time(18))
        response=self.client.post('/api/v1/admin/appointments/',{'customer_name':'مینا','customer_phone':'+989111111111','items':[{'service':self.service.pk,'employee':self.employee.pk,'date':day.isoformat(),'start_time':'09:00','end_time':'10:00'}]},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(Appointment.objects.get(pk=response.data['id']).customer_id,self.customer.pk)
        self.assertEqual(CustomerProfile.objects.count(),2)
        self.client.force_authenticate(None)
        response=self.client.post('/api/v1/customer/booking/',{'phone':'989111111111','confirmation_code':response.data['confirmation_code']})
        self.assertEqual(response.status_code,200,response.data)
