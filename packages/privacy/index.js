/**
 * Privacy Module - Main Export
 *
 * Exports all privacy-related functions for the VCR Engine:
 * - Entity hashing (hashAnimal, hashEnvironment, hashOperator)
 * - NPI compliance validation (validateNPICompliance, etc.)
 */

const {
    hashAnimal,
    hashEnvironment,
    hashOperator
} = require('./hashing');

const {
    validateNPICompliance,
    isForbiddenField,
    getForbiddenFields,
    FORBIDDEN_FIELDS
} = require('./npi-compliance');

module.exports = {
    // Entity hashing functions
    hashAnimal,
    hashEnvironment,
    hashOperator,

    // NPI compliance functions
    validateNPICompliance,
    isForbiddenField,
    getForbiddenFields,
    FORBIDDEN_FIELDS
};
