from django.contrib import admin
from .models import Appointment, Employee, Service, User

admin.site.register((User, Service, Employee, Appointment))
from django.contrib import admin

# Register your models here.
