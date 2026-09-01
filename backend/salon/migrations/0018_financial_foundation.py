from django.db import migrations, models
import django.db.models.deletion


def populate_financial_snapshots(apps, schema_editor):
    Payment = apps.get_model("salon", "Payment")
    EmployeeCommission = apps.get_model("salon", "EmployeeCommission")
    Payment.objects.filter(status__in=("paid", "refunded"), paid_at__isnull=True).update(paid_at=models.F("created_at"))
    commissions = list(EmployeeCommission.objects.select_related("appointment_item").filter(base_amount=0))
    for commission in commissions:
        commission.base_amount = commission.appointment_item.price_snapshot
    EmployeeCommission.objects.bulk_update(commissions, ("base_amount",))


class Migration(migrations.Migration):
    dependencies = [("salon", "0017_gallerycategory_galleryasset_category")]

    operations = [
        migrations.AddField(model_name="payment", name="notes", field=models.TextField(blank=True)),
        migrations.AddField(model_name="payment", name="paid_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="payment", name="payment_method", field=models.CharField(choices=[("cash", "Cash"), ("card", "Card"), ("bank_transfer", "Bank transfer"), ("online", "Online"), ("other", "Other")], default="cash", max_length=20)),
        migrations.AddField(model_name="transaction", name="payment", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="transactions", to="salon.payment")),
        migrations.AddField(model_name="employeecommission", name="base_amount", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="employeecommission", name="status", field=models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("paid", "Paid")], default="pending", max_length=20)),
        migrations.RunPython(populate_financial_snapshots, migrations.RunPython.noop),
        migrations.AddIndex(model_name="payment", index=models.Index(fields=["status", "paid_at"], name="payment_status_paid_idx")),
        migrations.AddIndex(model_name="employeecommission", index=models.Index(fields=["status", "created_at"], name="commission_status_date_idx")),
        migrations.AddConstraint(model_name="payment", constraint=models.CheckConstraint(condition=models.Q(("amount__gt", 0)), name="payment_amount_positive")),
        migrations.AddConstraint(model_name="refund", constraint=models.CheckConstraint(condition=models.Q(("amount__gt", 0)), name="refund_amount_positive")),
        migrations.AddConstraint(model_name="employeecommission", constraint=models.UniqueConstraint(fields=("appointment_item",), name="unique_item_commission")),
    ]
