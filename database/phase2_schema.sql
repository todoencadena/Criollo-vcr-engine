-- ============================================================================
-- PHASE 2: CARE EVENT LOGGER (CEL) - DATABASE SCHEMA
-- Zero-PII event tracking with temporal verification
-- ============================================================================

-- Event Type Enumeration
CREATE TYPE event_type AS ENUM (
    'intake',      -- Animal arrival events
    'medical',     -- Medical interventions (vaccines, surgeries, treatments)
    'care',        -- Daily care (feeding, exercise, socialization)
    'transfer',    -- Movement between environments
    'outcome'      -- Final outcomes (adoption, release, end-of-life)
);

-- Care Events Table
CREATE TABLE care_events (
    id SERIAL PRIMARY KEY,
    
    -- Zero-PII Identifiers (SHA-256 hashes)
    event_hash VARCHAR(64) UNIQUE NOT NULL,
    animal_hash VARCHAR(64) NOT NULL,
    environment_hash VARCHAR(64) NOT NULL,
    operator_hash VARCHAR(64),  -- Optional: who performed the event
    
    -- Event Classification
    event_type event_type NOT NULL,
    event_category VARCHAR(100) NOT NULL,  -- vaccination, surgery, feeding, etc.
    
    -- Temporal Data
    event_timestamp TIMESTAMPTZ NOT NULL,
    event_date DATE NOT NULL,  -- Indexed for fast date queries
    
    -- Zero-PII Metadata (structured data without PII)
    metadata JSONB,
    
    -- Notes (zero-PII descriptive text)
    notes TEXT,
    
    -- Audit Trail
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT event_timestamp_valid CHECK (event_timestamp <= NOW()),
    CONSTRAINT event_date_valid CHECK (event_date >= '2020-01-01' AND event_date <= CURRENT_DATE + INTERVAL '1 day')
);

-- Indexes for Performance
CREATE INDEX idx_care_events_animal ON care_events(animal_hash);
CREATE INDEX idx_care_events_environment ON care_events(environment_hash);
CREATE INDEX idx_care_events_operator ON care_events(operator_hash);
CREATE INDEX idx_care_events_type ON care_events(event_type);
CREATE INDEX idx_care_events_category ON care_events(event_category);
CREATE INDEX idx_care_events_date ON care_events(event_date);
CREATE INDEX idx_care_events_timestamp ON care_events(event_timestamp);
CREATE INDEX idx_care_events_metadata ON care_events USING GIN (metadata);

-- Audit Log for Care Events
CREATE TABLE care_event_audit_log (
    id SERIAL PRIMARY KEY,
    care_event_id INTEGER REFERENCES care_events(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,  -- created, updated, deleted
    changed_by VARCHAR(64),  -- operator_hash
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX idx_care_event_audit_event_id ON care_event_audit_log(care_event_id);
CREATE INDEX idx_care_event_audit_changed_at ON care_event_audit_log(changed_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_care_event_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER care_event_updated_at
    BEFORE UPDATE ON care_events
    FOR EACH ROW
    EXECUTE FUNCTION update_care_event_updated_at();

-- Function to log audit trail
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

-- Trigger for audit logging
CREATE TRIGGER care_event_audit
    AFTER INSERT OR UPDATE OR DELETE ON care_events
    FOR EACH ROW
    EXECUTE FUNCTION log_care_event_audit();

-- Comments for documentation
COMMENT ON TABLE care_events IS 'Zero-PII event tracking for animal care lifecycle';
COMMENT ON COLUMN care_events.event_hash IS 'SHA-256 hash uniquely identifying this event';
COMMENT ON COLUMN care_events.animal_hash IS 'SHA-256 hash of animal (microchip + intake date)';
COMMENT ON COLUMN care_events.environment_hash IS 'SHA-256 hash of environment (name + year)';
COMMENT ON COLUMN care_events.metadata IS 'Zero-PII structured data (no names, addresses, or PII)';
