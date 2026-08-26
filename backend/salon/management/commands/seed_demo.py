from django.core.management.base import BaseCommand
from django.db import transaction

from salon.models import Employee, Service, User, WorkingHour


class Command(BaseCommand):
    help = "Create demo salon services, employees, and working hours."

    @transaction.atomic
    def handle(self, *args, **options):
        services = [
            {
                "name": "Hair color and repair",
                "persian_name": "رنگ و احیای مو",
                "description": "رنگی درخشان با مراقبت عمیق و شخصی سازی شده",
                "category": "مو",
                "price": 2500000,
                "duration": 150,
            },
            {
                "name": "Cut and style",
                "persian_name": "کوتاهی و استایل",
                "description": "فرم دهی حرفه ای متناسب با چهره و سبک زندگی شما",
                "category": "مو",
                "price": 850000,
                "duration": 60,
            },
            {
                "name": "Luxury manicure",
                "persian_name": "مانیکور لوکس",
                "description": "مراقبت کامل از دست ها با جزئیات ظریف",
                "category": "ناخن",
                "price": 650000,
                "duration": 75,
            },
        ]
        service_objects = []
        for data in services:
            service, _ = Service.objects.update_or_create(name=data["name"], defaults=data)
            service_objects.append(service)

        employees = [
            ("maryam", "مریم احمدی", "رنگ و احیای مو", 12),
            ("sara", "سارا رضایی", "کوتاهی و استایل", 10),
            ("niloofar", "نیلوفر کریمی", "مانیکور و مراقبت ناخن", 10),
        ]
        workdays = (5, 6, 0, 1, 2, 3)
        for username, full_name, specialty, commission in employees:
            first_name, last_name = full_name.split(" ", 1)
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first_name, "last_name": last_name, "role": "employee"},
            )
            user.first_name = first_name
            user.last_name = last_name
            user.role = "employee"
            user.set_password("demo-password")
            user.save()
            employee, _ = Employee.objects.update_or_create(
                user=user,
                defaults={"specialty": specialty, "commission_value": commission, "is_active": True},
            )
            employee.services.set(service_objects)
            for weekday in workdays:
                WorkingHour.objects.update_or_create(
                    employee=employee,
                    weekday=weekday,
                    defaults={"start_time": "09:00", "end_time": "20:00", "is_active": True},
                )

        self.stdout.write(self.style.SUCCESS("Demo salon data and working hours are ready."))
