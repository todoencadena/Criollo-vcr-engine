/**
 * Query Optimizer Tests
 * Phase 2 - Week 2 Day 10
 * Target: 22 tests, 100% passing
 */

'use strict';

const {
  generateIndexSQL,
  applyIndexes,
  getExistingIndexes,
  getMissingIndexes,
  timedQuery,
  classifyQueryPerformance,
  explainQuery,
  QueryCache,
  cachedQuery,
  analyzePoolConfig,
  getOptimalPoolConfig,
  generatePerformanceReport,
  PERFORMANCE_THRESHOLDS,
  INDEX_DEFINITIONS,
} = require('../packages/cel/queryOptimizer');

// ─── Mock Pool Factory ────────────────────────────────────────────────────────

function makeMockPool(rows = [], rowCount = 0) {
  return {
    query: jest.fn(async () => ({ rows, rowCount: rowCount || rows.length })),
  };
}

function makeErrorPool(message = 'DB error') {
  return {
    query: jest.fn(async () => { throw new Error(message); }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Constants', () => {
  test('PERFORMANCE_THRESHOLDS defines all required thresholds', () => {
    expect(PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS).toBe(500);
    expect(PERFORMANCE_THRESHOLDS.WARNING_QUERY_MS).toBe(200);
    expect(PERFORMANCE_THRESHOLDS.CACHE_TTL_MS).toBe(60000);
    expect(PERFORMANCE_THRESHOLDS.MAX_CACHE_SIZE).toBe(100);
  });

  test('INDEX_DEFINITIONS contains at least 8 indexes', () => {
    expect(INDEX_DEFINITIONS.length).toBeGreaterThanOrEqual(8);
    INDEX_DEFINITIONS.forEach(idx => {
      expect(idx).toHaveProperty('name');
      expect(idx).toHaveProperty('table');
      expect(idx).toHaveProperty('columns');
      expect(idx).toHaveProperty('type');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('generateIndexSQL', () => {
  test('generates one SQL statement per index definition', () => {
    const sqls = generateIndexSQL();
    expect(sqls).toHaveLength(INDEX_DEFINITIONS.length);
  });

  test('each SQL uses IF NOT EXISTS', () => {
    const sqls = generateIndexSQL();
    sqls.forEach(sql => {
      expect(sql).toMatch(/IF NOT EXISTS/i);
    });
  });

  test('each SQL references care_events table', () => {
    const sqls = generateIndexSQL();
    sqls.forEach(sql => {
      expect(sql).toMatch(/care_events/i);
    });
  });

  test('composite indexes include all columns', () => {
    const sqls = generateIndexSQL();
    const compositeSQL = sqls.find(s => s.includes('idx_care_events_animal_date'));
    expect(compositeSQL).toMatch(/animal_hash/);
    expect(compositeSQL).toMatch(/event_date/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('applyIndexes', () => {
  test('returns success true when all indexes apply without error', async () => {
    const pool   = makeMockPool();
    const result = await applyIndexes(pool);
    expect(result.success).toBe(true);
    expect(result.applied).toBe(INDEX_DEFINITIONS.length);
    expect(result.failed).toBe(0);
  });

  test('returns failed count when DB throws', async () => {
    const pool   = makeErrorPool('index already exists');
    const result = await applyIndexes(pool);
    expect(result.success).toBe(false);
    expect(result.failed).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getExistingIndexes', () => {
  test('returns indexes from pg_indexes query', async () => {
    const mockIndexes = [
      { indexname: 'idx_care_events_animal_hash', tablename: 'care_events', indexdef: 'CREATE INDEX...' },
    ];
    const pool   = makeMockPool(mockIndexes);
    const result = await getExistingIndexes(pool);
    expect(result.success).toBe(true);
    expect(result.indexes).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  test('returns failure on DB error', async () => {
    const pool   = makeErrorPool();
    const result = await getExistingIndexes(pool);
    expect(result.success).toBe(false);
    expect(result.indexes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('classifyQueryPerformance', () => {
  test('classifies fast queries correctly', () => {
    expect(classifyQueryPerformance(50)).toBe('fast');
    expect(classifyQueryPerformance(199)).toBe('fast');
  });

  test('classifies warning queries correctly', () => {
    expect(classifyQueryPerformance(200)).toBe('warning');
    expect(classifyQueryPerformance(499)).toBe('warning');
  });

  test('classifies slow queries correctly', () => {
    expect(classifyQueryPerformance(500)).toBe('slow');
    expect(classifyQueryPerformance(1000)).toBe('slow');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('timedQuery', () => {
  test('returns result and metrics on success', async () => {
    const pool   = makeMockPool([{ id: 1 }]);
    const { result, metrics } = await timedQuery(pool, 'SELECT 1', [], 'test');
    expect(result.rows).toHaveLength(1);
    expect(metrics.success).toBe(true);
    expect(metrics.label).toBe('test');
    expect(typeof metrics.duration).toBe('number');
    expect(['fast', 'warning', 'slow']).toContain(metrics.performance);
  });

  test('throws on DB error', async () => {
    const pool = makeErrorPool('timeout');
    await expect(timedQuery(pool, 'SELECT 1')).rejects.toThrow('timeout');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('QueryCache', () => {
  test('returns null on cache miss', () => {
    const cache = new QueryCache();
    expect(cache.get('SELECT 1', [])).toBeNull();
  });

  test('returns cached value on hit', () => {
    const cache  = new QueryCache();
    const value  = { rows: [{ id: 1 }], rowCount: 1 };
    cache.set('SELECT 1', [], value);
    expect(cache.get('SELECT 1', [])).toEqual(value);
  });

  test('tracks hits and misses correctly', () => {
    const cache = new QueryCache();
    cache.get('SELECT 1', []);
    cache.set('SELECT 1', [], { rows: [] });
    cache.get('SELECT 1', []);
    const stats = cache.stats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
  });

  test('invalidate clears all cache entries', () => {
    const cache = new QueryCache();
    cache.set('SELECT 1', [], { rows: [] });
    cache.invalidate();
    expect(cache.get('SELECT 1', [])).toBeNull();
    expect(cache.stats().size).toBe(0);
  });

  test('evicts oldest entry when max size reached', () => {
    const cache = new QueryCache(2);
    cache.set('q1', [], { rows: [] });
    cache.set('q2', [], { rows: [] });
    cache.set('q3', [], { rows: [] });
    expect(cache.stats().size).toBe(2);
    expect(cache.get('q1', [])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('cachedQuery', () => {
  test('returns fromCache false on first call', async () => {
    const cache  = new QueryCache();
    const pool   = makeMockPool([{ id: 1 }]);
    const result = await cachedQuery(cache, pool, 'SELECT 1', []);
    expect(result.fromCache).toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('returns fromCache true on second call', async () => {
    const cache = new QueryCache();
    const pool  = makeMockPool([{ id: 1 }]);
    await cachedQuery(cache, pool, 'SELECT 1', []);
    const result = await cachedQuery(cache, pool, 'SELECT 1', []);
    expect(result.fromCache).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('analyzePoolConfig', () => {
  test('returns optimal true for a well-configured pool', () => {
    const config = {
      max:                    10,
      min:                    2,
      idleTimeoutMillis:      30000,
      connectionTimeoutMillis: 5000,
    };
    const result = analyzePoolConfig(config);
    expect(result.optimal).toBe(true);
    expect(result.recommendations).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  test('returns recommendations for undersized pool', () => {
    const result = analyzePoolConfig({ max: 1 });
    expect(result.optimal).toBe(false);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test('returns recommendations for oversized pool', () => {
    const result = analyzePoolConfig({ max: 25, min: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
    expect(result.optimal).toBe(false);
    expect(result.recommendations.some(r => r.field === 'max')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getOptimalPoolConfig', () => {
  test('returns smaller pool for test environment', () => {
    const config = getOptimalPoolConfig('test');
    expect(config.max).toBe(3);
    expect(config.min).toBe(1);
  });

  test('returns production config by default', () => {
    const config = getOptimalPoolConfig();
    expect(config.max).toBe(10);
    expect(config.min).toBe(2);
  });

  test('returns development config for development environment', () => {
    const config = getOptimalPoolConfig('development');
    expect(config.max).toBe(5);
  });
});
