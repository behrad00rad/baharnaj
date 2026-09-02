from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("salon", "0022_service_seo_fields")]

    operations = [
        migrations.AddField(
            model_name="service",
            name="short_description",
            field=models.CharField(blank=True, max_length=320),
        ),
        migrations.AddField(
            model_name="serviceimage",
            name="alt_text",
            field=models.CharField(blank=True, max_length=220),
        ),
    ]
