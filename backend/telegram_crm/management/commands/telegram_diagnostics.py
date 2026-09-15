import socket
from telegram_crm.integration import runtime
from django.core.management.base import BaseCommand
from telegram_crm.services import configured
from telegram_crm.models import Config


class Command(BaseCommand):
    help = 'Readiness only; never sends messages or changes Telegram webhook.'

    def add_arguments(self, parser):
        parser.add_argument('--connectivity', action='store_true')

    def handle(self, **options):
        self.stdout.write(str({'configured': configured(), 'dry_run': runtime().dry_run, 'token_present': bool(runtime().bot_token), 'heartbeat': Config.solo().heartbeat}))
        if options['connectivity']:
            try:
                with socket.create_connection(('api.telegram.org', 443), timeout=5):
                    self.stdout.write('Telegram TCP/443 reachable; this does not verify bot credentials.')
            except OSError:
                self.stdout.write('Telegram TCP/443 unreachable from this environment.')
