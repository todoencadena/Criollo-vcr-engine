/**
 * Environment Model
 * CRUD operations for environments table
 * Zero-PII compliant - uses hashes from Phase 0
 */

const { query, getClient } = require('../database/config');
const { hashEnvironment } = require('../../privacy/hashing');

/**
 * Register a new environment
 * @param {object} environmentData - Environment data (name, year)
 * @param {object} metadata - Additional metadata (type, capacity, specializations)
 * @returns {Promise<object>} Created environment record
 */
async function registerEnvironment(environmentData, metadata = {}) {
   // Generate hash FIRST (name needed for hash, but won't be stored)
    const environment_hash = hashEnvironment(
        environmentData.name,
        environmentData.year,
        process.env.HASH_SALT || 'criollo_default_salt_2024'
    );

    // Prepare data for database (zero-PII)
    const environment_type = metadata.type || 'high_intake';
    const monthly_intake_capacity = metadata.monthly_intake_capacity || null;
    const specializations = metadata.specializations || [];

    // Prepare insert query
    const insertQuery = `
        INSERT INTO environments (
            environment_hash,
            environment_type,
            year,
            status,
            monthly_intake_capacity,
            specializations
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;

    const values = [
        environment_hash,
        environment_type,
        environmentData.year,
        'pending',
        monthly_intake_capacity,
        specializations
    ];

    try {
        const result = await query(insertQuery, values);
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            throw new Error('Environment already registered (duplicate hash)');
        }
        throw error;
    }
}

/**
 * Get environment by ID
 * @param {string} id - Environment UUID
 * @returns {Promise<object|null>} Environment record or null
 */
async function getEnvironmentById(id) {
    const selectQuery = 'SELECT * FROM environments WHERE id = $1';
    const result = await query(selectQuery, [id]);
    return result.rows[0] || null;
}

/**
 * Get environment by hash
 * @param {string} hash - Environment hash
 * @returns {Promise<object|null>} Environment record or null
 */
async function getEnvironmentByHash(hash) {
    const selectQuery = 'SELECT * FROM environments WHERE environment_hash = $1';
    const result = await query(selectQuery, [hash]);
    return result.rows[0] || null;
}

/**
 * Get all environments
 * @param {object} filters - Optional filters (status, type)
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of environment records
 */
async function getAllEnvironments(filters = {}, limit = 100, offset = 0) {
    let selectQuery = 'SELECT * FROM environments WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
        selectQuery += ` AND status = $${paramCount}`;
        values.push(filters.status);
        paramCount++;
    }

    if (filters.type) {
        selectQuery += ` AND environment_type = $${paramCount}`;
        values.push(filters.type);
        paramCount++;
    }

    selectQuery += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await query(selectQuery, values);
    return result.rows;
}

/**
 * Update environment status
 * @param {string} id - Environment UUID
 * @param {string} newStatus - New status (pending, approved, rejected, suspended)
 * @param {string} changedBy - Who made the change (operator hash or system)
 * @param {string} reason - Reason for status change
 * @returns {Promise<object>} Updated environment record
 */
async function updateEnvironmentStatus(id, newStatus, changedBy = 'system', reason = '') {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Get current environment
        const currentResult = await client.query('SELECT * FROM environments WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) {
            throw new Error('Environment not found');
        }
        const currentEnv = currentResult.rows[0];

        // Update environment status
        const updateQuery = `
            UPDATE environments
            SET status = $1::environment_status,
                approved_at = CASE WHEN $1::environment_status = 'approved' THEN NOW() ELSE approved_at END,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `;
        const updateResult = await client.query(updateQuery, [newStatus, id]);

        // Create audit log entry
        const auditQuery = `
            INSERT INTO environment_audit_log (
                environment_id,
                action,
                old_status,
                new_status,
                changed_by,
                change_reason
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(auditQuery, [
            id,
            'status_changed',
            currentEnv.status,
            newStatus,
            changedBy,
            reason
        ]);

        await client.query('COMMIT');
        return updateResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Update environment eligibility score
 * @param {string} id - Environment UUID
 * @param {number} newScore - New eligibility score (0-100)
 * @param {string} changedBy - Who made the change
 * @returns {Promise<object>} Updated environment record
 */
async function updateEligibilityScore(id, newScore, changedBy = 'system') {
    if (newScore < 0 || newScore > 100) {
        throw new Error('Eligibility score must be between 0 and 100');
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Get current environment
        const currentResult = await client.query('SELECT * FROM environments WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) {
            throw new Error('Environment not found');
        }
        const currentEnv = currentResult.rows[0];

        // Update score
        const updateQuery = `
            UPDATE environments
            SET eligibility_score = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `;
        const updateResult = await client.query(updateQuery, [newScore, id]);

        // Create audit log entry
        const auditQuery = `
            INSERT INTO environment_audit_log (
                environment_id,
                action,
                old_score,
                new_score,
                changed_by
            ) VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(auditQuery, [
            id,
            'score_updated',
            currentEnv.eligibility_score,
            newScore,
            changedBy
        ]);

        await client.query('COMMIT');
        return updateResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Delete environment (soft delete - change status to suspended)
 * @param {string} id - Environment UUID
 * @param {string} changedBy - Who deleted it
 * @param {string} reason - Reason for deletion
 * @returns {Promise<object>} Updated environment record
 */
async function deleteEnvironment(id, changedBy = 'system', reason = 'Deleted') {
    return updateEnvironmentStatus(id, 'suspended', changedBy, reason);
}

/**
 * Get environment audit history
 * @param {string} id - Environment UUID
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getEnvironmentAuditHistory(id) {
    const selectQuery = `
        SELECT * FROM environment_audit_log
        WHERE environment_id = $1
        ORDER BY created_at DESC
    `;
    const result = await query(selectQuery, [id]);
    return result.rows;
}

module.exports = {
    registerEnvironment,
    getEnvironmentById,
    getEnvironmentByHash,
    getAllEnvironments,
    updateEnvironmentStatus,
    updateEligibilityScore,
    deleteEnvironment,
    getEnvironmentAuditHistory
};
