/**
 * Operator Attestation Layer (OAL)
 * Phase 3 - Week 3
 *
 * Cryptographic attestation system for care event operators.
 * Operators sign care events with their credentials to create
 * tamper-proof attestations — the institutional trust layer
 * between raw care events and on-chain VCR minting.
 */

'use strict';

const crypto = require('crypto');
const { hashOperator, hashCareEvent } = require('../privacy/hashing');

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTESTATION_VERSION = '1.0';

const OPERATOR_ROLES = [
  'veterinarian',
  'shelter_staff',
  'rescue_operator',
  'medical_technician',
  'intake_coordinator',
  'field_officer',
];

const ATTESTATION_STATUS = {
  PENDING:   'pending',
  VALID:     'valid',
  INVALID:   'invalid',
  REVOKED:   'revoked',
  EXPIRED:   'expired',
};

const ATTESTATION_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// ─── Operator Validation ──────────────────────────────────────────────────────

/**
 * Validate operator credentials before attestation.
 */
function validateOperatorCredentials(operator) {
  const errors = [];

  if (!operator || typeof operator !== 'object') {
    return { valid: false, errors: ['Operator must be a plain object'] };
  }

  if (!operator.name || !operator.name.trim()) {
    errors.push('Operator name is required');
  }

  if (!operator.role) {
    errors.push('Operator role is required');
  } else if (!OPERATOR_ROLES.includes(operator.role)) {
    errors.push(`Invalid operator role: ${operator.role}. Must be one of: ${OPERATOR_ROLES.join(', ')}`);
  }

  if (!operator.license_id || !operator.license_id.trim()) {
    errors.push('Operator license_id is required');
  }

  if (!operator.institution || !operator.institution.trim()) {
    errors.push('Operator institution is required');
  }

  return {
    valid:  errors.length === 0,
    errors,
  };
}

/**
 * Validate that a care event has the minimum fields for attestation.
 */
function validateAttestationTarget(event) {
  const errors = [];

  const required = ['event_hash', 'animal_hash', 'environment_hash', 'event_type', 'event_timestamp'];
  for (const field of required) {
    if (!event[field]) errors.push(`Missing required field: ${field}`);
  }

  if (event.event_hash && !/^[a-f0-9]{64}$/i.test(event.event_hash)) {
    errors.push('event_hash must be a valid SHA-256 hex string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Attestation Generation ───────────────────────────────────────────────────

/**
 * Generate a deterministic attestation hash for an operator + event pair.
 * The attestation hash binds the operator identity to the specific care event.
 */
function generateAttestationHash(operatorHash, eventHash, timestamp, salt) {
  const payload = JSON.stringify({
    operator_hash: operatorHash,
    event_hash:    eventHash,
    timestamp,
    version:       ATTESTATION_VERSION,
  });

  return crypto
    .createHash('sha256')
    .update(`${payload}${salt}`)
    .digest('hex');
}

/**
 * Create a full attestation record for a care event.
 * Binds operator credentials to event cryptographically.
 */
function createAttestation(operator, event, salt) {
  const operatorValidation = validateOperatorCredentials(operator);
  if (!operatorValidation.valid) {
    return { success: false, errors: operatorValidation.errors };
  }

  const eventValidation = validateAttestationTarget(event);
  if (!eventValidation.valid) {
    return { success: false, errors: eventValidation.errors };
  }

  const timestamp    = new Date().toISOString();
  const operatorHash = hashOperator(operator.name, operator.role, salt);
  const attestationHash = generateAttestationHash(
    operatorHash,
    event.event_hash,
    timestamp,
    salt,
  );

  const expiresAt = new Date(Date.now() + ATTESTATION_EXPIRY_MS).toISOString();

  return {
    success: true,
    attestation: {
      attestation_hash:  attestationHash,
      operator_hash:     operatorHash,
      event_hash:        event.event_hash,
      animal_hash:       event.animal_hash,
      environment_hash:  event.environment_hash,
      operator_role:     operator.role,
      operator_institution: operator.institution,
      attested_at:       timestamp,
      expires_at:        expiresAt,
      version:           ATTESTATION_VERSION,
      status:            ATTESTATION_STATUS.VALID,
    },
  };
}

// ─── Attestation Verification ─────────────────────────────────────────────────

/**
 * Verify an existing attestation against the original operator and event.
 * Recomputes the hash and compares — detects any tampering.
 */
function verifyAttestation(attestation, operator, salt) {
  if (!attestation || !attestation.attestation_hash) {
    return { valid: false, reason: 'Invalid attestation object' };
  }

  if (attestation.status === ATTESTATION_STATUS.REVOKED) {
    return { valid: false, reason: 'Attestation has been revoked' };
  }

  if (new Date(attestation.expires_at) < new Date()) {
    return { valid: false, reason: 'Attestation has expired', status: ATTESTATION_STATUS.EXPIRED };
  }

  const operatorHash = hashOperator(operator.name, operator.role, salt);
  if (operatorHash !== attestation.operator_hash) {
    return { valid: false, reason: 'Operator hash mismatch — credentials do not match attestation' };
  }

  const recomputed = generateAttestationHash(
    operatorHash,
    attestation.event_hash,
    attestation.attested_at,
    salt,
  );

  if (recomputed !== attestation.attestation_hash) {
    return { valid: false, reason: 'Attestation hash mismatch — data may have been tampered' };
  }

  return {
    valid:  true,
    reason: 'Attestation is valid',
    status: ATTESTATION_STATUS.VALID,
  };
}

/**
 * Revoke an attestation — returns a new attestation object with revoked status.
 * Original attestation is immutable; revocation creates a new record.
 */
function revokeAttestation(attestation, reason = 'Revoked by operator') {
  if (!attestation || !attestation.attestation_hash) {
    return { success: false, error: 'Invalid attestation object' };
  }

  if (attestation.status === ATTESTATION_STATUS.REVOKED) {
    return { success: false, error: 'Attestation is already revoked' };
  }

  return {
    success: true,
    attestation: {
      ...attestation,
      status:      ATTESTATION_STATUS.REVOKED,
      revoked_at:  new Date().toISOString(),
      revoke_reason: reason,
    },
  };
}

// ─── Batch Attestation ────────────────────────────────────────────────────────

/**
 * Create attestations for multiple events from a single operator.
 * Returns valid attestations and collects failures separately.
 */
function batchAttest(operator, events, salt) {
  const operatorValidation = validateOperatorCredentials(operator);
  if (!operatorValidation.valid) {
    return {
      success:      false,
      errors:       operatorValidation.errors,
      attestations: [],
      failed:       [],
    };
  }

  const attestations = [];
  const failed       = [];

  for (let i = 0; i < events.length; i++) {
    const result = createAttestation(operator, events[i], salt);
    if (result.success) {
      attestations.push({ index: i, attestation: result.attestation });
    } else {
      failed.push({ index: i, errors: result.errors });
    }
  }

  return {
    success:      attestations.length > 0,
    attestations,
    failed,
    summary: {
      total:   events.length,
      attested: attestations.length,
      failed:  failed.length,
    },
  };
}

// ─── Attestation Registry ─────────────────────────────────────────────────────

/**
 * Store attestation in the database.
 */
async function saveAttestation(pool, attestation) {
  const sql = `
    INSERT INTO operator_attestations
      (attestation_hash, operator_hash, event_hash, animal_hash,
       environment_hash, operator_role, operator_institution,
       attested_at, expires_at, version, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (attestation_hash) DO NOTHING
    RETURNING *
  `;

  const values = [
    attestation.attestation_hash,
    attestation.operator_hash,
    attestation.event_hash,
    attestation.animal_hash,
    attestation.environment_hash,
    attestation.operator_role,
    attestation.operator_institution,
    attestation.attested_at,
    attestation.expires_at,
    attestation.version,
    attestation.status,
  ];

  try {
    const result = await pool.query(sql, values);
    return { success: true, attestation: result.rows[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve attestation by its hash.
 */
async function getAttestationByHash(pool, attestationHash) {
  const sql = `
    SELECT * FROM operator_attestations
    WHERE attestation_hash = $1
  `;

  try {
    const result = await pool.query(sql, [attestationHash]);
    if (!result.rows.length) return { success: false, error: 'Attestation not found' };
    return { success: true, attestation: result.rows[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all attestations for a specific care event.
 */
async function getAttestationsByEvent(pool, eventHash) {
  const sql = `
    SELECT * FROM operator_attestations
    WHERE event_hash = $1
    ORDER BY attested_at DESC
  `;

  try {
    const result = await pool.query(sql, [eventHash]);
    return { success: true, attestations: result.rows, count: result.rowCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all attestations from a specific operator.
 */
async function getAttestationsByOperator(pool, operatorHash) {
  const sql = `
    SELECT * FROM operator_attestations
    WHERE operator_hash = $1
    ORDER BY attested_at DESC
  `;

  try {
    const result = await pool.query(sql, [operatorHash]);
    return { success: true, attestations: result.rows, count: result.rowCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Validation
  validateOperatorCredentials,
  validateAttestationTarget,

  // Attestation
  generateAttestationHash,
  createAttestation,
  verifyAttestation,
  revokeAttestation,
  batchAttest,

  // Registry
  saveAttestation,
  getAttestationByHash,
  getAttestationsByEvent,
  getAttestationsByOperator,

  // Constants
  ATTESTATION_VERSION,
  OPERATOR_ROLES,
  ATTESTATION_STATUS,
  ATTESTATION_EXPIRY_MS,
};
