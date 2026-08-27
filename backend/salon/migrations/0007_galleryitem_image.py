from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [("salon", "0006_galleryitem")]

	operations = [
		migrations.AddField(
			model_name="galleryitem",
			name="image",
			field=models.ImageField(blank=True, upload_to="gallery/"),
		),
	]