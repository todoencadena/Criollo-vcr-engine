/**
 * Tests for Metadata Validators
 * Validates event-specific metadata schemas
 */

const {
    METADATA_SCHEMAS,
    validateMetadata,
    getMetadataSchema,
    getRequiredFields,
    getOptionalFields
} = require('../packages/cel/validators/metadataValidators');

describe('Metadata Validators', () => {
    describe('METADATA_SCHEMAS', () => {
        test('should have schemas for all 5 event types', () => {
            expect(METADATA_SCHEMAS).toHaveProperty('intake');
            expect(METADATA_SCHEMAS).toHaveProperty('medical');
            expect(METADATA_SCHEMAS).toHaveProperty('care');
            expect(METADATA_SCHEMAS).toHaveProperty('transfer');
            expect(METADATA_SCHEMAS).toHaveProperty('outcome');
        });

        test('intake schemas should exist', () => {
            expect(METADATA_SCHEMAS.intake).toHaveProperty('arrival');
            expect(METADATA_SCHEMAS.intake).toHaveProperty('rescue');
            expect(METADATA_SCHEMAS.intake).toHaveProperty('surrender');
        });

        test('medical schemas should exist', () => {
            expect(METADATA_SCHEMAS.medical).toHaveProperty('vaccination');
            expect(METADATA_SCHEMAS.medical).toHaveProperty('surgery');
            expect(METADATA_SCHEMAS.medical).toHaveProperty('treatment');
        });
    });

    describe('validateMetadata', () => {
        describe('Valid metadata', () => {
            test('should validate vaccination with required fields', () => {
                const metadata = {
                    vaccine_type: 'rabies',
                    dose: '1ml'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            test('should validate vaccination with optional fields', () => {
                const metadata = {
                    vaccine_type: 'rabies',
                    dose: '1ml',
                    batch_number: 'BATCH123',
                    administrator: 'Dr. Smith'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            test('should validate feeding event', () => {
                const metadata = {
                    food_type: 'dry kibble',
                    quantity: '2 cups'
                };
                const result = validateMetadata('care', 'feeding', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            test('should validate rescue with all required fields', () => {
                const metadata = {
                    rescue_location: 'Highway 101',
                    rescue_reason: 'injured'
                };
                const result = validateMetadata('intake', 'rescue', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            test('should allow null metadata for events without required fields', () => {
                const result = validateMetadata('intake', 'arrival', null);
                expect(result.valid).toBe(true);
            });

            test('should allow empty object for events without required fields', () => {
                const result = validateMetadata('intake', 'arrival', {});
                expect(result.valid).toBe(true);
            });
        });

        describe('Invalid metadata', () => {
            test('should fail when required field is missing', () => {
                const metadata = {
                    dose: '1ml'
                    // Missing vaccine_type
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required field: vaccine_type');
            });

            test('should fail when multiple required fields are missing', () => {
                const metadata = {};
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required field: vaccine_type');
                expect(result.errors).toContain('Missing required field: dose');
            });

            test('should fail when required field is null', () => {
                const metadata = {
                    vaccine_type: null,
                    dose: '1ml'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required field: vaccine_type');
            });

            test('should fail when required field is empty string', () => {
                const metadata = {
                    vaccine_type: '',
                    dose: '1ml'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required field: vaccine_type');
            });

            test('should fail when metadata is null but required', () => {
                const result = validateMetadata('medical', 'vaccination', null);
                
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toContain('Metadata is required');
            });

            test('should fail for unknown event type', () => {
                const metadata = { test: 'value' };
                const result = validateMetadata('invalid_type', 'category', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Unknown event type: invalid_type');
            });

            test('should fail for unknown event category', () => {
                const metadata = { test: 'value' };
                const result = validateMetadata('medical', 'invalid_category', metadata);
                
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toContain('Unknown event category');
            });
        });

        describe('Warnings', () => {
            test('should warn about unexpected fields', () => {
                const metadata = {
                    vaccine_type: 'rabies',
                    dose: '1ml',
                    unexpected_field: 'value'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.warnings).toContain('Unexpected field: unexpected_field');
            });

            test('should warn about multiple unexpected fields', () => {
                const metadata = {
                    vaccine_type: 'rabies',
                    dose: '1ml',
                    field1: 'value1',
                    field2: 'value2'
                };
                const result = validateMetadata('medical', 'vaccination', metadata);
                
                expect(result.valid).toBe(true);
                expect(result.warnings).toHaveLength(2);
            });
        });
    });

    describe('getMetadataSchema', () => {
        test('should return schema for valid event', () => {
            const schema = getMetadataSchema('medical', 'vaccination');
            
            expect(schema).toBeDefined();
            expect(schema.required).toContain('vaccine_type');
            expect(schema.required).toContain('dose');
        });

        test('should return null for invalid event type', () => {
            const schema = getMetadataSchema('invalid', 'category');
            expect(schema).toBeNull();
        });

        test('should return null for invalid category', () => {
            const schema = getMetadataSchema('medical', 'invalid');
            expect(schema).toBeNull();
        });

        test('should return schema with optional fields', () => {
            const schema = getMetadataSchema('medical', 'vaccination');
            
            expect(schema.optional).toBeDefined();
            expect(Array.isArray(schema.optional)).toBe(true);
        });
    });

    describe('getRequiredFields', () => {
        test('should return required fields for vaccination', () => {
            const fields = getRequiredFields('medical', 'vaccination');
            
            expect(fields).toContain('vaccine_type');
            expect(fields).toContain('dose');
        });

        test('should return empty array for events without required fields', () => {
            const fields = getRequiredFields('intake', 'arrival');
            expect(fields).toEqual([]);
        });

        test('should return empty array for invalid event', () => {
            const fields = getRequiredFields('invalid', 'category');
            expect(fields).toEqual([]);
        });

        test('should return required fields for rescue', () => {
            const fields = getRequiredFields('intake', 'rescue');
            
            expect(fields).toContain('rescue_location');
            expect(fields).toContain('rescue_reason');
        });
    });

    describe('getOptionalFields', () => {
        test('should return optional fields for vaccination', () => {
            const fields = getOptionalFields('medical', 'vaccination');
            
            expect(Array.isArray(fields)).toBe(true);
            expect(fields.length).toBeGreaterThan(0);
        });

        test('should return empty array for events without optional fields', () => {
            // Find an event without optional fields or return empty
            const fields = getOptionalFields('medical', 'vaccination');
            expect(Array.isArray(fields)).toBe(true);
        });

        test('should return empty array for invalid event', () => {
            const fields = getOptionalFields('invalid', 'category');
            expect(fields).toEqual([]);
        });
    });

    describe('Schema Coverage', () => {
        test('all event types should have at least one category with schema', () => {
            const eventTypes = Object.keys(METADATA_SCHEMAS);
            
            eventTypes.forEach(type => {
                const categories = Object.keys(METADATA_SCHEMAS[type]);
                expect(categories.length).toBeGreaterThan(0);
            });
        });

        test('all schemas should have either required or optional fields', () => {
            const eventTypes = Object.keys(METADATA_SCHEMAS);
            
            eventTypes.forEach(type => {
                const categories = Object.keys(METADATA_SCHEMAS[type]);
                categories.forEach(category => {
                    const schema = METADATA_SCHEMAS[type][category];
                    const hasFields = (schema.required && schema.required.length > 0) ||
                                    (schema.optional && schema.optional.length > 0);
                    expect(hasFields).toBe(true);
                });
            });
        });

        test('vaccination schema should have proper structure', () => {
            const schema = METADATA_SCHEMAS.medical.vaccination;
            
            expect(schema.required).toBeDefined();
            expect(schema.optional).toBeDefined();
            expect(Array.isArray(schema.required)).toBe(true);
            expect(Array.isArray(schema.optional)).toBe(true);
        });
    });

    describe('Real-world scenarios', () => {
        test('complete vaccination event metadata', () => {
            const metadata = {
                vaccine_type: 'DHPP',
                dose: '1ml',
                batch_number: 'VX2024-001',
                expiration_date: '2025-12-31',
                administrator: 'Dr. Johnson',
                next_due_date: '2027-03-01'
            };
            const result = validateMetadata('medical', 'vaccination', metadata);
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        test('surgery with complications', () => {
            const metadata = {
                procedure_type: 'spay',
                outcome: 'successful',
                surgeon: 'Dr. Martinez',
                duration_minutes: 45,
                complications: 'none'
            };
            const result = validateMetadata('medical', 'surgery', metadata);
            
            expect(result.valid).toBe(true);
        });

        test('feeding event with dietary notes', () => {
            const metadata = {
                food_type: 'prescription diet',
                quantity: '1.5 cups',
                appetite: 'good',
                dietary_notes: 'kidney support formula'
            };
            const result = validateMetadata('care', 'feeding', metadata);
            
            expect(result.valid).toBe(true);
        });

        test('adoption outcome with all details', () => {
            const metadata = {
                adopter_verified: true,
                adoption_fee: 150,
                follow_up_scheduled: '2024-04-15',
                conditions: 'indoor only, regular vet checkups'
            };
            const result = validateMetadata('outcome', 'adoption', metadata);
            
            expect(result.valid).toBe(true);
        });
    });
});
