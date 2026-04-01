/**
 * Metadata Validators
 * Event-specific metadata validation rules
 * Ensures metadata contains required fields and valid values
 */

/**
 * Metadata schemas for each event category
 * Defines required and optional fields with validation rules
 */
const METADATA_SCHEMAS = {
    // INTAKE EVENTS
    intake: {
        arrival: {
            optional: ['source', 'transport_method', 'condition', 'estimated_age']
        },
        rescue: {
            required: ['rescue_location', 'rescue_reason'],
            optional: ['rescue_organization', 'condition', 'estimated_age']
        },
        surrender: {
            required: ['surrender_reason'],
            optional: ['previous_owner_info', 'condition', 'history']
        },
        transfer_in: {
            required: ['origin_facility', 'transfer_reason'],
            optional: ['transport_method', 'condition', 'medical_records']
        },
        stray: {
            required: ['found_location'],
            optional: ['finder_info', 'condition', 'estimated_age']
        }
    },

    // MEDICAL EVENTS
    medical: {
        vaccination: {
            required: ['vaccine_type', 'dose'],
            optional: ['batch_number', 'expiration_date', 'administrator', 'next_due_date']
        },
        surgery: {
            required: ['procedure_type', 'outcome'],
            optional: ['surgeon', 'duration_minutes', 'anesthesia_type', 'complications']
        },
        treatment: {
            required: ['treatment_type', 'diagnosis'],
            optional: ['medication', 'dosage', 'duration_days', 'response']
        },
        checkup: {
            required: ['health_status'],
            optional: ['weight_kg', 'temperature_c', 'heart_rate', 'findings']
        },
        diagnosis: {
            required: ['condition', 'severity'],
            optional: ['diagnostic_tests', 'treatment_plan', 'prognosis']
        },
        medication: {
            required: ['medication_name', 'dosage', 'frequency'],
            optional: ['route', 'duration_days', 'prescriber']
        },
        lab_test: {
            required: ['test_type', 'results'],
            optional: ['lab_name', 'reference_range', 'interpretation']
        },
        emergency: {
            required: ['emergency_type', 'response_action'],
            optional: ['severity', 'outcome', 'follow_up_required']
        }
    },

    // CARE EVENTS
    care: {
        feeding: {
            required: ['food_type', 'quantity'],
            optional: ['unit', 'appetite', 'dietary_notes']
        },
        exercise: {
            required: ['activity_type', 'duration_minutes'],
            optional: ['intensity', 'behavior', 'location']
        },
        grooming: {
            required: ['grooming_type'],
            optional: ['products_used', 'condition_noted', 'behavior']
        },
        socialization: {
            required: ['interaction_type'],
            optional: ['duration_minutes', 'participants', 'behavior', 'progress']
        },
        enrichment: {
            required: ['enrichment_type'],
            optional: ['duration_minutes', 'response', 'items_used']
        },
        training: {
            required: ['training_type', 'outcome'],
            optional: ['duration_minutes', 'techniques_used', 'progress', 'challenges']
        },
        observation: {
            required: ['observation_type', 'findings'],
            optional: ['behavior', 'health_indicators', 'concerns']
        }
    },

    // TRANSFER EVENTS
    transfer: {
        foster: {
            required: ['destination_type'],
            optional: ['foster_caregiver_id', 'expected_duration_days', 'conditions']
        },
        temporary_care: {
            required: ['reason', 'destination_type'],
            optional: ['expected_return_date', 'caregiver_info']
        },
        facility_transfer: {
            required: ['destination_facility', 'transfer_reason'],
            optional: ['transport_method', 'transfer_paperwork', 'receiving_staff']
        },
        transport: {
            required: ['origin', 'destination', 'transport_method'],
            optional: ['duration_minutes', 'condition_on_arrival']
        },
        quarantine: {
            required: ['quarantine_reason', 'expected_duration_days'],
            optional: ['isolation_location', 'monitoring_protocol']
        }
    },

    // OUTCOME EVENTS
    outcome: {
        adoption: {
            required: ['adopter_verified'],
            optional: ['adoption_fee', 'follow_up_scheduled', 'conditions']
        },
        return_to_wild: {
            required: ['release_location', 'release_assessment'],
            optional: ['tracking_method', 'monitoring_plan']
        },
        transfer_out: {
            required: ['destination_facility', 'transfer_reason'],
            optional: ['transfer_paperwork', 'receiving_organization']
        },
        deceased: {
            required: ['cause_of_death'],
            optional: ['necropsy_performed', 'contributing_factors', 'age_at_death']
        },
        euthanasia: {
            required: ['reason', 'authorized_by'],
            optional: ['method', 'quality_of_life_assessment']
        },
        return_to_owner: {
            required: ['owner_verified'],
            optional: ['reunion_conditions', 'follow_up_required']
        }
    }
};

/**
 * Validate metadata for a specific event
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category of event
 * @param {Object} metadata - Metadata to validate
 * @returns {Object} Validation result { valid: boolean, errors: Array, warnings: Array }
 */
function validateMetadata(eventType, eventCategory, metadata) {
    const errors = [];
    const warnings = [];

    // Get schema for this event type/category
    const typeSchemas = METADATA_SCHEMAS[eventType];
    if (!typeSchemas) {
        errors.push(`Unknown event type: ${eventType}`);
        return { valid: false, errors, warnings };
    }

    const schema = typeSchemas[eventCategory];
    if (!schema) {
        errors.push(`Unknown event category '${eventCategory}' for type '${eventType}'`);
        return { valid: false, errors, warnings };
    }

    // Metadata can be null/undefined for events without required fields
    if (!metadata || typeof metadata !== 'object') {
        if (schema.required && schema.required.length > 0) {
            errors.push(`Metadata is required for ${eventType}/${eventCategory}`);
            errors.push(`Required fields: ${schema.required.join(', ')}`);
            return { valid: false, errors, warnings };
        }
        return { valid: true, errors, warnings };
    }

    // Check required fields
    if (schema.required) {
        schema.required.forEach(field => {
            if (!(field in metadata) || metadata[field] === null || metadata[field] === undefined || metadata[field] === '') {
                errors.push(`Missing required field: ${field}`);
            }
        });
    }

    // Check for unexpected fields (warning only)
    const allowedFields = [...(schema.required || []), ...(schema.optional || [])];
    Object.keys(metadata).forEach(field => {
        if (!allowedFields.includes(field)) {
            warnings.push(`Unexpected field: ${field}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get metadata schema for an event
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category of event
 * @returns {Object|null} Schema object or null if not found
 */
function getMetadataSchema(eventType, eventCategory) {
    const typeSchemas = METADATA_SCHEMAS[eventType];
    if (!typeSchemas) return null;
    return typeSchemas[eventCategory] || null;
}

/**
 * Get required fields for an event
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category of event
 * @returns {Array<string>} Array of required field names
 */
function getRequiredFields(eventType, eventCategory) {
    const schema = getMetadataSchema(eventType, eventCategory);
    return schema?.required || [];
}

/**
 * Get optional fields for an event
 * 
 * @param {string} eventType - Type of event
 * @param {string} eventCategory - Category of event
 * @returns {Array<string>} Array of optional field names
 */
function getOptionalFields(eventType, eventCategory) {
    const schema = getMetadataSchema(eventType, eventCategory);
    return schema?.optional || [];
}

module.exports = {
    METADATA_SCHEMAS,
    validateMetadata,
    getMetadataSchema,
    getRequiredFields,
    getOptionalFields
};
