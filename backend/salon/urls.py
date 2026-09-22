from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (AdminAppointmentViewSet, AdminBlogCategoryViewSet, AdminBlogMediaViewSet, AdminBlogPostViewSet, AdminBlogTagViewSet, AdminEmployeeViewSet, AdminGalleryCategoryDetailView, AdminGalleryCategoryView, AdminServiceViewSet,
					AdminUserViewSet, AdminDeletionRequestViewSet, AdminCustomerOptionsView, AdminSelfAccountView, AdminSelfPasswordChangeView, AdminEmployeeEligibleUsersView, AdminEmployeeFinanceView, AdminRevenueView, AdminServiceCategoryViewSet, AdminTransactionTypesView, BookingHoldDeleteView,
					AdminStatisticsView, AppointmentCreateView, AvailabilityView, BookingHoldView,
										EmployeeAppointmentsView, EmployeeCustomerOptionsView, EmployeeListView, EmployeeSelfBookingView, EmployeeSelfServiceListView, EmployeeStatisticsView, GalleryCategoryListView,
					ServiceDetailView, ServiceListView, TransactionViewSet, WorkingScheduleViewSet,
					AppointmentItemViewSet, EmployeeAppointmentItemViewSet, EmployeePasswordChangeView, EmployeeProfileView, EmployeeWorkingScheduleViewSet,
					PaymentViewSet, FirebaseDeviceViewSet, NotificationViewSet, RefundViewSet, EmployeeCommissionViewSet, ServiceImageViewSet, AdminActionLogViewSet, AdminCustomerViewSet, AdminSalonClosureViewSet, AdminTimeOffViewSet, EmployeeTimeOffViewSet,
					EmployeeEarningsView, EmployeeAppointmentPaymentReportView, GalleryListView, AdminGalleryViewSet, WaitlistView, AvailabilityCalendarView, CustomerBookingView, CustomerHistoryView,
					BlogCategoryListView, BlogPostDetailView, BlogPostListView, CustomerAppointmentDetailView, CustomerAppointmentListView, CustomerBookAgainView, CustomerDashboardView, CustomerDeletionRequestView, CustomerIdentityClaimView, CustomerNotificationViewSet, CustomerPasswordChangeView, CustomerPreferencesView, CustomerProfileView, CustomerAppointmentMutationView)

router = DefaultRouter()
router.register("admin/services", AdminServiceViewSet, basename="admin-service")
router.register("admin/gallery", AdminGalleryViewSet, basename="admin-gallery")
router.register("admin/employees", AdminEmployeeViewSet, basename="admin-employee")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("admin/customers", AdminCustomerViewSet, basename="admin-customer")
router.register("admin/closures", AdminSalonClosureViewSet, basename="admin-closure")
router.register("admin/time-off", AdminTimeOffViewSet, basename="admin-time-off")
router.register("admin/deletion-requests", AdminDeletionRequestViewSet, basename="admin-deletion-request")
router.register("admin/service-categories", AdminServiceCategoryViewSet, basename="admin-service-category")
router.register("admin/appointments", AdminAppointmentViewSet, basename="admin-appointment")
router.register("admin/working-schedules", WorkingScheduleViewSet, basename="working-schedule")
router.register("admin/appointment-items", AppointmentItemViewSet, basename="appointment-item")
router.register("admin/transactions", TransactionViewSet, basename="transaction")
router.register("admin/payments", PaymentViewSet, basename="payment")
router.register("admin/refunds", RefundViewSet, basename="refund")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("customer/notifications", CustomerNotificationViewSet, basename="customer-notification")
router.register("firebase-devices", FirebaseDeviceViewSet, basename="firebase-device")
router.register("admin/commissions", EmployeeCommissionViewSet, basename="commission")
router.register("admin/service-images", ServiceImageViewSet, basename="service-image")
router.register("admin/activity", AdminActionLogViewSet, basename="admin-activity")
router.register("admin/blog/posts", AdminBlogPostViewSet, basename="admin-blog-post")
router.register("admin/blog/media", AdminBlogMediaViewSet, basename="admin-blog-media")
router.register("admin/blog/categories", AdminBlogCategoryViewSet, basename="admin-blog-category")
router.register("admin/blog/tags", AdminBlogTagViewSet, basename="admin-blog-tag")
router.register("employee/appointment-items", EmployeeAppointmentItemViewSet, basename="employee-appointment-item")
router.register("employee/time-off", EmployeeTimeOffViewSet, basename="employee-time-off")
router.register("employee/schedule", EmployeeWorkingScheduleViewSet, basename="employee-schedule")

urlpatterns = [
	path("services/", ServiceListView.as_view(), name="service-list"),
	path("services/<str:slug>/", ServiceDetailView.as_view(), name="service-detail"),
	path("gallery/", GalleryListView.as_view(), name="gallery-list"),
	path("gallery/categories/", GalleryCategoryListView.as_view(), name="gallery-category-list"),
	path("blog/posts/", BlogPostListView.as_view(), name="blog-post-list"),
	path("blog/posts/<str:slug>/", BlogPostDetailView.as_view(), name="blog-post-detail"),
	path("blog/categories/", BlogCategoryListView.as_view(), name="blog-category-list"),
	path("employees/", EmployeeListView.as_view(), name="employee-list"),
	path("availability/", AvailabilityView.as_view(), name="availability-list"),
	path("availability/calendar/", AvailabilityCalendarView.as_view(), name="availability-calendar"),
	path("appointments/", AppointmentCreateView.as_view(), name="appointment-create"),
	path("booking-holds/", BookingHoldView.as_view(), name="booking-hold-create"),
	path("booking-holds/<uuid:token>/", BookingHoldDeleteView.as_view(), name="booking-hold-delete"),
	path("waitlist/", WaitlistView.as_view(), name="waitlist-create"),
	path("customer/booking/", CustomerBookingView.as_view(), name="customer-booking-lookup"),
	path("customer/history/", CustomerHistoryView.as_view(), name="customer-history"),
	path("customer/profile/", CustomerProfileView.as_view(), name="customer-profile"),
	path("customer/dashboard/", CustomerDashboardView.as_view(), name="customer-dashboard"),
	path("customer/appointments/", CustomerAppointmentListView.as_view(), name="customer-appointments"),
	path("customer/appointments/<int:appointment_id>/", CustomerAppointmentDetailView.as_view(), name="customer-appointment-detail"),
	path("customer/appointments/<int:appointment_id>/book-again/", CustomerBookAgainView.as_view(), name="customer-book-again"),
	path("customer/appointments/<int:appointment_id>/<str:action>/", CustomerAppointmentMutationView.as_view(), name="customer-appointment-mutation"),
	path("customer/preferences/", CustomerPreferencesView.as_view(), name="customer-preferences"),
	path("customer/password/", CustomerPasswordChangeView.as_view(), name="customer-password"),
	path("customer/account/deletion-request/", CustomerDeletionRequestView.as_view(), name="customer-deletion-request"),
	path("customer/account/claim-history/", CustomerIdentityClaimView.as_view(), name="customer-identity-claim"),
	path("employee/appointments/", EmployeeAppointmentsView.as_view(), name="employee-appointments"),
	path("employee/appointments/create/", EmployeeSelfBookingView.as_view(), name="employee-appointment-create"),
	path("employee/services/", EmployeeSelfServiceListView.as_view(), name="employee-service-list"),
	path("employee/customers/", EmployeeCustomerOptionsView.as_view(), name="employee-customer-options"),
	path("employee/appointments/<int:appointment_id>/payments/", EmployeeAppointmentPaymentReportView.as_view(), name="employee-appointment-payments"),
	path("employee/statistics/", EmployeeStatisticsView.as_view(), name="employee-statistics"),
	path("employee/profile/", EmployeeProfileView.as_view(), name="employee-profile"),
	path("employee/password/", EmployeePasswordChangeView.as_view(), name="employee-password-change"),
	path("employee/earnings/", EmployeeEarningsView.as_view(), name="employee-earnings"),
	path("admin/statistics/", AdminStatisticsView.as_view(), name="admin-statistics"),
	path("admin/gallery-categories/", AdminGalleryCategoryView.as_view(), name="admin-gallery-category-list"),
	path("admin/gallery-categories/<int:pk>/", AdminGalleryCategoryDetailView.as_view(), name="admin-gallery-category-detail"),
	path("admin/employee-eligible-users/", AdminEmployeeEligibleUsersView.as_view(), name="admin-employee-eligible-users"),
	path("admin/customer-options/", AdminCustomerOptionsView.as_view(), name="admin-customer-options"),
	path("admin/account/", AdminSelfAccountView.as_view(), name="admin-self-account"),
	path("admin/account/password/", AdminSelfPasswordChangeView.as_view(), name="admin-self-password"),
	path("admin/transaction-types/", AdminTransactionTypesView.as_view(), name="admin-transaction-types"),
	path("admin/revenue/", AdminRevenueView.as_view(), name="admin-revenue"),
	path("admin/employees/<int:employee_id>/finance/", AdminEmployeeFinanceView.as_view(), name="admin-employee-finance"),
	path("", include(router.urls)),
]
