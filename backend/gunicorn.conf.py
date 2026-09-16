"""Conservative SQLite deployment; scale only after measuring contention."""
import os

bind = "0.0.0.0:8000"
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
accesslog = None  # URL query strings may contain customer tokens.
errorlog = "-"
capture_output = True
# Django trusts the protocol header only on the private proxy network.
forwarded_allow_ips = "*"
