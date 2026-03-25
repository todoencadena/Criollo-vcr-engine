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

module.exports = {
    hashAnimal
};
