"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from salon.views import CookieLogoutView, CookieRefreshView, CookieTokenView, CsrfView, CustomerRegistrationView, PasswordResetConfirmView, PasswordResetRequestView, TwoFactorTokenVerifyView
from salon.seo import robots_txt, sitemap_xml

urlpatterns = [
    path("api/v1/sms/", include("sms_crm.urls")),
    path("api/v1/telegram/", include("telegram_crm.urls")),
    path("robots.txt", robots_txt, name="robots-txt"),
    path("sitemap.xml", sitemap_xml, name="sitemap-xml"),
    path("django-admin/", admin.site.urls),
    # Legacy backend-only URL remains available during local development.
    path("admin/", (admin.site.get_urls(), "admin", "legacy_admin")),
    path("api/v1/", include("salon.urls")),
    path("api/v1/auth/token/", CookieTokenView.as_view()),
    path("api/v1/auth/token/verify-2fa/", TwoFactorTokenVerifyView.as_view()),
    path("api/v1/auth/token/refresh/", CookieRefreshView.as_view()),
    path("api/v1/auth/csrf/", CsrfView.as_view()),
    path("api/v1/auth/register/", CustomerRegistrationView.as_view()),
    path("api/v1/auth/logout/", CookieLogoutView.as_view()),
    path("api/v1/auth/password-reset/", PasswordResetRequestView.as_view()),
    path("api/v1/auth/password-reset/<uidb64>/<token>/", PasswordResetConfirmView.as_view()),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
