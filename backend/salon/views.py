from datetime import datetime, timedelta
from django.db import transaction
from rest_framework import generics, status, viewsets
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import Appointment, Employee, Service, Transaction, User, WorkRecord, WorkingHour
from .serializers import (AppointmentSerializer, EmployeeAdminSerializer, EmployeeSerializer,
                          ServiceAdminSerializer, ServiceSerializer, TransactionSerializer,
                          UserAdminSerializer,
                          WorkRecordSerializer, WorkingHourSerializer)

class ServiceListView(generics.ListAPIView):
    queryset = Service.objects.filter(is_active=True)
    serializer_class = ServiceSerializer

class EmployeeListView(generics.ListAPIView):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = Employee.objects.filter(is_active=True).select_related("user")
        service_id = self.request.query_params.get("service")
        return queryset.filter(services=service_id) if service_id else queryset

class AvailabilityView(generics.ListAPIView):
    def list(self, request, *args, **kwargs):
        service_id, employee_id, date_value = request.query_params.get("service"), request.query_params.get("employee"), request.query_params.get("date")
        if not all((service_id, employee_id, date_value)):
            return Response({"detail": "خدمت، متخصص و تاریخ الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        service = Service.objects.get(pk=service_id)
        employee = Employee.objects.get(pk=employee_id, is_active=True, services=service)
        date = datetime.strptime(date_value, "%Y-%m-%d").date()
        appointments = Appointment.objects.filter(employee=employee, date=date, status__in=["pending", "confirmed"])
        working_hours = employee.working_hours.filter(weekday=date.weekday(), is_active=True)
        if not working_hours.exists():
            return Response({"date": date_value, "slots": []})
        slots = []
        for working_hour in working_hours:
            current = datetime.combine(date, working_hour.start_time)
            closing = datetime.combine(date, working_hour.end_time)
            while current + timedelta(minutes=service.duration) <= closing:
                start = current.time()
                end = (current + timedelta(minutes=service.duration)).time()
                if not appointments.filter(start_time__lt=end, end_time__gt=start).exists():
                    slots.append(start.strftime("%H:%M"))
                current += timedelta(minutes=30)
        return Response({"date": date_value, "slots": slots})

class EmployeeAppointmentsView(generics.ListAPIView):
    serializer_class = AppointmentSerializer
    permission_classes = (IsAuthenticated,)
    def get_queryset(self):
        return Appointment.objects.filter(employee__user=self.request.user).select_related("service", "customer")

class EmployeeStatisticsView(generics.GenericAPIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        records = WorkRecord.objects.filter(employee__user=request.user)
        return Response({"completed_services": records.count(), "income": sum(record.price for record in records), "commission": sum(record.commission for record in records), "customers": records.values("appointment__customer").distinct().count()})

class AdminStatisticsView(generics.GenericAPIView):
    def get(self, request):
        if not (request.user.is_authenticated and (request.user.is_staff or request.user.role == "admin")):
            return Response({"detail": "دسترسی مجاز نیست."}, status=status.HTTP_403_FORBIDDEN)
        appointments = Appointment.objects.all()
        return Response({"appointments": appointments.count(), "completed": appointments.filter(status="completed").count(), "cancelled": appointments.filter(status="cancelled").count(), "revenue": sum(item.amount for item in Transaction.objects.filter(type="payment")), "active_employees": Employee.objects.filter(is_active=True).count()})

class AppointmentCreateView(generics.CreateAPIView):
    serializer_class = AppointmentSerializer
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        end_time = (datetime.combine(data["date"], data["start_time"]) + timedelta(minutes=data["service"].duration)).time()
        conflict = Appointment.objects.select_for_update().filter(employee=data["employee"], date=data["date"], status__in=["pending", "confirmed"], start_time__lt=end_time, end_time__gt=data["start_time"]).exists()
        if conflict:
            return Response({"detail": "این زمان قبلاً رزرو شده است."}, status=status.HTTP_409_CONFLICT)
        appointment = serializer.save(price=data["service"].price, end_time=end_time, customer=request.user if request.user.is_authenticated else None)
        return Response(self.get_serializer(appointment).data, status=status.HTTP_201_CREATED)


class IsSalonAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or request.user.role == "admin"))


class AdminModelViewSet(viewsets.ModelViewSet):
    permission_classes = (IsSalonAdmin,)

class AdminServiceViewSet(AdminModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceAdminSerializer

class AdminEmployeeViewSet(AdminModelViewSet):
    queryset = Employee.objects.select_related("user").prefetch_related("services")
    serializer_class = EmployeeAdminSerializer


class AdminUserViewSet(AdminModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer

class AdminAppointmentViewSet(AdminModelViewSet):
    queryset = Appointment.objects.select_related("customer", "employee__user", "service")
    serializer_class = AppointmentSerializer

class WorkingHourViewSet(AdminModelViewSet):
    queryset = WorkingHour.objects.select_related("employee__user")
    serializer_class = WorkingHourSerializer

class WorkRecordViewSet(AdminModelViewSet):
    queryset = WorkRecord.objects.select_related("employee__user", "appointment", "service")
    serializer_class = WorkRecordSerializer

class TransactionViewSet(AdminModelViewSet):
    queryset = Transaction.objects.select_related("appointment")
    serializer_class = TransactionSerializer


class SalonTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["is_staff"] = user.is_staff
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        data["is_staff"] = self.user.is_staff
        return data


class SalonTokenView(TokenObtainPairView):
    serializer_class = SalonTokenSerializer


class EmployeeWorkRecordViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = WorkRecordSerializer

    def get_queryset(self):
        return WorkRecord.objects.filter(employee__user=self.request.user).select_related("appointment", "service")

    def perform_create(self, serializer):
        appointment = serializer.validated_data["appointment"]
        if appointment.employee.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("این نوبت متعلق به شما نیست.")
        serializer.save()
