from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

	dependencies = [("salon", "0004_appointment_services")]

	operations = [
		migrations.RemoveField(
			model_name="appointment",
			name="services",
		),
		migrations.CreateModel(
			name="AppointmentService",
			fields=[
				("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
				("appointment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="service_assignments", to="salon.appointment")),
				("employee", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="salon.employee")),
				("service", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="salon.service")),
			],
			options={"constraints": [models.UniqueConstraint(fields=("appointment", "service"), name="unique_appointment_service")]},
		),
		migrations.AddField(
			model_name="appointment",
			name="services",
			field=models.ManyToManyField(blank=True, through="salon.AppointmentService", related_name="multi_service_appointments", to="salon.service"),
		),
	]