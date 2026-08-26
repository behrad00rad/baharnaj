from datetime import datetime, timedelta
from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Appointment, Employee, Service, Transaction, WorkRecord
from .serializers import AppointmentSerializer, EmployeeSerializer, ServiceSerializer

class ServiceListView(generics.ListAPIView):
    queryset = Service.objects.filter(is_active=True)
    serializer_class = ServiceSerializer

class EmployeeListView(generics.ListAPIView):
    queryset = Employee.objects.filter(is_active=True).select_related("user")
    serializer_class = EmployeeSerializer

class AvailabilityView(generics.ListAPIView):
    def list(self, request, *args, **kwargs):
        service_id, employee_id, date_value = request.query_params.get("service"), request.query_params.get("employee"), request.query_params.get("date")
        if not all((service_id, employee_id, date_value)):
            return Response({"detail": "خدمت، متخصص و تاریخ الزامی است."}, status=status.HTTP_400_BAD_REQUEST)
        service = Service.objects.get(pk=service_id)
        employee = Employee.objects.get(pk=employee_id, is_active=True, services=service)
        date = datetime.strptime(date_value, "%Y-%m-%d").date()
        appointments = Appointment.objects.filter(employee=employee, date=date, status__in=["pending", "confirmed"])
        slots = []
        for hour in range(9, 20):
            for minute in (0, 30):
                start = datetime.strptime(f"{hour:02d}:{minute:02d}", "%H:%M").time()
                end = (datetime.combine(date, start) + timedelta(minutes=service.duration)).time()
                if end <= datetime.strptime("20:00", "%H:%M").time() and not appointments.filter(start_time__lt=end, end_time__gt=start).exists():
                    slots.append(start.strftime("%H:%M"))
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
