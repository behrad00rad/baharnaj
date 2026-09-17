# Customer Dashboard MVP

The authenticated customer dashboard is available under `/account`. Access uses the existing in-memory JWT access token and HTTP-only refresh cookie; access tokens are not stored in browser storage.

## API

All endpoints require an authenticated user with `role=customer` and `account_status=active` unless noted otherwise:

- `GET/PATCH /api/v1/customer/profile/`
- `GET /api/v1/customer/dashboard/`
- `GET /api/v1/customer/appointments/?filter=upcoming|completed|cancelled`
- `GET /api/v1/customer/appointments/<id>/`
- `POST /api/v1/customer/appointments/<id>/cancel/`
- `POST /api/v1/customer/appointments/<id>/reschedule/`
- `GET /api/v1/customer/appointments/<id>/book-again/`
- `GET/PATCH /api/v1/customer/preferences/`
- `GET /api/v1/customer/notifications/`
- `POST /api/v1/customer/notifications/<id>/read/`
- `POST /api/v1/customer/notifications/read-all/`
- `GET /api/v1/customer/notifications/unread-count/`
- `GET/POST /api/v1/customer/account/deletion-request/`

Cancellation and rescheduling require an `idempotency_key`. They are ownership-filtered, transaction-locked, and reject the request with `policy_not_configured` until a real salon policy is configured. Rescheduling moves every appointment item together and rejects conflicts rather than partially moving a booking.

The customer serializer exposes finalized prices only. Unresolved variable/consultation prices return an explicit unresolved state and never become zero. Specialist display names, service names, payment state, status, confirmation code, and customer-visible capabilities are included; internal notes, staff actors, commissions, and database-only fields are excluded.

## Profile and deletion

Customers can edit first name, last name, birthday, neighborhood, and service preferences. Phone changes are read-only because no approved phone-verification provider is configured. Account deletion creates an auditable pending request and requires explicit confirmation plus the current password. Appointments, payments, refunds, commissions, and financial history are retained for review and legal obligations.

Operational reminders and promotional messages are separate preferences. Promotional consent defaults off and channel availability is reported by provider configuration. SMS and Telegram channels remain unavailable; Firebase delivery remains disabled unless separately configured.

## Migration and tests

Migrations `0029_customer_dashboard_models` and `0030_alter_notification_type` are additive. They add nullable customer profile fields, communication preferences, deletion requests, idempotency records, and a customer notification type. Existing guest booking and confirmation-code lookup remain unchanged.

Useful checks:

```bash
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --noinput
python manage.py test salon.test_customer_dashboard
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Deferred from this MVP: loyalty, coupons, online payments, real phone verification, SMS/Telegram/Firebase delivery, marketing automation, and automatic policy/fee configuration.
