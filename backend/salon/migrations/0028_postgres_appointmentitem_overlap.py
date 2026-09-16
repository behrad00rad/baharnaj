from django.db import migrations


POSTGRES_TRIGGER_FUNCTION = """
CREATE OR REPLACE FUNCTION salon_appointmentitem_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM salon_appointmentitem AS existing
        JOIN salon_appointment AS appointment
          ON appointment.id = existing.appointment_id
        WHERE existing.employee_id = NEW.employee_id
          AND existing.date = NEW.date
          AND appointment.status IN ('pending', 'confirmed')
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
          AND (TG_OP = 'INSERT' OR existing.id <> NEW.id)
    ) THEN
        RAISE EXCEPTION 'employee appointment items overlap'
            USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$;
"""


def install_postgres_overlap_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(POSTGRES_TRIGGER_FUNCTION)
    schema_editor.execute("""
        CREATE TRIGGER salon_appointmentitem_no_overlap_insert
        BEFORE INSERT ON salon_appointmentitem
        FOR EACH ROW EXECUTE FUNCTION salon_appointmentitem_no_overlap();
    """)
    schema_editor.execute("""
        CREATE TRIGGER salon_appointmentitem_no_overlap_update
        BEFORE UPDATE OF employee_id, date, start_time, end_time, appointment_id
        ON salon_appointmentitem
        FOR EACH ROW EXECUTE FUNCTION salon_appointmentitem_no_overlap();
    """)


def remove_postgres_overlap_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "DROP TRIGGER IF EXISTS salon_appointmentitem_no_overlap_insert "
        "ON salon_appointmentitem"
    )
    schema_editor.execute(
        "DROP TRIGGER IF EXISTS salon_appointmentitem_no_overlap_update "
        "ON salon_appointmentitem"
    )
    schema_editor.execute(
        "DROP FUNCTION IF EXISTS salon_appointmentitem_no_overlap()"
    )


class Migration(migrations.Migration):
    dependencies = [("salon", "0027_appointmentitem_discount_amount_and_more")]

    operations = [
        migrations.RunPython(
            install_postgres_overlap_triggers,
            remove_postgres_overlap_triggers,
        ),
    ]