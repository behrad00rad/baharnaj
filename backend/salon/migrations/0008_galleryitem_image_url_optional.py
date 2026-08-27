from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [("salon", "0007_galleryitem_image")]

	operations = [
		migrations.AlterField(
			model_name="galleryitem",
			name="image_url",
			field=models.URLField(blank=True, max_length=500),
		),
	]