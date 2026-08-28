# API Changes

This is a breaking schema/API revision for the frontend. The frontend has not been modified.

- Appointment creation now requires `items`, a non-empty array. Each item contains `service`, `employee`, `date`, `start_time`, `end_time`, and optional `notes`.
- The appointment-level `service`, `employee`, `services`, `service_assignments`, `price`, `date`, `start_time`, and `end_time` fields were removed. These values now belong to each `AppointmentItem`.
- Appointment responses return `items` with `price_snapshot`, `duration_snapshot`, and `completion_status`; appointment totals must be calculated from item snapshots.
- Employee and service relationships now use `EmployeeProfile` and the `EmployeeService` through model. Service categories are represented by `ServiceCategory`; the old free-text service category is gone.
- `WorkingHour` was replaced by `WorkingSchedule`. `GalleryItem` was replaced by `GalleryAsset`; its ordering field is now `display_order`.
- `AppointmentService` and `WorkRecord` were removed. Work completion and commissions are represented by `AppointmentItem.completion_status` and `EmployeeCommission`.
- Admin routes changed from `/admin/working-hours/` to `/admin/working-schedules/`, and a new `/admin/appointment-items/` route was added. The old work-record routes were removed.
- Customer and employee references now point to `CustomerProfile` and `EmployeeProfile` rather than directly to the legacy employee model. A customer profile is created automatically for an authenticated or guest booking.
- Service images are now separate `ServiceImage` records, allowing multiple images per service.
- Service responses include `is_active` and `is_bookable`; both must allow a service to be publicly bookable.
- Payment, refund, transaction, commission, schedule, and appointment resources expose audit fields: `created_by`, `updated_by`, `created_at`, and `updated_at` where applicable.
- Appointment status history is append-only. Status changes must use the model status-transition method so a history row is written.

## Call Sites Updated

- `salon/serializers.py`: `WorkRecordSerializer` legacy reads were removed; appointment creation and representation now operate on nested `AppointmentItemSerializer` records.
- `salon/views.py`: availability conflict queries now read `AppointmentItem.employee`, `AppointmentItem.date`, `start_time`, and `end_time`.
- `salon/views.py`: employee appointment filtering now uses `Appointment.objects.filter(items__employee__user=...)`.
- `salon/views.py`: admin appointment query optimization now prefetches `items__service` and `items__employee__user` instead of selecting `appointment.service` and `appointment.employee`.
- `salon/views.py`: employee listing and availability now use `EmployeeService` links instead of the removed employee `services` many-to-many field.
- `salon/urls.py`, `salon/admin.py`, and `salon/management/commands/seed_demo.py`: removed legacy appointment/service/employee model references and adopted the replacement models.

Old-data migration is intentionally a separate follow-up task. Migration `0010` changes the schema only and does not copy data from the removed appointment structures.

## Employee App Notes

- Employee routes now include `employee/appointment-items/`, `employee/earnings/`, `employee/profile/`, and `employee/time-off/`.
- Appointment actions are posted to `employee/appointment-items/{id}/action/` with `arrival`, `start`, `complete`, or `cancel`; cancellation requires `reason`. The server writes appointment status history and enforces employee ownership.
- Employee services are read-only in the employee app and require an admin change. Time-off requests are self-submitted but require admin approval before they affect the approved schedule.

## Customer Booking Notes

- Booking is now a five-step wizard and submits only nested `items`; the removed appointment-level service/employee fields are not sent.
- Availability and date validation use `Asia/Tehran` server-side and the Jalali picker also derives today from Tehran. The client timezone is ignored.
- A booking hold lasts five minutes and is consumed on successful submission; abandoned holds expire automatically. Holds are checked again during appointment creation.
- Guest booking remains the default. The confirmation checkbox is present for account creation, but account provisioning is deferred until the account-registration endpoint is added.
- Guest reschedule/cancel lookup uses phone plus `confirmation_code`. Account-based history and authenticated customer management are follow-up work.
- Waitlist signup is available through `waitlist/`; notification when a slot opens requires a scheduled polling/cron worker.
- Confirmation SMS/email is not sent yet. A provider interface and credentials are required before enabling production notifications.
