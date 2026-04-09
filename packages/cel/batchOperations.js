/**
 * Batch Operations Module
 * Phase 2 - Week 2 Day 9
 *
 * Bulk care event operations with transaction safety,
 * batch validation, partial failure handling,
 * and performance optimization via single-transaction inserts.
 */

'use strict';

const { validateEventCategory } = require('./validators/eventTaxonomy');
const { hashCareEvent } = require('../privacy/hashing');

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_LIMITS = {
  MAX_BATCH_SIZE: 500,
  MIN_BATCH_SIZE: 1,
  DEFAULT_CHUNK_SIZE: 50,
};

const BATCH_MODES = {
  ALL_OR_NOTHING: 'all_or_nothing',   // rollback entire batch on any failure
  PARTIAL:        'partial',           // insert valid events, collect failures
};

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a single event object before batch insert.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
function validateBatchEvent(event, index) {
  const errors = [];

  // Required fields
  const required = [
    'animal_hash',
    'environment_hash',
    'operator_hash',
    'event_type',
    'event_category',
    'event_timestamp',
  ];

  for (const field of required) {
    if (!event[field] || (typeof event[field] === 'string' && !event[field].trim())) {
      errors.push(`[${index}] Missing required field: ${field}`);
    }
  }

  // Hash format — must be 64-char hex
  const hashFields = ['animal_hash', 'environment_hash', 'operator_hash'];
  for (const field of hashFields) {
    if (event[field] && !/^[a-f0-9]{64}$/i.test(event[field])) {
      errors.push(`[${index}] Invalid hash format for field: ${field}`);
    }
  }

  // Event type
  const validTypes = ['intake', 'medical', 'care', 'transfer', 'outcome'];
  if (event.event_type && !validTypes.includes(event.event_type)) {
    errors.push(`[${index}] Invalid event_type: ${event.event_type}`);
  }

  // Category (uses taxonomy validator)
  if (event.event_type && event.event_category) {
    try {
      validateEventCategory(event.event_type, event.event_category);
    } catch (err) {
      errors.push(`[${index}] ${err.message}`);
    }
  }

  // Timestamp
  if (event.event_timestamp) {
    const ts = new Date(event.event_timestamp);
    if (isNaN(ts.getTime())) {
      errors.push(`[${index}] Invalid event_timestamp: ${event.event_timestamp}`);
    }
  }

  // Metadata (optional but validated if present — structure only, not required fields)
  if (event.metadata !== undefined && event.metadata !== null) {
    if (typeof event.metadata !== 'object' || Array.isArray(event.metadata)) {
      errors.push(`[${index}] metadata must be a plain object`);
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Validate all events in a batch.
 * Returns { allValid, validEvents, invalidEvents, errors }
 */
function validateBatch(events) {
  if (!Array.isArray(events)) {
    return {
      allValid: false,
      validEvents: [],
      invalidEvents: [],
      errors: ['Input must be an array of events'],
    };
  }

  if (events.length < BATCH_LIMITS.MIN_BATCH_SIZE) {
    return {
      allValid: false,
      validEvents: [],
      invalidEvents: [],
      errors: ['Batch must contain at least one event'],
    };
  }

  if (events.length > BATCH_LIMITS.MAX_BATCH_SIZE) {
    return {
      allValid: false,
      validEvents: [],
      invalidEvents: [],
      errors: [`Batch exceeds maximum size of ${BATCH_LIMITS.MAX_BATCH_SIZE} events`],
    };
  }

  const validEvents   = [];
  const invalidEvents = [];
  const allErrors     = [];

  for (let i = 0; i < events.length; i++) {
    const result = validateBatchEvent(events[i], i);
    if (result.valid) {
      validEvents.push({ index: i, event: events[i] });
    } else {
      invalidEvents.push({ index: i, event: events[i], errors: result.errors });
      allErrors.push(...result.errors);
    }
  }

  return {
    allValid:     invalidEvents.length === 0,
    validEvents,
    invalidEvents,
    errors:       allErrors,
    summary: {
      total:   events.length,
      valid:   validEvents.length,
      invalid: invalidEvents.length,
    },
  };
}

// ─── Hash Generation ──────────────────────────────────────────────────────────

/**
 * Generate event hashes for a set of validated events.
 * Mutates a copy — does not touch originals.
 */
function enrichWithHashes(events, salt) {
  return events.map(({ index, event }) => {
    const hash = hashCareEvent(
      event.animal_hash,
      event.environment_hash,
      event.event_type,
      event.event_timestamp,
      salt,
    );

    return { index, event: { ...event, event_hash: hash } };
  });
}

// ─── Database Operations ──────────────────────────────────────────────────────

/**
 * Build a multi-row INSERT for a chunk of events.
 * Uses parameterized queries — safe against SQL injection.
 */
function buildBulkInsertQuery(events) {
  if (!events.length) return null;

  const cols = [
    'event_hash', 'animal_hash', 'environment_hash', 'operator_hash',
    'event_type', 'event_category', 'event_timestamp', 'event_date',
    'metadata', 'notes',
  ];

  const placeholders = [];
  const values       = [];
  let   paramIndex   = 1;

  for (const { event } of events) {
    const ts        = new Date(event.event_timestamp);
    const eventDate = ts.toISOString().split('T')[0];

    const rowPlaceholders = cols.map(() => `$${paramIndex++}`);
    placeholders.push(`(${rowPlaceholders.join(', ')})`);

    values.push(
      event.event_hash,
      event.animal_hash,
      event.environment_hash,
      event.operator_hash,
      event.event_type,
      event.event_category,
      event.event_timestamp,
      eventDate,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.notes    || null,
    );
  }

  const sql = `
    INSERT INTO care_events
      (${cols.join(', ')})
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (event_hash) DO NOTHING
    RETURNING id, event_hash, event_type, event_category, event_timestamp
  `;

  return { sql: sql.trim(), values };
}

/**
 * Split an array into chunks of `size`.
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Core Batch Functions ─────────────────────────────────────────────────────

/**
 * Insert a batch of events — ALL OR NOTHING mode.
 * Wraps entire insert in a single DB transaction.
 * Rolls back on any error.
 *
 * @param {pg.Pool} pool
 * @param {object[]} events
 * @param {object} options
 * @returns {object} result
 */
async function insertBatchAllOrNothing(pool, events, options = {}) {
  const salt      = options.salt      || 'default-salt';
  const chunkSize = options.chunkSize || BATCH_LIMITS.DEFAULT_CHUNK_SIZE;

  // Step 1 — validate all
  const validation = validateBatch(events);
  if (!validation.allValid) {
    return {
      success:        false,
      mode:           BATCH_MODES.ALL_OR_NOTHING,
      inserted:       0,
      failed:         validation.summary.invalid,
      errors:         validation.errors,
      invalidEvents:  validation.invalidEvents,
      rolledBack:     false,
    };
  }

  // Step 2 — enrich with hashes
  const enriched = enrichWithHashes(validation.validEvents, salt);
  const chunks   = chunkArray(enriched, chunkSize);

  const client = await pool.connect();
  const inserted = [];

  try {
    await client.query('BEGIN');

    for (const chunk of chunks) {
      const query = buildBulkInsertQuery(chunk);
      if (!query) continue;
      const result = await client.query(query.sql, query.values);
      inserted.push(...result.rows);
    }

    await client.query('COMMIT');

    return {
      success:    true,
      mode:       BATCH_MODES.ALL_OR_NOTHING,
      inserted:   inserted.length,
      failed:     0,
      events:     inserted,
      errors:     [],
      rolledBack: false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return {
      success:    false,
      mode:       BATCH_MODES.ALL_OR_NOTHING,
      inserted:   0,
      failed:     events.length,
      errors:     [err.message],
      rolledBack: true,
    };
  } finally {
    client.release();
  }
}

/**
 * Insert a batch in PARTIAL mode.
 * Valid events are inserted; invalid ones are collected as failures.
 * DB errors on individual rows are caught per-chunk.
 *
 * @param {pg.Pool} pool
 * @param {object[]} events
 * @param {object} options
 * @returns {object} result
 */
async function insertBatchPartial(pool, events, options = {}) {
  const salt      = options.salt      || 'default-salt';
  const chunkSize = options.chunkSize || BATCH_LIMITS.DEFAULT_CHUNK_SIZE;

  // Step 1 — validate, keep both valid + invalid
  const validation = validateBatch(events);

  // If the array itself is bad (not array, size issues), abort entirely
  if (validation.errors.length && !validation.summary) {
    return {
      success:       false,
      mode:          BATCH_MODES.PARTIAL,
      inserted:      0,
      failed:        0,
      errors:        validation.errors,
      invalidEvents: [],
      skipped:       0,
    };
  }

  const enriched = enrichWithHashes(validation.validEvents, salt);
  const chunks   = chunkArray(enriched, chunkSize);

  const inserted    = [];
  const chunkErrors = [];

  const client = await pool.connect();

  try {
    for (const chunk of chunks) {
      try {
        await client.query('BEGIN');
        const query  = buildBulkInsertQuery(chunk);
        const result = await client.query(query.sql, query.values);
        await client.query('COMMIT');
        inserted.push(...result.rows);
      } catch (err) {
        await client.query('ROLLBACK');
        chunkErrors.push({
          chunkSize: chunk.length,
          error:     err.message,
          indices:   chunk.map(e => e.index),
        });
      }
    }
  } finally {
    client.release();
  }

  const totalFailed =
    validation.summary.invalid +
    chunkErrors.reduce((sum, c) => sum + c.chunkSize, 0);

  return {
    success:       inserted.length > 0,
    mode:          BATCH_MODES.PARTIAL,
    inserted:      inserted.length,
    failed:        totalFailed,
    events:        inserted,
    errors:        [
      ...validation.errors,
      ...chunkErrors.map(c => c.error),
    ],
    invalidEvents: validation.invalidEvents,
    chunkErrors,
    summary: {
      total:         events.length,
      inserted:      inserted.length,
      validationFail: validation.summary.invalid,
      dbFail:        chunkErrors.reduce((sum, c) => sum + c.chunkSize, 0),
    },
  };
}

/**
 * Unified batch insert — choose mode via options.mode.
 * Defaults to ALL_OR_NOTHING.
 */
async function insertBatch(pool, events, options = {}) {
  const mode = options.mode || BATCH_MODES.ALL_OR_NOTHING;

  if (mode === BATCH_MODES.PARTIAL) {
    return insertBatchPartial(pool, events, options);
  }
  return insertBatchAllOrNothing(pool, events, options);
}

// ─── Batch Query Helpers ──────────────────────────────────────────────────────

/**
 * Fetch multiple events by their hashes in a single query.
 */
async function getBatchByHashes(pool, eventHashes) {
  if (!Array.isArray(eventHashes) || !eventHashes.length) {
    return { success: false, events: [], errors: ['eventHashes must be a non-empty array'] };
  }

  const placeholders = eventHashes.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    SELECT id, event_hash, animal_hash, environment_hash, operator_hash,
           event_type, event_category, event_timestamp, event_date,
           metadata, notes, created_at
    FROM care_events
    WHERE event_hash IN (${placeholders})
    ORDER BY event_timestamp DESC
  `;

  try {
    const result = await pool.query(sql, eventHashes);
    return { success: true, events: result.rows, count: result.rowCount };
  } catch (err) {
    return { success: false, events: [], errors: [err.message] };
  }
}

/**
 * Fetch events for multiple animals in one query.
 */
async function getBatchByAnimalHashes(pool, animalHashes, options = {}) {
  if (!Array.isArray(animalHashes) || !animalHashes.length) {
    return { success: false, events: [], errors: ['animalHashes must be a non-empty array'] };
  }

  const params       = [...animalHashes];
  const placeholders = animalHashes.map((_, i) => `$${i + 1}`).join(', ');

  let sql = `
    SELECT id, event_hash, animal_hash, environment_hash, operator_hash,
           event_type, event_category, event_timestamp, event_date,
           metadata, notes, created_at
    FROM care_events
    WHERE animal_hash IN (${placeholders})
  `;

  if (options.event_type) {
    params.push(options.event_type);
    sql += ` AND event_type = $${params.length}`;
  }

  sql += ' ORDER BY animal_hash, event_timestamp DESC';

  if (options.limit) {
    params.push(options.limit);
    sql += ` LIMIT $${params.length}`;
  }

  try {
    const result = await pool.query(sql, params);
    return {
      success: true,
      events:  result.rows,
      count:   result.rowCount,
      // group by animal for convenience
      byAnimal: animalHashes.reduce((acc, hash) => {
        acc[hash] = result.rows.filter(e => e.animal_hash === hash);
        return acc;
      }, {}),
    };
  } catch (err) {
    return { success: false, events: [], errors: [err.message] };
  }
}

// ─── Batch Statistics ─────────────────────────────────────────────────────────

/**
 * Summarize a batch result for logging / reporting.
 */
function summarizeBatchResult(result) {
  return {
    mode:        result.mode,
    success:     result.success,
    inserted:    result.inserted  || 0,
    failed:      result.failed    || 0,
    rolledBack:  result.rolledBack || false,
    errorCount:  (result.errors || []).length,
    hasPartial:  result.mode === BATCH_MODES.PARTIAL && result.inserted > 0 && result.failed > 0,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Core
  insertBatch,
  insertBatchAllOrNothing,
  insertBatchPartial,

  // Validation
  validateBatch,
  validateBatchEvent,

  // Query helpers
  getBatchByHashes,
  getBatchByAnimalHashes,

  // Utilities
  buildBulkInsertQuery,
  chunkArray,
  enrichWithHashes,
  summarizeBatchResult,

  // Constants
  BATCH_LIMITS,
  BATCH_MODES,
};
