from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (AdminAppointmentViewSet, AdminEmployeeViewSet, AdminServiceViewSet,
					AdminUserViewSet,
					AdminStatisticsView, AppointmentCreateView, AvailabilityView,
					EmployeeAppointmentsView, EmployeeListView, EmployeeStatisticsView,
					ServiceListView, TransactionViewSet, WorkRecordViewSet,
					WorkingHourViewSet, EmployeeWorkRecordViewSet, GalleryListView, AdminGalleryViewSet)

router = DefaultRouter()
router.register("admin/services", AdminServiceViewSet, basename="admin-service")
router.register("admin/gallery", AdminGalleryViewSet, basename="admin-gallery")
router.register("admin/employees", AdminEmployeeViewSet, basename="admin-employee")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("admin/appointments", AdminAppointmentViewSet, basename="admin-appointment")
router.register("admin/working-hours", WorkingHourViewSet, basename="working-hour")
router.register("admin/work-records", WorkRecordViewSet, basename="work-record")
router.register("admin/transactions", TransactionViewSet, basename="transaction")
router.register("employee/work-records", EmployeeWorkRecordViewSet, basename="employee-work-record")

urlpatterns = [
	path("services/", ServiceListView.as_view(), name="service-list"),
	path("gallery/", GalleryListView.as_view(), name="gallery-list"),
	path("employees/", EmployeeListView.as_view(), name="employee-list"),
	path("availability/", AvailabilityView.as_view(), name="availability-list"),
	path("appointments/", AppointmentCreateView.as_view(), name="appointment-create"),
	path("employee/appointments/", EmployeeAppointmentsView.as_view(), name="employee-appointments"),
	path("employee/statistics/", EmployeeStatisticsView.as_view(), name="employee-statistics"),
	path("admin/statistics/", AdminStatisticsView.as_view(), name="admin-statistics"),
	path("", include(router.urls)),
]