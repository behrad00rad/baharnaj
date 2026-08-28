import logging

logger = logging.getLogger(__name__)


def send_booking_confirmation(appointment):
    """Provider boundary for SMS/email confirmation and future reminders."""
    logger.info("Booking confirmation queued", extra={"appointment_id": appointment.pk})


def send_appointment_reminder(appointment):
    logger.info("Appointment reminder queued", extra={"appointment_id": appointment.pk})
