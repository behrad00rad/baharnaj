from django.test import TestCase

# Create your tests here.
from datetime import date

from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Appointment, Employee, Service, Transaction, User, WorkRecord, WorkingHour


class SalonApiTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(username="admin", is_staff=True)
		self.customer = User.objects.create_user(username="customer", phone="09120000000")
		self.service = Service.objects.create(
			name="Cut", persian_name="کوتاهی", price=800000, duration=60, is_active=True
		)
		self.employee_user = User.objects.create_user(username="employee", first_name="Sara", role="employee")
		self.employee_user.set_password("secret")
		self.employee_user.save()
		self.employee = Employee.objects.create(
			user=self.employee_user, commission_value=10, is_active=True
		)
		self.employee.services.add(self.service)
		WorkingHour.objects.create(
			employee=self.employee, weekday=5, start_time="09:00", end_time="20:00"
		)

	def test_public_employee_filter_and_working_hour_availability(self):
		response = self.client.get(reverse("employee-list"), {"service": self.service.id})
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data[0]["id"], self.employee.id)

		response = self.client.get(
			reverse("availability-list"),
			{"service": self.service.id, "employee": self.employee.id, "date": "2026-08-29"},
		)
		self.assertEqual(response.status_code, 200)
		self.assertIn("09:00", response.data["slots"])

	def test_booking_rejects_overlapping_appointment(self):
		payload = {
			"customer_name": "مریم",
			"customer_phone": "09121111111",
			"service": self.service.id,
			"employee": self.employee.id,
			"date": "2026-08-29",
			"start_time": "09:00",
		}
		first = self.client.post(reverse("appointment-create"), payload)
		second = self.client.post(reverse("appointment-create"), payload)
		self.assertEqual(first.status_code, 201)
		self.assertEqual(second.status_code, 409)

	def test_admin_crud_requires_staff(self):
		response = self.client.get(reverse("admin-service-list"))
		self.assertEqual(response.status_code, 401)
		self.client.force_authenticate(self.admin)
		response = self.client.get(reverse("admin-service-list"))
		self.assertEqual(response.status_code, 200)

	def test_login_returns_role_claim(self):
		response = self.client.post("/api/v1/auth/token/", {"username": "employee", "password": "secret"})
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["role"], "employee")

	def test_work_record_completes_appointment_and_calculates_commission(self):
		appointment = Appointment.objects.create(
			customer=self.customer,
			employee=self.employee,
			service=self.service,
			date=date(2026, 8, 29),
			start_time="09:00",
			end_time="10:00",
			price=self.service.price,
		)
		self.client.force_authenticate(self.admin)
		response = self.client.post(
			reverse("work-record-list"), {"appointment": appointment.id, "notes": "Done"}
		)
		self.assertEqual(response.status_code, 201)
		appointment.refresh_from_db()
		self.assertEqual(appointment.status, "completed")
		self.assertEqual(WorkRecord.objects.get().commission, 80000)

	def test_closed_day_has_no_availability_and_finance_is_in_admin_crud(self):
		response = self.client.get(
			reverse("availability-list"),
			{"service": self.service.id, "employee": self.employee.id, "date": "2026-08-28"},
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["slots"], [])

		self.client.force_authenticate(self.admin)
		response = self.client.post(
			reverse("transaction-list"),
			{"type": "payment", "amount": 800000, "description": "Booking payment"},
		)
		self.assertEqual(response.status_code, 201)
		self.assertEqual(Transaction.objects.get().amount, 800000)
