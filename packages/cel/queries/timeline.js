/**
 * Timeline Queries
 * Advanced queries for event timelines and activity logs
 */

const { query } = require('../../ier/database/config');

/**
 * Get complete timeline for an animal
 * Returns all events in chronological order
 * 
 * @param {string} animalHash - SHA-256 hash of animal
 * @param {Object} options - Query options
 * @param {string} options.startDate - Optional start date filter
 * @param {string} options.endDate - Optional end date filter
 * @param {Array<string>} options.eventTypes - Optional event type filter
 * @returns {Array} Array of events in chronological order
 */
async function getAnimalTimeline(animalHash, options = {}) {
    const { startDate, endDate, eventTypes } = options;

    let queryText = `
        SELECT 
            event_hash,
            animal_hash,
            environment_hash,
            operator_hash,
            event_type,
            event_category,
            event_timestamp,
            event_date,
            metadata,
            notes,
            created_at
        FROM care_events
        WHERE animal_hash = $1
    `;

    const params = [animalHash];
    let paramCount = 2;

    // Add date range filters
    if (startDate) {
        queryText += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        queryText += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    // Add event type filter
    if (eventTypes && eventTypes.length > 0) {
        queryText += ` AND event_type = ANY($${paramCount})`;
        params.push(eventTypes);
        paramCount++;
    }

    queryText += ' ORDER BY event_timestamp ASC, created_at ASC';

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get activity log for an environment
 * Returns all events that occurred in a specific environment
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @param {Object} options - Query options
 * @param {string} options.startDate - Optional start date filter
 * @param {string} options.endDate - Optional end date filter
 * @param {Array<string>} options.eventTypes - Optional event type filter
 * @param {number} options.limit - Optional result limit
 * @returns {Array} Array of events
 */
async function getEnvironmentActivityLog(environmentHash, options = {}) {
    const { startDate, endDate, eventTypes, limit } = options;

    let queryText = `
        SELECT 
            event_hash,
            animal_hash,
            environment_hash,
            operator_hash,
            event_type,
            event_category,
            event_timestamp,
            event_date,
            metadata,
            notes,
            created_at
        FROM care_events
        WHERE environment_hash = $1
    `;

    const params = [environmentHash];
    let paramCount = 2;

    if (startDate) {
        queryText += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        queryText += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    if (eventTypes && eventTypes.length > 0) {
        queryText += ` AND event_type = ANY($${paramCount})`;
        params.push(eventTypes);
        paramCount++;
    }

    queryText += ' ORDER BY event_timestamp DESC';

    if (limit) {
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);
    }

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get activity log for an operator
 * Returns all events performed by a specific operator
 * 
 * @param {string} operatorHash - SHA-256 hash of operator
 * @param {Object} options - Query options
 * @param {string} options.startDate - Optional start date filter
 * @param {string} options.endDate - Optional end date filter
 * @param {Array<string>} options.eventTypes - Optional event type filter
 * @param {number} options.limit - Optional result limit
 * @returns {Array} Array of events
 */
async function getOperatorActivityLog(operatorHash, options = {}) {
    const { startDate, endDate, eventTypes, limit } = options;

    let queryText = `
        SELECT 
            event_hash,
            animal_hash,
            environment_hash,
            operator_hash,
            event_type,
            event_category,
            event_timestamp,
            event_date,
            metadata,
            notes,
            created_at
        FROM care_events
        WHERE operator_hash = $1
    `;

    const params = [operatorHash];
    let paramCount = 2;

    if (startDate) {
        queryText += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        queryText += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    if (eventTypes && eventTypes.length > 0) {
        queryText += ` AND event_type = ANY($${paramCount})`;
        params.push(eventTypes);
        paramCount++;
    }

    queryText += ' ORDER BY event_timestamp DESC';

    if (limit) {
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);
    }

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get recent events across all animals
 * 
 * @param {number} limit - Number of events to return (default 50)
 * @param {Array<string>} eventTypes - Optional event type filter
 * @returns {Array} Array of recent events
 */
async function getRecentEvents(limit = 50, eventTypes = null) {
    let queryText = `
        SELECT 
            event_hash,
            animal_hash,
            environment_hash,
            operator_hash,
            event_type,
            event_category,
            event_timestamp,
            event_date,
            metadata,
            notes,
            created_at
        FROM care_events
    `;

    const params = [];
    let paramCount = 1;

    if (eventTypes && eventTypes.length > 0) {
        queryText += ` WHERE event_type = ANY($${paramCount})`;
        params.push(eventTypes);
        paramCount++;
    }

    queryText += ' ORDER BY event_timestamp DESC';
    queryText += ` LIMIT $${paramCount}`;
    params.push(limit);

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get events by category
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category of event
 * @param {Object} options - Query options
 * @returns {Array} Array of events
 */
async function getEventsByCategory(eventType, eventCategory, options = {}) {
    const { startDate, endDate, limit } = options;

    let queryText = `
        SELECT *
        FROM care_events
        WHERE event_type = $1 AND event_category = $2
    `;

    const params = [eventType, eventCategory];
    let paramCount = 3;

    if (startDate) {
        queryText += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        queryText += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    queryText += ' ORDER BY event_timestamp DESC';

    if (limit) {
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);
    }

    const result = await query(queryText, params);
    return result.rows;
}

module.exports = {
    getAnimalTimeline,
    getEnvironmentActivityLog,
    getOperatorActivityLog,
    getRecentEvents,
    getEventsByCategory
};
