/**
 * Event Aggregations
 * Statistical analysis and metrics for care events
 */

const { query } = require('../../ier/database/config');

/**
 * Get event statistics by type
 * Returns count of events grouped by event type
 * 
 * @param {Object} options - Query options
 * @param {string} options.startDate - Optional start date filter
 * @param {string} options.endDate - Optional end date filter
 * @param {string} options.animalHash - Optional animal filter
 * @param {string} options.environmentHash - Optional environment filter
 * @returns {Array} Array of {event_type, count}
 */
async function getEventStatsByType(options = {}) {
    const { startDate, endDate, animalHash, environmentHash } = options;

    let queryText = `
        SELECT 
            event_type,
            COUNT(*) as count
        FROM care_events
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

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

    if (animalHash) {
        queryText += ` AND animal_hash = $${paramCount}`;
        params.push(animalHash);
        paramCount++;
    }

    if (environmentHash) {
        queryText += ` AND environment_hash = $${paramCount}`;
        params.push(environmentHash);
        paramCount++;
    }

    queryText += ' GROUP BY event_type ORDER BY count DESC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
        event_type: row.event_type,
        count: parseInt(row.count)
    }));
}

/**
 * Get event statistics by category
 * Returns count of events grouped by type and category
 * 
 * @param {Object} options - Query options
 * @returns {Array} Array of {event_type, event_category, count}
 */
async function getEventStatsByCategory(options = {}) {
    const { startDate, endDate, animalHash, environmentHash } = options;

    let queryText = `
        SELECT 
            event_type,
            event_category,
            COUNT(*) as count
        FROM care_events
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

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

    if (animalHash) {
        queryText += ` AND animal_hash = $${paramCount}`;
        params.push(animalHash);
        paramCount++;
    }

    if (environmentHash) {
        queryText += ` AND environment_hash = $${paramCount}`;
        params.push(environmentHash);
        paramCount++;
    }

    queryText += ' GROUP BY event_type, event_category ORDER BY event_type, count DESC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
        event_type: row.event_type,
        event_category: row.event_category,
        count: parseInt(row.count)
    }));
}

/**
 * Get daily event counts for a date range
 * Returns count of events per day
 * 
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} options - Additional filters
 * @returns {Array} Array of {date, count}
 */
async function getDailyEventCounts(startDate, endDate, options = {}) {
    const { animalHash, environmentHash, eventType } = options;

    let queryText = `
        SELECT 
            event_date as date,
            COUNT(*) as count
        FROM care_events
        WHERE event_date >= $1 AND event_date <= $2
    `;

    const params = [startDate, endDate];
    let paramCount = 3;

    if (animalHash) {
        queryText += ` AND animal_hash = $${paramCount}`;
        params.push(animalHash);
        paramCount++;
    }

    if (environmentHash) {
        queryText += ` AND environment_hash = $${paramCount}`;
        params.push(environmentHash);
        paramCount++;
    }

    if (eventType) {
        queryText += ` AND event_type = $${paramCount}`;
        params.push(eventType);
        paramCount++;
    }

    queryText += ' GROUP BY event_date ORDER BY event_date ASC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count)
    }));
}

/**
 * Get care metrics for an animal
 * Returns comprehensive care statistics
 * 
 * @param {string} animalHash - SHA-256 hash of animal
 * @returns {Object} Care metrics including event counts, date range, etc.
 */
async function getAnimalCareMetrics(animalHash) {
    // Get total event count
    const totalQuery = `
        SELECT COUNT(*) as total_events
        FROM care_events
        WHERE animal_hash = $1
    `;
    const totalResult = await query(totalQuery, [animalHash]);
    const totalEvents = parseInt(totalResult.rows[0].total_events);

    if (totalEvents === 0) {
        return {
            animal_hash: animalHash,
            total_events: 0,
            events_by_type: {},
            first_event_date: null,
            last_event_date: null,
            days_in_care: 0
        };
    }

    // Get events by type
    const typeQuery = `
        SELECT event_type, COUNT(*) as count
        FROM care_events
        WHERE animal_hash = $1
        GROUP BY event_type
    `;
    const typeResult = await query(typeQuery, [animalHash]);
    const eventsByType = {};
    typeResult.rows.forEach(row => {
        eventsByType[row.event_type] = parseInt(row.count);
    });

    // Get date range
    const dateQuery = `
        SELECT 
            MIN(event_date) as first_event,
            MAX(event_date) as last_event
        FROM care_events
        WHERE animal_hash = $1
    `;
    const dateResult = await query(dateQuery, [animalHash]);
    const firstEventDate = dateResult.rows[0].first_event;
    const lastEventDate = dateResult.rows[0].last_event;

    // Calculate days in care
    const daysInCare = Math.ceil(
        (new Date(lastEventDate) - new Date(firstEventDate)) / (1000 * 60 * 60 * 24)
    );

    return {
        animal_hash: animalHash,
        total_events: totalEvents,
        events_by_type: eventsByType,
        first_event_date: firstEventDate,
        last_event_date: lastEventDate,
        days_in_care: daysInCare
    };
}

/**
 * Get environment activity summary
 * Returns comprehensive activity statistics for an environment
 * 
 * @param {string} environmentHash - SHA-256 hash of environment
 * @param {Object} options - Query options
 * @returns {Object} Environment activity summary
 */
async function getEnvironmentActivitySummary(environmentHash, options = {}) {
    const { startDate, endDate } = options;

    let whereClause = 'WHERE environment_hash = $1';
    const params = [environmentHash];
    let paramCount = 2;

    if (startDate) {
        whereClause += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        whereClause += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    // Get total events
    const totalQuery = `
        SELECT COUNT(*) as total_events
        FROM care_events
        ${whereClause}
    `;
    const totalResult = await query(totalQuery, params);
    const totalEvents = parseInt(totalResult.rows[0].total_events);

    if (totalEvents === 0) {
        return {
            environment_hash: environmentHash,
            total_events: 0,
            unique_animals: 0,
            events_by_type: {},
            date_range: { start: startDate || null, end: endDate || null }
        };
    }

    // Get unique animals
    const animalsQuery = `
        SELECT COUNT(DISTINCT animal_hash) as unique_animals
        FROM care_events
        ${whereClause}
    `;
    const animalsResult = await query(animalsQuery, params);
    const uniqueAnimals = parseInt(animalsResult.rows[0].unique_animals);

    // Get events by type
    const typeQuery = `
        SELECT event_type, COUNT(*) as count
        FROM care_events
        ${whereClause}
        GROUP BY event_type
    `;
    const typeResult = await query(typeQuery, params);
    const eventsByType = {};
    typeResult.rows.forEach(row => {
        eventsByType[row.event_type] = parseInt(row.count);
    });

    return {
        environment_hash: environmentHash,
        total_events: totalEvents,
        unique_animals: uniqueAnimals,
        events_by_type: eventsByType,
        date_range: { start: startDate || null, end: endDate || null }
    };
}

/**
 * Get operator activity summary
 * Returns statistics for operator's activities
 * 
 * @param {string} operatorHash - SHA-256 hash of operator
 * @param {Object} options - Query options
 * @returns {Object} Operator activity summary
 */
async function getOperatorActivitySummary(operatorHash, options = {}) {
    const { startDate, endDate } = options;

    let whereClause = 'WHERE operator_hash = $1';
    const params = [operatorHash];
    let paramCount = 2;

    if (startDate) {
        whereClause += ` AND event_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        whereClause += ` AND event_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    // Get total events
    const totalQuery = `
        SELECT COUNT(*) as total_events
        FROM care_events
        ${whereClause}
    `;
    const totalResult = await query(totalQuery, params);
    const totalEvents = parseInt(totalResult.rows[0].total_events);

    if (totalEvents === 0) {
        return {
            operator_hash: operatorHash,
            total_events: 0,
            unique_animals: 0,
            events_by_type: {}
        };
    }

    // Get unique animals
    const animalsQuery = `
        SELECT COUNT(DISTINCT animal_hash) as unique_animals
        FROM care_events
        ${whereClause}
    `;
    const animalsResult = await query(animalsQuery, params);
    const uniqueAnimals = parseInt(animalsResult.rows[0].unique_animals);

    // Get events by type
    const typeQuery = `
        SELECT event_type, COUNT(*) as count
        FROM care_events
        ${whereClause}
        GROUP BY event_type
    `;
    const typeResult = await query(typeQuery, params);
    const eventsByType = {};
    typeResult.rows.forEach(row => {
        eventsByType[row.event_type] = parseInt(row.count);
    });

    return {
        operator_hash: operatorHash,
        total_events: totalEvents,
        unique_animals: uniqueAnimals,
        events_by_type: eventsByType
    };
}

module.exports = {
    getEventStatsByType,
    getEventStatsByCategory,
    getDailyEventCounts,
    getAnimalCareMetrics,
    getEnvironmentActivitySummary,
    getOperatorActivitySummary
};
