/**
 * Batch Operations Tests
 * Phase 2 - Week 2 Day 9
 * Target: 22 tests, 100% passing
 */

'use strict';

const {
  validateBatch,
  validateBatchEvent,
  buildBulkInsertQuery,
  chunkArray,
  enrichWithHashes,
  insertBatchAllOrNothing,
  insertBatchPartial,
  insertBatch,
  getBatchByHashes,
  getBatchByAnimalHashes,
  summarizeBatchResult,
  BATCH_LIMITS,
  BATCH_MODES,
} = require('../packages/cel/batchOperations');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const testSalt = 'test-salt-2026';

const validAnimalHash  = 'a'.repeat(64);
const validEnvHash     = 'b'.repeat(64);
const validOpHash      = 'c'.repeat(64);
const validAnimalHash2 = 'd'.repeat(64);

function makeEvent(overrides = {}) {
  return {
    animal_hash:      validAnimalHash,
    environment_hash: validEnvHash,
    operator_hash:    validOpHash,
    event_type:       'care',
    event_category:   'feeding',
    event_timestamp:  '2026-04-07T10:00:00Z',
    metadata:         { food_type: 'kibble', amount_grams: 250 },
    notes:            'Morning feeding',
    ...overrides,
  };
}

// ─── Mock Pool Factory ────────────────────────────────────────────────────────

function makeMockPool(queryResults = []) {
  let callIndex = 0;

  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      const result = queryResults[callIndex] || { rows: [], rowCount: 0 };
      callIndex++;
      return result;
    }),
    release: jest.fn(),
  };

  return {
    connect: jest.fn(async () => client),
    query:   jest.fn(async (sql, params) => {
      const result = queryResults[callIndex] || { rows: [], rowCount: 0 };
      callIndex++;
      return result;
    }),
    _client: client,
  };
}

function makeErrorPool(errorMessage = 'DB error') {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(errorMessage);
    }),
    release: jest.fn(),
  };
  return {
    connect: jest.fn(async () => client),
    _client: client,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Batch Operations - Constants', () => {
  test('BATCH_LIMITS defines expected constraints', () => {
    expect(BATCH_LIMITS.MAX_BATCH_SIZE).toBe(500);
    expect(BATCH_LIMITS.MIN_BATCH_SIZE).toBe(1);
    expect(BATCH_LIMITS.DEFAULT_CHUNK_SIZE).toBe(50);
  });

  test('BATCH_MODES defines all_or_nothing and partial modes', () => {
    expect(BATCH_MODES.ALL_OR_NOTHING).toBe('all_or_nothing');
    expect(BATCH_MODES.PARTIAL).toBe('partial');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateBatchEvent', () => {
  test('returns valid for a complete, correct event', () => {
    const result = validateBatchEvent(makeEvent(), 0);
    expect(result.valid).toBe(true);
  });

  test('returns errors for missing required fields', () => {
    const result = validateBatchEvent({ notes: 'oops' }, 0);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('animal_hash'))).toBe(true);
  });

  test('returns error for invalid hash format', () => {
    const result = validateBatchEvent(makeEvent({ animal_hash: 'not-a-hash' }), 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('animal_hash'))).toBe(true);
  });

  test('returns error for invalid event_type', () => {
    const result = validateBatchEvent(makeEvent({ event_type: 'unknown' }), 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('event_type'))).toBe(true);
  });

  test('returns error for invalid event_timestamp', () => {
    const result = validateBatchEvent(makeEvent({ event_timestamp: 'not-a-date' }), 0);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('event_timestamp'))).toBe(true);
  });

  test('returns error for non-object metadata', () => {
    const result = validateBatchEvent(makeEvent({ metadata: ['array'] }), 0);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('metadata'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateBatch', () => {
  test('returns allValid true for a batch of valid events', () => {
    const events = [makeEvent(), makeEvent({ event_category: 'grooming' })];
    const result = validateBatch(events);
    expect(result.allValid).toBe(true);
    expect(result.summary.valid).toBe(2);
    expect(result.summary.invalid).toBe(0);
  });

  test('returns allValid false when any event is invalid', () => {
    const events = [makeEvent(), { animal_hash: 'bad' }];
    const result = validateBatch(events);
    expect(result.allValid).toBe(false);
    expect(result.summary.invalid).toBe(1);
    expect(result.invalidEvents.length).toBe(1);
    expect(result.invalidEvents[0].index).toBe(1);
  });

  test('rejects non-array input', () => {
    const result = validateBatch('not an array');
    expect(result.allValid).toBe(false);
    expect(result.errors[0]).toMatch(/array/i);
  });

  test('rejects empty array', () => {
    const result = validateBatch([]);
    expect(result.allValid).toBe(false);
    expect(result.errors[0]).toMatch(/at least one/i);
  });

  test('rejects batch exceeding MAX_BATCH_SIZE', () => {
    const events = Array.from({ length: 501 }, () => makeEvent());
    const result = validateBatch(events);
    expect(result.allValid).toBe(false);
    expect(result.errors[0]).toMatch(/maximum size/i);
  });

  test('summary counts are accurate for mixed batch', () => {
    const events = [makeEvent(), makeEvent(), { bad: true }, { bad: true }];
    const result = validateBatch(events);
    expect(result.summary.total).toBe(4);
    expect(result.summary.valid).toBe(2);
    expect(result.summary.invalid).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('chunkArray', () => {
  test('splits array into chunks of given size', () => {
    const arr    = [1, 2, 3, 4, 5];
    const chunks = chunkArray(arr, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('returns single chunk when array smaller than chunk size', () => {
    const chunks = chunkArray([1, 2], 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual([1, 2]);
  });

  test('returns empty array for empty input', () => {
    expect(chunkArray([], 5)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('buildBulkInsertQuery', () => {
  test('returns null for empty events array', () => {
    expect(buildBulkInsertQuery([])).toBeNull();
  });

  test('generates parameterized query for single event', () => {
    const event = makeEvent({ event_hash: 'e'.repeat(64) });
    const { sql, values } = buildBulkInsertQuery([{ index: 0, event }]);
    expect(sql).toMatch(/INSERT INTO care_events/i);
    expect(sql).toMatch(/\$1/);
    expect(values).toContain('e'.repeat(64));
    expect(values).toContain(validAnimalHash);
  });

  test('generates correct number of placeholders for multiple events', () => {
    const events = [
      { index: 0, event: makeEvent({ event_hash: '1'.repeat(64) }) },
      { index: 1, event: makeEvent({ event_hash: '2'.repeat(64), animal_hash: validAnimalHash2 }) },
    ];
    const { sql, values } = buildBulkInsertQuery(events);
    // 10 columns × 2 events = 20 params
    expect(values).toHaveLength(20);
    expect(sql).toMatch(/ON CONFLICT.*DO NOTHING/i);
  });

  test('correctly derives event_date from event_timestamp', () => {
    const event = makeEvent({
      event_hash:      'f'.repeat(64),
      event_timestamp: '2026-04-07T15:30:00Z',
    });
    const { values } = buildBulkInsertQuery([{ index: 0, event }]);
    expect(values).toContain('2026-04-07');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('insertBatchAllOrNothing', () => {
  test('successfully inserts a valid batch', async () => {
    const events = [makeEvent(), makeEvent({ event_category: 'grooming' })];
    const rows   = [
      { id: 1, event_hash: 'h1', event_type: 'care', event_category: 'feeding',  event_timestamp: events[0].event_timestamp },
      { id: 2, event_hash: 'h2', event_type: 'care', event_category: 'grooming', event_timestamp: events[1].event_timestamp },
    ];
    const pool   = makeMockPool([{ rows, rowCount: 2 }]);

    const result = await insertBatchAllOrNothing(pool, events, { salt: testSalt });
    expect(result.success).toBe(true);
    expect(result.mode).toBe(BATCH_MODES.ALL_OR_NOTHING);
    expect(result.rolledBack).toBe(false);
    expect(result.inserted).toBe(2);
  });

  test('rolls back and returns failure on DB error', async () => {
    const events = [makeEvent()];
    const pool   = makeErrorPool('unique constraint violation');

    const result = await insertBatchAllOrNothing(pool, events, { salt: testSalt });
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.inserted).toBe(0);
    expect(result.errors[0]).toMatch(/unique constraint/i);
  });

  test('rejects invalid batch without hitting DB', async () => {
    const events = [{ bad: true }];
    const pool   = makeMockPool();

    const result = await insertBatchAllOrNothing(pool, events, { salt: testSalt });
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(false);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('insertBatchPartial', () => {
  test('inserts valid events and reports invalid ones', async () => {
    const events = [makeEvent(), { bad: 'event' }];
    const rows   = [{ id: 1, event_hash: 'h1', event_type: 'care', event_category: 'feeding', event_timestamp: events[0].event_timestamp }];
    const pool   = makeMockPool([{ rows, rowCount: 1 }]);

    const result = await insertBatchPartial(pool, events, { salt: testSalt });
    expect(result.success).toBe(true);
    expect(result.mode).toBe(BATCH_MODES.PARTIAL);
    expect(result.inserted).toBe(1);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.invalidEvents.length).toBe(1);
  });

  test('returns success false when all events fail validation', async () => {
    const events = [{ bad: true }, { also_bad: true }];
    const pool   = makeMockPool();

    const result = await insertBatchPartial(pool, events, { salt: testSalt });
    expect(result.success).toBe(false);
    expect(result.inserted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('insertBatch - unified dispatcher', () => {
  test('defaults to ALL_OR_NOTHING mode', async () => {
    const events = [makeEvent()];
    const pool   = makeMockPool([{ rows: [{ id: 1 }], rowCount: 1 }]);

    const result = await insertBatch(pool, events, { salt: testSalt });
    expect(result.mode).toBe(BATCH_MODES.ALL_OR_NOTHING);
  });

  test('uses PARTIAL mode when specified', async () => {
    const events = [makeEvent()];
    const pool   = makeMockPool([{ rows: [{ id: 1 }], rowCount: 1 }]);

    const result = await insertBatch(pool, events, { salt: testSalt, mode: BATCH_MODES.PARTIAL });
    expect(result.mode).toBe(BATCH_MODES.PARTIAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('summarizeBatchResult', () => {
  test('summarizes all_or_nothing success result', () => {
    const fakeResult = {
      mode:       BATCH_MODES.ALL_OR_NOTHING,
      success:    true,
      inserted:   5,
      failed:     0,
      errors:     [],
      rolledBack: false,
    };
    const summary = summarizeBatchResult(fakeResult);
    expect(summary.mode).toBe(BATCH_MODES.ALL_OR_NOTHING);
    expect(summary.success).toBe(true);
    expect(summary.inserted).toBe(5);
    expect(summary.hasPartial).toBe(false);
  });

  test('identifies partial success in PARTIAL mode', () => {
    const fakeResult = {
      mode:      BATCH_MODES.PARTIAL,
      success:   true,
      inserted:  3,
      failed:    2,
      errors:    ['err1', 'err2'],
    };
    const summary = summarizeBatchResult(fakeResult);
    expect(summary.hasPartial).toBe(true);
    expect(summary.errorCount).toBe(2);
  });
});
