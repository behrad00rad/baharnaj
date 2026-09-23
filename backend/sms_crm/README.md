# Phase 1 SMS setup

SMS lives in `sms_crm` and uses the existing appointment records. No production sender, database migration, or timer is activated by adding this code. The environment switch `SMS_ENABLED=false` and saved mode `off` are the defaults. `SMS_DRY_RUN=true` forces simulation even when the saved mode is `live`.

## Melipayamak account

Obtain a REST-enabled Melipayamak account and an approved sender number. Obtain service-pattern body IDs for each transactional message if using patterns. Each provider pattern must have the variable order listed for its message kind in `PATTERN_FIELDS` in `services.py`; verify the approved pattern with Melipayamak before enabling live mode. Plain text sending needs an approved sender.

An administrator can enter the username, password, sender and body IDs at `/admin/sms` → **راه‌اندازی**. The username and password are encrypted in `SmsProviderSettings` with a key derived from Django `SECRET_KEY`. They are write-only in the API; blank fields preserve saved values. Body IDs are also hidden after saving. Changing provider settings turns SMS mode off and clears verification. Keep `SECRET_KEY` stable and protect database backups; changing the key makes stored credentials unreadable and sending fails closed. Existing server environment values remain a fallback only until panel settings are saved.

Keep the safety switches in the server environment:

```env
SMS_ENABLED=false
SMS_DRY_RUN=true
SMS_PROVIDER=melipayamak
MELIPAYAMAK_USERNAME=
MELIPAYAMAK_PASSWORD=
MELIPAYAMAK_SENDER=
MELIPAYAMAK_BODY_ID_BOOKING_RECEIVED=
MELIPAYAMAK_BODY_ID_BOOKING_CONFIRMED=
MELIPAYAMAK_BODY_ID_BOOKING_RESCHEDULED=
MELIPAYAMAK_BODY_ID_BOOKING_CANCELLED=
MELIPAYAMAK_BODY_ID_APPOINTMENT_REMINDER=
SMS_BATCH_SIZE=25
SMS_MAX_PER_MINUTE=20
```

If a body ID is set, the worker sends through `BaseServiceNumber`. Otherwise it sends rendered text through `SendSMS` and requires a sender number. The optional Melipayamak environment values above remain available for deployments that do not use panel setup. Never commit credentials or real body IDs.

## Modes and worker

The saved `off` mode stops all sends. `test` simulates sends and records `simulated`. `live` requires `SMS_ENABLED=true`, `SMS_DRY_RUN=false`, complete credentials/sender or all body IDs, and a successful provider verification within 24 hours. The environment switches always take priority. Provider verification and credit/number diagnostics are read-only checks initiated by the administrator and work while sending is off or in dry-run. Start with `test` and inspect the report at `/admin/sms`. Administrator test messages may target only the signed-in administrator's saved phone number.

Run one batch with `python manage.py sms_worker`. An example systemd timer can run every minute:

```ini
# /etc/systemd/system/baharnaj-sms.service
[Unit]
Description=Baharnaj SMS batch
[Service]
Type=oneshot
User=baharnaj
WorkingDirectory=/srv/baharnaj/backend
ExecStart=/srv/baharnaj/venv/bin/python manage.py sms_worker
```

```ini
# /etc/systemd/system/baharnaj-sms.timer
[Unit]
Description=Run Baharnaj SMS batch
[Timer]
OnCalendar=*-*-* *:*:00
Persistent=true
[Install]
WantedBy=timers.target
```

Do not enable the timer until the schema migration, environment settings, and dry-run report have been reviewed. The worker has a bounded lease, per-minute and daily limits, and never holds a database lock while contacting Melipayamak.

## Activation, rollback, and delivery status

Apply the additive migration, save the Melipayamak details in the admin panel, set `SMS_ENABLED=true` while keeping `SMS_DRY_RUN=true`, set mode `test`, and run `sms_worker` manually. Check simulated deliveries and template previews. For a live test to yourself, set `SMS_DRY_RUN=false`, verify provider diagnostics on the admin page, switch to `live` with confirmation, and send a test message to the administrator account's saved number. A real administrator test message requires a sender number. Enable the timer only after this succeeds.

For an emergency stop set `SMS_ENABLED=false` or stop the timer. For routine rollback set mode `off`, stop/disable the timer, and keep delivery history; do not reverse the additive migration or delete SMS records. `accepted` means Melipayamak returned a receipt; only a later poll can mark `delivered`. `unknown` means the send outcome was ambiguous and must be investigated manually rather than blindly resent. `failed`, `cancelled`, and `expired` are terminal.

Phase 2 may add explicit SMS consent management and promotional, birthday, loyalty, or care campaigns. None of those messages are sent in Phase 1.
