from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsEmployee(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "employee")


class IsAdminOrEmployeeReadOnly(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in {"admin", "employee"}) and (request.method in ("GET", "HEAD", "OPTIONS") or request.user.role == "admin")


class IsOwnEmployeeObject(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in {"employee", "admin"})

    def has_object_permission(self, request, view, obj):
        if request.user.role == "admin":
            return True
        employee = getattr(obj, "employee", None)
        if hasattr(obj, "user"):
            employee = obj
        return bool(employee and employee.user_id == request.user.id)


class IsAdminWriteOnly(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsCustomer(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "customer"
            and request.user.account_status == "active"
        )
