from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from PIL import Image

from .models import BlogCategory, BlogPost, BlogPostRevision, BlogTag, Service, ServiceCategory, User


class BlogApiTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media_directory = TemporaryDirectory()
        cls.media_override = override_settings(MEDIA_ROOT=cls.media_directory.name)
        cls.media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.media_override.disable()
        cls.media_directory.cleanup()

    def setUp(self):
        self.admin = User.objects.create_user(username="blog-admin", password="secret-pass", role="admin")
        self.customer = User.objects.create_user(username="reader", password="secret-pass", role="customer")
        self.category = BlogCategory.objects.create(name="مراقبت و زیبایی")
        self.tag = BlogTag.objects.create(name="مراقبت مو")
        service_category = ServiceCategory.objects.create(name="Hair")
        self.service = Service.objects.create(category=service_category, name="hair-care", persian_name="مراقبت مو", price=100000, duration=60)
        self.post = BlogPost.objects.create(
            title="راهنمای مراقبت مو",
            excerpt="خلاصه مقاله",
            content=[{"type": "heading", "level": 2, "text": "شروع"}, {"type": "paragraph", "text": "متن **مهم**"}],
            category=self.category,
            author=self.admin,
        )
        self.post.tags.add(self.tag)
        self.post.related_services.add(self.service)
        self.client = APIClient()

    def image_upload(self, name="article.png", color="#bf5b3d"):
        image_bytes = BytesIO()
        Image.new("RGB", (4, 4), color).save(image_bytes, format="PNG")
        return SimpleUploadedFile(name, image_bytes.getvalue(), content_type="image/png")

    def test_draft_never_leaks_to_public_api_or_sitemap(self):
        response = self.client.get(reverse("blog-post-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(self.client.get(reverse("blog-post-detail", args=[self.post.slug])).status_code, 404)
        self.assertNotContains(self.client.get(reverse("sitemap-xml")), f"/blog/{self.post.slug}")

    def test_admin_can_publish_and_public_detail_is_complete(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("admin-blog-post-publish", args=[self.post.pk]))
        self.assertEqual(response.status_code, 200)
        self.post.refresh_from_db()
        self.assertEqual(self.post.status, BlogPost.STATUS_PUBLISHED)
        self.assertIsNotNone(self.post.published_at)

        self.client.force_authenticate(None)
        listing = self.client.get(reverse("blog-post-list"))
        self.assertEqual(listing.data["results"][0]["slug"], self.post.slug)
        self.assertNotIn("content", listing.data["results"][0])
        detail = self.client.get(reverse("blog-post-detail", args=[self.post.slug]))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["content"][1]["type"], "paragraph")
        self.assertEqual(detail.data["related_services"][0]["id"], self.service.id)
        self.assertContains(self.client.get(reverse("sitemap-xml")), f"/blog/{self.post.slug}")

    def test_scheduled_publication_is_resolved_server_side(self):
        self.post.status = BlogPost.STATUS_SCHEDULED
        self.post.scheduled_publish_at = timezone.now() + timedelta(hours=1)
        self.post.save()
        self.assertEqual(self.client.get(reverse("blog-post-list")).data["count"], 0)
        self.post.scheduled_publish_at = timezone.now() - timedelta(minutes=1)
        self.post.save()
        self.assertEqual(self.client.get(reverse("blog-post-list")).data["count"], 1)

    def test_blog_admin_endpoints_require_admin_role(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(reverse("admin-blog-post-list")).status_code, 403)
        self.assertEqual(self.client.post(reverse("admin-blog-post-publish", args=[self.post.pk])).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("admin-blog-post-list")).status_code, 401)

    def test_slug_is_stable_and_explicitly_editable(self):
        original_slug = self.post.slug
        self.post.title = "عنوان کاملاً تازه"
        self.post.save()
        self.assertEqual(self.post.slug, original_slug)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse("admin-blog-post-detail", args=[self.post.pk]), {"slug": "new-stable-url"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slug"], "new-stable-url")

    def test_structured_content_is_validated_and_revision_is_created(self):
        self.client.force_authenticate(self.admin)
        invalid = self.client.patch(reverse("admin-blog-post-detail", args=[self.post.pk]), {"content": [{"type": "script", "text": "alert(1)"}]}, format="json")
        self.assertEqual(invalid.status_code, 400)
        valid = self.client.patch(reverse("admin-blog-post-detail", args=[self.post.pk]), {"content": [{"type": "callout", "title": "نکته", "text": "متن", "tone": "tip", "ignored": "removed"}]}, format="json")
        self.assertEqual(valid.status_code, 200)
        self.assertNotIn("ignored", valid.data["content"][0])
        self.assertEqual(BlogPostRevision.objects.filter(post=self.post).count(), 1)

    def test_duplicate_is_a_new_draft_without_changing_source(self):
        self.post.status = BlogPost.STATUS_PUBLISHED
        self.post.save()
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("admin-blog-post-duplicate", args=[self.post.pk]))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], BlogPost.STATUS_DRAFT)
        self.assertNotEqual(response.data["slug"], self.post.slug)
        self.post.refresh_from_db()
        self.assertEqual(self.post.status, BlogPost.STATUS_PUBLISHED)

    def test_admin_uploads_image_with_alt_text_and_can_embed_it(self):
        self.client.force_authenticate(self.admin)
        media = self.client.post(
            reverse("admin-blog-media-list"),
            {"post": self.post.pk, "image": self.image_upload(), "alt_text": "نمای نزدیک نتیجه کار", "caption": "نتیجه نهایی", "display_order": 0},
            format="multipart",
        )
        self.assertEqual(media.status_code, 201)
        updated = self.client.patch(
            reverse("admin-blog-post-detail", args=[self.post.pk]),
            {"content": [{"type": "image", "media_id": media.data["id"]}]},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.client.post(reverse("admin-blog-post-publish", args=[self.post.pk]))
        self.client.force_authenticate(None)
        detail = self.client.get(reverse("blog-post-detail", args=[self.post.slug]))
        self.assertEqual(detail.data["media"][0]["alt_text"], "نمای نزدیک نتیجه کار")
        self.assertEqual(detail.data["content"][0]["media_id"], media.data["id"])

    def test_tag_normalization_prevents_spacing_variants(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("admin-blog-tag-list"), {"name": "  مراقبت   مو "}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_complete_publishing_flow_and_published_edit_safety(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(
            reverse("admin-blog-post-list"),
            {
                "title": "تفاوت مراقبت حرفه‌ای و خانگی",
                "excerpt": "راهنمای انتخاب روش مناسب",
                "content": [],
                "category": self.category.pk,
                "tags": [self.tag.pk],
                "related_services": [self.service.pk],
                "seo_title": "مراقبت حرفه‌ای یا خانگی | بهارناژ",
                "seo_description": "راهنمای واقعی انتخاب مراقبت حرفه‌ای و خانگی مو.",
                "is_featured": True,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        post_id = created.data["id"]
        slug = created.data["slug"]
        cover = self.client.patch(
            reverse("admin-blog-post-detail", args=[post_id]),
            {"cover_image": self.image_upload("cover.png"), "cover_alt_text": "موهای مرتب پس از مراقبت"},
            format="multipart",
        )
        self.assertEqual(cover.status_code, 200)
        media_ids = []
        for index in range(2):
            media = self.client.post(
                reverse("admin-blog-media-list"),
                {"post": post_id, "image": self.image_upload(f"step-{index}.png"), "alt_text": f"مرحله {index + 1} مراقبت", "caption": f"مرحله {index + 1}", "display_order": index},
                format="multipart",
            )
            self.assertEqual(media.status_code, 201)
            media_ids.append(media.data["id"])
        content = [
            {"type": "heading", "level": 2, "text": "انتخاب آگاهانه"},
            {"type": "paragraph", "text": "یک متن **قابل ویرایش** با [لینک سرویس](/services/hair-care)."},
            {"type": "image", "media_id": media_ids[0]},
            {"type": "image", "media_id": media_ids[1]},
            {"type": "callout", "title": "نکته", "text": "نیاز مو را در نظر بگیرید.", "tone": "tip"},
            {"type": "service", "service_id": self.service.pk},
            {"type": "cta", "title": "برای مراقبت آماده‌اید؟", "text": "وقت مناسب را انتخاب کنید.", "service_ids": [self.service.pk]},
        ]
        saved = self.client.patch(reverse("admin-blog-post-detail", args=[post_id]), {"content": content}, format="json")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(len(saved.data["media"]), 2)
        self.assertEqual(self.client.get(reverse("blog-post-detail", args=[slug])).status_code, 404)

        published = self.client.post(reverse("admin-blog-post-publish", args=[post_id]))
        self.assertEqual(published.status_code, 200)
        published_at = published.data["published_at"]
        edited = self.client.patch(reverse("admin-blog-post-detail", args=[post_id]), {"title": "نسخه ویرایش‌شده مقاله", "content": content + [{"type": "paragraph", "text": "بخش تازه"}]}, format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["slug"], slug)
        self.assertEqual(edited.data["status"], BlogPost.STATUS_PUBLISHED)
        self.assertEqual(edited.data["published_at"], published_at)
        replaced = self.client.patch(
            reverse("admin-blog-media-detail", args=[media_ids[0]]),
            {"image": self.image_upload("replacement.png", "#171715"), "alt_text": "تصویر جایگزین مرحله اول"},
            format="multipart",
        )
        self.assertEqual(replaced.status_code, 200)

        self.client.force_authenticate(None)
        public = self.client.get(reverse("blog-post-detail", args=[slug]))
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["title"], "نسخه ویرایش‌شده مقاله")
        self.assertEqual(public.data["status"] if "status" in public.data else None, None)
        self.assertEqual(public.data["media"][0]["alt_text"], "تصویر جایگزین مرحله اول")
        self.assertEqual(public.data["seo_title"], "مراقبت حرفه‌ای یا خانگی | بهارناژ")
