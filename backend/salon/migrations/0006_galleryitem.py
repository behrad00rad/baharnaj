from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [("salon", "0005_appointmentservice")]

	operations = [
		migrations.CreateModel(
			name="GalleryItem",
			fields=[
				("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
				("title", models.CharField(blank=True, max_length=160)),
				("category", models.CharField(blank=True, max_length=80)),
				("image_url", models.URLField(max_length=500)),
				("description", models.TextField(blank=True)),
				("order", models.PositiveIntegerField(default=0)),
				("is_published", models.BooleanField(default=True)),
				("created_at", models.DateTimeField(auto_now_add=True)),
			],
			options={"ordering": ["order", "-created_at"]},
		),
	]