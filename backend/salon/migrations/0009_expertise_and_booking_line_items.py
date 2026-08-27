from django.db import migrations, models
import django.db.models.deletion


def copy_legacy_specialties(apps, schema_editor):
    Expertise = apps.get_model("salon", "Expertise")
    Employee = apps.get_model("salon", "Employee")
    EmployeeExpertise = apps.get_model("salon", "EmployeeExpertise")

    for employee in Employee.objects.exclude(specialty="").exclude(specialty__isnull=True):
        value = employee.specialty.strip()
        if not value:
            continue
        expertise, _ = Expertise.objects.get_or_create(name=value, persian_name=value)
        EmployeeExpertise.objects.get_or_create(
            employee_id=employee.pk,
            expertise_id=expertise.pk,
            defaults={"is_primary": True},
        )


def snapshot_appointment_services(apps, schema_editor):
    AppointmentService = apps.get_model("salon", "AppointmentService")

    for item in AppointmentService.objects.select_related("service").iterator():
        item.unit_price = item.service.price
        item.duration_minutes = item.service.duration
        item.save(update_fields=("unit_price", "duration_minutes"))


class Migration(migrations.Migration):
    dependencies = [
        ("salon", "0008_galleryitem_image_url_optional"),
    ]

    operations = [
        migrations.CreateModel(
            name="Expertise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("persian_name", models.CharField(max_length=120)),
                ("category", models.CharField(blank=True, max_length=80)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["persian_name", "name"],
            },
        ),
        migrations.CreateModel(
            name="EmployeeExpertise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("years_experience", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("is_primary", models.BooleanField(default=False)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="expertise_links", to="salon.employee")),
                ("expertise", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="employee_links", to="salon.expertise")),
            ],
            options={
                "ordering": ["-is_primary", "expertise__persian_name"],
            },
        ),
        migrations.AddConstraint(
            model_name="expertise",
            constraint=models.UniqueConstraint(fields=("name", "persian_name"), name="unique_expertise_name"),
        ),
        migrations.AddConstraint(
            model_name="employeeexpertise",
            constraint=models.UniqueConstraint(fields=("employee", "expertise"), name="unique_employee_expertise"),
        ),
        migrations.AddField(
            model_name="employee",
            name="expertise",
            field=models.ManyToManyField(blank=True, related_name="employees", through="salon.EmployeeExpertise", to="salon.expertise"),
        ),
        migrations.AddField(
            model_name="appointmentservice",
            name="duration_minutes",
            field=models.PositiveIntegerField(blank=True, help_text="Duration captured when the appointment was booked", null=True),
        ),
        migrations.AddField(
            model_name="appointmentservice",
            name="notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="appointmentservice",
            name="status",
            field=models.CharField(choices=[("pending", "Pending"), ("confirmed", "Confirmed"), ("completed", "Completed"), ("cancelled", "Cancelled")], default="pending", max_length=20),
        ),
        migrations.AddField(
            model_name="appointmentservice",
            name="unit_price",
            field=models.PositiveIntegerField(blank=True, help_text="Price captured when the appointment was booked", null=True),
        ),
        migrations.AlterField(
            model_name="workrecord",
            name="appointment",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="work_records", to="salon.appointment"),
        ),
        migrations.AddField(
            model_name="workrecord",
            name="appointment_service",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="work_record", to="salon.appointmentservice"),
        ),
        migrations.RunPython(copy_legacy_specialties, migrations.RunPython.noop),
        migrations.RunPython(snapshot_appointment_services, migrations.RunPython.noop),
    ]
