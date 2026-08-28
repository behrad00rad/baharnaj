# Testing Guide

## Backend

From `backend/`:

```bash
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py test
```

The backend suite covers appointment overlap and rescheduling, working hours, time off, snapshots, role and employee isolation, status history, commission, payment/refund transitions, and Tehran timezone invariance.

To run against Postgres locally, set `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` before running the commands above.

## Frontend Unit Tests

From `frontend/`:

```bash
npm ci
npm test
npm run lint
npm run build
```

Vitest uses jsdom and React Testing Library. Tests cover Persian number/date helpers, in-memory auth state, booking wizard transitions, and employee loading/empty states.

## End to End

Install the Playwright browser once:

```bash
npx playwright install --with-deps chromium
npx playwright test
```

The Playwright smoke test starts the Vite dev server and verifies that a guest reaches the booking wizard. Full API-backed booking lifecycle coverage should run against a deployed backend fixture once CI service orchestration is added.

## CI

GitHub Actions runs backend migrations/tests on Postgres, frontend lint/unit/build checks, Playwright smoke coverage, and advisory `pip-audit`/`npm audit` scans. Audit findings are surfaced without failing the pipeline.
