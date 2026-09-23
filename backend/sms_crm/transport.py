"""Small, bounded adapter for the official Melipayamak REST operation names."""
import json
import math
import requests

from .provider_settings import provider_settings

BASE = "https://rest.payamak-panel.com/api/SendSMS/"


class MelipayamakTransport:
    def __init__(self, session=None, provider=None):
        self.session = session or requests.Session()
        self.provider = provider or provider_settings()

    def _call(self, operation, values, *, sending=False):
        try:
            response = self.session.post(
                BASE + operation,
                data={"username": self.provider.username, "password": self.provider.password, **values},
                timeout=(3, 8),
            )
        except requests.exceptions.ConnectTimeout:
            return {"status": "retry", "error": "connection_timeout"}
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
            return {"status": "unknown" if sending else "failed", "error": "network_outcome_unknown"}
        except requests.exceptions.RequestException:
            return {"status": "unknown" if sending else "failed", "error": "transport_error"}
        if response.status_code == 429:
            return {"status": "retry", "error": "provider_rate_limit"}
        if response.status_code >= 500:
            # A send may have reached the provider before its error response.
            return {"status": "unknown" if sending else "failed", "error": "provider_server_error"}
        if response.status_code != 200:
            return {"status": "failed", "error": "provider_rejected"}
        try:
            payload = response.json()
        except ValueError:
            return {"status": "unknown" if sending else "failed", "error": "invalid_provider_response"}
        if not isinstance(payload, dict) or "RetStatus" not in payload:
            return {"status": "unknown" if sending else "failed", "error": "invalid_provider_response"}
        code = str(payload["RetStatus"])
        if code != "1":
            return {"status": "failed", "error": "provider_rejected", "provider_code": code[:40] if code.isdecimal() else "unrecognized"}
        return {"status": "ok", "value": payload.get("Value"), "provider_code": code}

    def send_pattern(self, phone, body_id, values):
        result = self._call("BaseServiceNumber", {"to": phone, "bodyId": body_id, "text": "|".join(str(v) for v in values)}, sending=True)
        return self._send_result(result)

    def send_text(self, phone, sender, text):
        result = self._call("SendSMS", {"to": phone, "from": sender, "text": text, "isFlash": False}, sending=True)
        return self._send_result(result)

    @staticmethod
    def _send_result(result):
        if result["status"] != "ok":
            return result
        receipt = result.get("value")
        if receipt is None or not str(receipt).isdigit() or int(receipt) <= 0:
            return {"status": "unknown", "error": "missing_provider_receipt"}
        return {"status": "accepted", "provider_id": str(receipt)[:80], "provider_code": result["provider_code"]}

    def get_delivery(self, provider_id):
        result = self._call("GetDeliveries2", {"recId": provider_id})
        if result["status"] != "ok":
            return result
        # Melipayamak's Value is a delivery code. Unknown codes stay accepted for later review.
        code = str(result.get("value", ""))
        if code == "1":
            return {"status": "delivered", "provider_code": code}
        if code == "2":
            return {"status": "failed", "provider_code": code, "error": "provider_delivery_failed"}
        return {"status": "accepted", "provider_code": code[:40] if code.isdecimal() else "unrecognized"}

    def get_credit(self):
        result = self._call("GetCredit", {})
        if result["status"] != "ok":
            return result
        try:
            value = float(result["value"])
        except (TypeError, ValueError):
            return {"status": "failed", "error": "invalid_provider_response"}
        if not math.isfinite(value):
            return {"status": "failed", "error": "invalid_provider_response"}
        return {"status": "ok", "credit": value}

    def get_sender_numbers(self):
        result = self._call("GetUserNumbers", {})
        if result["status"] != "ok":
            return result
        value = result["value"]
        if isinstance(value, str):
            if value.strip().startswith("["):
                try:
                    value = json.loads(value)
                except ValueError:
                    return {"status": "failed", "error": "invalid_provider_response"}
            else:
                value = [part.strip() for part in value.split(",") if part.strip()]
        if not isinstance(value, list):
            return {"status": "failed", "error": "invalid_provider_response"}
        return {"status": "ok", "numbers": [str(number)[:32] for number in value[:50]]}


class MockSmsTransport:
    def __init__(self, send_result=None):
        self.calls = []
        self.send_result = send_result or {"status": "simulated"}

    def send_pattern(self, phone, body_id, values):
        self.calls.append(("pattern", phone, body_id, values))
        return dict(self.send_result)

    def send_text(self, phone, sender, text):
        self.calls.append(("text", phone, sender, text))
        return dict(self.send_result)

    def get_delivery(self, provider_id):
        return {"status": "delivered", "provider_code": "1"}

    def get_credit(self):
        return {"status": "ok", "credit": 0}

    def get_sender_numbers(self):
        return {"status": "ok", "numbers": []}
