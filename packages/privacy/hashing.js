const crypto = require('crypto');

/**
 * Hash an animal's identity using SHA-256
 * @param {string} microchipId - The animal's microchip ID
 * @param {string} intakeDate - Date when animal was rescued (YYYY-MM-DD)
 * @param {string} salt - Secret salt for additional security
 * @returns {string} 64-character hexadecimal hash
 */
function hashAnimal(microchipId, intakeDate, salt) {
    if (!microchipId || !intakeDate || !salt) {
        throw new Error('All parameters are required: microchipId, intakeDate, salt');
    }

    const data = `${microchipId}-${intakeDate}-${salt}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash an environment's identity using SHA-256
 * @param {string} name - The environment/shelter name
 * @param {number} year - Year of operation
 * @param {string} salt - Secret salt for additional security
 * @returns {string} 64-character hexadecimal hash
 */
function hashEnvironment(name, year, salt) {
    if (!name || !year || !salt) {
        throw new Error('All parameters are required: name, year, salt');
    }

    // Normalize name: lowercase and trim whitespace
    const normalizedName = name.toLowerCase().trim();
    const data = `${normalizedName}-${year}-${salt}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash an operator's identity using SHA-256
 * @param {string} licenseNumber - The operator's professional license number
 * @param {string} jurisdiction - State/country where operator is licensed
 * @param {string} salt - Secret salt for additional security
 * @returns {string} 64-character hexadecimal hash
 */
function hashOperator(licenseNumber, jurisdiction, salt) {
    if (!licenseNumber || !jurisdiction || !salt) {
        throw new Error('All parameters are required: licenseNumber, jurisdiction, salt');
    }

    const data = `${licenseNumber}-${jurisdiction}-${salt}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}
/**
 * Generate a cryptographic hash for a care event
 * Combines event data with salt for unique, deterministic hashing
 * 
 * @param {string} animalHash - SHA-256 hash of the animal
 * @param {string} environmentHash - SHA-256 hash of the environment
 * @param {string} eventType - Type of event (intake/medical/care/transfer/outcome)
 * @param {string} eventTimestamp - ISO timestamp of the event
 * @param {string} salt - Cryptographic salt
 * @returns {string} SHA-256 hash (64 character hex string)
 */
function hashCareEvent(animalHash, environmentHash, eventType, eventTimestamp, salt) {
    if (!animalHash || !environmentHash || !eventType || !eventTimestamp || !salt) {
        throw new Error('All parameters are required: animalHash, environmentHash, eventType, eventTimestamp, salt');
    }

    // Validate hash format (64 character hex strings)
    const hashRegex = /^[a-f0-9]{64}$/;
    if (!hashRegex.test(animalHash)) {
        throw new Error('Invalid animalHash format - must be 64 character hex string');
    }
    if (!hashRegex.test(environmentHash)) {
        throw new Error('Invalid environmentHash format - must be 64 character hex string');
    }

    // Validate event type
    const validTypes = ['intake', 'medical', 'care', 'transfer', 'outcome'];
    if (!validTypes.includes(eventType.toLowerCase())) {
        throw new Error(`Invalid event type - must be one of: ${validTypes.join(', ')}`);
    }

    // Normalize inputs
    const normalizedType = eventType.toLowerCase().trim();
    const normalizedTimestamp = eventTimestamp.trim();
    const normalizedSalt = salt.trim();

    // Combine all components
    const combined = `${animalHash}|${environmentHash}|${normalizedType}|${normalizedTimestamp}|${normalizedSalt}`;

    // Generate SHA-256 hash
    const hash = crypto.createHash('sha256').update(combined).digest('hex');

    return hash;
}
module.exports = {
    hashAnimal,
    hashEnvironment,
    hashOperator,
    hashCareEvent
};
