/**
 * Query Optimizer Module
 * Phase 2 - Week 2 Day 10
 *
 * Performance optimization layer for CEL queries:
 * - Database index management
 * - Query performance analysis
 * - Connection pool optimization
 * - Intelligent query caching
 * - Batch query optimization
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERFORMANCE_THRESHOLDS = {
  SLOW_QUERY_MS:    500,
  WARNING_QUERY_MS: 200,
  CACHE_TTL_MS:     60000,  // 1 minute
  MAX_CACHE_SIZE:   100,
  OPTIMAL_POOL_MIN: 2,
  OPTIMAL_POOL_MAX: 10,
};

const INDEX_DEFINITIONS = [
  {
    name:    'idx_care_events_animal_hash',
    table:   'care_events',
    columns: ['animal_hash'],
    type:    'btree',
    reason:  'Timeline queries filter heavily by animal_hash',
  },
  {
    name:    'idx_care_events_environment_hash',
    table:   'care_events',
    columns: ['environment_hash'],
    type:    'btree',
    reason:  'Environment activity queries',
  },
  {
    name:    'idx_care_events_operator_hash',
    table:   'care_events',
    columns: ['operator_hash'],
    type:    'btree',
    reason:  'Operator activity tracking',
  },
  {
    name:    'idx_care_events_event_type',
    table:   'care_events',
    columns: ['event_type'],
    type:    'btree',
    reason:  'Event type filtering in aggregations',
  },
  {
    name:    'idx_care_events_event_date',
    table:   'care_events',
    columns: ['event_date'],
    type:    'btree',
    reason:  'Date range queries in timeline',
  },
  {
    name:    'idx_care_events_timestamp',
    table:   'care_events',
    columns: ['event_timestamp'],
    type:    'btree',
    reason:  'Chronological ordering',
  },
  {
    name:    'idx_care_events_animal_date',
    table:   'care_events',
    columns: ['animal_hash', 'event_date'],
    type:    'btree',
    reason:  'Composite: animal timeline with date filter',
  },
  {
    name:    'idx_care_events_env_type',
    table:   'care_events',
    columns: ['environment_hash', 'event_type'],
    type:    'btree',
    reason:  'Composite: environment queries filtered by type',
  },
];

// ─── Index Management ─────────────────────────────────────────────────────────

/**
 * Generate CREATE INDEX SQL for all defined indexes.
 * Uses IF NOT EXISTS — safe to run multiple times.
 */
function generateIndexSQL() {
  return INDEX_DEFINITIONS.map(idx => {
    const cols = idx.columns.join(', ');
    return `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} USING ${idx.type} (${cols});`;
  });
}

/**
 * Apply all indexes to the database.
 * Returns results per index.
 */
async function applyIndexes(pool) {
  const sqls    = generateIndexSQL();
  const results = [];

  for (const sql of sqls) {
    try {
      await pool.query(sql);
      const name = sql.match(/idx_\w+/)?.[0] || 'unknown';
      results.push({ index: name, success: true });
    } catch (err) {
      const name = sql.match(/idx_\w+/)?.[0] || 'unknown';
      results.push({ index: name, success: false, error: err.message });
    }
  }

  return {
    success:  results.every(r => r.success),
    applied:  results.filter(r => r.success).length,
    failed:   results.filter(r => !r.success).length,
    results,
  };
}

/**
 * Check which indexes currently exist in the database.
 */
async function getExistingIndexes(pool) {
  const sql = `
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE tablename = 'care_events'
    ORDER BY indexname
  `;

  try {
    const result = await pool.query(sql);
    return {
      success: true,
      indexes: result.rows,
      count:   result.rowCount,
    };
  } catch (err) {
    return { success: false, indexes: [], error: err.message };
  }
}

/**
 * Compare defined indexes vs existing — find missing ones.
 */
async function getMissingIndexes(pool) {
  const existing = await getExistingIndexes(pool);
  if (!existing.success) return { success: false, missing: [], error: existing.error };

  const existingNames = existing.indexes.map(i => i.indexname);
  const missing = INDEX_DEFINITIONS.filter(idx => !existingNames.includes(idx.name));

  return {
    success: true,
    missing,
    count:   missing.length,
    allPresent: missing.length === 0,
  };
}

// ─── Query Performance Analyzer ──────────────────────────────────────────────

/**
 * Wrap a query with timing and performance classification.
 */
async function timedQuery(pool, sql, params = [], label = 'query') {
  const start  = Date.now();
  let result, error;

  try {
    result = await pool.query(sql, params);
  } catch (err) {
    error = err;
  }

  const duration = Date.now() - start;
  const performance = classifyQueryPerformance(duration);

  const record = {
    label,
    duration,
    performance,
    rowCount: result?.rowCount ?? 0,
    success:  !error,
    error:    error?.message,
    timestamp: new Date().toISOString(),
  };

  if (error) throw error;

  return { result, metrics: record };
}

/**
 * Classify query speed into performance tiers.
 */
function classifyQueryPerformance(durationMs) {
  if (durationMs >= PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS)    return 'slow';
  if (durationMs >= PERFORMANCE_THRESHOLDS.WARNING_QUERY_MS) return 'warning';
  return 'fast';
}

/**
 * Run EXPLAIN ANALYZE on a query to get the PostgreSQL query plan.
 */
async function explainQuery(pool, sql, params = []) {
  const explainSQL = `EXPLAIN ANALYZE ${sql}`;

  try {
    const result = await pool.query(explainSQL, params);
    const plan   = result.rows.map(r => r['QUERY PLAN']).join('\n');

    return {
      success: true,
      plan,
      hasSeqScan:   plan.includes('Seq Scan'),
      hasIndexScan: plan.includes('Index Scan'),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Query Cache ──────────────────────────────────────────────────────────────

/**
 * Simple in-memory LRU cache for read-only queries.
 * Not suitable for write queries or queries requiring real-time data.
 */
class QueryCache {
  constructor(maxSize = PERFORMANCE_THRESHOLDS.MAX_CACHE_SIZE, ttlMs = PERFORMANCE_THRESHOLDS.CACHE_TTL_MS) {
    this.cache   = new Map();
    this.maxSize = maxSize;
    this.ttlMs   = ttlMs;
    this.hits    = 0;
    this.misses  = 0;
  }

  _key(sql, params) {
    return `${sql}::${JSON.stringify(params)}`;
  }

  get(sql, params) {
    const key   = this._key(sql, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  set(sql, params, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const key = this._key(sql, params);
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  invalidate() {
    this.cache.clear();
  }

  stats() {
    const total      = this.hits + this.misses;
    const hitRate    = total > 0 ? Math.round((this.hits / total) * 100) : 0;
    return {
      size:    this.cache.size,
      maxSize: this.maxSize,
      hits:    this.hits,
      misses:  this.misses,
      hitRate: `${hitRate}%`,
    };
  }
}

/**
 * Cached query wrapper — checks cache before hitting DB.
 */
async function cachedQuery(cache, pool, sql, params = []) {
  const cached = cache.get(sql, params);
  if (cached) return { result: cached, fromCache: true };

  const result = await pool.query(sql, params);
  cache.set(sql, params, result);

  return { result, fromCache: false };
}

// ─── Connection Pool Optimizer ────────────────────────────────────────────────

/**
 * Analyze pool configuration and return recommendations.
 */
function analyzePoolConfig(poolConfig = {}) {
  const recommendations = [];
  const { max, min, idleTimeoutMillis, connectionTimeoutMillis } = poolConfig;

  if (!max || max < PERFORMANCE_THRESHOLDS.OPTIMAL_POOL_MIN) {
    recommendations.push({
      field:   'max',
      current: max,
      suggest: PERFORMANCE_THRESHOLDS.OPTIMAL_POOL_MAX,
      reason:  'Pool too small for concurrent batch operations',
    });
  }

  if (max > 20) {
    recommendations.push({
      field:   'max',
      current: max,
      suggest: 10,
      reason:  'Pool too large — may exhaust DB connections',
    });
  }

  if (!idleTimeoutMillis || idleTimeoutMillis < 10000) {
    recommendations.push({
      field:   'idleTimeoutMillis',
      current: idleTimeoutMillis,
      suggest: 30000,
      reason:  'Idle timeout too short — connections recycled too fast',
    });
  }

  if (!connectionTimeoutMillis || connectionTimeoutMillis < 2000) {
    recommendations.push({
      field:   'connectionTimeoutMillis',
      current: connectionTimeoutMillis,
      suggest: 5000,
      reason:  'Connection timeout too aggressive',
    });
  }

  return {
    optimal:         recommendations.length === 0,
    recommendations,
    score:           Math.max(0, 100 - recommendations.length * 25),
  };
}

/**
 * Return the recommended pool configuration for CEL workloads.
 */
function getOptimalPoolConfig(environment = 'production') {
  const base = {
    max:                    10,
    min:                    2,
    idleTimeoutMillis:      30000,
    connectionTimeoutMillis: 5000,
  };

  if (environment === 'test') {
    return { ...base, max: 3, min: 1 };
  }

  if (environment === 'development') {
    return { ...base, max: 5 };
  }

  return base;
}

// ─── Performance Report ───────────────────────────────────────────────────────

/**
 * Generate a full performance report for the current DB state.
 */
async function generatePerformanceReport(pool, poolConfig = {}) {
  const [indexReport, missingIndexes] = await Promise.all([
    getExistingIndexes(pool),
    getMissingIndexes(pool),
  ]);

  const poolAnalysis = analyzePoolConfig(poolConfig);

  return {
    timestamp:    new Date().toISOString(),
    indexes: {
      existing:   indexReport.count,
      missing:    missingIndexes.count,
      allPresent: missingIndexes.allPresent,
      missingList: missingIndexes.missing?.map(i => i.name) || [],
    },
    pool:         poolAnalysis,
    thresholds:   PERFORMANCE_THRESHOLDS,
    recommendations: [
      ...( missingIndexes.allPresent ? [] : ['Run applyIndexes() to add missing indexes']),
      ...( poolAnalysis.optimal      ? [] : poolAnalysis.recommendations.map(r => `Pool: ${r.reason}`)),
    ],
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Index management
  generateIndexSQL,
  applyIndexes,
  getExistingIndexes,
  getMissingIndexes,

  // Query performance
  timedQuery,
  classifyQueryPerformance,
  explainQuery,

  // Cache
  QueryCache,
  cachedQuery,

  // Pool optimization
  analyzePoolConfig,
  getOptimalPoolConfig,

  // Reporting
  generatePerformanceReport,

  // Constants
  PERFORMANCE_THRESHOLDS,
  INDEX_DEFINITIONS,
};
