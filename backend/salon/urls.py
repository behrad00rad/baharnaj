from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (AdminAppointmentViewSet, AdminEmployeeViewSet, AdminServiceViewSet,
					AdminUserViewSet, BookingHoldDeleteView,
					AdminStatisticsView, AppointmentCreateView, AvailabilityView, BookingHoldView,
					EmployeeAppointmentsView, EmployeeListView, EmployeeStatisticsView,
					ServiceListView, TransactionViewSet, WorkingScheduleViewSet,
					AppointmentItemViewSet, EmployeeAppointmentItemViewSet, EmployeeProfileView, EmployeeWorkingScheduleViewSet,
					PaymentViewSet, ServiceImageViewSet, AdminActionLogViewSet, EmployeeTimeOffViewSet,
					EmployeeEarningsView, GalleryListView, AdminGalleryViewSet, WaitlistView, CustomerBookingView, CustomerHistoryView)

router = DefaultRouter()
router.register("admin/services", AdminServiceViewSet, basename="admin-service")
router.register("admin/gallery", AdminGalleryViewSet, basename="admin-gallery")
router.register("admin/employees", AdminEmployeeViewSet, basename="admin-employee")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("admin/appointments", AdminAppointmentViewSet, basename="admin-appointment")
router.register("admin/working-schedules", WorkingScheduleViewSet, basename="working-schedule")
router.register("admin/appointment-items", AppointmentItemViewSet, basename="appointment-item")
router.register("admin/transactions", TransactionViewSet, basename="transaction")
router.register("admin/payments", PaymentViewSet, basename="payment")
router.register("admin/service-images", ServiceImageViewSet, basename="service-image")
router.register("admin/activity", AdminActionLogViewSet, basename="admin-activity")
router.register("employee/appointment-items", EmployeeAppointmentItemViewSet, basename="employee-appointment-item")
router.register("employee/time-off", EmployeeTimeOffViewSet, basename="employee-time-off")
router.register("employee/schedule", EmployeeWorkingScheduleViewSet, basename="employee-schedule")

urlpatterns = [
	path("services/", ServiceListView.as_view(), name="service-list"),
	path("gallery/", GalleryListView.as_view(), name="gallery-list"),
	path("employees/", EmployeeListView.as_view(), name="employee-list"),
	path("availability/", AvailabilityView.as_view(), name="availability-list"),
	path("appointments/", AppointmentCreateView.as_view(), name="appointment-create"),
	path("booking-holds/", BookingHoldView.as_view(), name="booking-hold-create"),
	path("booking-holds/<uuid:token>/", BookingHoldDeleteView.as_view(), name="booking-hold-delete"),
	path("waitlist/", WaitlistView.as_view(), name="waitlist-create"),
	path("customer/booking/", CustomerBookingView.as_view(), name="customer-booking-lookup"),
	path("customer/history/", CustomerHistoryView.as_view(), name="customer-history"),
	path("employee/appointments/", EmployeeAppointmentsView.as_view(), name="employee-appointments"),
	path("employee/statistics/", EmployeeStatisticsView.as_view(), name="employee-statistics"),
	path("employee/profile/", EmployeeProfileView.as_view(), name="employee-profile"),
	path("employee/earnings/", EmployeeEarningsView.as_view(), name="employee-earnings"),
	path("admin/statistics/", AdminStatisticsView.as_view(), name="admin-statistics"),
	path("", include(router.urls)),
]