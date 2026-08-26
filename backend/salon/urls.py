from django.urls import path
from .views import AppointmentCreateView, ServiceListView

urlpatterns = [path("services/", ServiceListView.as_view()), path("appointments/", AppointmentCreateView.as_view())]