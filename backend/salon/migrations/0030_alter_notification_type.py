from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("salon", "0029_customer_dashboard_models")]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("appointment_created", "Appointment created"),
                    ("appointment_assigned", "Appointment assigned"),
                    ("appointment_rescheduled", "Appointment rescheduled"),
                    ("appointment_cancelled", "Appointment cancelled"),
                    ("appointment_updated", "Appointment updated"),
                    ("payment_reported", "Payment reported"),
                    ("payment_confirmed", "Payment confirmed"),
                    ("payment_rejected", "Payment rejected"),
                    ("customer_account", "Customer account"),
                ],
                max_length=40,
            ),
        ),
    ]