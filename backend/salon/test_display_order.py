from django.test import TestCase
from rest_framework.test import APIClient

from .models import AdminActionLog, EmployeeProfile, EmployeeService, Service, ServiceCategory, User


class DisplayOrderTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="order-admin", password="password123", role="admin")
        self.customer = User.objects.create_user(username="order-customer", password="password123", role="customer")
        self.client = APIClient()
        self.category = ServiceCategory.objects.create(name="مو", display_order=1)
        self.other_category = ServiceCategory.objects.create(name="ناخن", display_order=2)
        self.a = Service.objects.create(category=self.category, name="Alpha", persian_name="الف", duration=30, price=100)
        self.b = Service.objects.create(category=self.category, name="Beta", persian_name="ب", duration=40, price=200)
        self.c = Service.objects.create(category=self.other_category, name="Gamma", persian_name="ج", duration=50, price=300)
        self.employees = []
        for index in range(2):
            user = User.objects.create_user(username=f"order-employee-{index}", password="password123", role="employee")
            employee = EmployeeProfile.objects.create(user=user, specialty="مو")
            EmployeeService.objects.create(employee=employee, service=self.a)
            self.employees.append(employee)

    def test_new_records_append_and_public_lists_are_deterministic(self):
        self.assertEqual([self.a.display_order, self.b.display_order, self.c.display_order], [0, 1, 0])
        self.assertEqual([item.display_order for item in self.employees], [0, 1])
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/services/").data], [self.a.pk, self.b.pk, self.c.pk])
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/employees/").data], [item.pk for item in self.employees])
        self.b.category = self.other_category
        self.b.save()
        self.assertEqual(self.b.display_order, 1)

    def test_service_reorder_scope_is_atomic_and_audited(self):
        url = "/api/v1/admin/services/reorder/"
        payload = {"category_id": self.category.pk, "items": [{"id": self.b.pk, "display_order": 2}, {"id": self.a.pk, "display_order": 4}]}
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["items"], [{"id": self.b.pk, "display_order": 0}, {"id": self.a.pk, "display_order": 1}])
        self.assertTrue(AdminActionLog.objects.filter(action="reorder", model_name="Service").exists())
        appended = Service.objects.create(category=self.category, name="Delta", persian_name="د", duration=20, price=50)
        self.assertEqual(appended.display_order, 2)
        appended.delete()
        payload["items"] = [{"id": self.b.pk, "display_order": 0}, {"id": self.c.pk, "display_order": 1}]
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        self.assertEqual(list(Service.objects.filter(category=self.category).values_list("pk", flat=True)), [self.b.pk, self.a.pk])
        payload["items"] = [{"id": self.b.pk, "display_order": 0}, {"id": self.b.pk, "display_order": 1}]
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        payload["items"] = [{"id": self.b.pk, "display_order": 0}, {"id": 999999, "display_order": 1}]
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        payload["items"] = [{"id": self.b.pk, "display_order": 0, "price": 0}, {"id": self.a.pk, "display_order": 1}]
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)

    def test_employee_reorder_and_permissions(self):
        url = "/api/v1/admin/employees/reorder/"
        payload = {"items": [{"id": self.employees[1].pk, "display_order": 0}, {"id": self.employees[0].pk, "display_order": 1}]}
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 200)
        newcomer_user = User.objects.create_user(username="order-employee-new", password="password123", role="employee")
        newcomer = EmployeeProfile.objects.create(user=newcomer_user, is_active=False)
        self.assertEqual(newcomer.display_order, 2)
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/employees/?service=" + str(self.a.pk)).data], [self.employees[1].pk, self.employees[0].pk])
        self.employees[1].is_active = False
        self.employees[1].save()
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/employees/").data], [self.employees[0].pk])

    def test_public_filters_stay_intact(self):
        self.b.is_bookable = False
        self.b.save()
        self.c.is_active = False
        self.c.save()
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/services/").data], [self.a.pk])
