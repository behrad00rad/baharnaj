import time
from django.core.management.base import BaseCommand
from salon.sms.tasks import tick
from salon.sms.providers import ProviderUnavailable


class Command(BaseCommand):
    help = 'Process due SMS rules and one bounded delivery batch. Use --loop under a process supervisor, or cron once per minute.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true')
        parser.add_argument('--interval', type=int, default=60)

    def handle(self, *args, **options):
        while True:
            try:
                count, errors = tick()
                self.stdout.write(f'Processed {count}; invalid automation IDs: {errors}')
            except ProviderUnavailable as exc:
                self.stderr.write(str(exc))
            if not options['loop']:
                break
            time.sleep(max(30, options['interval']))
