from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("salon", "0028_postgres_appointmentitem_overlap")]

    operations = [
        migrations.AddField(
            model_name="customerprofile",
            name="birthday",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customerprofile",
            name="neighborhood",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="customerprofile",
            name="service_preferences",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="CustomerCommunicationPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("operational_reminders", models.BooleanField(default=True)),
                ("promotional_messages", models.BooleanField(default=False)),
                ("push_enabled", models.BooleanField(default=False)),
                ("email_enabled", models.BooleanField(default=False)),
                ("sms_enabled", models.BooleanField(default=False)),
                ("telegram_enabled", models.BooleanField(default=False)),
                ("consent_source", models.CharField(blank=True, max_length=80)),
                ("consent_version", models.CharField(blank=True, max_length=40)),
                ("consented_at", models.DateTimeField(blank=True, null=True)),
                ("withdrawn_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="communication_preferences", to="salon.customerprofile")),
            ],
        ),
        migrations.CreateModel(
            name="CustomerAccountDeletionRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected"), ("completed", "Completed")], default="pending", max_length=20)),
                ("reason", models.CharField(blank=True, max_length=500)),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="deletion_requests", to="salon.customerprofile")),
                ("processed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="processed_deletion_requests", to="salon.user")),
            ],
        ),
        migrations.CreateModel(
            name="CustomerMutationRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=20)),
                ("idempotency_key", models.CharField(max_length=100)),
                ("response_status", models.PositiveSmallIntegerField(default=200)),
                ("response_body", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("appointment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="customer_mutations", to="salon.appointment")),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="mutation_requests", to="salon.customerprofile")),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("customer", "appointment", "action", "idempotency_key"), name="unique_customer_mutation")]},
        ),
    ]