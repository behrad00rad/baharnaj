from django.db import migrations, models
import django.db.models.deletion


def migrate_categories(apps, schema_editor):
    GalleryAsset = apps.get_model("salon", "GalleryAsset")
    GalleryCategory = apps.get_model("salon", "GalleryCategory")
    categories = {}
    for asset in GalleryAsset.objects.all().iterator():
        name = (asset.legacy_category or "").strip()
        if not name:
            continue
        key = name.casefold()
        category = categories.get(key)
        if category is None:
            category = GalleryCategory.objects.create(name=name)
            categories[key] = category
        asset.category = category
        asset.save(update_fields=("category",))


def restore_category_strings(apps, schema_editor):
    GalleryAsset = apps.get_model("salon", "GalleryAsset")
    for asset in GalleryAsset.objects.select_related("category").all().iterator():
        asset.legacy_category = asset.category.name if asset.category_id else ""
        asset.save(update_fields=("legacy_category",))


class Migration(migrations.Migration):
    dependencies = [("salon", "0016_bookinghold_owner_bookingholditem")]

    operations = [
        migrations.CreateModel(
            name="GalleryCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("display_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ("display_order", "name")},
        ),
        migrations.RenameField(model_name="galleryasset", old_name="category", new_name="legacy_category"),
        migrations.AddField(
            model_name="galleryasset",
            name="category",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="assets", to="salon.gallerycategory"),
        ),
        migrations.RunPython(migrate_categories, restore_category_strings),
        migrations.RemoveField(model_name="galleryasset", name="legacy_category"),
    ]
