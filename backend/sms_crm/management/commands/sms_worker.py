from django.core.management.base import BaseCommand
from sms_crm.worker import run_batch


class Command(BaseCommand):
    help = "Reconcile committed appointments and process one bounded SMS batch."

    def handle(self, **options):
        self.stdout.write(str(run_batch()))
