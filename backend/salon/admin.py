from django.contrib import admin
from .models import Appointment, Employee, Service, Transaction, User, WorkRecord

admin.site.register((User, Service, Employee, Appointment, WorkRecord, Transaction))
from django.contrib import admin

# Register your models here.
