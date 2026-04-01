-- Migration: Fix audit trigger for DELETE operations
--
-- Problem: The log_care_event_audit trigger fires AFTER DELETE on care_events
-- and tries to INSERT into care_event_audit_log with care_event_id = OLD.id.
-- But the parent row is already gone at that point, violating the FK constraint
-- care_event_audit_log_care_event_id_fkey.
--
-- Fix: For DELETE events, omit care_event_id (leave it NULL).
-- care_event_id is already nullable and old_values JSONB preserves all data.

CREATE OR REPLACE FUNCTION log_care_event_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO care_event_audit_log (care_event_id, action, new_values)
        VALUES (NEW.id, 'created', row_to_json(NEW)::jsonb);
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO care_event_audit_log (care_event_id, action, old_values, new_values)
        VALUES (NEW.id, 'updated', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    ELSIF TG_OP = 'DELETE' THEN
        -- care_event_id is intentionally NULL here: the parent row is already gone
        -- by the time the AFTER DELETE trigger fires. All data is preserved in old_values.
        INSERT INTO care_event_audit_log (action, old_values)
        VALUES ('deleted', row_to_json(OLD)::jsonb);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
