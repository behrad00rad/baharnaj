from base64 import urlsafe_b64decode
from datetime import date as date_type, datetime, time, timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import AdminActionLog, Appointment, AppointmentItem, BookingHold, EmployeeProfile, EmployeeService, GalleryAsset, Payment, Service, ServiceCategory, ServiceImage, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule
from .permissions import IsAdmin, IsEmployee, IsOwnEmployeeObject
from .security import clear_failed_logins, is_locked, record_failed_login
from .serializers import AdminActionLogSerializer, AppointmentSerializer, BookingHoldSerializer, EmployeeSerializer, GalleryAssetSerializer, ServiceAdminSerializer, ServiceImageSerializer, ServiceSerializer, TimeOffSerializer, TransactionSerializer, UserAdminSerializer, AppointmentItemSerializer, WaitlistEntrySerializer, WorkingScheduleSerializer, PaymentSerializer


class ServiceListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    queryset = Service.objects.filter(is_active=True, is_bookable=True).select_related("category")
    serializer_class = ServiceSerializer


class GalleryListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    queryset = GalleryAsset.objects.filter(is_published=True)
    serializer_class = GalleryAssetSerializer


class EmployeeListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = EmployeeProfile.objects.filter(is_active=True).select_related("user")
        service_ids = [value for value in self.request.query_params.get("service", "").split(",") if value]
        if service_ids:
            return queryset.filter(service_links__service_id__in=service_ids, service_links__is_active=True).annotate(service_count=Count("service_links__service", distinct=True)).filter(service_count=len(set(service_ids)))
        return queryset


class AvailabilityView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    throttle_scope = "guest_booking"
    def list(self, request, *args, **kwargs):
        service_values = [value for value in request.query_params.get("service", "").split(",") if value]
        employee_id = request.query_params.get("employee")
        date_value = request.query_params.get("date")
        if not all((service_values, employee_id, date_value)):
            return Response({"detail": "خدمت، متخصص و تاریخ الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            services = list(Service.objects.filter(pk__in=service_values, is_active=True, is_bookable=True))
            employee = EmployeeProfile.objects.filter(pk=employee_id, is_active=True, service_links__service_id__in=service_values, service_links__is_active=True).distinct().first()
            appointment_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        except ValueError:
            return Response({"date": date_value, "slots": []})
        if employee is None or len(services) != len(set(service_values)) or EmployeeService.objects.filter(employee=employee, service_id__in=service_values, is_active=True).values("service_id").distinct().count() != len(set(service_values)):
            return Response({"date": date_value, "slots": []})
        if appointment_date < timezone.localdate():
            return Response({"date": date_value, "slots": []})
        duration = sum(service.duration for service in services)
        items = AppointmentItem.objects.filter(employee=employee, date=appointment_date, appointment__status__in=("pending", "confirmed"))
        schedule = employee.working_schedules.filter(weekday=appointment_date.weekday(), is_active=True).first()
        if not schedule:
            return Response({"date": date_value, "slots": []})
        slots = []
        current = datetime.combine(appointment_date, max(schedule.start_time, time(8)))
        closing = datetime.combine(appointment_date, min(schedule.end_time, time(20)))
        while current + timedelta(minutes=duration) <= closing:
            start, end = current.time(), (current + timedelta(minutes=duration)).time()
            if not items.filter(start_time__lt=end, end_time__gt=start).exists():
                slots.append(start.strftime("%H:%M"))
            current += timedelta(minutes=30)
        return Response({"date": date_value, "slots": slots})


class EmployeeAppointmentsView(generics.ListAPIView):
    serializer_class = AppointmentSerializer
    permission_classes = (IsEmployee,)

    def get_queryset(self):
        return Appointment.objects.filter(items__employee__user=self.request.user).prefetch_related("items")


class EmployeeStatisticsView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)

    def get(self, request):
        items = AppointmentItem.objects.filter(employee__user=request.user, completion_status="completed")
        return Response({"completed_services": items.count(), "income": sum(item.price_snapshot for item in items), "commission": 0, "customers": items.values("appointment__customer").distinct().count()})


class AdminStatisticsView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)
    def get(self, request):
        appointments = Appointment.objects.all()
        return Response({"appointments": appointments.count(), "completed": appointments.filter(status="completed").count(), "cancelled": appointments.filter(status="cancelled").count()})


class AppointmentCreateView(generics.CreateAPIView):
    permission_classes = (AllowAny,)
    throttle_scope = "guest_booking"
    serializer_class = AppointmentSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save()
        return Response(self.get_serializer(appointment).data, status=status.HTTP_201_CREATED)


class BookingHoldView(generics.CreateAPIView):
    permission_classes = (AllowAny,)
    throttle_scope = "guest_booking"
    serializer_class = BookingHoldSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        from .validators import validate_no_employee_overlap
        if not data["employee"].working_schedules.filter(weekday=data["date"].weekday(), is_active=True, start_time__lte=data["start_time"], end_time__gte=data["end_time"]).exists():
            return Response({"detail": "زمان انتخاب‌شده خارج از ساعات کاری متخصص است."}, status=status.HTTP_400_BAD_REQUEST)
        if data["employee"].time_off.filter(start_date__lte=data["date"], end_date__gte=data["date"]).exists():
            return Response({"detail": "متخصص در این تاریخ در دسترس نیست."}, status=status.HTTP_400_BAD_REQUEST)
        validate_no_employee_overlap(employee=data["employee"], date=data["date"], start_time=data["start_time"], end_time=data["end_time"])
        if BookingHold.objects.filter(employee=data["employee"], date=data["date"], expires_at__gt=timezone.now(), start_time__lt=data["end_time"], end_time__gt=data["start_time"]).exists():
            return Response({"detail": "این زمان موقتاً در اختیار مشتری دیگری است."}, status=status.HTTP_409_CONFLICT)
        hold = BookingHold.objects.create(expires_at=timezone.now() + timedelta(minutes=5), **data)
        return Response(self.get_serializer(hold).data, status=status.HTTP_201_CREATED)


class WaitlistView(generics.CreateAPIView):
    permission_classes = (AllowAny,)
    serializer_class = WaitlistEntrySerializer


class CustomerBookingView(generics.GenericAPIView):
    permission_classes = (AllowAny,)

    def find(self, request):
        return Appointment.objects.filter(customer__user__phone=request.data.get("phone"), confirmation_code=request.data.get("confirmation_code")).first()

    def post(self, request):
        appointment = self.find(request)
        if not appointment:
            return Response({"detail": "رزرو پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    def patch(self, request):
        appointment = self.find(request)
        if not appointment:
            return Response({"detail": "رزرو پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get("date") or request.data.get("start_time"):
            item = appointment.items.first()
            item.date = request.data.get("date", item.date)
            item.start_time = request.data.get("start_time", item.start_time)
            item.end_time = request.data.get("end_time", item.end_time)
            item.full_clean()
            item.save(update_fields=("date", "start_time", "end_time", "updated_at"))
        appointment.set_status("cancelled", reason=request.data.get("reason", "لغو توسط مشتری")) if request.data.get("cancel") else None
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)


class CustomerHistoryView(generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        return Appointment.objects.filter(customer__user=self.request.user).prefetch_related("items")


class AdminModelViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)


class AdminServiceViewSet(AdminModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceAdminSerializer


class AdminGalleryViewSet(AdminModelViewSet):
    queryset = GalleryAsset.objects.all()
    serializer_class = GalleryAssetSerializer


class AdminEmployeeViewSet(AdminModelViewSet):
    queryset = EmployeeProfile.objects.select_related("user")
    serializer_class = EmployeeSerializer

    def perform_update(self, serializer):
        employee = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="EmployeeProfile", object_id=str(employee.pk), details={"fields": list(serializer.validated_data)})


class AdminUserViewSet(AdminModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer


class AdminAppointmentViewSet(AdminModelViewSet):
    queryset = Appointment.objects.select_related("customer__user").prefetch_related("items__service", "items__employee__user")
    serializer_class = AppointmentSerializer

    def perform_update(self, serializer):
        appointment = self.get_object()
        status_value = serializer.validated_data.pop("status", None)
        if status_value:
            appointment.set_status(status_value, changed_by=self.request.user, reason=serializer.validated_data.pop("status_reason", ""))
        appointment = serializer.save(updated_by=self.request.user)
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="Appointment", object_id=str(appointment.pk), details={"fields": list(serializer.validated_data)})


class AppointmentItemViewSet(AdminModelViewSet):
    queryset = AppointmentItem.objects.select_related("appointment", "service", "employee__user")
    serializer_class = AppointmentItemSerializer


class WorkingScheduleViewSet(AdminModelViewSet):
    queryset = WorkingSchedule.objects.select_related("employee__user")
    serializer_class = WorkingScheduleSerializer


class TransactionViewSet(AdminModelViewSet):
    queryset = Transaction.objects.select_related("appointment")
    serializer_class = TransactionSerializer


class PaymentViewSet(AdminModelViewSet):
    queryset = Payment.objects.select_related("appointment")
    serializer_class = PaymentSerializer


class ServiceImageViewSet(AdminModelViewSet):
    queryset = ServiceImage.objects.select_related("service")
    serializer_class = ServiceImageSerializer


class AdminActionLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsAdmin,)
    queryset = AdminActionLog.objects.select_related("actor").order_by("-changed_at")
    serializer_class = AdminActionLogSerializer


class SalonTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        return data


class SalonTokenView(TokenObtainPairView):
    permission_classes = (AllowAny,)
    serializer_class = SalonTokenSerializer


class CookieTokenView(TokenObtainPairView):
    serializer_class = SalonTokenSerializer
    permission_classes = (AllowAny,)
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        username = request.data.get("username", "")
        user = User.objects.filter(username=username).first()
        if user and is_locked(user):
            return Response({"detail": "حساب موقتاً قفل شده است."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            if user:
                record_failed_login(user, username, request.META.get("REMOTE_ADDR"))
            return Response({"detail": "نام کاربری یا رمز عبور صحیح نیست."}, status=status.HTTP_401_UNAUTHORIZED)
        user = serializer.user
        clear_failed_logins(user, username, request.META.get("REMOTE_ADDR"))
        response = Response({"access": serializer.validated_data["access"], "role": user.role})
        response.set_cookie(settings.REFRESH_COOKIE_NAME, serializer.validated_data["refresh"], httponly=True, secure=settings.REFRESH_COOKIE_SECURE, samesite=settings.REFRESH_COOKIE_SAMESITE, max_age=7 * 24 * 3600)
        response["X-CSRFToken"] = get_token(request)
        return response


class CookieRefreshView(TokenRefreshView):
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not refresh:
            return Response({"detail": "نشست معتبر نیست."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data={"refresh": refresh})
        serializer.is_valid(raise_exception=True)
        response = Response({"access": serializer.validated_data["access"]})
        token = serializer.validated_data["access"]
        from rest_framework_simplejwt.tokens import AccessToken
        response.data["role"] = User.objects.get(pk=AccessToken(token)["user_id"]).role
        if "refresh" in serializer.validated_data:
            response.set_cookie(settings.REFRESH_COOKIE_NAME, serializer.validated_data["refresh"], httponly=True, secure=settings.REFRESH_COOKIE_SECURE, samesite=settings.REFRESH_COOKIE_SAMESITE, max_age=7 * 24 * 3600)
        return response


class CsrfView(generics.GenericAPIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        return JsonResponse({"csrfToken": get_token(request)})


class PasswordResetRequestView(generics.GenericAPIView):
    permission_classes = (AllowAny,)
    throttle_scope = "login"

    def post(self, request):
        user = User.objects.filter(email=request.data.get("email", ""), is_active=True).first()
        if user:
            from django.utils.encoding import force_bytes
            from django.utils.http import urlsafe_base64_encode
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            send_mail("Baharnaj password reset", f"Reset token: {uid}:{token}", settings.DEFAULT_FROM_EMAIL, [user.email])
        return Response({"detail": "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال می‌شود."})


class PasswordResetConfirmView(generics.GenericAPIView):
    permission_classes = (AllowAny,)

    def post(self, request, uidb64, token):
        try:
            uid = urlsafe_b64decode(uidb64 + "=" * (-len(uidb64) % 4)).decode()
            user = User.objects.get(pk=uid, is_active=True)
        except (ValueError, TypeError, User.DoesNotExist):
            user = None
        password = request.data.get("new_password", "")
        if not user or not default_token_generator.check_token(user, token) or len(password) < 8:
            return Response({"detail": "لینک بازیابی یا رمز عبور معتبر نیست."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=("password",))
        return Response({"detail": "رمز عبور تغییر کرد."})


class EmployeeAppointmentItemViewSet(viewsets.ModelViewSet):
    permission_classes = (IsOwnEmployeeObject,)
    serializer_class = AppointmentItemSerializer

    def get_queryset(self):
        return AppointmentItem.objects.filter(employee__user=self.request.user).select_related("appointment", "service", "employee__user")

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=("post",))
    def action(self, request, pk=None):
        item = self.get_object()
        next_status = request.data.get("status")
        reason = request.data.get("reason", "")
        status_map = {"arrival": "confirmed", "start": "in_progress", "complete": "completed", "cancel": "cancelled"}
        if next_status not in status_map:
            return Response({"detail": "عملیات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if next_status == "cancel" and not reason.strip():
            return Response({"detail": "دلیل لغو الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        item.set_completion_status(status_map[next_status], changed_by=request.user, reason=reason)
        return Response(AppointmentItemSerializer(item, context={"request": request}).data)

class EmployeeProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsOwnEmployeeObject,)
    serializer_class = EmployeeSerializer

    def get_object(self):
        return EmployeeProfile.objects.get(user=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="EmployeeProfile", object_id=str(employee.pk), details={"fields": list(serializer.validated_data)})


class EmployeeTimeOffViewSet(viewsets.ModelViewSet):
    permission_classes = (IsEmployee,)
    serializer_class = TimeOffSerializer

    def get_queryset(self):
        return TimeOff.objects.filter(employee__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(employee=EmployeeProfile.objects.get(user=self.request.user), created_by=self.request.user)


class EmployeeEarningsView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)

    def get(self, request):
        items = AppointmentItem.objects.filter(employee__user=request.user, completion_status="completed").select_related("service")
        return Response({"items": [{"date": item.date, "service": item.service.persian_name, "price": item.price_snapshot, "payment_status": "unknown", "commission": sum(c.commission_amount for c in item.commissions.all())} for item in items], "total": sum(item.price_snapshot for item in items)})
