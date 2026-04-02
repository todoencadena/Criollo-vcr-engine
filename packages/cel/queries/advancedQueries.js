/**
 * Advanced Queries
 * Multi-criteria search, range queries, sorting, and pagination
 */

const { query } = require('../../ier/database/config');

/**
 * Advanced event search with multiple criteria
 * 
 * @param {Object} filters - Search filters
 * @param {Array<string>} filters.eventTypes - Array of event types to include
 * @param {Array<string>} filters.eventCategories - Array of event categories
 * @param {string} filters.startDate - Start date filter
 * @param {string} filters.endDate - End date filter
 * @param {string} filters.animalHash - Filter by animal
 * @param {string} filters.environmentHash - Filter by environment
 * @param {string} filters.operatorHash - Filter by operator
 * @param {string} filters.searchText - Full-text search in notes
 * @param {Object} options - Query options
 * @param {string} options.sortBy - Field to sort by (default: event_timestamp)
 * @param {string} options.sortOrder - Sort order: 'asc' or 'desc' (default: desc)
 * @param {number} options.limit - Results limit (default: 50, max: 1000)
 * @param {number} options.offset - Pagination offset (default: 0)
 * @returns {Promise<Object>} { events: Array, total: number, hasMore: boolean }
 */
async function advancedSearch(filters = {}, options = {}) {
    const {
        eventTypes,
        eventCategories,
        startDate,
        endDate,
        animalHash,
        environmentHash,
        operatorHash,
        searchText
    } = filters;

    const {
        sortBy = 'event_timestamp',
        sortOrder = 'desc',
        limit = 50,
        offset = 0
    } = options;

    // Validate limit
    const validLimit = Math.min(Math.max(1, limit), 1000);
    const validOffset = Math.max(0, offset);

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (eventTypes && eventTypes.length > 0) {
        conditions.push(`event_type = ANY($${paramCount})`);
        params.push(eventTypes);
        paramCount++;
    }

    if (eventCategories && eventCategories.length > 0) {
        conditions.push(`event_category = ANY($${paramCount})`);
        params.push(eventCategories);
        paramCount++;
    }

    if (startDate) {
        conditions.push(`event_date >= $${paramCount}`);
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        conditions.push(`event_date <= $${paramCount}`);
        params.push(endDate);
        paramCount++;
    }

    if (animalHash) {
        conditions.push(`animal_hash = $${paramCount}`);
        params.push(animalHash);
        paramCount++;
    }

    if (environmentHash) {
        conditions.push(`environment_hash = $${paramCount}`);
        params.push(environmentHash);
        paramCount++;
    }

    if (operatorHash) {
        conditions.push(`operator_hash = $${paramCount}`);
        params.push(operatorHash);
        paramCount++;
    }

    if (searchText) {
        conditions.push(`(notes ILIKE $${paramCount} OR metadata::text ILIKE $${paramCount})`);
        params.push(`%${searchText}%`);
        paramCount++;
    }

    const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // Validate sort field
    const validSortFields = [
        'event_timestamp', 'event_date', 'event_type', 
        'event_category', 'created_at'
    ];
    const validSortBy = validSortFields.includes(sortBy) ? sortBy : 'event_timestamp';
    const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `
        SELECT COUNT(*) as total
        FROM care_events
        ${whereClause}
    `;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataQuery = `
        SELECT *
        FROM care_events
        ${whereClause}
        ORDER BY ${validSortBy} ${validSortOrder}
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(validLimit, validOffset);

    const dataResult = await query(dataQuery, params);

    return {
        events: dataResult.rows,
        total,
        hasMore: (validOffset + validLimit) < total,
        limit: validLimit,
        offset: validOffset
    };
}

/**
 * Search events by metadata field values
 * 
 * @param {string} eventType - Event type to search
 * @param {string} eventCategory - Event category
 * @param {Object} metadataFilters - Key-value pairs to match in metadata
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of matching events
 */
async function searchByMetadata(eventType, eventCategory, metadataFilters = {}, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const conditions = [
        'event_type = $1',
        'event_category = $2'
    ];
    const params = [eventType, eventCategory];
    let paramCount = 3;

    // Add metadata filters using JSONB containment
    if (Object.keys(metadataFilters).length > 0) {
        conditions.push(`metadata @> $${paramCount}::jsonb`);
        params.push(JSON.stringify(metadataFilters));
        paramCount++;
    }

    const queryText = `
        SELECT *
        FROM care_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY event_timestamp DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
}

/**
 * Get events with date range grouping
 * 
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} groupBy - Grouping: 'day', 'week', 'month'
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Array of grouped results
 */
async function getEventsGroupedByDate(startDate, endDate, groupBy = 'day', filters = {}) {
    const { eventType, environmentHash } = filters;

    const conditions = [
        'event_date >= $1',
        'event_date <= $2'
    ];
    const params = [startDate, endDate];
    let paramCount = 3;

    if (eventType) {
        conditions.push(`event_type = $${paramCount}`);
        params.push(eventType);
        paramCount++;
    }

    if (environmentHash) {
        conditions.push(`environment_hash = $${paramCount}`);
        params.push(environmentHash);
        paramCount++;
    }

    let dateGrouping;
    switch (groupBy) {
        case 'week':
            dateGrouping = "DATE_TRUNC('week', event_date)";
            break;
        case 'month':
            dateGrouping = "DATE_TRUNC('month', event_date)";
            break;
        default:
            dateGrouping = 'event_date';
    }

    const queryText = `
        SELECT 
            ${dateGrouping}::date as period,
            event_type,
            COUNT(*) as count
        FROM care_events
        WHERE ${conditions.join(' AND ')}
        GROUP BY period, event_type
        ORDER BY period ASC, event_type
    `;

    const result = await query(queryText, params);
    return result.rows.map(row => ({
        period: row.period,
        event_type: row.event_type,
        count: parseInt(row.count)
    }));
}

/**
 * Find events with similar metadata
 * Uses JSONB similarity for fuzzy matching
 * 
 * @param {string} eventHash - Reference event hash
 * @param {number} limit - Number of similar events to return
 * @returns {Promise<Array>} Array of similar events
 */
async function findSimilarEvents(eventHash, limit = 10) {
    // Get reference event
    const refQuery = 'SELECT * FROM care_events WHERE event_hash = $1';
    const refResult = await query(refQuery, [eventHash]);
    
    if (refResult.rows.length === 0) {
        return [];
    }

    const refEvent = refResult.rows[0];

    // Find events of same type and category with similar metadata
    const similarQuery = `
        SELECT *
        FROM care_events
        WHERE event_type = $1
        AND event_category = $2
        AND event_hash != $3
        ORDER BY event_timestamp DESC
        LIMIT $4
    `;

    const result = await query(similarQuery, [
        refEvent.event_type,
        refEvent.event_category,
        eventHash,
        limit
    ]);

    return result.rows;
}

module.exports = {
    advancedSearch,
    searchByMetadata,
    getEventsGroupedByDate,
    findSimilarEvents
};
