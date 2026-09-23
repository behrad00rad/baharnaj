from django.urls import path

from .views import ConfigView, DeliveryView, DiagnosticsView, OverviewView, PreferenceView, SetupView, TemplateView, TestView, VerifyView

urlpatterns = [
    path("preferences/", PreferenceView.as_view()),
    path("admin/overview/", OverviewView.as_view()),
    path("admin/config/", ConfigView.as_view()),
    path("admin/setup/", SetupView.as_view()),
    path("admin/verify/", VerifyView.as_view()),
    path("admin/diagnostics/<str:operation>/", DiagnosticsView.as_view()),
    path("admin/test/", TestView.as_view()),
    path("admin/templates/", TemplateView.as_view()),
    path("admin/templates/<str:kind>/", TemplateView.as_view()),
    path("admin/deliveries/", DeliveryView.as_view()),
]
