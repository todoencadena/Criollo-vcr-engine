/**
 * NPI (Non-Public Information) Compliance Module
 *
 * Ensures zero PII (Personally Identifiable Information) reaches blockchain.
 * Validates data structures before on-chain operations.
 */

/**
 * List of forbidden field names that contain PII
 * These fields must NEVER appear in on-chain data structures
 */
const FORBIDDEN_FIELDS = [
    // Animal identity
    'animal_name',
    'pet_name',
    'name',
    'breed',
    'color',
    'species',
    'age',
    'weight',
    'physical_description',
    'distinguishing_marks',
    'medical_history',

    // Environment identity
    'shelter_name',
    'refuge_name',
    'organization_name',
    'facility_name',
    'location',
    'address',
    'street',
    'city',
    'state',
    'zip_code',
    'postal_code',
    'country',
    'coordinates',
    'latitude',
    'longitude',

    // Operator identity
    'operator_name',
    'vet_name',
    'veterinarian_name',
    'doctor_name',
    'rescuer_name',
    'first_name',
    'last_name',
    'full_name',
    'email',
    'phone',
    'phone_number',
    'mobile',
    'contact',

    // Owner/adopter identity
    'owner_name',
    'adopter_name',
    'guardian_name',
    'previous_owner',

    // Financial PII
    'credit_card',
    'bank_account',
    'ssn',
    'social_security',
    'tax_id',

    // Other identifying info
    'photo',
    'image',
    'picture',
    'video',
    'notes',
    'comments',
    'description'
];

/**
 * Validate that a data object contains no PII fields
 * @param {Object} data - Data object to validate
 * @param {string} context - Context description for error messages (optional)
 * @throws {Error} If PII fields are detected
 * @returns {boolean} True if validation passes
 */
function validateNPICompliance(data, context = 'data') {
    if (!data || typeof data !== 'object') {
        throw new Error('Data must be a non-null object');
    }

    const violations = [];

    // Check for forbidden fields
    for (const field of FORBIDDEN_FIELDS) {
        if (data.hasOwnProperty(field)) {
            violations.push(field);
        }
    }

    if (violations.length > 0) {
        throw new Error(
            `NPI Compliance Violation in ${context}: ` +
            `Forbidden fields detected: ${violations.join(', ')}. ` +
            `These fields contain PII and cannot be stored on-chain.`
        );
    }

    return true;
}

/**
 * Check if a field name is forbidden (contains PII)
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if field is forbidden
 */
function isForbiddenField(fieldName) {
    return FORBIDDEN_FIELDS.includes(fieldName);
}

/**
 * Get list of all forbidden fields
 * @returns {Array<string>} Array of forbidden field names
 */
function getForbiddenFields() {
    return [...FORBIDDEN_FIELDS];
}

module.exports = {
    validateNPICompliance,
    isForbiddenField,
    getForbiddenFields,
    FORBIDDEN_FIELDS
};
