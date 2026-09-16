from django.db import migrations, models


def populate_service_slugs(apps, schema_editor):
    Service = apps.get_model("salon", "Service")
    # Existing names are Persian in many installations; IDs provide an additive,
    # URL-safe and permanent fallback without touching service records or links.
    for service in Service.objects.filter(slug__isnull=True):
        service.slug = f"service-{service.pk}"
        service.save(update_fields=("slug",))


class Migration(migrations.Migration):
    dependencies = [("salon", "0021_firebasedevice")]

    operations = [
        migrations.AddField(
            model_name="service",
            name="slug",
            field=models.SlugField(blank=True, max_length=160, null=True),
        ),
        migrations.AddField(
            model_name="service",
            name="seo_title",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="service",
            name="seo_description",
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(populate_service_slugs, migrations.RunPython.noop),
        # Django 6.1 duplicates SlugField's PostgreSQL pattern index when a
        # nullable field becomes unique in one AlterField operation.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.AlterField(
                    model_name="service",
                    name="slug",
                    field=models.SlugField(
                        blank=True, db_index=False, max_length=160, unique=False
                    ),
                ),
                migrations.AddConstraint(
                    model_name="service",
                    constraint=models.UniqueConstraint(
                        fields=("slug",), name="salon_service_slug_unique"
                    ),
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="service",
                    name="slug",
                    field=models.SlugField(
                        blank=True, db_index=False, max_length=160, unique=True
                    ),
                ),
            ],
        ),
    ]
