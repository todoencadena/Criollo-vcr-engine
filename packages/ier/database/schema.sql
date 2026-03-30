-- Criollo VCR Engine - Phase 1: IER Database Schema
-- Intake Environment Registry (IER)
-- Zero-PII compliant schema for environment registration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for environment status
CREATE TYPE environment_status AS ENUM (
    'pending',      -- Awaiting review
    'approved',     -- Eligible for VCR minting
    'rejected',     -- Does not meet criteria
    'suspended'     -- Temporarily inactive
);

-- Enum for environment types
CREATE TYPE environment_type AS ENUM (
    'high_intake',     -- High-volume rescue/intake facility
    'medical',         -- Medical/surgical facility
    'sanctuary',       -- Long-term care sanctuary
    'transport',       -- Transport/logistics hub
    'foster_network'   -- Distributed foster network
);

-- Main environments table
CREATE TABLE environments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Privacy-preserving identifier (from Phase 0 hashing)
    environment_hash VARCHAR(64) NOT NULL UNIQUE,

    -- Environment metadata (NO PII)
    environment_type environment_type NOT NULL,
    year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),

    -- Registration status
    status environment_status NOT NULL DEFAULT 'pending',
    eligibility_score INTEGER CHECK (eligibility_score >= 0 AND eligibility_score <= 100),

    -- Operational capacity (no identifying info)
    monthly_intake_capacity INTEGER CHECK (monthly_intake_capacity > 0),
    specializations TEXT[], -- Array of specializations (e.g., ['emergency', 'surgical'])

    -- Timestamps
    registration_date TIMESTAMP NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_approval CHECK (
        (status = 'approved' AND approved_at IS NOT NULL) OR
        (status != 'approved' AND approved_at IS NULL)
    )
);

-- Eligibility criteria table
CREATE TABLE eligibility_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Criteria definition
    criterion_name VARCHAR(100) NOT NULL UNIQUE,
    criterion_type VARCHAR(50) NOT NULL, -- 'required', 'recommended', 'bonus'
    description TEXT NOT NULL,

    -- Scoring
    max_points INTEGER NOT NULL CHECK (max_points > 0),
    weight DECIMAL(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Environment eligibility scores (junction table)
CREATE TABLE environment_eligibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    criterion_id UUID NOT NULL REFERENCES eligibility_criteria(id) ON DELETE CASCADE,

    -- Evaluation
    points_earned INTEGER NOT NULL CHECK (points_earned >= 0),
    evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(environment_id, criterion_id)
);

-- Audit log for environment changes
CREATE TABLE environment_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

    -- Change tracking
    action VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'score_updated'
    old_status environment_status,
    new_status environment_status,
    old_score INTEGER,
    new_score INTEGER,

    -- Metadata
    changed_by VARCHAR(100), -- Operator hash or system
    change_reason TEXT,

    -- Timestamp
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_environments_hash ON environments(environment_hash);
CREATE INDEX idx_environments_status ON environments(status);
CREATE INDEX idx_environments_type ON environments(environment_type);
CREATE INDEX idx_environments_score ON environments(eligibility_score);
CREATE INDEX idx_audit_log_env_id ON environment_audit_log(environment_id);
CREATE INDEX idx_audit_log_created ON environment_audit_log(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_eligibility_criteria_updated_at BEFORE UPDATE ON eligibility_criteria
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_environment_eligibility_updated_at BEFORE UPDATE ON environment_eligibility
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default eligibility criteria
INSERT INTO eligibility_criteria (criterion_name, criterion_type, description, max_points, weight) VALUES
    ('operational_history', 'required', 'Minimum 6 months operational history', 20, 0.25),
    ('monthly_capacity', 'required', 'Documented monthly intake capacity > 10', 15, 0.20),
    ('medical_certification', 'required', 'Licensed veterinary partnership', 25, 0.30),
    ('transparency_score', 'recommended', 'Public reporting and transparency', 10, 0.10),
    ('network_participation', 'bonus', 'Active in rescue network', 10, 0.05),
    ('emergency_response', 'bonus', 'Emergency response capability', 10, 0.05),
    ('spay_neuter_program', 'bonus', 'Active spay/neuter program', 10, 0.05);

-- Comments for documentation
COMMENT ON TABLE environments IS 'Zero-PII registry of environments eligible for VCR minting';
COMMENT ON COLUMN environments.environment_hash IS 'SHA-256 hash from Phase 0 hashing module';
COMMENT ON TABLE eligibility_criteria IS 'Criteria for environment eligibility evaluation';
COMMENT ON TABLE environment_audit_log IS 'Audit trail for all environment changes';
