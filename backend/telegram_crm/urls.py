from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
for name, view in [('customers', views.CustomerAdmin), ('segments', views.SegmentAdmin), ('campaigns', views.CampaignAdmin), ('templates', views.TemplateAdmin), ('service-rules', views.ServiceRuleAdmin), ('benefit-rules', views.BenefitRuleAdmin), ('benefits', views.BenefitAdmin)]:
    router.register(name, view, basename='telegram-'+name)
urlpatterns = [
    path('benefits/', views.CustomerBenefits.as_view()),
    path('customer/', views.CustomerView.as_view()),
    path('bot/', views.BotView.as_view()),
    path('visit/<uuid:token>/', views.VisitView.as_view()),
    path('admin/setup/', views.AdminSetup.as_view()),
    path('admin/overview/', views.AdminOverview.as_view()),
    path('admin/managers/', views.ManagerRecipients.as_view()),
    path('admin/automation-preview/', views.AutomationPreview.as_view()),
    path('admin/config/', views.AdminConfig.as_view()),
    path('admin/', include(router.urls)),
]
