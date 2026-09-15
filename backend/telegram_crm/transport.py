"""Single outbound interface; Telegram updates belong exclusively to TeleBotHost."""
import json
import socket
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from django.conf import settings
from .integration import runtime


class TelegramTransport:
    def send(self, chat_id, text, keyboard):
        payload = {'chat_id': chat_id, 'text': text, 'reply_markup': {'inline_keyboard': keyboard}, 'link_preview_options': {'is_disabled': True}}
        request = Request(f'https://api.telegram.org/bot{runtime().bot_token}/sendMessage', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urlopen(request, timeout=10) as response:
                data = json.load(response)
        except HTTPError as error:
            try:
                data = json.loads(error.read())
            except (ValueError, OSError):
                data = {'ok': False, 'error_code': error.code}
        except URLError as error:
            if isinstance(error.reason, (socket.gaierror, ConnectionRefusedError)):
                return {'status': 'queued', 'retry_after': 60, 'error': 'connection_unavailable'}
            return {'status': 'unknown', 'error': 'network_outcome_unknown'}
        except (TimeoutError, socket.timeout, OSError):
            # Request may have reached Telegram. Never blindly resend an ambiguous send.
            return {'status': 'unknown', 'error': 'network_outcome_unknown'}
        except ValueError:
            return {'status': 'unknown', 'error': 'invalid_response'}
        if not isinstance(data, dict):
            return {'status': 'unknown', 'error': 'invalid_response'}
        if data.get('ok'):
            if not isinstance(data.get('result'), dict) or type(data['result'].get('message_id')) is not int:
                return {'status': 'unknown', 'error': 'invalid_response'}
            return {'status': 'accepted', 'message_id': data['result']['message_id']}
        code = data.get('error_code', 500)
        if code == 429:
            return {'status': 'queued', 'retry_after': max(1, min(int(data.get('parameters', {}).get('retry_after', 60)), 86400)), 'error': 'rate_limited'}
        if code >= 500:
            return {'status': 'queued', 'retry_after': 120, 'error': 'telegram_5xx'}
        return {'status': 'failed', 'error': 'unreachable' if code == 403 else 'telegram_permanent_error'}


class MockTransport:
    def __init__(self, result=None):
        self.result = result or {'status': 'simulated'}
        self.calls = []

    def send(self, chat_id, text, keyboard):
        self.calls.append({'chat_id': chat_id, 'text': text, 'keyboard': keyboard})
        return dict(self.result)
