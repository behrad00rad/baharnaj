from datetime import date, time, timedelta
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from .models import (Service, ServiceCategory, User, EmployeeProfile, EmployeeService, WorkingSchedule,
                     CustomerProfile, Appointment, AppointmentItem, Payment, EmployeeCommission)
from .serializers import ServiceAdminSerializer, AppointmentItemSerializer
from .views import _allocate_amount

class FlexiblePricingTests(TestCase):
    def setUp(self):
        self.category = ServiceCategory.objects.create(name='Hair')
        self.admin = User.objects.create_user(username='pricing-admin', role='admin')
        self.staff = User.objects.create_user(username='pricing-staff', role='employee')
        self.other = User.objects.create_user(username='pricing-other', role='employee')
        self.employee = EmployeeProfile.objects.create(user=self.staff, commission_rate=Decimal('20'))
        EmployeeProfile.objects.create(user=self.other)
        customer_user = User.objects.create_user(username='pricing-customer', phone='09111111111')
        self.customer = CustomerProfile.objects.create(user=customer_user)
        self.day = date.today() + timedelta(days=7)
        WorkingSchedule.objects.create(employee=self.employee, weekday=self.day.weekday(), start_time=time(8), end_time=time(20))
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def service(self, **values):
        service = Service.objects.create(category=self.category, name=f'Service-{Service.objects.count()}', persian_name='رنگ مو', price=450, duration=60, **values)
        EmployeeService.objects.create(employee=self.employee, service=service)
        return service

    def appointment(self, service):
        appointment = Appointment.objects.create(customer=self.customer)
        item = AppointmentItem.objects.create(appointment=appointment, service=service, employee=self.employee,
            date=self.day, start_time=time(9), end_time=time(10))
        return appointment, item

    def finalize(self, item, amount=3850, role='admin'):
        return self.client.post(f'/api/v1/{role}/appointment-items/{item.pk}/final-price/', {'final_price':amount},format='json')

    def test_all_catalog_modes_and_validation(self):
        for mode, fields in [('FIXED', {'price':450}), ('STARTING_FROM', {'minimum_price':2000}),
                             ('RANGE', {'minimum_price':1500,'maximum_price':3000}), ('CONSULTATION', {}),
                             ('VARIABLE', {'minimum_price':2000,'pricing_note':'بر اساس قد و حجم مو'})]:
            payload={'category':self.category.pk,'name':mode,'persian_name':mode,'duration':60,'pricing_type':mode,**fields}
            response=self.client.post('/api/v1/admin/services/',payload,format='json')
            self.assertEqual(response.status_code,201,response.data)
            self.assertEqual(response.data['pricing_type'],mode)
            self.assertEqual(self.client.get(f"/api/v1/services/{response.data['slug']}/").data['pricing_type'],mode)
        for fields in [{'pricing_type':'FIXED','price':-1},{'pricing_type':'RANGE','minimum_price':3000,'maximum_price':2000},
                       {'pricing_type':'STARTING_FROM'}, {'pricing_type':'VARIABLE','pricing_note':''}]:
            serializer=ServiceAdminSerializer(data={'category':self.category.pk,'name':'bad','persian_name':'bad','duration':60,**fields})
            self.assertFalse(serializer.is_valid())

    def test_service_edit_preserves_slug_and_old_snapshots(self):
        service=self.service()
        appointment,item=self.appointment(service)
        AppointmentItem.objects.filter(pk=item.pk).update(catalog_pricing_snapshot={})
        response=self.client.patch(f'/api/v1/admin/services/{service.pk}/', {'pricing_type':'CONSULTATION','price':9999})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['slug'],service.slug)
        item.refresh_from_db()
        self.assertEqual(item.price_snapshot,450)
        self.assertEqual(item.effective_price,450)
        self.assertFalse(appointment.has_unresolved_prices)
        self.assertEqual(appointment.appointment_total,450)

    def test_mixed_total_never_counts_estimates(self):
        appointment,fixed=self.appointment(self.service())
        variable=self.service(pricing_type='STARTING_FROM',minimum_price=2000)
        item=AppointmentItem.objects.create(appointment=appointment,service=variable,employee=self.employee,date=self.day,start_time=time(11),end_time=time(12))
        self.assertTrue(appointment.has_unresolved_prices)
        self.assertEqual(appointment.appointment_total,450)
        self.assertEqual(item.price_snapshot,2000)
        self.assertEqual(item.effective_price,0)
        self.assertEqual(item.price_status,'estimated')
        self.assertEqual(self.finalize(item).status_code,200)
        self.assertEqual(appointment.appointment_total,4300)
        self.assertFalse(appointment.has_unresolved_prices)
        item.refresh_from_db()
        self.assertEqual(item.price_snapshot,2000)
        self.assertEqual(_allocate_amount([fixed,item],4300),{fixed.pk:450,item.pk:3850})

    def test_final_price_permissions_and_validation(self):
        appointment,item=self.appointment(self.service(pricing_type='CONSULTATION'))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.finalize(item,role='employee').status_code,404)
        self.client.force_authenticate(self.customer.user)
        self.assertEqual(self.finalize(item).status_code,403)
        self.client.force_authenticate(self.staff)
        for amount in [-1,'bad',None,1.5]:
            self.assertEqual(self.finalize(item,amount,role='employee').status_code,400)
        self.assertEqual(self.finalize(item,0,role='employee').status_code,200)
        item.refresh_from_db()
        self.assertTrue(item.is_price_final)
        self.assertEqual(item.effective_price,0)
        self.assertEqual(item.updated_by,self.staff)

    def test_customer_cannot_inject_price_via_item_serializer(self):
        serializer=AppointmentItemSerializer()
        for field in ['final_price','price_snapshot','catalog_pricing_snapshot']:
            self.assertTrue(serializer.fields[field].read_only)

    def test_unresolved_payments_and_confirmation_are_rejected(self):
        appointment,item=self.appointment(self.service(pricing_type='RANGE',minimum_price=1500,maximum_price=3000))
        self.assertEqual(self.client.post('/api/v1/admin/payments/', {'appointment':appointment.pk,'amount':100,'payment_method':'cash'}).status_code,400)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(f'/api/v1/employee/appointments/{appointment.pk}/payments/', {'amount':100,'payment_method':'cash'}).status_code,400)
        self.client.force_authenticate(self.admin)
        pending=Payment.objects.create(appointment=appointment,amount=100,status='pending')
        self.assertEqual(self.client.post(f'/api/v1/admin/payments/{pending.pk}/confirm/').status_code,400)
        pending.refresh_from_db();self.assertEqual(pending.status,'pending')
        self.assertEqual(EmployeeCommission.objects.count(),0)

    def test_actual_final_price_drives_partial_payments_and_commissions(self):
        appointment,item=self.appointment(self.service(pricing_type='VARIABLE',minimum_price=2000,pricing_note='پس از بررسی مو'))
        self.assertEqual(self.finalize(item).status_code,200)
        item.refresh_from_db()
        item.set_completion_status('completed',changed_by=self.staff)
        self.assertFalse(EmployeeCommission.objects.filter(appointment_item=item).exists())
        for amount in [1000,2850]:
            response=self.client.post('/api/v1/admin/payments/',{'appointment':appointment.pk,'amount':amount,'payment_method':'cash'})
            self.assertEqual(response.status_code,201,response.data)
            if amount==1000:
                self.assertEqual(appointment.payment_status,'partially_paid')
                self.assertEqual(appointment.remaining_total,2850)
        commission=EmployeeCommission.objects.get(appointment_item=item)
        self.assertEqual(commission.base_amount,3850)
        self.assertEqual(commission.commission_amount,770)
        self.assertEqual(appointment.payment_status,'paid')
        revenue=self.client.get('/api/v1/admin/revenue/',{'period':'custom','start_date':date.today().isoformat(),'end_date':self.day.isoformat()})
        self.assertEqual(revenue.status_code,200,revenue.data)
        self.assertEqual(revenue.data['received'],3850)
        self.assertEqual(revenue.data['service_revenue'],3850)
        self.assertEqual(revenue.data['commission_total'],770)
        self.assertEqual(self.finalize(item,4000).status_code,400)

    def test_employee_report_confirmation_generates_actual_commission(self):
        appointment,item=self.appointment(self.service(pricing_type='CONSULTATION'))
        self.finalize(item,1000);item.refresh_from_db();item.set_completion_status('completed',changed_by=self.staff)
        self.client.force_authenticate(self.staff)
        report=self.client.post(f'/api/v1/employee/appointments/{appointment.pk}/payments/',{'amount':1000,'payment_method':'cash'})
        self.assertEqual(report.status_code,201,report.data)
        self.assertFalse(EmployeeCommission.objects.filter(appointment_item=item).exists())
        self.client.force_authenticate(self.admin)
        response=self.client.post(f"/api/v1/admin/payments/{report.data['id']}/confirm/")
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(EmployeeCommission.objects.get(appointment_item=item).base_amount,1000)

    def test_admin_booking_bulk_create_captures_variable_catalog(self):
        service=self.service(pricing_type='STARTING_FROM',minimum_price=2000)
        response=self.client.post('/api/v1/admin/appointments/',{'customer':self.customer.pk,'items':[{'service':service.pk,'employee':self.employee.pk,'date':self.day.isoformat(),'start_time':'09:00','end_time':'10:00'}]},format='json')
        self.assertEqual(response.status_code,201,response.data)
        item=AppointmentItem.objects.get(appointment_id=response.data['id'])
        self.assertEqual(item.pricing_type,'STARTING_FROM')
        self.assertFalse(item.is_price_final)
        self.assertEqual(response.data['appointment_total'],0)
        self.assertTrue(response.data['has_unresolved_prices'])

    def test_employee_bulk_booking_and_catalog_edits_do_not_finalize_price(self):
        service=self.service(pricing_type='VARIABLE',pricing_note='پس از بررسی')
        self.client.force_authenticate(self.staff)
        response=self.client.post('/api/v1/employee/appointments/create/',{'customer':self.customer.pk,'services':[service.pk],'date':self.day.isoformat(),'start_time':'11:00'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        item=AppointmentItem.objects.get(appointment_id=response.data['id'])
        self.assertEqual(item.price_status,'unresolved')
        service.pricing_type='FIXED';service.price=9999;service.save()
        item.refresh_from_db()
        self.assertFalse(item.is_price_final)
        self.assertEqual(item.effective_price,0)
        self.assertEqual(self.client.post(f'/api/v1/employee/appointment-items/{item.pk}/action/',{'status':'complete'}).status_code,400)

    def test_empty_irrelevant_fields_do_not_break_fixed_prices(self):
        serializer=ServiceAdminSerializer(data={'category':self.category.pk,'name':'Fixed','persian_name':'ثابت','duration':60,'price':450,'pricing_type':'FIXED','minimum_price':'','maximum_price':''})
        self.assertTrue(serializer.is_valid(),serializer.errors)
        self.assertEqual(serializer.save().price,450)

    def test_price_cannot_change_after_a_pending_partial_report(self):
        appointment,item=self.appointment(self.service(pricing_type='CONSULTATION'))
        self.finalize(item,1000)
        self.client.force_authenticate(self.staff)
        response=self.client.post(f'/api/v1/employee/appointments/{appointment.pk}/payments/',{'amount':100,'payment_method':'cash'})
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.finalize(item,1500,role='employee').status_code,400)

    def test_guest_mixed_booking_cannot_inject_final_price(self):
        from django.utils import timezone
        from .models import BookingHold, BookingHoldItem
        fixed=self.service()
        variable=self.service(pricing_type='CONSULTATION')
        rows=[{'employee':self.employee,'service':fixed,'date':self.day,'start_time':time(9),'end_time':time(10)},
              {'employee':self.employee,'service':variable,'date':self.day,'start_time':time(10),'end_time':time(11)}]
        hold=BookingHold.objects.create(expires_at=timezone.now()+timedelta(minutes=5),**rows[0])
        for row in rows:
            BookingHoldItem.objects.create(hold=hold,**row)
        self.client.force_authenticate(None)
        payload={'hold_token':str(hold.token),'customer_name':'مشتری','customer_phone':'09112223344','items':[
            {'service':row['service'].pk,'employee':self.employee.pk,'date':self.day.isoformat(),
             'start_time':row['start_time'].isoformat(),'end_time':row['end_time'].isoformat(),
             'final_price':1,'price_snapshot':1,'catalog_pricing_snapshot':{'pricing_type':'FIXED'}} for row in rows]}
        response=self.client.post('/api/v1/appointments/',payload,format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['appointment_total'],450)
        self.assertTrue(response.data['has_unresolved_prices'])
        self.assertIsNone(response.data['items'][1]['final_price'])
        self.assertEqual(response.data['items'][1]['pricing_type'],'CONSULTATION')
