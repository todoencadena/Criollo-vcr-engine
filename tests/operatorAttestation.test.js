/**
 * Operator Attestation Layer Tests
 * Phase 3 - Week 3
 * Target: 25 tests, 100% passing
 */

'use strict';

const {
  validateOperatorCredentials,
  validateAttestationTarget,
  generateAttestationHash,
  createAttestation,
  verifyAttestation,
  revokeAttestation,
  batchAttest,
  saveAttestation,
  getAttestationByHash,
  getAttestationsByEvent,
  getAttestationsByOperator,
  ATTESTATION_STATUS,
  OPERATOR_ROLES,
} = require('../packages/cel/operatorAttestation');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const testSalt = 'test-salt-2026';

function makeOperator(overrides = {}) {
  return {
    name:        'Dr. Maria Garcia',
    role:        'veterinarian',
    license_id:  'VET-2026-001',
    institution: 'Miami Animal Shelter',
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    event_hash:       'a'.repeat(64),
    animal_hash:      'b'.repeat(64),
    environment_hash: 'c'.repeat(64),
    operator_hash:    'd'.repeat(64),
    event_type:       'medical',
    event_timestamp:  '2026-04-11T10:00:00Z',
    ...overrides,
  };
}

function makeMockPool(rows = []) {
  return {
    query: jest.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

function makeErrorPool() {
  return {
    query: jest.fn(async () => { throw new Error('DB error'); }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Constants', () => {
  test('OPERATOR_ROLES contains all expected roles', () => {
    expect(OPERATOR_ROLES).toContain('veterinarian');
    expect(OPERATOR_ROLES).toContain('shelter_staff');
    expect(OPERATOR_ROLES).toContain('rescue_operator');
    expect(OPERATOR_ROLES.length).toBeGreaterThanOrEqual(6);
  });

  test('ATTESTATION_STATUS defines all states', () => {
    expect(ATTESTATION_STATUS.VALID).toBe('valid');
    expect(ATTESTATION_STATUS.INVALID).toBe('invalid');
    expect(ATTESTATION_STATUS.REVOKED).toBe('revoked');
    expect(ATTESTATION_STATUS.EXPIRED).toBe('expired');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateOperatorCredentials', () => {
  test('returns valid for complete operator', () => {
    const result = validateOperatorCredentials(makeOperator());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns error for missing name', () => {
    const result = validateOperatorCredentials(makeOperator({ name: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  test('returns error for invalid role', () => {
    const result = validateOperatorCredentials(makeOperator({ role: 'hacker' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('role'))).toBe(true);
  });

  test('returns error for missing license_id', () => {
    const result = validateOperatorCredentials(makeOperator({ license_id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('license_id'))).toBe(true);
  });

  test('returns error for non-object input', () => {
    const result = validateOperatorCredentials('not an object');
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateAttestationTarget', () => {
  test('returns valid for complete event', () => {
    const result = validateAttestationTarget(makeEvent());
    expect(result.valid).toBe(true);
  });

  test('returns error for missing event_hash', () => {
    const result = validateAttestationTarget(makeEvent({ event_hash: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('event_hash'))).toBe(true);
  });

  test('returns error for invalid hash format', () => {
    const result = validateAttestationTarget(makeEvent({ event_hash: 'not-a-hash' }));
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('generateAttestationHash', () => {
  test('generates a 64-character hex hash', () => {
    const hash = generateAttestationHash('a'.repeat(64), 'b'.repeat(64), '2026-04-11T10:00:00Z', testSalt);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('is deterministic — same inputs produce same hash', () => {
    const h1 = generateAttestationHash('a'.repeat(64), 'b'.repeat(64), '2026-04-11T10:00:00Z', testSalt);
    const h2 = generateAttestationHash('a'.repeat(64), 'b'.repeat(64), '2026-04-11T10:00:00Z', testSalt);
    expect(h1).toBe(h2);
  });

  test('different operator produces different hash', () => {
    const h1 = generateAttestationHash('a'.repeat(64), 'b'.repeat(64), '2026-04-11T10:00:00Z', testSalt);
    const h2 = generateAttestationHash('c'.repeat(64), 'b'.repeat(64), '2026-04-11T10:00:00Z', testSalt);
    expect(h1).not.toBe(h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('createAttestation', () => {
  test('creates valid attestation for correct inputs', () => {
    const result = createAttestation(makeOperator(), makeEvent(), testSalt);
    expect(result.success).toBe(true);
    expect(result.attestation.status).toBe(ATTESTATION_STATUS.VALID);
    expect(result.attestation.attestation_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.attestation.operator_role).toBe('veterinarian');
  });

  test('fails for invalid operator', () => {
    const result = createAttestation(makeOperator({ role: 'invalid' }), makeEvent(), testSalt);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('fails for invalid event', () => {
    const result = createAttestation(makeOperator(), makeEvent({ event_hash: '' }), testSalt);
    expect(result.success).toBe(false);
  });

  test('attestation includes expiry date', () => {
    const result = createAttestation(makeOperator(), makeEvent(), testSalt);
    expect(result.attestation.expires_at).toBeDefined();
    expect(new Date(result.attestation.expires_at) > new Date()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('verifyAttestation', () => {
  test('verifies a valid attestation successfully', () => {
    const operator    = makeOperator();
    const { attestation } = createAttestation(operator, makeEvent(), testSalt).attestation
      ? createAttestation(operator, makeEvent(), testSalt)
      : {};
    const verification = verifyAttestation(attestation, operator, testSalt);
    expect(verification.valid).toBe(true);
  });

  test('fails verification for wrong operator', () => {
    const operator    = makeOperator();
    const wrongOp     = makeOperator({ name: 'Impostor' });
    const { attestation } = createAttestation(operator, makeEvent(), testSalt);
    const verification = verifyAttestation(attestation, wrongOp, testSalt);
    expect(verification.valid).toBe(false);
  });

  test('fails verification for revoked attestation', () => {
    const operator = makeOperator();
    const { attestation } = createAttestation(operator, makeEvent(), testSalt);
    const revoked  = revokeAttestation(attestation).attestation;
    const result   = verifyAttestation(revoked, operator, testSalt);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/revoked/i);
  });

  test('fails for null attestation', () => {
    const result = verifyAttestation(null, makeOperator(), testSalt);
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('revokeAttestation', () => {
  test('successfully revokes a valid attestation', () => {
    const { attestation } = createAttestation(makeOperator(), makeEvent(), testSalt);
    const result = revokeAttestation(attestation, 'Test revocation');
    expect(result.success).toBe(true);
    expect(result.attestation.status).toBe(ATTESTATION_STATUS.REVOKED);
    expect(result.attestation.revoke_reason).toBe('Test revocation');
  });

  test('fails to revoke already revoked attestation', () => {
    const { attestation } = createAttestation(makeOperator(), makeEvent(), testSalt);
    const revoked = revokeAttestation(attestation).attestation;
    const result  = revokeAttestation(revoked);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('batchAttest', () => {
  test('attests multiple events from one operator', () => {
    const events = [makeEvent(), makeEvent({ event_hash: 'e'.repeat(64) })];
    const result = batchAttest(makeOperator(), events, testSalt);
    expect(result.success).toBe(true);
    expect(result.summary.attested).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  test('collects failures without stopping valid attestations', () => {
    const events = [makeEvent(), makeEvent({ event_hash: '' })];
    const result = batchAttest(makeOperator(), events, testSalt);
    expect(result.attestations.length).toBe(1);
    expect(result.failed.length).toBe(1);
  });

  test('fails entirely for invalid operator', () => {
    const result = batchAttest(makeOperator({ role: 'invalid' }), [makeEvent()], testSalt);
    expect(result.success).toBe(false);
    expect(result.attestations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Registry — DB operations', () => {
  test('saveAttestation returns success on valid insert', async () => {
    const { attestation } = createAttestation(makeOperator(), makeEvent(), testSalt);
    const pool   = makeMockPool([attestation]);
    const result = await saveAttestation(pool, attestation);
    expect(result.success).toBe(true);
  });

  test('saveAttestation returns failure on DB error', async () => {
    const { attestation } = createAttestation(makeOperator(), makeEvent(), testSalt);
    const pool   = makeErrorPool();
    const result = await saveAttestation(pool, attestation);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('getAttestationByHash returns attestation when found', async () => {
    const fakeAttestation = { attestation_hash: 'a'.repeat(64) };
    const pool   = makeMockPool([fakeAttestation]);
    const result = await getAttestationByHash(pool, 'a'.repeat(64));
    expect(result.success).toBe(true);
    expect(result.attestation).toEqual(fakeAttestation);
  });

  test('getAttestationByHash returns error when not found', async () => {
    const pool   = makeMockPool([]);
    const result = await getAttestationByHash(pool, 'a'.repeat(64));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  test('getAttestationsByEvent returns all attestations for event', async () => {
    const rows = [{ attestation_hash: 'a'.repeat(64) }, { attestation_hash: 'b'.repeat(64) }];
    const pool = makeMockPool(rows);
    const result = await getAttestationsByEvent(pool, 'c'.repeat(64));
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});
