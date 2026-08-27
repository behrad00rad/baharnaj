from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		("salon", "0003_workinghour"),
	]

	operations = [
		migrations.AddField(
			model_name="appointment",
			name="services",
			field=models.ManyToManyField(
				blank=True,
				related_name="multi_service_appointments",
				to="salon.service",
			),
		),
	]