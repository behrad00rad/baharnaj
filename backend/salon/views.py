from base64 import urlsafe_b64decode
import copy
from datetime import date as date_type, datetime, time, timedelta
import json

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Case, Count, IntegerField, Prefetch, Q, Sum, When
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import AdminActionLog, Appointment, AppointmentItem, BlogCategory, BlogMedia, BlogPost, BlogTag, BookingHold, BookingHoldItem, CustomerProfile, EmployeeCommission, EmployeeProfile, EmployeeService, FirebaseDevice, GalleryAsset, GalleryCategory, Notification, Payment, Refund, Service, ServiceCategory, ServiceImage, TimeOff, Transaction, User, WaitlistEntry, WorkingSchedule
from .permissions import IsAdmin, IsEmployee, IsOwnEmployeeObject
from .security import clear_failed_logins, is_locked, record_failed_login
from .serializers import AdminActionLogSerializer, AdminAppointmentCreateSerializer, AdminAppointmentStatusSerializer, AdminBlogPostListSerializer, AdminBlogPostSerializer, AdminCustomerOptionSerializer, AdminEmployeeCreateSerializer, AdminEmployeeSerializer, AdminGalleryAssetSerializer, AppointmentSerializer, BlogCategorySerializer, BlogMediaSerializer, BlogPostDetailSerializer, BlogPostListSerializer, BlogTagSerializer, BookingHoldSerializer, EmployeeAppointmentSerializer, EmployeeCommissionSerializer, EmployeePasswordChangeSerializer, EmployeePaymentReportSerializer, EmployeeSelfBookingSerializer, EmployeeSelfProfileSerializer, EmployeeSerializer, EmployeeWorkingScheduleSerializer, FirebaseDeviceSerializer, GalleryAssetSerializer, GalleryCategorySerializer, NotificationSerializer, RefundSerializer, ServiceAdminSerializer, ServiceCategorySerializer, ServiceImageSerializer, ServiceSerializer, TimeOffSerializer, TransactionSerializer, UserAdminSerializer, AppointmentItemSerializer, WaitlistEntrySerializer, WorkingScheduleSerializer, PaymentSerializer


def public_blog_posts():
    now = timezone.now()
    return BlogPost.objects.filter(
        Q(status=BlogPost.STATUS_PUBLISHED)
        | Q(status=BlogPost.STATUS_SCHEDULED, scheduled_publish_at__lte=now)
    ).select_related("category", "author").prefetch_related("tags")


class BlogPagination(PageNumberPagination):
    page_size = 9
    page_size_query_param = "page_size"
    max_page_size = 30


class BlogPostListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = BlogPostListSerializer
    pagination_class = BlogPagination

    def get_queryset(self):
        queryset = public_blog_posts()
        category = self.request.query_params.get("category")
        tag = self.request.query_params.get("tag")
        query = self.request.query_params.get("q", "").strip()
        featured = self.request.query_params.get("featured")
        service = self.request.query_params.get("service")
        if category:
            queryset = queryset.filter(category_id=category) if category.isdigit() else queryset.filter(category__slug=category)
        if tag:
            queryset = queryset.filter(tags__id=tag) if tag.isdigit() else queryset.filter(tags__slug=tag)
        if query:
            queryset = queryset.filter(Q(title__icontains=query) | Q(excerpt__icontains=query))
        if featured in {"1", "true"}:
            queryset = queryset.filter(is_featured=True)
        if service:
            queryset = queryset.filter(related_services__id=service) if service.isdigit() else queryset.none()
        return queryset.distinct().order_by("-is_featured", "-published_at", "-scheduled_publish_at", "-created_at")


class BlogPostDetailView(generics.RetrieveAPIView):
    permission_classes = (AllowAny,)
    serializer_class = BlogPostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return public_blog_posts().prefetch_related("media", "related_services__images", "related_services__category", "related_services__employee_links__employee__user")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if getattr(self, "kwargs", {}).get("slug"):
            current = self.get_queryset().filter(slug=self.kwargs["slug"]).first()
            if current:
                tag_ids = list(current.tags.values_list("id", flat=True))
                related = public_blog_posts().exclude(pk=current.pk)
                if current.category_id or tag_ids:
                    related = related.filter(Q(category_id=current.category_id) | Q(tags__id__in=tag_ids))
                related = related.annotate(
                    category_match=Case(When(category_id=current.category_id, then=1), default=0, output_field=IntegerField()),
                    tag_matches=Count("tags", filter=Q(tags__id__in=tag_ids), distinct=True),
                ).order_by("-category_match", "-tag_matches", "-published_at").distinct()[:3]
                context["related_articles"] = list(related)
        return context


class BlogCategoryListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = BlogCategorySerializer

    def get_queryset(self):
        now = timezone.now()
        return BlogCategory.objects.filter(is_active=True).annotate(
            post_count=Count(
                "posts",
                filter=Q(posts__status=BlogPost.STATUS_PUBLISHED)
                | Q(posts__status=BlogPost.STATUS_SCHEDULED, posts__scheduled_publish_at__lte=now),
                distinct=True,
            )
        ).filter(post_count__gt=0)


class AdminBlogPostViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = AdminBlogPostSerializer
    pagination_class = BlogPagination

    def get_serializer_class(self):
        return AdminBlogPostListSerializer if self.action == "list" else AdminBlogPostSerializer

    def get_queryset(self):
        queryset = BlogPost.objects.select_related("category", "author").prefetch_related(
            "tags", "media", "related_services__images", "related_services__category", "related_services__employee_links__employee__user"
        )
        status_value = self.request.query_params.get("status")
        category = self.request.query_params.get("category")
        tag = self.request.query_params.get("tag")
        author = self.request.query_params.get("author")
        query = self.request.query_params.get("q", "").strip()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if status_value:
            queryset = queryset.filter(status=status_value)
        if category:
            queryset = queryset.filter(category_id=category)
        if tag:
            queryset = queryset.filter(tags__id=tag)
        if author:
            queryset = queryset.filter(author_id=author)
        if query:
            queryset = queryset.filter(Q(title__icontains=query) | Q(excerpt__icontains=query) | Q(slug__icontains=query))
        if date_from:
            queryset = queryset.filter(updated_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(updated_at__date__lte=date_to)
        return queryset.distinct().order_by("-updated_at")

    def perform_create(self, serializer):
        post = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="create", model_name="BlogPost", object_id=str(post.pk), details={"title": post.title})

    def perform_update(self, serializer):
        post = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="BlogPost", object_id=str(post.pk), details={"fields": list(serializer.validated_data)})

    def destroy(self, request, *args, **kwargs):
        post = self.get_object()
        if post.status in {BlogPost.STATUS_PUBLISHED, BlogPost.STATUS_SCHEDULED}:
            return Response({"detail": "مقاله منتشرشده را ابتدا آرشیو کنید."}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)

    def _change_status(self, request, post, next_status):
        if next_status == BlogPost.STATUS_SCHEDULED:
            scheduled = request.data.get("scheduled_publish_at")
            if not scheduled:
                raise ValidationError({"scheduled_publish_at": "زمان انتشار الزامی است."})
            post.scheduled_publish_at = serializers.DateTimeField().to_internal_value(scheduled)
            if post.scheduled_publish_at <= timezone.now():
                raise ValidationError({"scheduled_publish_at": "زمان انتشار باید در آینده باشد."})
        if next_status == BlogPost.STATUS_PUBLISHED and not post.published_at:
            post.published_at = timezone.now()
        post.status = next_status
        post.save()
        AdminActionLog.objects.create(actor=request.user, action=next_status, model_name="BlogPost", object_id=str(post.pk), details={"title": post.title})
        return Response(self.get_serializer(post).data)

    @action(detail=True, methods=("post",))
    def publish(self, request, pk=None):
        return self._change_status(request, self.get_object(), BlogPost.STATUS_PUBLISHED)

    @action(detail=True, methods=("post",))
    def unpublish(self, request, pk=None):
        return self._change_status(request, self.get_object(), BlogPost.STATUS_DRAFT)

    @action(detail=True, methods=("post",))
    def archive(self, request, pk=None):
        return self._change_status(request, self.get_object(), BlogPost.STATUS_ARCHIVED)

    @action(detail=True, methods=("post",))
    def schedule(self, request, pk=None):
        return self._change_status(request, self.get_object(), BlogPost.STATUS_SCHEDULED)

    @action(detail=True, methods=("post",))
    def duplicate(self, request, pk=None):
        source = self.get_object()
        duplicate = BlogPost.objects.create(
            title=f"کپی {source.title}", excerpt=source.excerpt, content=[],
            category=source.category, author=request.user, seo_title=source.seo_title,
            seo_description=source.seo_description, cover_alt_text=source.cover_alt_text,
            cover_image=source.cover_image, og_image=source.og_image,
        )
        duplicate.tags.set(source.tags.all())
        duplicate.related_services.set(source.related_services.all())
        media_map = {}
        for source_media in source.media.all():
            cloned = BlogMedia.objects.create(
                post=duplicate, image=source_media.image, alt_text=source_media.alt_text,
                caption=source_media.caption, display_order=source_media.display_order,
            )
            media_map[source_media.pk] = cloned.pk
        duplicate.content = copy.deepcopy(source.content)
        for block in duplicate.content:
            if block.get("type") == "image" and block.get("media_id") in media_map:
                block["media_id"] = media_map[block["media_id"]]
        duplicate.save(update_fields=("content", "updated_at"))
        AdminActionLog.objects.create(actor=request.user, action="duplicate", model_name="BlogPost", object_id=str(duplicate.pk), details={"source": source.pk})
        return Response(self.get_serializer(duplicate).data, status=status.HTTP_201_CREATED)


class AdminBlogMediaViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = BlogMediaSerializer

    def get_queryset(self):
        queryset = BlogMedia.objects.select_related("post")
        post = self.request.query_params.get("post")
        return queryset.filter(post_id=post) if post else queryset

    def perform_destroy(self, instance):
        post = instance.post
        post.content = [
            block for block in post.content
            if block.get("type") != "image" or block.get("media_id") != instance.pk
        ]
        post.save(update_fields=("content", "updated_at"))
        instance.delete()


class AdminBlogCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = BlogCategorySerializer
    queryset = BlogCategory.objects.annotate(post_count=Count("posts"))

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.posts.exists():
            category.is_active = False
            category.save(update_fields=("is_active", "updated_at"))
            return Response(self.get_serializer(category).data)
        return super().destroy(request, *args, **kwargs)


class AdminBlogTagViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    serializer_class = BlogTagSerializer
    queryset = BlogTag.objects.all()


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsAdmin | IsEmployee,)
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related("appointment", "payment")

    @action(detail=False, methods=("get",), url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})

    @action(detail=True, methods=("post",))
    def read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=("is_read", "read_at"))
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=("post",), url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True, read_at=timezone.now())
        return Response({"count": 0})


class FirebaseDeviceViewSet(viewsets.ViewSet):
    permission_classes = (IsAdmin | IsEmployee,)

    def list(self, request):
        configured = bool(settings.FIREBASE_PROJECT_ID and settings.FIREBASE_SERVICE_ACCOUNT_CONFIGURED)
        return Response({"configured": configured})

    def create(self, request):
        serializer = FirebaseDeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        device, _ = FirebaseDevice.objects.update_or_create(token=data["token"], defaults={"user": request.user, "device_label": data.get("device_label", ""), "is_active": True, "last_seen_at": timezone.now()})
        return Response(FirebaseDeviceSerializer(device).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=("post",), url_path="disable")
    def disable(self, request):
        FirebaseDevice.objects.filter(user=request.user, token=request.data.get("token", "")).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=("post",), url_path="test")
    def test_notification(self, request):
        from .notifications import notify_users
        target_url = "/admin" if request.user.role == "admin" else "/employee"
        notification = notify_users(
            [request.user],
            type="appointment_updated",
            title="اعلان آزمایشی بهارناژ",
            message="اگر این پیام را می‌بینید، سیستم اعلان به‌درستی کار می‌کند.",
            target_url=target_url,
        )[0]
        return Response(NotificationSerializer(notification).data, status=status.HTTP_201_CREATED)


class ServiceListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    queryset = Service.objects.filter(is_active=True, is_bookable=True).select_related("category").prefetch_related("images", "employee_links__employee__user")
    serializer_class = ServiceSerializer


class ServiceDetailView(generics.RetrieveAPIView):
    permission_classes = (AllowAny,)
    serializer_class = ServiceSerializer

    def get_queryset(self):
        return Service.objects.filter(is_active=True, is_bookable=True).select_related("category").prefetch_related("images", "employee_links__employee__user")

    def get_object(self):
        identifier = self.kwargs["slug"]
        queryset = self.get_queryset()
        service = queryset.filter(slug=identifier).first()
        if service is None and identifier.isdigit():
            service = queryset.filter(pk=identifier).first()
        if service is None:
            from django.http import Http404
            raise Http404
        return service


class GalleryListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    queryset = GalleryAsset.objects.filter(is_published=True).select_related("category")
    serializer_class = GalleryAssetSerializer


class GalleryCategoryListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    queryset = GalleryCategory.objects.filter(is_active=True)
    serializer_class = GalleryCategorySerializer


class EmployeeListView(generics.ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = EmployeeProfile.objects.filter(is_active=True).select_related("user").prefetch_related("service_links__service")
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
    serializer_class = EmployeeAppointmentSerializer
    permission_classes = (IsEmployee,)

    def get_queryset(self):
        selected_date = self.request.query_params.get("date")
        start_date = self.request.query_params.get("start")
        end_date = self.request.query_params.get("end")
        item_filters = {"employee__user": self.request.user}
        appointment_filters = {"items__employee__user": self.request.user}
        notification_appointment = self.request.query_params.get("appointment")
        if notification_appointment:
            if not notification_appointment.isdigit():
                raise ValidationError({"appointment": "شناسه نوبت نامعتبر است."})
            appointment_filters["pk"] = notification_appointment
        if selected_date:
            item_filters["date"] = selected_date
            appointment_filters["items__date"] = selected_date
        elif start_date or end_date:
            if not (start_date and end_date):
                raise ValidationError({"detail": "هر دو تاریخ شروع و پایان الزامی هستند."})
            item_filters["date__range"] = (start_date, end_date)
            appointment_filters["items__date__range"] = (start_date, end_date)
        own_items = AppointmentItem.objects.filter(**item_filters).select_related("service", "employee__user")
        queryset = (
            Appointment.objects.filter(**appointment_filters)
            .select_related("customer__user")
            .prefetch_related(Prefetch("items", queryset=own_items, to_attr="employee_items"), "payments__refunds")
        )
        return queryset.distinct()


class EmployeeSelfServiceListView(generics.ListAPIView):
    permission_classes = (IsEmployee,)
    serializer_class = ServiceSerializer

    def get_queryset(self):
        return Service.objects.filter(employee_links__employee__user=self.request.user, employee_links__is_active=True, is_active=True, is_bookable=True).distinct()


class EmployeeCustomerOptionsView(generics.ListAPIView):
    permission_classes = (IsEmployee,)
    serializer_class = AdminCustomerOptionSerializer

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return CustomerProfile.objects.none()
        return CustomerProfile.objects.filter(Q(user__first_name__icontains=query) | Q(user__last_name__icontains=query) | Q(user__phone__icontains=query)).select_related("user")[:20]


class EmployeeSelfBookingView(generics.CreateAPIView):
    permission_classes = (IsEmployee,)
    serializer_class = EmployeeSelfBookingSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save()
        from .notifications import notify_appointment_created
        notify_appointment_created(appointment, actor=request.user)
        return Response(EmployeeAppointmentSerializer(appointment, context={"request": request}).data, status=status.HTTP_201_CREATED)


class EmployeeStatisticsView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)

    def get(self, request):
        today = timezone.localdate()
        now = timezone.localtime().time()
        today_items = AppointmentItem.objects.filter(employee__user=request.user, date=today)
        completed_items = today_items.filter(completion_status="completed")
        commissions = EmployeeCommission.objects.filter(appointment_item__employee__user=request.user, appointment_item__date=today)
        next_item = (
            AppointmentItem.objects.filter(employee__user=request.user, appointment__status__in=("pending", "confirmed"))
            .exclude(completion_status__in=("completed", "cancelled"))
            .filter(Q(date__gt=today) | Q(date=today, start_time__gte=now))
            .select_related("appointment__customer__user", "service")
            .order_by("date", "start_time")
            .first()
        )
        return Response({
            "today_total": today_items.values("appointment_id").distinct().count(),
            "completed_services": completed_items.count(),
            "remaining_services": today_items.exclude(completion_status__in=("completed", "cancelled")).count(),
            "employee_commission": commissions.aggregate(total=Sum("commission_amount"))["total"] or 0,
            "next_appointment": EmployeeAppointmentSerializer(next_item.appointment, context={"request": request}).data if next_item else None,
            "next_appointment_item": AppointmentItemSerializer(next_item, context={"request": request}).data if next_item else None,
        })


class AdminStatisticsView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)
    def get(self, request):
        current = timezone.localdate()
        week_start = current - timedelta(days=current.weekday())
        week_end = week_start + timedelta(days=6)
        month_start = current.replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        today = Appointment.objects.filter(items__date=current).distinct()
        week = Appointment.objects.filter(items__date__range=(week_start, week_end)).distinct()
        month = Appointment.objects.filter(items__date__range=(month_start, month_end)).distinct()
        status_counts = {key: today.filter(status=key).count() for key in ("pending", "confirmed", "completed", "cancelled")}
        top_services = (
            AppointmentItem.objects.filter(date__range=(month_start, month_end))
            .values("service_id", "service__persian_name")
            .annotate(count=Count("appointment_id", distinct=True))
            .order_by("-count", "service__persian_name")[:5]
        )
        def revenue(start, end):
            received = Payment.objects.filter(status__in=("paid", "refunded"), paid_at__date__range=(start, end)).aggregate(total=Sum("amount"))["total"] or 0
            refunded = Refund.objects.filter(status="completed", created_at__date__range=(start, end)).aggregate(total=Sum("amount"))["total"] or 0
            return received - refunded
        return Response({
            "today": {"appointments": today.count(), **status_counts},
            "week": {"appointments": week.count()},
            "month": {"appointments": month.count()},
            "top_services": [{"id": row["service_id"], "name": row["service__persian_name"], "appointments": row["count"]} for row in top_services],
            "revenue": {"today": revenue(current, current), "week": revenue(week_start, week_end), "month": revenue(month_start, month_end)},
            "revenue_available": True,
        })


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
            from .notifications import notify_appointment_rescheduled
            notify_appointment_rescheduled(appointment, actor=request.user)
        if request.data.get("cancel"):
            appointment.set_status("cancelled", reason=request.data.get("reason", "لغو توسط مشتری"))
            from .notifications import notify_appointment_cancelled
            notify_appointment_cancelled(appointment)
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)


class CustomerHistoryView(generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        return Appointment.objects.filter(customer__user=self.request.user).prefetch_related("items")


class AdminModelViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)


class AdminServiceViewSet(AdminModelViewSet):
    queryset = Service.objects.select_related("category").prefetch_related("images", "employee_links__employee__user")
    serializer_class = ServiceAdminSerializer


class AdminGalleryViewSet(AdminModelViewSet):
    queryset = GalleryAsset.objects.select_related("category")
    serializer_class = AdminGalleryAssetSerializer


class AdminGalleryCategoryView(generics.ListCreateAPIView):
    permission_classes = (IsAdmin,)
    queryset = GalleryCategory.objects.filter(is_active=True)
    serializer_class = GalleryCategorySerializer


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
    queryset = Appointment.objects.select_related("customer__user").prefetch_related("items__service", "items__employee__user", "payments__refunds", "status_history__changed_by")
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
        from .notifications import notify_appointment_created
        notify_appointment_created(appointment, actor=self.request.user)
        AdminActionLog.objects.create(actor=self.request.user, action="create", model_name="Appointment", object_id=str(appointment.pk), details={"status": appointment.status})

    def perform_update(self, serializer):
        appointment = self.get_object()
        status_value = serializer.validated_data["status"]
        if status_value == "completed":
            for item in appointment.items.exclude(completion_status="completed"):
                item.set_completion_status("completed", changed_by=self.request.user)
        else:
            appointment.set_status(status_value, changed_by=self.request.user)
        if status_value == "cancelled":
            from .notifications import notify_appointment_cancelled
            notify_appointment_cancelled(appointment, actor=self.request.user)
        appointment.refresh_from_db()
        serializer.instance = appointment
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="Appointment", object_id=str(appointment.pk), details={"fields": ["status"]})


class AppointmentItemViewSet(AdminModelViewSet):
    queryset = AppointmentItem.objects.select_related("appointment", "service", "employee__user")
    serializer_class = AppointmentItemSerializer

    def perform_update(self, serializer):
        item = self.get_object()
        old_schedule = (item.date, item.start_time, item.end_time)
        item = serializer.save(updated_by=self.request.user)
        if old_schedule != (item.date, item.start_time, item.end_time):
            from .notifications import notify_appointment_rescheduled
            notify_appointment_rescheduled(item.appointment, actor=self.request.user)

    @action(detail=True, methods=("post",))
    @transaction.atomic
    def action(self, request, pk=None):
        item = self.get_object()
        requested_action = request.data.get("status")
        reason = request.data.get("reason", "")
        status_map = {"arrival": "pending", "start": "in_progress", "complete": "completed", "cancel": "cancelled"}
        if requested_action not in status_map:
            return Response({"detail": "عملیات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if requested_action == "cancel" and not reason.strip():
            return Response({"detail": "دلیل لغو الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        if "notes" in request.data:
            item.notes = request.data.get("notes", "").strip()
            item.updated_by = request.user
            item.save(update_fields=("notes", "updated_by", "updated_at"))
        item.set_completion_status(status_map[requested_action], changed_by=request.user, reason=reason)
        item.appointment.refresh_from_db()
        if requested_action == "cancel":
            from .notifications import notify_appointment_cancelled
            notify_appointment_cancelled(item.appointment, actor=request.user, item=item)
        return Response(AppointmentItemSerializer(item, context={"request": request}).data)


class WorkingScheduleViewSet(AdminModelViewSet):
    queryset = WorkingSchedule.objects.select_related("employee__user")
    serializer_class = WorkingScheduleSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        return queryset.filter(employee_id=employee_id) if employee_id else queryset


class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsAdmin,)
    queryset = Transaction.objects.select_related("appointment", "payment").order_by("-created_at")
    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        start_date, end_date = self.request.query_params.get("start_date"), self.request.query_params.get("end_date")
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)
        if self.request.query_params.get("type"):
            queryset = queryset.filter(type=self.request.query_params["type"])
        if self.request.query_params.get("employee"):
            queryset = queryset.filter(appointment__items__employee_id=self.request.query_params["employee"])
        query = self.request.query_params.get("q", "").strip()
        if query:
            search_filter = Q(description__icontains=query) | Q(appointment__customer__user__first_name__icontains=query)
            if query.isdigit():
                search_filter |= Q(appointment_id=int(query))
            queryset = queryset.filter(search_filter)
        return queryset.distinct()


class PaymentViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    http_method_names = ("get", "post", "head", "options")
    queryset = Payment.objects.select_related("appointment__customer__user", "created_by", "reviewed_by").prefetch_related("refunds", "appointment__items__service", "appointment__items__employee__user").order_by("-created_at")
    serializer_class = PaymentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        start_date, end_date = self.request.query_params.get("start_date"), self.request.query_params.get("end_date")
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("payment_method"):
            queryset = queryset.filter(payment_method=self.request.query_params["payment_method"])
        if self.request.query_params.get("employee"):
            employee_id = self.request.query_params["employee"]
            queryset = queryset.filter(Q(appointment__items__employee_id=employee_id) | Q(created_by__employee_profile__id=employee_id))
        query = self.request.query_params.get("q", "").strip()
        if query:
            search_filter = Q(appointment__customer__user__first_name__icontains=query) | Q(notes__icontains=query)
            if query.isdigit():
                search_filter |= Q(appointment_id=int(query))
            queryset = queryset.filter(search_filter)
        return queryset.distinct()

    @action(detail=True, methods=("post",))
    @transaction.atomic
    def confirm(self, request, pk=None):
        payment = self.get_object()
        if payment.status != "pending":
            return Response({"detail": "فقط پرداخت گزارش‌شده قابل تأیید است."}, status=status.HTTP_400_BAD_REQUEST)
        appointment = Appointment.objects.select_for_update().get(pk=payment.appointment_id)
        if payment.amount > appointment.remaining_total:
            return Response({"detail": "مبلغ پرداخت از مانده نوبت بیشتر است."}, status=status.HTTP_400_BAD_REQUEST)
        payment.mark_paid(changed_by=request.user)
        Transaction.objects.get_or_create(
            payment=payment,
            defaults={"type": "payment", "amount": payment.amount, "appointment": appointment, "description": payment.notes, "created_by": request.user, "updated_by": request.user},
        )
        from .notifications import notify_payment_reviewed
        notify_payment_reviewed(payment, confirmed=True)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=("post",))
    @transaction.atomic
    def reject(self, request, pk=None):
        payment = self.get_object()
        if payment.status != "pending":
            return Response({"detail": "فقط پرداخت گزارش‌شده قابل رد است."}, status=status.HTTP_400_BAD_REQUEST)
        payment.status = "failed"
        payment.reviewed_by = request.user
        payment.reviewed_at = timezone.now()
        payment.updated_by = request.user
        payment.save(update_fields=("status", "reviewed_by", "reviewed_at", "updated_by", "updated_at"))
        from .notifications import notify_payment_reviewed
        notify_payment_reviewed(payment, confirmed=False)
        return Response(self.get_serializer(payment).data)


class RefundViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAdmin,)
    http_method_names = ("get", "post", "head", "options")
    queryset = Refund.objects.select_related("payment__appointment").order_by("-created_at")
    serializer_class = RefundSerializer


class EmployeeCommissionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsAdmin,)
    queryset = EmployeeCommission.objects.select_related("appointment_item__employee__user", "appointment_item__service").order_by("-created_at")
    serializer_class = EmployeeCommissionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get("start_date"):
            queryset = queryset.filter(appointment_item__date__gte=self.request.query_params["start_date"])
        if self.request.query_params.get("end_date"):
            queryset = queryset.filter(appointment_item__date__lte=self.request.query_params["end_date"])
        if self.request.query_params.get("employee"):
            queryset = queryset.filter(appointment_item__employee_id=self.request.query_params["employee"])
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset


FINANCE_GROUPS = {"daily", "weekly", "monthly"}


def _finance_range(request):
    period = request.query_params.get("period", "month")
    anchor = request.query_params.get("date")
    try:
        current = datetime.strptime(anchor, "%Y-%m-%d").date() if anchor else timezone.localdate()
        if period == "custom" or request.query_params.get("start_date") or request.query_params.get("end_date"):
            start = datetime.strptime(request.query_params["start_date"], "%Y-%m-%d").date()
            end = datetime.strptime(request.query_params["end_date"], "%Y-%m-%d").date()
        elif period == "day":
            start = end = current
        elif period == "week":
            start, end = current - timedelta(days=current.weekday()), current + timedelta(days=6 - current.weekday())
        elif period == "month":
            start = current.replace(day=1)
            end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        elif period == "last-month":
            end = current.replace(day=1) - timedelta(days=1)
            start = end.replace(day=1)
        else:
            raise ValueError
    except (KeyError, ValueError):
        raise ValidationError({"detail": "بازه تاریخ نامعتبر است."})
    if start > end:
        raise ValidationError({"detail": "تاریخ شروع باید پیش از تاریخ پایان باشد."})
    if (end - start).days > 1826:
        raise ValidationError({"detail": "بازه گزارش نمی‌تواند بیشتر از پنج سال باشد."})
    return period, start, end


def _bucket_start(value, grouping):
    if grouping == "weekly":
        return value - timedelta(days=value.weekday())
    if grouping == "monthly":
        return value.replace(day=1)
    return value


def _empty_series(start, end, grouping):
    rows = {}
    cursor = _bucket_start(start, grouping)
    while cursor <= end:
        rows[cursor] = {"date": cursor.isoformat(), "revenue": 0, "payment_value": 0, "payments": 0, "appointments": set(), "commission": 0, "services": 0}
        if grouping == "monthly":
            cursor = (cursor + timedelta(days=32)).replace(day=1)
        else:
            cursor += timedelta(days=7 if grouping == "weekly" else 1)
    return rows


def _allocate_amount(items, amount):
    items = list(items)
    if not items:
        return {}
    total = sum(item.price_snapshot for item in items)
    if not total:
        base, remainder = divmod(amount, len(items))
        return {item.id: base + int(index < remainder) for index, item in enumerate(items)}
    allocations, allocated = {}, 0
    for index, item in enumerate(items):
        value = amount - allocated if index == len(items) - 1 else amount * item.price_snapshot // total
        allocations[item.id] = value
        allocated += value
    return allocations


def _employee_label(employee):
    return employee.user.get_full_name() or employee.user.username


def _profile_url(request, employee):
    return request.build_absolute_uri(employee.profile_photo.url) if employee.profile_photo else ""


def _finance_analytics(request, start, end, grouping="daily", employee=None, include_details=False):
    if grouping not in FINANCE_GROUPS:
        raise ValidationError({"group_by": "گروه‌بندی زمانی نامعتبر است."})
    item_queryset = AppointmentItem.objects.select_related("service__category", "employee__user", "appointment__customer__user").prefetch_related("appointment__payments__refunds")
    payments = Payment.objects.filter(status__in=("paid", "refunded"), paid_at__date__range=(start, end)).select_related("appointment__customer__user", "created_by", "reviewed_by").prefetch_related(Prefetch("appointment__items", queryset=item_queryset), "refunds")
    refunds = Refund.objects.filter(status="completed", created_at__date__range=(start, end)).select_related("payment__appointment__customer__user").prefetch_related(Prefetch("payment__appointment__items", queryset=item_queryset))
    reports = Payment.objects.filter(status__in=("pending", "failed"), created_at__date__range=(start, end)).select_related("appointment__customer__user", "created_by").prefetch_related(Prefetch("appointment__items", queryset=item_queryset))
    dated_items = item_queryset.filter(date__range=(start, end))
    commissions = EmployeeCommission.objects.filter(appointment_item__date__range=(start, end)).select_related("appointment_item__employee__user", "appointment_item__service")
    appointments = Appointment.objects.filter(items__date__range=(start, end)).exclude(status="cancelled").distinct().select_related("customer__user").prefetch_related(Prefetch("items", queryset=item_queryset), "payments__refunds")
    if employee:
        payments = payments.filter(appointment__items__employee=employee).distinct()
        refunds = refunds.filter(payment__appointment__items__employee=employee).distinct()
        reports = reports.filter(appointment__items__employee=employee).distinct()
        dated_items = dated_items.filter(employee=employee)
        commissions = commissions.filter(appointment_item__employee=employee)
        appointments = appointments.filter(items__employee=employee).distinct()

    employee_profiles = [employee] if employee else list(EmployeeProfile.objects.filter(is_active=True, is_deleted=False).select_related("user"))
    employee_rows = {
        item.id: {"id": item.id, "name": _employee_label(item), "specialty": item.specialty, "profile_photo_url": _profile_url(request, item), "confirmed_revenue": 0, "refunds": 0, "commission": 0, "completed_services": 0, "appointments": set(), "payments": 0, "pending_reports": 0, "outstanding": 0}
        for item in employee_profiles
    }
    service_rows = {}
    series = _empty_series(start, end, grouping)
    payment_details = []
    received = 0

    for payment in payments:
        items = list(payment.appointment.items.all())
        allocations = _allocate_amount(items, payment.amount)
        received += payment.amount
        employee_amount = 0
        affected_employees = set()
        for item in items:
            allocation = allocations.get(item.id, 0)
            stat = employee_rows.get(item.employee_id)
            if stat:
                stat["confirmed_revenue"] += allocation
                employee_amount += allocation
                affected_employees.add(item.employee_id)
            if not employee or item.employee_id == employee.id:
                service = service_rows.setdefault(item.service_id, {"id": item.service_id, "name": item.service.persian_name, "category": item.service.category.name, "revenue": 0, "paid_services": set()})
                service["revenue"] += allocation
                service["paid_services"].add(item.id)
        for employee_id in affected_employees:
            employee_rows[employee_id]["payments"] += 1
        plotted = employee_amount if employee else payment.amount
        bucket = series[_bucket_start(timezone.localdate(payment.paid_at), grouping)]
        bucket["revenue"] += plotted
        bucket["payment_value"] += plotted
        bucket["payments"] += 1
        if include_details:
            payment_details.append({"id": payment.id, "date": payment.paid_at or payment.created_at, "customer": payment.appointment.customer.user.get_full_name() or payment.appointment.customer.user.username, "appointment": payment.appointment_id, "services": [item.service.persian_name for item in items if item.employee_id == employee.id], "amount": payment.amount, "employee_amount": employee_amount, "method": payment.payment_method, "status": payment.status, "reporter": (payment.created_by.get_full_name() or payment.created_by.username) if payment.created_by else "مدیریت", "refunded": sum(item.amount for item in payment.refunds.all() if item.status == "completed")})

    refunded = 0
    for refund in refunds:
        items = list(refund.payment.appointment.items.all())
        allocations = _allocate_amount(items, refund.amount)
        refunded += refund.amount
        employee_amount = 0
        for item in items:
            stat = employee_rows.get(item.employee_id)
            if stat:
                stat["refunds"] += allocations.get(item.id, 0)
                employee_amount += allocations.get(item.id, 0)
        series[_bucket_start(timezone.localdate(refund.created_at), grouping)]["revenue"] -= employee_amount if employee else refund.amount

    pending_total = 0
    pending_details = []
    for payment in reports:
        items = list(payment.appointment.items.all())
        allocations = _allocate_amount(items, payment.amount)
        employee_amount = sum(allocations.get(item.id, 0) for item in items if not employee or item.employee_id == employee.id)
        if payment.status == "pending":
            pending_total += employee_amount if employee else payment.amount
            for item in items:
                stat = employee_rows.get(item.employee_id)
                if stat:
                    stat["pending_reports"] += allocations.get(item.id, 0)
        if include_details:
            pending_details.append({"id": payment.id, "date": payment.created_at, "customer": payment.appointment.customer.user.get_full_name() or payment.appointment.customer.user.username, "appointment": payment.appointment_id, "services": [item.service.persian_name for item in items if item.employee_id == employee.id], "amount": payment.amount, "employee_amount": employee_amount, "method": payment.payment_method, "status": payment.status, "reporter": (payment.created_by.get_full_name() or payment.created_by.username) if payment.created_by else "مدیریت", "refunded": 0})

    completed_items = list(dated_items.filter(completion_status="completed"))
    for item in completed_items:
        bucket = series[_bucket_start(item.date, grouping)]
        bucket["services"] += 1
        bucket["appointments"].add(item.appointment_id)
        stat = employee_rows.get(item.employee_id)
        if stat:
            stat["completed_services"] += 1
            stat["appointments"].add(item.appointment_id)

    commission_total = 0
    commission_by_item = {}
    for commission in commissions:
        commission_total += commission.commission_amount
        commission_by_item[commission.appointment_item_id] = commission
        series[_bucket_start(commission.appointment_item.date, grouping)]["commission"] += commission.commission_amount
        stat = employee_rows.get(commission.appointment_item.employee_id)
        if stat:
            stat["commission"] += commission.commission_amount

    appointment_details = []
    outstanding = 0
    for appointment in appointments:
        all_items = [item for item in appointment.items.all() if item.completion_status != "cancelled"]
        allocations = _allocate_amount(all_items, appointment.remaining_total)
        relevant_items = [item for item in all_items if not employee or item.employee_id == employee.id]
        employee_outstanding = sum(allocations.get(item.id, 0) for item in relevant_items)
        outstanding += employee_outstanding if employee else appointment.remaining_total
        for item in all_items:
            stat = employee_rows.get(item.employee_id)
            if stat:
                stat["outstanding"] += allocations.get(item.id, 0)
        if include_details:
            appointment_details.append({"id": appointment.id, "date": min((item.date for item in relevant_items), default=None), "customer": appointment.customer.user.get_full_name() or appointment.customer.user.username, "services": [item.service.persian_name for item in relevant_items], "status": appointment.status, "payment_status": appointment.payment_status, "total": appointment.appointment_total, "paid": appointment.net_paid, "employee_outstanding": employee_outstanding})

    employee_output = []
    for row in employee_rows.values():
        row["appointments"] = len(row["appointments"])
        row["net_revenue"] = row["confirmed_revenue"] - row["refunds"]
        row["average_payment"] = round(row["confirmed_revenue"] / row["payments"]) if row["payments"] else 0
        employee_output.append(row)
    employee_output.sort(key=lambda row: (row["confirmed_revenue"], row["completed_services"]), reverse=True)

    service_total = sum(row["revenue"] for row in service_rows.values())
    services_output = []
    for row in service_rows.values():
        row["paid_services"] = len(row["paid_services"])
        row["share"] = round(row["revenue"] * 100 / service_total, 1) if service_total else 0
        services_output.append(row)
    services_output.sort(key=lambda row: (row["revenue"], row["paid_services"]), reverse=True)

    series_output = []
    for row in series.values():
        row["appointments"] = len(row["appointments"])
        row["average_payment"] = round(row["payment_value"] / row["payments"]) if row["payments"] else 0
        row.pop("payment_value")
        series_output.append(row)

    confirmed_count = len(payment_details) if include_details else payments.count()
    selected_employee = employee_output[0] if employee_output else {}
    employee_received = selected_employee.get("confirmed_revenue", 0)
    status_source = Payment.objects.filter(created_at__date__range=(start, end))
    if employee:
        status_source = status_source.filter(appointment__items__employee=employee).distinct()
    payload = {
        "start_date": start, "end_date": end, "group_by": grouping,
        "received": employee_received if employee else received,
        "refunded": selected_employee.get("refunds", 0) if employee else refunded,
        "net_revenue": selected_employee.get("net_revenue", 0) if employee else received - refunded,
        "pending_reports": pending_total, "outstanding": outstanding,
        "service_revenue": sum(item.price_snapshot for item in completed_items),
        "commission_total": commission_total, "completed_services": len(completed_items),
        "completed_appointments": len({item.appointment_id for item in completed_items}),
        "payments_count": confirmed_count,
        "average_payment": round((employee_received if employee else received) / confirmed_count) if confirmed_count else 0,
        "series": series_output, "employees": employee_output, "services": services_output[:10],
        "methods": list(payments.values("payment_method").annotate(value=Sum("amount")).order_by("-value")),
        "statuses": list(status_source.values("status").annotate(value=Count("id")).order_by("status")),
    }
    if include_details:
        transaction_queryset = Transaction.objects.filter(created_at__date__range=(start, end), appointment__items__employee=employee).distinct().select_related("appointment__customer__user", "payment").prefetch_related(Prefetch("appointment__items", queryset=item_queryset)).order_by("-created_at")[:200]
        payload.update({
            "employee": selected_employee,
            "payments": sorted(payment_details + pending_details, key=lambda row: row["date"], reverse=True)[:200],
            "transactions": [{"id": entry.id, "date": entry.created_at, "type": entry.type, "amount": entry.amount, "employee_amount": sum(_allocate_amount(entry.appointment.items.all(), entry.amount).get(item.id, 0) for item in entry.appointment.items.all() if item.employee_id == employee.id) if entry.appointment else 0, "customer": (entry.appointment.customer.user.get_full_name() or entry.appointment.customer.user.username) if entry.appointment else "—", "appointment": entry.appointment_id, "services": [item.service.persian_name for item in entry.appointment.items.all() if item.employee_id == employee.id] if entry.appointment else [], "payment_status": entry.payment.status if entry.payment else "—"} for entry in transaction_queryset],
            "appointments": sorted(appointment_details, key=lambda row: row["date"] or start, reverse=True)[:200],
            "services_performed": [{"id": item.id, "date": item.date, "customer": item.appointment.customer.user.get_full_name() or item.appointment.customer.user.username, "appointment": item.appointment_id, "service": item.service.persian_name, "amount": item.price_snapshot, "status": item.completion_status, "appointment_status": item.appointment.status, "payment_status": item.appointment.payment_status, "commission": commission_by_item[item.id].commission_amount if item.id in commission_by_item else 0} for item in list(dated_items.order_by("-date", "-start_time")[:200])],
        })
    return payload


class AdminRevenueView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)

    def get(self, request):
        period, start, end = _finance_range(request)
        employee = None
        if request.query_params.get("employee"):
            employee = generics.get_object_or_404(EmployeeProfile.objects.select_related("user"), pk=request.query_params["employee"])
        payload = _finance_analytics(request, start, end, request.query_params.get("group_by", "daily"), employee=employee)
        payload["period"] = period
        return Response(payload)


class AdminEmployeeFinanceView(generics.GenericAPIView):
    permission_classes = (IsAdmin,)

    def get(self, request, employee_id):
        period, start, end = _finance_range(request)
        employee = generics.get_object_or_404(EmployeeProfile.objects.select_related("user"), pk=employee_id)
        payload = _finance_analytics(request, start, end, request.query_params.get("group_by", "daily"), employee=employee, include_details=True)
        payload["period"] = period
        return Response(payload)


class ServiceImageViewSet(AdminModelViewSet):
    queryset = ServiceImage.objects.select_related("service")
    serializer_class = ServiceImageSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.filter(service_id=self.request.query_params["service"]) if self.request.query_params.get("service") else queryset


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

    @staticmethod
    def invalid_session_response():
        response = Response({"detail": "نشست معتبر نیست."}, status=status.HTTP_401_UNAUTHORIZED)
        response.delete_cookie(
            settings.REFRESH_COOKIE_NAME,
            samesite=settings.REFRESH_COOKIE_SAMESITE,
        )
        return response

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not refresh:
            return self.invalid_session_response()
        serializer = self.get_serializer(data={"refresh": refresh})
        try:
            serializer.is_valid(raise_exception=True)
            token = serializer.validated_data["access"]
            from rest_framework_simplejwt.tokens import AccessToken
            role = User.objects.get(pk=AccessToken(token)["user_id"]).role
        except (TokenError, User.DoesNotExist):
            return self.invalid_session_response()
        response = Response({"access": token, "role": role})
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
    @transaction.atomic
    def action(self, request, pk=None):
        item = self.get_object()
        next_status = request.data.get("status")
        reason = request.data.get("reason", "")
        status_map = {"arrival": "pending", "start": "in_progress", "complete": "completed", "cancel": "cancelled"}
        if next_status not in status_map:
            return Response({"detail": "عملیات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if item.completion_status in {"completed", "cancelled"}:
            return Response({"detail": "وضعیت این خدمت نهایی شده است."}, status=status.HTTP_400_BAD_REQUEST)
        if next_status == "cancel" and not reason.strip():
            return Response({"detail": "دلیل لغو الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        if "notes" in request.data:
            item.notes = request.data.get("notes", "").strip()
            item.updated_by = request.user
            item.save(update_fields=("notes", "updated_by", "updated_at"))
        item.set_completion_status(status_map[next_status], changed_by=request.user, reason=reason)
        if next_status == "cancel":
            item.appointment.refresh_from_db()
            from .notifications import notify_appointment_cancelled
            notify_appointment_cancelled(item.appointment, actor=request.user, item=item)
        return Response(AppointmentItemSerializer(item, context={"request": request}).data)

class EmployeeProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsOwnEmployeeObject,)
    serializer_class = EmployeeSelfProfileSerializer

    def get_object(self):
        return EmployeeProfile.objects.get(user=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.save()
        AdminActionLog.objects.create(actor=self.request.user, action="update", model_name="EmployeeProfile", object_id=str(employee.pk), details={"fields": list(serializer.validated_data)})


class EmployeePasswordChangeView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)
    serializer_class = EmployeePasswordChangeSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "رمز عبور با موفقیت تغییر کرد."})


class EmployeeAppointmentPaymentReportView(generics.GenericAPIView):
    permission_classes = (IsEmployee,)
    serializer_class = PaymentSerializer

    def get_appointment(self, request, appointment_id):
        return generics.get_object_or_404(
            Appointment.objects.filter(items__employee__user=request.user).distinct(),
            pk=appointment_id,
        )

    def get(self, request, appointment_id):
        appointment = self.get_appointment(request, appointment_id)
        payments = Payment.objects.filter(appointment=appointment).select_related("created_by", "reviewed_by", "appointment__customer__user").order_by("-created_at")
        pending_total = payments.filter(status="pending").aggregate(total=Sum("amount"))["total"] or 0
        return Response({
            "appointment_total": appointment.appointment_total,
            "paid_total": appointment.net_paid,
            "remaining_total": appointment.remaining_total,
            "pending_total": pending_total,
            "reportable_total": max(appointment.remaining_total - pending_total, 0),
            "payments": self.get_serializer(payments, many=True).data,
        })

    @transaction.atomic
    def post(self, request, appointment_id):
        authorized = self.get_appointment(request, appointment_id)
        appointment = Appointment.objects.select_for_update().get(pk=authorized.pk)
        if appointment.status == "cancelled":
            return Response({"detail": "ثبت پرداخت برای نوبت لغوشده ممکن نیست."}, status=status.HTTP_400_BAD_REQUEST)
        report_serializer = EmployeePaymentReportSerializer(data=request.data)
        report_serializer.is_valid(raise_exception=True)
        amount = report_serializer.validated_data["amount"]
        pending_total = Payment.objects.filter(appointment=appointment, status="pending").aggregate(total=Sum("amount"))["total"] or 0
        reportable_total = max(appointment.remaining_total - pending_total, 0)
        if reportable_total == 0:
            return Response({"detail": "مبلغ نوبت قبلاً پرداخت یا برای تأیید گزارش شده است."}, status=status.HTTP_400_BAD_REQUEST)
        if amount > reportable_total:
            return Response({"detail": "مبلغ گزارش از مانده قابل گزارش بیشتر است."}, status=status.HTTP_400_BAD_REQUEST)
        payment = Payment.objects.create(
            appointment=appointment,
            amount=amount,
            payment_method=report_serializer.validated_data["payment_method"],
            notes=report_serializer.validated_data.get("notes", ""),
            status="pending",
            created_by=request.user,
            updated_by=request.user,
        )
        from .notifications import notify_payment_reported
        notify_payment_reported(payment)
        return Response(self.get_serializer(payment).data, status=status.HTTP_201_CREATED)


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
        period, start, end = _finance_range(request)
        employee = generics.get_object_or_404(EmployeeProfile.objects.select_related("user"), user=request.user)
        payload = _finance_analytics(request, start, end, request.query_params.get("group_by", "daily"), employee=employee, include_details=True)
        payload["period"] = period
        # Preserve the response keys used by older employee clients.
        payload["items"] = [{"id": item["id"], "date": item["date"], "service": item["service"], "base_amount": item["amount"], "employee_commission": item["commission"], "status": item["status"], "payment_status": item["payment_status"]} for item in payload["services_performed"] if item["commission"]]
        payload["employee_commission"] = payload["commission_total"]
        return Response(payload)
