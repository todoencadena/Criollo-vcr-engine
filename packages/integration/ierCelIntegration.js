/**
 * IER + CEL Integration
 * Connects Intake Environment Registry with Care Event Logger
 * Provides cross-phase validation and queries
 */

const { getEnvironmentByHash } = require('../ier/models/Environment');
const { createCareEvent } = require('../cel/models/CareEvent');
const { query } = require('../ier/database/config');

/**
 * Validate that an environment exists before creating an event
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @returns {Promise<boolean>} True if environment exists
 */
async function validateEnvironmentExists(environmentHash) {
    const environment = await getEnvironmentByHash(environmentHash);
    return environment !== null;
}

/**
 * Create a care event with environment validation
 * Ensures the environment exists in IER before creating event
 * 
 * @param {Object} eventData - Event data
 * @param {string} salt - Cryptographic salt
 * @returns {Promise<Object>} Created care event
 * @throws {Error} If environment doesn't exist
 */
async function createValidatedCareEvent(eventData, salt) {
    const { environmentHash } = eventData;

    // Validate environment exists
    const environmentExists = await validateEnvironmentExists(environmentHash);
    if (!environmentExists) {
        throw new Error(
            `Environment ${environmentHash} not found in IER. ` +
            `Events can only be created for registered environments.`
        );
    }

    // Create the event
    return await createCareEvent(eventData, salt);
}

/**
 * Get environment details with event summary
 * Combines IER environment data with CEL event statistics
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @returns {Promise<Object|null>} Environment with event summary
 */
async function getEnvironmentWithEventSummary(environmentHash) {
    // Get environment from IER
    const environment = await getEnvironmentByHash(environmentHash);
    if (!environment) {
        return null;
    }

    // Get event counts by type
    const eventStatsQuery = `
        SELECT 
            event_type,
            COUNT(*) as count
        FROM care_events
        WHERE environment_hash = $1
        GROUP BY event_type
    `;
    const statsResult = await query(eventStatsQuery, [environmentHash]);
    
    const eventStats = {};
    statsResult.rows.forEach(row => {
        eventStats[row.event_type] = parseInt(row.count);
    });

    // Get total events and unique animals
    const summaryQuery = `
        SELECT 
            COUNT(*) as total_events,
            COUNT(DISTINCT animal_hash) as unique_animals
        FROM care_events
        WHERE environment_hash = $1
    `;
    const summaryResult = await query(summaryQuery, [environmentHash]);
    const summary = summaryResult.rows[0];

    return {
        ...environment,
        event_summary: {
            total_events: parseInt(summary.total_events),
            unique_animals: parseInt(summary.unique_animals),
            events_by_type: eventStats
        }
    };
}

/**
 * Get all events for animals in a specific environment
 * Cross-references environment eligibility with care events
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of events
 */
async function getEnvironmentAnimalEvents(environmentHash, options = {}) {
    const { startDate, endDate, eventType } = options;

    // Verify environment exists
    const environment = await getEnvironmentByHash(environmentHash);
    if (!environment) {
        return [];
    }

    let queryText = `
        SELECT 
            ce.*
        FROM care_events ce
        WHERE ce.environment_hash = $1
    `;

    const params = [environmentHash];
    let paramCount = 2;

    if (startDate) {
        queryText += ` AND ce.event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        queryText += ` AND ce.event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    if (eventType) {
        queryText += ` AND ce.event_type = $${paramCount}`;
        params.push(eventType);
        paramCount++;
    }

    queryText += ' ORDER BY ce.event_timestamp DESC';

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get list of registered environments with activity metrics
 * Shows all IER environments with their CEL activity
 * 
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Array of environments with metrics
 */
async function getEnvironmentsWithActivity(options = {}) {
    const { minEvents, hasActivity } = options;

    // Get all environments
    const envQuery = `
        SELECT 
            e.environment_hash,
            e.environment_type,
            e.year,
            e.status,
            COALESCE(event_counts.total_events, 0) as total_events,
            COALESCE(event_counts.unique_animals, 0) as unique_animals
        FROM environments e
        LEFT JOIN (
            SELECT 
                environment_hash,
                COUNT(*) as total_events,
                COUNT(DISTINCT animal_hash) as unique_animals
            FROM care_events
            GROUP BY environment_hash
        ) event_counts ON e.environment_hash = event_counts.environment_hash
    `;

    let whereClause = '';
    const params = [];
    let paramCount = 1;

    if (hasActivity !== undefined) {
        if (hasActivity) {
            whereClause = ' WHERE COALESCE(event_counts.total_events, 0) > 0';
        } else {
            whereClause = ' WHERE COALESCE(event_counts.total_events, 0) = 0';
        }
    }

    if (minEvents !== undefined) {
        if (whereClause) {
            whereClause += ` AND COALESCE(event_counts.total_events, 0) >= $${paramCount}`;
        } else {
            whereClause = ` WHERE COALESCE(event_counts.total_events, 0) >= $${paramCount}`;
        }
        params.push(minEvents);
        paramCount++;
    }

    const finalQuery = envQuery + whereClause + ' ORDER BY total_events DESC';
    const result = await query(finalQuery, params);

    return result.rows.map(row => ({
        environment_hash: row.environment_hash,
        environment_type: row.environment_type,
        year: row.year,
        status: row.status,
        total_events: parseInt(row.total_events),
        unique_animals: parseInt(row.unique_animals)
    }));
}

/**
 * Validate environment eligibility before event creation
 * Ensures environment meets minimum eligibility score
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @param {number} minScore - Minimum required eligibility score
 * @returns {Promise<Object>} Validation result
 */
async function validateEnvironmentEligibility(environmentHash, minScore = 70) {
    const environment = await getEnvironmentByHash(environmentHash);
    
    if (!environment) {
        return {
            valid: false,
            reason: 'Environment not found in registry'
        };
    }

    if (!environment.eligibility_score) {
        return {
            valid: false,
            reason: 'Environment has not been evaluated for eligibility'
        };
    }

    if (environment.eligibility_score < minScore) {
        return {
            valid: false,
            reason: `Environment eligibility score (${environment.eligibility_score}) below minimum (${minScore})`,
            current_score: environment.eligibility_score,
            required_score: minScore
        };
    }

    return {
        valid: true,
        eligibility_score: environment.eligibility_score
    };
}

module.exports = {
    validateEnvironmentExists,
    createValidatedCareEvent,
    getEnvironmentWithEventSummary,
    getEnvironmentAnimalEvents,
    getEnvironmentsWithActivity,
    validateEnvironmentEligibility
};
