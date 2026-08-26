from datetime import datetime, timedelta
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from .models import Appointment, Service
from .serializers import AppointmentSerializer, ServiceSerializer

class ServiceListView(generics.ListAPIView):
    queryset = Service.objects.filter(is_active=True)
    serializer_class = ServiceSerializer

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
