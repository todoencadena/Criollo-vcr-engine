/**
 * Criollo Witness Engine (CWE)
 * Phase 4
 *
 * The bridge between the CEL backend and Solana on-chain minting.
 * Prepares verified care events for VCR (Verifiable Care Record)
 * minting on Solana Devnet — the final trust layer before on-chain
 * immutability.
 */

'use strict';

const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────

const CWE_VERSION = '1.0';

const WITNESS_STATUS = {
  PENDING:   'pending',
  WITNESSED: 'witnessed',
  REJECTED:  'rejected',
  MINTED:    'minted',
  FAILED:    'failed',
};

const SOLANA_NETWORKS = {
  DEVNET:    'devnet',
  TESTNET:   'testnet',
  MAINNET:   'mainnet-beta',
};

const VCR_SCHEMA_VERSION = '1.0';

const REQUIRED_ATTESTATION_FIELDS = [
  'attestation_hash',
  'operator_hash',
  'event_hash',
  'animal_hash',
  'environment_hash',
  'operator_role',
  'attested_at',
  'status',
];

// ─── VCR Payload Builder ──────────────────────────────────────────────────────

/**
 * Validate that an attestation is ready for witnessing.
 */
function validateWitnessInput(attestation) {
  const errors = [];

  if (!attestation || typeof attestation !== 'object') {
    return { valid: false, errors: ['Attestation must be a plain object'] };
  }

  for (const field of REQUIRED_ATTESTATION_FIELDS) {
    if (!attestation[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (attestation.status && attestation.status !== 'valid') {
    errors.push(`Attestation status must be 'valid' — got '${attestation.status}'`);
  }

  if (attestation.attestation_hash && !/^[a-f0-9]{64}$/i.test(attestation.attestation_hash)) {
    errors.push('attestation_hash must be a valid SHA-256 hex string');
  }

  if (attestation.expires_at && new Date(attestation.expires_at) < new Date()) {
    errors.push('Attestation has expired');
  }

  return {
    valid:  errors.length === 0,
    errors,
  };
}

/**
 * Build a VCR (Verifiable Care Record) payload from a witnessed attestation.
 * This is the data structure that gets serialized and sent to Solana.
 */
function buildVCRPayload(attestation, network = SOLANA_NETWORKS.DEVNET) {
  const validation = validateWitnessInput(attestation);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const witnessedAt = new Date().toISOString();

  const vcr = {
    schema_version:    VCR_SCHEMA_VERSION,
    cwe_version:       CWE_VERSION,
    network,

    // Identity hashes — zero PII on-chain
    attestation_hash:  attestation.attestation_hash,
    event_hash:        attestation.event_hash,
    animal_hash:       attestation.animal_hash,
    environment_hash:  attestation.environment_hash,
    operator_hash:     attestation.operator_hash,

    // Metadata — no personal data
    operator_role:     attestation.operator_role,
    attested_at:       attestation.attested_at,
    witnessed_at:      witnessedAt,

    // Status
    witness_status:    WITNESS_STATUS.WITNESSED,
  };

  // Generate a deterministic VCR hash from the payload
  const vcrHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      attestation_hash: vcr.attestation_hash,
      event_hash:       vcr.event_hash,
      animal_hash:      vcr.animal_hash,
      witnessed_at:     vcr.witnessed_at,
      network:          vcr.network,
    }))
    .digest('hex');

  return {
    success: true,
    vcr: { ...vcr, vcr_hash: vcrHash },
  };
}

/**
 * Serialize a VCR payload to a compact binary-safe string for on-chain storage.
 * Solana programs store data in accounts — this produces the account data.
 */
function serializeVCRPayload(vcr) {
  if (!vcr || !vcr.vcr_hash) {
    return { success: false, error: 'Invalid VCR payload — missing vcr_hash' };
  }

  const serialized = JSON.stringify({
    v:   vcr.schema_version,
    net: vcr.network,
    ah:  vcr.attestation_hash,
    eh:  vcr.event_hash,
    anh: vcr.animal_hash,
    evh: vcr.environment_hash,
    oph: vcr.operator_hash,
    or:  vcr.operator_role,
    at:  vcr.attested_at,
    wt:  vcr.witnessed_at,
    vh:  vcr.vcr_hash,
  });

  return {
    success:    true,
    serialized,
    byteLength: Buffer.byteLength(serialized, 'utf8'),
  };
}

/**
 * Deserialize a VCR payload from its compact form back to full structure.
 */
function deserializeVCRPayload(serialized) {
  try {
    const data = JSON.parse(serialized);

    return {
      success: true,
      vcr: {
        schema_version:   data.v,
        network:          data.net,
        attestation_hash: data.ah,
        event_hash:       data.eh,
        animal_hash:      data.anh,
        environment_hash: data.evh,
        operator_hash:    data.oph,
        operator_role:    data.or,
        attested_at:      data.at,
        witnessed_at:     data.wt,
        vcr_hash:         data.vh,
      },
    };
  } catch (err) {
    return { success: false, error: `Deserialization failed: ${err.message}` };
  }
}

// ─── Witness Queue ────────────────────────────────────────────────────────────

/**
 * Prepare a batch of attestations for witnessing.
 * Returns ready VCR payloads and collects failures.
 */
function prepareBatchForMinting(attestations, network = SOLANA_NETWORKS.DEVNET) {
  if (!Array.isArray(attestations) || attestations.length === 0) {
    return {
      success: false,
      errors:  ['attestations must be a non-empty array'],
      vcrs:    [],
      failed:  [],
    };
  }

  const vcrs   = [];
  const failed = [];

  for (let i = 0; i < attestations.length; i++) {
    const result = buildVCRPayload(attestations[i], network);
    if (result.success) {
      vcrs.push({ index: i, vcr: result.vcr });
    } else {
      failed.push({ index: i, errors: result.errors });
    }
  }

  return {
    success: vcrs.length > 0,
    vcrs,
    failed,
    summary: {
      total:  attestations.length,
      ready:  vcrs.length,
      failed: failed.length,
    },
  };
}

// ─── Solana Transaction Builder ───────────────────────────────────────────────

/**
 * Build the instruction data for a Solana mint_vcr instruction.
 * This produces the exact byte array the Anchor program expects.
 */
function buildMintInstruction(vcr) {
  if (!vcr || !vcr.vcr_hash) {
    return { success: false, error: 'Invalid VCR — missing vcr_hash' };
  }

  const serialization = serializeVCRPayload(vcr);
  if (!serialization.success) {
    return { success: false, error: serialization.error };
  }

  return {
    success:         true,
    instruction: {
      program:       'criollo_vcr_engine',
      method:        'mint_vcr',
      data:          serialization.serialized,
      byteLength:    serialization.byteLength,
      accounts: {
        vcr_account: vcr.vcr_hash,
        authority:   vcr.operator_hash,
        animal:      vcr.animal_hash,
        environment: vcr.environment_hash,
      },
    },
  };
}

/**
 * Simulate a Solana transaction for testing without hitting the network.
 * Returns what a successful devnet response would look like.
 */
function simulateMintTransaction(vcr) {
  if (!vcr || !vcr.vcr_hash) {
    return { success: false, error: 'Invalid VCR' };
  }

  const txHash = crypto
    .createHash('sha256')
    .update(`${vcr.vcr_hash}${Date.now()}`)
    .digest('hex');

  return {
    success:   true,
    simulated: true,
    tx: {
      signature:   txHash,
      vcr_hash:    vcr.vcr_hash,
      network:     vcr.network,
      status:      'confirmed',
      slot:        Math.floor(Math.random() * 1000000) + 300000000,
      timestamp:   new Date().toISOString(),
      explorer_url: `https://explorer.solana.com/tx/${txHash}?cluster=${vcr.network}`,
    },
  };
}

// ─── Witness Registry ─────────────────────────────────────────────────────────

/**
 * Save a witnessed VCR to the database before minting.
 */
async function saveWitnessRecord(pool, vcr) {
  const sql = `
    INSERT INTO vcr_witness_records
      (vcr_hash, attestation_hash, event_hash, animal_hash,
       environment_hash, operator_hash, operator_role,
       attested_at, witnessed_at, network, schema_version, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (vcr_hash) DO NOTHING
    RETURNING *
  `;

  const values = [
    vcr.vcr_hash,
    vcr.attestation_hash,
    vcr.event_hash,
    vcr.animal_hash,
    vcr.environment_hash,
    vcr.operator_hash,
    vcr.operator_role,
    vcr.attested_at,
    vcr.witnessed_at,
    vcr.network,
    vcr.schema_version,
    vcr.witness_status || WITNESS_STATUS.WITNESSED,
  ];

  try {
    const result = await pool.query(sql, values);
    return { success: true, record: result.rows[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update witness record status after minting attempt.
 */
async function updateWitnessStatus(pool, vcrHash, status, txSignature = null) {
  const sql = `
    UPDATE vcr_witness_records
    SET status = $2, tx_signature = $3, updated_at = NOW()
    WHERE vcr_hash = $1
    RETURNING *
  `;

  try {
    const result = await pool.query(sql, [vcrHash, status, txSignature]);
    if (!result.rows.length) return { success: false, error: 'VCR record not found' };
    return { success: true, record: result.rows[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get witness record by VCR hash.
 */
async function getWitnessRecord(pool, vcrHash) {
  const sql = `SELECT * FROM vcr_witness_records WHERE vcr_hash = $1`;

  try {
    const result = await pool.query(sql, [vcrHash]);
    if (!result.rows.length) return { success: false, error: 'Witness record not found' };
    return { success: true, record: result.rows[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // VCR Payload
  validateWitnessInput,
  buildVCRPayload,
  serializeVCRPayload,
  deserializeVCRPayload,

  // Batch
  prepareBatchForMinting,

  // Solana
  buildMintInstruction,
  simulateMintTransaction,

  // Registry
  saveWitnessRecord,
  updateWitnessStatus,
  getWitnessRecord,

  // Constants
  CWE_VERSION,
  WITNESS_STATUS,
  SOLANA_NETWORKS,
  VCR_SCHEMA_VERSION,
};
