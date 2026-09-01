from base64 import urlsafe_b64decode
from datetime import date as date_type, datetime, time, timedelta
import json

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count, Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import AdminActionLog, Appointment, AppointmentItem, BookingHold, BookingHoldItem, CustomerProfile, EmployeeProfile, EmployeeService, GalleryAsset, Payment, Service, ServiceCategory, ServiceImage, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule
from .permissions import IsAdmin, IsEmployee, IsOwnEmployeeObject
from .security import clear_failed_logins, is_locked, record_failed_login
from .serializers import AdminActionLogSerializer, AdminAppointmentCreateSerializer, AdminAppointmentStatusSerializer, AdminCustomerOptionSerializer, AdminEmployeeCreateSerializer, AdminEmployeeSerializer, AppointmentSerializer, BookingHoldSerializer, EmployeeSelfProfileSerializer, EmployeeSerializer, EmployeeWorkingScheduleSerializer, GalleryAssetSerializer, ServiceAdminSerializer, ServiceCategorySerializer, ServiceImageSerializer, ServiceSerializer, TimeOffSerializer, TransactionSerializer, UserAdminSerializer, AppointmentItemSerializer, WaitlistEntrySerializer, WorkingScheduleSerializer, PaymentSerializer


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
        raw_items = request.query_params.get("items")
        if raw_items:
            try:
                selected_items = json.loads(raw_items)
            except json.JSONDecodeError:
                return Response({"detail": "جزئیات خدمات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            selected_items = [{"service": value, "employee": request.query_params.get("employee")} for value in request.query_params.get("service", "").split(",") if value]
        service_values = [value for value in request.query_params.get("service", "").split(",") if value]
        date_value = request.query_params.get("date")
        if not selected_items or not date_value:
            return Response({"detail": "خدمت، متخصص و تاریخ الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            appointment_date = datetime.strptime(date_value, "%Y-%m-%d").date()
            segments = []
            for selected in selected_items:
                service = Service.objects.filter(pk=selected["service"], is_active=True, is_bookable=True).first()
                employee = EmployeeProfile.objects.filter(pk=selected["employee"], is_active=True).first()
                if not service or not employee or not EmployeeService.objects.filter(employee=employee, service=service, is_active=True).exists():
                    return Response({"date": date_value, "slots": []})
                segments.append((service, employee))
        except ValueError:
            return Response({"date": date_value, "slots": []})
        if appointment_date < timezone.localdate():
            return Response({"date": date_value, "slots": []})
        slots = []
        current = datetime.combine(appointment_date, time(8))
        closing = datetime.combine(appointment_date, time(20))
        while current < closing:
            segment_start = current
            available = True
            for service, employee in segments:
                segment_end = segment_start + timedelta(minutes=service.duration)
                schedule = employee.working_schedules.filter(weekday=appointment_date.weekday(), is_active=True, start_time__lte=segment_start.time(), end_time__gte=segment_end.time()).first()
                appointment_conflict = AppointmentItem.objects.filter(employee=employee, date=appointment_date, appointment__status__in=("pending", "confirmed"), start_time__lt=segment_end.time(), end_time__gt=segment_start.time()).exists()
                hold_conflict = BookingHoldItem.objects.filter(employee=employee, date=appointment_date, hold__expires_at__gt=timezone.now(), start_time__lt=segment_end.time(), end_time__gt=segment_start.time()).exists()
                if not schedule or employee.time_off.filter(start_date__lte=appointment_date, end_date__gte=appointment_date).exists() or appointment_conflict or hold_conflict:
                    available = False
                    break
                segment_start = segment_end
            if available:
                slots.append(current.strftime("%H:%M"))
            current += timedelta(minutes=30)
        return Response({"date": date_value, "slots": slots})


class EmployeeAppointmentsView(generics.ListAPIView):
    serializer_class = AppointmentSerializer
    permission_classes = (IsEmployee,)

    def get_queryset(self):
        queryset = Appointment.objects.filter(items__employee__user=self.request.user).prefetch_related("items")
        selected_date = self.request.query_params.get("date")
        if selected_date:
            queryset = queryset.filter(items__date=selected_date)
        return queryset.distinct()


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

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        held_items = serializer.validated_data["items"]
        from .validators import validate_no_employee_overlap
        for item in held_items:
            if not item["employee"].working_schedules.filter(weekday=item["date"].weekday(), is_active=True, start_time__lte=item["start_time"], end_time__gte=item["end_time"]).exists():
                return Response({"detail": "زمان انتخاب‌شده خارج از ساعات کاری متخصص است."}, status=status.HTTP_400_BAD_REQUEST)
            if item["employee"].time_off.filter(start_date__lte=item["date"], end_date__gte=item["date"]).exists():
                return Response({"detail": "متخصص در این تاریخ در دسترس نیست."}, status=status.HTTP_400_BAD_REQUEST)
            validate_no_employee_overlap(employee=item["employee"], date=item["date"], start_time=item["start_time"], end_time=item["end_time"])
            if BookingHoldItem.objects.filter(employee=item["employee"], date=item["date"], hold__expires_at__gt=timezone.now(), start_time__lt=item["end_time"], end_time__gt=item["start_time"]).exists():
                return Response({"detail": "این زمان موقتاً در اختیار مشتری دیگری است."}, status=status.HTTP_409_CONFLICT)
        first_item = held_items[0]
        hold = BookingHold.objects.create(owner=request.user if request.user.is_authenticated else None, expires_at=timezone.now() + timedelta(minutes=5), **first_item)
        BookingHoldItem.objects.bulk_create([BookingHoldItem(hold=hold, **item) for item in held_items])
        return Response(self.get_serializer(hold).data, status=status.HTTP_201_CREATED)


class BookingHoldDeleteView(generics.DestroyAPIView):
    permission_classes = (AllowAny,)
    lookup_field = "token"
    queryset = BookingHold.objects.all()


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
    serializer_class = AdminEmployeeSerializer

    def get_serializer_class(self):
        return AdminEmployeeCreateSerializer if self.action == "create" else AdminEmployeeSerializer

    def perform_create(self, serializer):
        employee = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="create", model_name="EmployeeProfile", object_id=str(employee.pk), details={"username": employee.user.username})

    def perform_update(self, serializer):
        employee = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="EmployeeProfile", object_id=str(employee.pk), details={"fields": list(serializer.validated_data)})


class AdminUserViewSet(AdminModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer


class AdminEmployeeEligibleUsersView(generics.ListAPIView):
    permission_classes = (IsAdmin,)
    serializer_class = UserAdminSerializer

    def get_queryset(self):
        return User.objects.filter(role="employee", employee_profile__isnull=True).order_by("username")


class AdminCustomerOptionsView(generics.ListAPIView):
    permission_classes = (IsAdmin,)
    serializer_class = AdminCustomerOptionSerializer
    queryset = CustomerProfile.objects.select_related("user").order_by("user__first_name", "user__username")


class AdminTransactionTypesView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)

    def get(self, request):
        return Response([{"value": value, "label": label} for value, label in Transaction.TYPE_CHOICES])


class AdminServiceCategoryViewSet(AdminModelViewSet):
    queryset = ServiceCategory.objects.order_by("name")
    serializer_class = ServiceCategorySerializer


class AdminAppointmentViewSet(AdminModelViewSet):
    queryset = Appointment.objects.select_related("customer__user").prefetch_related("items__service", "items__employee__user")
    serializer_class = AppointmentSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return AdminAppointmentCreateSerializer
        if self.action in {"update", "partial_update"}:
            return AdminAppointmentStatusSerializer
        return AppointmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            queryset = queryset.filter(items__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(items__date__lte=end_date)
        for query_name, lookup in (("status", "status"), ("employee", "items__employee_id"), ("service", "items__service_id")):
            value = self.request.query_params.get(query_name)
            if value:
                queryset = queryset.filter(**{lookup: value})
        return queryset.distinct()

    def perform_create(self, serializer):
        appointment = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="create", model_name="Appointment", object_id=str(appointment.pk), details={"status": appointment.status})

    def perform_update(self, serializer):
        appointment = self.get_object()
        status_value = serializer.validated_data["status"]
        appointment.set_status(status_value, changed_by=self.request.user)
        appointment.refresh_from_db()
        serializer.instance = appointment
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="Appointment", object_id=str(appointment.pk), details={"fields": ["status"]})


class AppointmentItemViewSet(AdminModelViewSet):
    queryset = AppointmentItem.objects.select_related("appointment", "service", "employee__user")
    serializer_class = AppointmentItemSerializer


class WorkingScheduleViewSet(AdminModelViewSet):
    queryset = WorkingSchedule.objects.select_related("employee__user")
    serializer_class = WorkingScheduleSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        return queryset.filter(employee_id=employee_id) if employee_id else queryset


class TransactionViewSet(AdminModelViewSet):
    queryset = Transaction.objects.select_related("appointment")
    serializer_class = TransactionSerializer


class PaymentViewSet(AdminModelViewSet):
    queryset = Payment.objects.select_related("appointment")
    serializer_class = PaymentSerializer


class AdminRevenueView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)

    def get(self, request):
        period = request.query_params.get("period", "day")
        anchor = request.query_params.get("date")
        try:
            current = datetime.strptime(anchor, "%Y-%m-%d").date() if anchor else timezone.localdate()
        except ValueError:
            return Response({"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if period == "week":
            start, end = current - timedelta(days=current.weekday()), current + timedelta(days=6 - current.weekday())
        elif period == "month":
            start = current.replace(day=1)
            end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        else:
            start = end = current
        total = Payment.objects.filter(status="paid", created_at__date__range=(start, end)).aggregate(total=Sum("amount"))["total"] or 0
        return Response({"period": period, "start_date": start, "end_date": end, "total": total})


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
    serializer_class = EmployeeSelfProfileSerializer

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


class EmployeeWorkingScheduleViewSet(viewsets.ModelViewSet):
    permission_classes = (IsEmployee,)
    serializer_class = EmployeeWorkingScheduleSerializer

    def get_queryset(self):
        return WorkingSchedule.objects.filter(employee__user=self.request.user).select_related("employee__user")

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user.employee_profile, created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class EmployeeEarningsView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)

    def get(self, request):
        period = request.query_params.get("period", "day")
        current = timezone.localdate()
        if period == "week":
            start_date, end_date = current - timedelta(days=current.weekday()), current + timedelta(days=6 - current.weekday())
        elif period == "month":
            start_date = current.replace(day=1)
            end_date = (start_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        elif period == "day":
            start_date = end_date = current
        else:
            return Response({"detail": "بازه زمانی نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)

        items = AppointmentItem.objects.filter(employee__user=request.user, date__range=(start_date, end_date)).select_related("service", "appointment").prefetch_related("commissions", "appointment__payments")
        rows = []
        for item in items:
            payment_statuses = [payment.status for payment in item.appointment.payments.all()]
            payment_status = "paid" if "paid" in payment_statuses else "refunded" if "refunded" in payment_statuses else "pending" if "pending" in payment_statuses else "unpaid"
            commission = sum(record.commission_amount for record in item.commissions.all())
            rows.append({"date": item.date, "service": item.service.persian_name, "gross_service_revenue": item.price_snapshot, "employee_commission": commission, "payment_status": payment_status})
        return Response({"period": period, "start_date": start_date, "end_date": end_date, "items": rows, "gross_service_revenue": sum(row["gross_service_revenue"] for row in rows), "employee_commission": sum(row["employee_commission"] for row in rows), "payment_statuses": {key: sum(row["payment_status"] == key for row in rows) for key in ("paid", "pending", "refunded", "unpaid")}})
