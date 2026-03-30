const {
    validateNPICompliance,
    isForbiddenField,
    getForbiddenFields,
    FORBIDDEN_FIELDS
} = require('../packages/privacy/npi-compliance');

describe('NPI Compliance - validateNPICompliance', () => {
    test('should pass validation for compliant data (only hashes)', () => {
        const compliantData = {
            animal_hash: '0xabc123...',
            environment_hash: '0xdef456...',
            operator_hash: '0x789ghi...',
            event_type: 'clinical_vaccination',
            timestamp: 1711382400,
            status: 1
        };

        expect(validateNPICompliance(compliantData)).toBe(true);
    });

    test('should throw error if animal_name is present', () => {
        const violatingData = {
            animal_hash: '0xabc123...',
            animal_name: 'Max'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('NPI Compliance Violation');

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('animal_name');
    });

    test('should throw error if shelter_name is present', () => {
        const violatingData = {
            environment_hash: '0xdef456...',
            shelter_name: 'Refugio Patitas'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('shelter_name');
    });

    test('should throw error if address is present', () => {
        const violatingData = {
            environment_hash: '0xdef456...',
            address: '123 Main Street'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('address');
    });

    test('should throw error if email is present', () => {
        const violatingData = {
            operator_hash: '0x789ghi...',
            email: 'vet@example.com'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('email');
    });

    test('should throw error if phone is present', () => {
        const violatingData = {
            operator_hash: '0x789ghi...',
            phone: '555-1234'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('phone');
    });

    test('should throw error for multiple violations', () => {
        const violatingData = {
            animal_hash: '0xabc123...',
            animal_name: 'Max',
            breed: 'Golden Retriever',
            owner_name: 'John Doe'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('animal_name');
    });

    test('should include context in error message', () => {
        const violatingData = {
            name: 'Test'
        };

        expect(() => {
            validateNPICompliance(violatingData, 'care event');
        }).toThrow('care event');
    });

    test('should throw error if data is null', () => {
        expect(() => {
            validateNPICompliance(null);
        }).toThrow('Data must be a non-null object');
    });

    test('should throw error if data is not an object', () => {
        expect(() => {
            validateNPICompliance('string');
        }).toThrow('Data must be a non-null object');
    });

    test('should pass for empty object', () => {
        expect(validateNPICompliance({})).toBe(true);
    });

    test('should detect SSN field', () => {
        const violatingData = {
            operator_hash: '0x789ghi...',
            ssn: '123-45-6789'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('ssn');
    });

    test('should detect credit_card field', () => {
        const violatingData = {
            payment_hash: '0xabc...',
            credit_card: '4111-1111-1111-1111'
        };

        expect(() => {
            validateNPICompliance(violatingData);
        }).toThrow('credit_card');
    });
});

describe('NPI Compliance - isForbiddenField', () => {
    test('should return true for forbidden field', () => {
        expect(isForbiddenField('animal_name')).toBe(true);
        expect(isForbiddenField('email')).toBe(true);
        expect(isForbiddenField('address')).toBe(true);
    });

    test('should return false for allowed field', () => {
        expect(isForbiddenField('animal_hash')).toBe(false);
        expect(isForbiddenField('timestamp')).toBe(false);
        expect(isForbiddenField('event_type')).toBe(false);
    });

    test('should be case-sensitive', () => {
        expect(isForbiddenField('animal_name')).toBe(true);
        expect(isForbiddenField('ANIMAL_NAME')).toBe(false);
    });
});

describe('NPI Compliance - getForbiddenFields', () => {
    test('should return array of forbidden fields', () => {
        const fields = getForbiddenFields();

        expect(Array.isArray(fields)).toBe(true);
        expect(fields.length).toBeGreaterThan(0);
    });

    test('should include known PII fields', () => {
        const fields = getForbiddenFields();

        expect(fields).toContain('animal_name');
        expect(fields).toContain('shelter_name');
        expect(fields).toContain('email');
        expect(fields).toContain('address');
    });

    test('should return a copy (not modify original)', () => {
        const fields1 = getForbiddenFields();
        const fields2 = getForbiddenFields();

        fields1.push('test_field');

        expect(fields2).not.toContain('test_field');
    });
});

describe('NPI Compliance - FORBIDDEN_FIELDS constant', () => {
    test('should have expected number of forbidden fields', () => {
        expect(FORBIDDEN_FIELDS.length).toBeGreaterThanOrEqual(50);
    });

    test('should include all PII categories', () => {
        // Animal identity
        expect(FORBIDDEN_FIELDS).toContain('animal_name');
        expect(FORBIDDEN_FIELDS).toContain('breed');

        // Environment identity
        expect(FORBIDDEN_FIELDS).toContain('shelter_name');
        expect(FORBIDDEN_FIELDS).toContain('address');

        // Operator identity
        expect(FORBIDDEN_FIELDS).toContain('operator_name');
        expect(FORBIDDEN_FIELDS).toContain('email');

        // Financial PII
        expect(FORBIDDEN_FIELDS).toContain('credit_card');
        expect(FORBIDDEN_FIELDS).toContain('ssn');
    });
});
