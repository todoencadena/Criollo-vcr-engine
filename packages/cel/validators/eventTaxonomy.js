/**
 * Event Taxonomy
 * Defines valid event categories for each event type
 * Zero-PII compliant categories for animal care tracking
 */

/**
 * Event taxonomy mapping
 * Each event type has a set of valid categories
 */
const EVENT_TAXONOMY = {
    intake: [
        'arrival',           // Animal arrives at facility
        'rescue',            // Animal rescued from situation
        'surrender',         // Owner surrender
        'transfer_in',       // Transfer from another facility
        'stray'              // Stray animal intake
    ],
    medical: [
        'vaccination',       // Vaccine administration
        'surgery',           // Surgical procedure
        'treatment',         // Medical treatment
        'checkup',           // Routine health check
        'diagnosis',         // Medical diagnosis
        'medication',        // Medication administration
        'lab_test',          // Laboratory testing
        'emergency'          // Emergency medical care
    ],
    care: [
        'feeding',           // Feeding activity
        'exercise',          // Exercise/activity
        'grooming',          // Grooming care
        'socialization',     // Social interaction
        'enrichment',        // Environmental enrichment
        'training',          // Behavioral training
        'observation'        // Health/behavior observation
    ],
    transfer: [
        'foster',            // Transfer to foster care
        'temporary_care',    // Temporary care placement
        'facility_transfer', // Transfer to another facility
        'transport',         // Transportation event
        'quarantine'         // Quarantine placement
    ],
    outcome: [
        'adoption',          // Adopted by family
        'return_to_wild',    // Released to natural habitat
        'transfer_out',      // Transferred out permanently
        'deceased',          // Natural death
        'euthanasia',        // Humane euthanasia
        'return_to_owner'    // Returned to original owner
    ]
};

/**
 * Get valid categories for an event type
 * 
 * @param {string} eventType - Type of event (intake/medical/care/transfer/outcome)
 * @returns {Array<string>} Array of valid categories
 */
function getValidCategories(eventType) {
    if (!eventType) {
        throw new Error('Event type is required');
    }

    const normalizedType = eventType.toLowerCase().trim();
    const categories = EVENT_TAXONOMY[normalizedType];

    if (!categories) {
        throw new Error(`Invalid event type: ${eventType}`);
    }

    return categories;
}

/**
 * Validate if a category is valid for an event type
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidCategory(eventType, eventCategory) {
    if (!eventType || !eventCategory) {
        return false;
    }

    try {
        const validCategories = getValidCategories(eventType);
        const normalizedCategory = eventCategory.toLowerCase().trim();
        return validCategories.includes(normalizedCategory);
    } catch (error) {
        return false;
    }
}

/**
 * Validate event category and throw error if invalid
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category to validate
 * @throws {Error} If category is invalid for the event type
 */
function validateEventCategory(eventType, eventCategory) {
    if (!eventType || !eventCategory) {
        throw new Error('Both eventType and eventCategory are required');
    }

    const validCategories = getValidCategories(eventType);
    const normalizedCategory = eventCategory.toLowerCase().trim();

    if (!validCategories.includes(normalizedCategory)) {
        throw new Error(
            `Invalid category '${eventCategory}' for event type '${eventType}'. ` +
            `Valid categories: ${validCategories.join(', ')}`
        );
    }

    return true;
}

/**
 * Get all event types
 * 
 * @returns {Array<string>} Array of all event types
 */
function getAllEventTypes() {
    return Object.keys(EVENT_TAXONOMY);
}

/**
 * Get full taxonomy
 * 
 * @returns {Object} Complete event taxonomy
 */
function getEventTaxonomy() {
    return Object.fromEntries(
        Object.entries(EVENT_TAXONOMY).map(([k, v]) => [k, [...v]])
    );
}

module.exports = {
    EVENT_TAXONOMY,
    getValidCategories,
    isValidCategory,
    validateEventCategory,
    getAllEventTypes,
    getEventTaxonomy
};
