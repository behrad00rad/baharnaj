FROM python:3.12.1-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY . .

FROM base AS development
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

FROM base AS production
RUN groupadd -g 10001 app && useradd -u 10001 -g app -M app \
    && mkdir -p /data /app/staticfiles /app/media && chown app:app /data /app/staticfiles /app/media
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["python", "healthcheck.py"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]
