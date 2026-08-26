# بهارناژ

Full-stack salon management platform. The repository contains one Persian RTL React/Vite frontend and a Django REST backend.

## Current foundation

- `frontend/`: Persian RTL public salon experience with API-connected service cards and booking request form.
- `backend/`: Django 6 + Django REST Framework with a custom user model, services, employees, appointments, validation, and versioned endpoints.
- SQLite is the default database for local development and is stored at `backend/db.sqlite3`.

## Run locally

1. Copy `.env.example` to `.env` in `backend/` and adjust values if needed.
2. Apply migrations:

```bash
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver
```

3. Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The API is versioned under `/api/v1/`. Public endpoints currently include `GET /api/v1/services/` and `POST /api/v1/appointments/`.

## Configuration

See `backend/.env.example`. Never commit real secrets. Appointment creation validates that the employee is assigned to the service and performs a transaction-protected overlap check before saving.