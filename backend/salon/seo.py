"""Small public SEO endpoints kept separate from the REST application."""

from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone

from .models import BlogPost, Service


def _absolute(path):
    return f"{settings.SITE_URL}{path}"


def robots_txt(request):
    content = "\n".join(
        (
            "User-agent: *",
            "Allow: /",
            "Disallow: /admin/",
            "Disallow: /employee/",
            "Disallow: /login",
            "Disallow: /api/",
            f"Sitemap: {_absolute('/sitemap.xml')}",
            "",
        )
    )
    return HttpResponse(content, content_type="text/plain; charset=utf-8")


def sitemap_xml(request):
    public_paths = ("/", "/services", "/gallery", "/blog", "/about", "/team", "/contact", "/privacy", "/terms")
    locations = [_absolute(path) for path in public_paths]
    locations.extend(
        _absolute(f"/services/{service.slug}")
        for service in Service.objects.filter(is_active=True, is_bookable=True).exclude(slug="")
    )
    body = "".join(f"<url><loc>{escape(location)}</loc></url>" for location in locations)
    now = timezone.now()
    posts = BlogPost.objects.filter(
        Q(status=BlogPost.STATUS_PUBLISHED)
        | Q(status=BlogPost.STATUS_SCHEDULED, scheduled_publish_at__lte=now)
    ).exclude(slug="")
    body += "".join(
        f"<url><loc>{escape(_absolute(f'/blog/{post.slug}'))}</loc><lastmod>{post.updated_at.date().isoformat()}</lastmod></url>"
        for post in posts
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return HttpResponse(xml, content_type="application/xml; charset=utf-8")
