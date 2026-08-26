from django.urls import path
from .views import AdminStatisticsView, AppointmentCreateView, AvailabilityView, EmployeeAppointmentsView, EmployeeListView, EmployeeStatisticsView, ServiceListView

urlpatterns = [path("services/", ServiceListView.as_view()), path("employees/", EmployeeListView.as_view()), path("availability/", AvailabilityView.as_view()), path("appointments/", AppointmentCreateView.as_view()), path("employee/appointments/", EmployeeAppointmentsView.as_view()), path("employee/statistics/", EmployeeStatisticsView.as_view()), path("admin/statistics/", AdminStatisticsView.as_view())]