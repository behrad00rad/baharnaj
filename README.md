# بهارناژ

Full-stack salon management platform with a Persian RTL React/Vite frontend and a Django REST backend.

## Requirements

- Python 3.12.1 (see `.python-version`)
- Node.js 22.13.0 (see `.nvmrc`)
- npm 10 or newer

## Local development

Create and configure the backend environment:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
~~python manage.py migrate
~~python manage.py runserver
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`.
To create an administrator, run `python manage.py createsuperuser`. The backend is available at `http://localhost:8000`.

In a second terminal, install and start the frontend:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

For local development, set the frontend environment to:

```dotenv
VITE_API_BASE_URL=/api/v1/
```

The relative URL sends API and media requests through Vite's development proxy. This also works in Codespaces and remote Docker environments, where a browser-visible `localhost:8000` would point to the wrong machine. Set `VITE_PROXY_TARGET` only when the local backend is not at `http://127.0.0.1:8000`.

The frontend is available at `http://localhost:5173`. The API is versioned under `/api/v1/`.

Backend configuration is documented in `backend/.env.example`. `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `PUBLIC_BACKEND_URL`, and `DEFAULT_FROM_EMAIL` are supported. `SQLITE_PATH` is optional. Never commit real secrets.

## Docker development

Docker with Compose is the only prerequisite. Optionally copy `backend/.env.example` to `backend/.env`; Compose provides safe local defaults for hosts, CORS, and SQLite storage.

```bash
docker compose up --build
```

The frontend uses port 5173 and the backend uses port 8000. SQLite data is retained in the `backend_data` named volume.

Stop the containers with `docker compose down`. Rebuild after dependency changes with `docker compose up --build`. To intentionally remove the development database as well, use `docker compose down --volumes`.

## Validation

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run

cd ../frontend
npm run build
```
