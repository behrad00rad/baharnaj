"""Run in the backend image: python /checks/test_settings.py. No DB or network."""
import os
import subprocess
import unittest

BASE = {
    "PATH": os.environ["PATH"],
    "PYTHONPATH": os.environ.get("PYTHONPATH", "/app"),
    "SECRET_KEY": "isolated-check-only-abcdefghijklmnopqrstuvwxyz-0123456789-ABCDEF",
    "DJANGO_SETTINGS_MODULE": "config.settings", "DEBUG": "false", "EMAIL_HOST": "smtp.invalid",
    "TELEGRAM_ENABLED": "false", "TELEGRAM_FORCE_DISABLED": "true",
}

class ProductionSettingsTests(unittest.TestCase):
    def check(self, changes, success):
        env = BASE | changes
        if "SECRET_KEY" in changes and changes["SECRET_KEY"] is None:
            env.pop("SECRET_KEY", None)
        result = subprocess.run(["python", "-c", "from django.conf import settings; settings.SECRET_KEY"], env=env, capture_output=True)
        self.assertEqual(result.returncode == 0, success, "Unexpected settings startup result (values suppressed)")

    def test_valid_production(self): self.check({"SECRET_KEY": BASE["SECRET_KEY"]}, True)
    def test_missing_secret(self): self.check({"SECRET_KEY": ""}, False)
    def test_development_secret(self): self.check({"SECRET_KEY": "dev-only-change-this-secret-key-32"}, False)
    def test_short_secret(self): self.check({"SECRET_KEY": "short"}, False)
    def test_missing_smtp(self): self.check({"EMAIL_HOST": ""}, False)
    def test_console_email(self): self.check({"EMAIL_BACKEND": "django.core.mail.backends.console.EmailBackend"}, False)
    def test_localhost_cors(self): self.check({"CORS_ALLOWED_ORIGINS": "http://localhost:5173"}, False)
    def test_codespaces_cors(self): self.check({"CORS_ALLOWED_ORIGINS": "https://demo-5173.app.github.dev"}, False)
    def test_wildcard_hosts(self): self.check({"ALLOWED_HOSTS": "*"}, False)
    def test_localhost_csrf(self): self.check({"CSRF_TRUSTED_ORIGINS": "http://localhost:5173"}, False)
    def test_trim_empty(self): self.check({"ALLOWED_HOSTS": " baharnaj.ir, ,www.baharnaj.ir, "}, True)
    def test_local_development(self): self.check({"DEBUG": "true", "SECRET_KEY": None, "EMAIL_HOST": ""}, True)

if __name__ == "__main__": unittest.main()
