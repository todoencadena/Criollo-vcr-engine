/**
 * Care Event Model
 * CRUD operations for care event tracking with zero-PII architecture
 */

const { query, getClient } = require('../../ier/database/config');
const { hashCareEvent } = require('../../privacy/hashing');

/**
 * Create a new care event
 * 
 * @param {Object} eventData - Event data
 * @param {string} eventData.animalHash - SHA-256 hash of animal
 * @param {string} eventData.environmentHash - SHA-256 hash of environment
 * @param {string} eventData.operatorHash - SHA-256 hash of operator (optional)
 * @param {string} eventData.eventType - Type of event (intake/medical/care/transfer/outcome)
 * @param {string} eventData.eventCategory - Specific category (e.g., 'vaccination', 'surgery')
 * @param {string} eventData.eventTimestamp - ISO timestamp of event
 * @param {Object} eventData.metadata - Zero-PII metadata (optional)
 * @param {string} eventData.notes - Zero-PII notes (optional)
 * @param {string} salt - Cryptographic salt for hashing
 * @returns {Object} Created care event
 */
async function createCareEvent(eventData, salt) {
    const {
        animalHash,
        environmentHash,
        operatorHash,
        eventType,
        eventCategory,
        eventTimestamp,
        metadata,
        notes
    } = eventData;

    // Validate required fields
    if (!animalHash || !environmentHash || !eventType || !eventCategory || !eventTimestamp || !salt) {
        throw new Error('Missing required fields: animalHash, environmentHash, eventType, eventCategory, eventTimestamp, salt');
    }

    // Generate event hash
    const eventHash = hashCareEvent(animalHash, environmentHash, eventType, eventTimestamp, salt);

    // Extract date from timestamp
    const eventDate = new Date(eventTimestamp).toISOString().split('T')[0];

    const insertQuery = `
        INSERT INTO care_events (
            event_hash,
            animal_hash,
            environment_hash,
            operator_hash,
            event_type,
            event_category,
            event_timestamp,
            event_date,
            metadata,
            notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
    `;

    const values = [
        eventHash,
        animalHash,
        environmentHash,
        operatorHash || null,
        eventType.toLowerCase(),
        eventCategory,
        eventTimestamp,
        eventDate,
        metadata ? JSON.stringify(metadata) : null,
        notes || null
    ];

    const result = await query(insertQuery, values);
    return result.rows[0];
}

/**
 * Get a care event by its hash
 * 
 * @param {string} eventHash - SHA-256 hash of the event
 * @returns {Object|null} Care event or null if not found
 */
async function getCareEventByHash(eventHash) {
    const selectQuery = 'SELECT * FROM care_events WHERE event_hash = $1';
    const result = await query(selectQuery, [eventHash]);
    return result.rows[0] || null;
}

/**
 * Get all care events for a specific animal
 * 
 * @param {string} animalHash - SHA-256 hash of the animal
 * @returns {Array} Array of care events
 */
async function getCareEventsByAnimal(animalHash) {
    const selectQuery = `
        SELECT * FROM care_events 
        WHERE animal_hash = $1 
        ORDER BY event_timestamp DESC
    `;
    const result = await query(selectQuery, [animalHash]);
    return result.rows;
}

/**
 * Get all care events for a specific environment
 * 
 * @param {string} environmentHash - SHA-256 hash of the environment
 * @returns {Array} Array of care events
 */
async function getCareEventsByEnvironment(environmentHash) {
    const selectQuery = `
        SELECT * FROM care_events 
        WHERE environment_hash = $1 
        ORDER BY event_timestamp DESC
    `;
    const result = await query(selectQuery, [environmentHash]);
    return result.rows;
}

/**
 * Get care events by type
 * 
 * @param {string} eventType - Type of event (intake/medical/care/transfer/outcome)
 * @returns {Array} Array of care events
 */
async function getCareEventsByType(eventType) {
    const selectQuery = `
        SELECT * FROM care_events 
        WHERE event_type = $1 
        ORDER BY event_timestamp DESC
    `;
    const result = await query(selectQuery, [eventType.toLowerCase()]);
    return result.rows;
}

/**
 * Get care events within a date range
 * 
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @returns {Array} Array of care events
 */
async function getCareEventsByDateRange(startDate, endDate) {
    const selectQuery = `
        SELECT * FROM care_events 
        WHERE event_date >= $1 AND event_date <= $2 
        ORDER BY event_timestamp DESC
    `;
    const result = await query(selectQuery, [startDate, endDate]);
    return result.rows;
}

/**
 * Update care event notes or metadata
 * 
 * @param {string} eventHash - SHA-256 hash of the event
 * @param {Object} updates - Fields to update
 * @param {Object} updates.metadata - New metadata (optional)
 * @param {string} updates.notes - New notes (optional)
 * @returns {Object|null} Updated care event or null if not found
 */
async function updateCareEvent(eventHash, updates) {
    const { metadata, notes } = updates;

    if (!metadata && !notes) {
        throw new Error('At least one field (metadata or notes) must be provided for update');
    }

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    if (metadata) {
        setClauses.push(`metadata = $${paramCount}`);
        values.push(JSON.stringify(metadata));
        paramCount++;
    }

    if (notes) {
        setClauses.push(`notes = $${paramCount}`);
        values.push(notes);
        paramCount++;
    }

    values.push(eventHash);

    const updateQuery = `
        UPDATE care_events 
        SET ${setClauses.join(', ')} 
        WHERE event_hash = $${paramCount}
        RETURNING *
    `;

    const result = await query(updateQuery, values);
    return result.rows[0] || null;
}

/**
 * Delete a care event
 * Note: This is a hard delete. Use with caution.
 * 
 * @param {string} eventHash - SHA-256 hash of the event
 * @returns {boolean} True if deleted, false if not found
 */
async function deleteCareEvent(eventHash) {
    const deleteQuery = 'DELETE FROM care_events WHERE event_hash = $1 RETURNING *';
    const result = await query(deleteQuery, [eventHash]);
    return result.rows.length > 0;
}

module.exports = {
    createCareEvent,
    getCareEventByHash,
    getCareEventsByAnimal,
    getCareEventsByEnvironment,
    getCareEventsByType,
    getCareEventsByDateRange,
    updateCareEvent,
    deleteCareEvent
};
