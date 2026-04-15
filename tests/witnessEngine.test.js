/**
 * Criollo Witness Engine Tests
 * Phase 4
 * Target: 28 tests, 100% passing
 */

'use strict';

const {
  validateWitnessInput,
  buildVCRPayload,
  serializeVCRPayload,
  deserializeVCRPayload,
  prepareBatchForMinting,
  buildMintInstruction,
  simulateMintTransaction,
  saveWitnessRecord,
  updateWitnessStatus,
  getWitnessRecord,
  WITNESS_STATUS,
  SOLANA_NETWORKS,
  VCR_SCHEMA_VERSION,
} = require('../packages/cwe/witnessEngine');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAttestation(overrides = {}) {
  return {
    attestation_hash:     'a'.repeat(64),
    operator_hash:        'b'.repeat(64),
    event_hash:           'c'.repeat(64),
    animal_hash:          'd'.repeat(64),
    environment_hash:     'e'.repeat(64),
    operator_role:        'veterinarian',
    operator_institution: 'Miami Animal Shelter',
    attested_at:          '2026-04-15T10:00:00Z',
    expires_at:           '2027-04-15T10:00:00Z',
    status:               'valid',
    ...overrides,
  };
}

function makeVCR(overrides = {}) {
  const result = buildVCRPayload(makeAttestation());
  return { ...result.vcr, ...overrides };
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
  test('WITNESS_STATUS defines all states', () => {
    expect(WITNESS_STATUS.PENDING).toBe('pending');
    expect(WITNESS_STATUS.WITNESSED).toBe('witnessed');
    expect(WITNESS_STATUS.MINTED).toBe('minted');
    expect(WITNESS_STATUS.FAILED).toBe('failed');
    expect(WITNESS_STATUS.REJECTED).toBe('rejected');
  });

  test('SOLANA_NETWORKS defines all networks', () => {
    expect(SOLANA_NETWORKS.DEVNET).toBe('devnet');
    expect(SOLANA_NETWORKS.MAINNET).toBe('mainnet-beta');
    expect(SOLANA_NETWORKS.TESTNET).toBe('testnet');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateWitnessInput', () => {
  test('returns valid for complete attestation', () => {
    const result = validateWitnessInput(makeAttestation());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns error for non-object input', () => {
    const result = validateWitnessInput('not an object');
    expect(result.valid).toBe(false);
  });

  test('returns error for missing required fields', () => {
    const result = validateWitnessInput({ attestation_hash: 'a'.repeat(64) });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('returns error for non-valid attestation status', () => {
    const result = validateWitnessInput(makeAttestation({ status: 'revoked' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  test('returns error for invalid attestation_hash format', () => {
    const result = validateWitnessInput(makeAttestation({ attestation_hash: 'not-a-hash' }));
    expect(result.valid).toBe(false);
  });

  test('returns error for expired attestation', () => {
    const result = validateWitnessInput(makeAttestation({ expires_at: '2020-01-01T00:00:00Z' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expired'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('buildVCRPayload', () => {
  test('builds valid VCR payload from attestation', () => {
    const result = buildVCRPayload(makeAttestation());
    expect(result.success).toBe(true);
    expect(result.vcr.vcr_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.vcr.witness_status).toBe(WITNESS_STATUS.WITNESSED);
    expect(result.vcr.schema_version).toBe(VCR_SCHEMA_VERSION);
  });

  test('defaults to devnet network', () => {
    const result = buildVCRPayload(makeAttestation());
    expect(result.vcr.network).toBe(SOLANA_NETWORKS.DEVNET);
  });

  test('accepts custom network', () => {
    const result = buildVCRPayload(makeAttestation(), SOLANA_NETWORKS.TESTNET);
    expect(result.vcr.network).toBe(SOLANA_NETWORKS.TESTNET);
  });

  test('fails for invalid attestation', () => {
    const result = buildVCRPayload(makeAttestation({ status: 'revoked' }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('VCR contains zero PII — only hashes', () => {
    const result = buildVCRPayload(makeAttestation());
    const vcrStr = JSON.stringify(result.vcr);
    expect(vcrStr).not.toMatch(/Miami/);
    expect(vcrStr).not.toMatch(/Garcia/);
    expect(vcrStr).not.toMatch(/VET-/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('serializeVCRPayload + deserializeVCRPayload', () => {
  test('serializes VCR to compact JSON string', () => {
    const vcr    = makeVCR();
    const result = serializeVCRPayload(vcr);
    expect(result.success).toBe(true);
    expect(typeof result.serialized).toBe('string');
    expect(result.byteLength).toBeGreaterThan(0);
  });

  test('deserialized VCR matches original', () => {
    const vcr        = makeVCR();
    const serialized = serializeVCRPayload(vcr);
    const restored   = deserializeVCRPayload(serialized.serialized);
    expect(restored.success).toBe(true);
    expect(restored.vcr.vcr_hash).toBe(vcr.vcr_hash);
    expect(restored.vcr.animal_hash).toBe(vcr.animal_hash);
    expect(restored.vcr.event_hash).toBe(vcr.event_hash);
  });

  test('serialization fails for invalid VCR', () => {
    const result = serializeVCRPayload({ no_hash: true });
    expect(result.success).toBe(false);
  });

  test('deserialization fails for invalid JSON', () => {
    const result = deserializeVCRPayload('not valid json {{{');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('prepareBatchForMinting', () => {
  test('prepares multiple attestations for minting', () => {
    const attestations = [makeAttestation(), makeAttestation({ attestation_hash: 'f'.repeat(64) })];
    const result       = prepareBatchForMinting(attestations);
    expect(result.success).toBe(true);
    expect(result.summary.ready).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  test('collects failures without stopping valid VCRs', () => {
    const attestations = [makeAttestation(), makeAttestation({ status: 'revoked' })];
    const result       = prepareBatchForMinting(attestations);
    expect(result.vcrs.length).toBe(1);
    expect(result.failed.length).toBe(1);
  });

  test('fails for empty array', () => {
    const result = prepareBatchForMinting([]);
    expect(result.success).toBe(false);
  });

  test('fails for non-array input', () => {
    const result = prepareBatchForMinting('not an array');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('buildMintInstruction', () => {
  test('builds valid mint instruction from VCR', () => {
    const vcr    = makeVCR();
    const result = buildMintInstruction(vcr);
    expect(result.success).toBe(true);
    expect(result.instruction.method).toBe('mint_vcr');
    expect(result.instruction.program).toBe('criollo_vcr_engine');
    expect(result.instruction.accounts.vcr_account).toBe(vcr.vcr_hash);
  });

  test('fails for invalid VCR', () => {
    const result = buildMintInstruction({ no_hash: true });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('simulateMintTransaction', () => {
  test('returns simulated transaction with explorer URL', () => {
    const vcr    = makeVCR();
    const result = simulateMintTransaction(vcr);
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.tx.status).toBe('confirmed');
    expect(result.tx.explorer_url).toMatch(/explorer\.solana\.com/);
    expect(result.tx.signature).toMatch(/^[a-f0-9]{64}$/);
  });

  test('fails for invalid VCR', () => {
    const result = simulateMintTransaction(null);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Witness Registry', () => {
  test('saveWitnessRecord succeeds with valid VCR', async () => {
    const vcr    = makeVCR();
    const pool   = makeMockPool([vcr]);
    const result = await saveWitnessRecord(pool, vcr);
    expect(result.success).toBe(true);
  });

  test('saveWitnessRecord fails on DB error', async () => {
    const vcr    = makeVCR();
    const pool   = makeErrorPool();
    const result = await saveWitnessRecord(pool, vcr);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('updateWitnessStatus updates record successfully', async () => {
    const vcr    = makeVCR();
    const pool   = makeMockPool([{ ...vcr, status: WITNESS_STATUS.MINTED }]);
    const result = await updateWitnessStatus(pool, vcr.vcr_hash, WITNESS_STATUS.MINTED, 'tx123');
    expect(result.success).toBe(true);
  });

  test('updateWitnessStatus returns error when record not found', async () => {
    const pool   = makeMockPool([]);
    const result = await updateWitnessStatus(pool, 'a'.repeat(64), WITNESS_STATUS.MINTED);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  test('getWitnessRecord returns record when found', async () => {
    const vcr    = makeVCR();
    const pool   = makeMockPool([vcr]);
    const result = await getWitnessRecord(pool, vcr.vcr_hash);
    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
  });

  test('getWitnessRecord returns error when not found', async () => {
    const pool   = makeMockPool([]);
    const result = await getWitnessRecord(pool, 'a'.repeat(64));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
