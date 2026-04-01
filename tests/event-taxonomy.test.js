/**
 * Tests for Event Taxonomy
 * Validates event type/category mappings
 */

const {
    EVENT_TAXONOMY,
    getValidCategories,
    isValidCategory,
    validateEventCategory,
    getAllEventTypes,
    getEventTaxonomy
} = require('../packages/cel/validators/eventTaxonomy');

describe('Event Taxonomy', () => {
    describe('EVENT_TAXONOMY', () => {
        test('should have all 5 event types', () => {
            const eventTypes = Object.keys(EVENT_TAXONOMY);
            expect(eventTypes).toHaveLength(5);
            expect(eventTypes).toContain('intake');
            expect(eventTypes).toContain('medical');
            expect(eventTypes).toContain('care');
            expect(eventTypes).toContain('transfer');
            expect(eventTypes).toContain('outcome');
        });

        test('intake should have valid categories', () => {
            expect(EVENT_TAXONOMY.intake).toContain('arrival');
            expect(EVENT_TAXONOMY.intake).toContain('rescue');
            expect(EVENT_TAXONOMY.intake).toContain('surrender');
        });

        test('medical should have valid categories', () => {
            expect(EVENT_TAXONOMY.medical).toContain('vaccination');
            expect(EVENT_TAXONOMY.medical).toContain('surgery');
            expect(EVENT_TAXONOMY.medical).toContain('treatment');
        });

        test('care should have valid categories', () => {
            expect(EVENT_TAXONOMY.care).toContain('feeding');
            expect(EVENT_TAXONOMY.care).toContain('exercise');
            expect(EVENT_TAXONOMY.care).toContain('grooming');
        });

        test('transfer should have valid categories', () => {
            expect(EVENT_TAXONOMY.transfer).toContain('foster');
            expect(EVENT_TAXONOMY.transfer).toContain('temporary_care');
            expect(EVENT_TAXONOMY.transfer).toContain('facility_transfer');
        });

        test('outcome should have valid categories', () => {
            expect(EVENT_TAXONOMY.outcome).toContain('adoption');
            expect(EVENT_TAXONOMY.outcome).toContain('return_to_wild');
            expect(EVENT_TAXONOMY.outcome).toContain('deceased');
        });
    });

    describe('getValidCategories', () => {
        test('should return categories for intake', () => {
            const categories = getValidCategories('intake');
            expect(categories).toBeInstanceOf(Array);
            expect(categories.length).toBeGreaterThan(0);
            expect(categories).toContain('arrival');
        });

        test('should return categories for medical', () => {
            const categories = getValidCategories('medical');
            expect(categories).toContain('vaccination');
            expect(categories).toContain('surgery');
        });

        test('should be case-insensitive', () => {
            const lower = getValidCategories('medical');
            const upper = getValidCategories('MEDICAL');
            const mixed = getValidCategories('MeDiCaL');
            
            expect(lower).toEqual(upper);
            expect(lower).toEqual(mixed);
        });

        test('should trim whitespace', () => {
            const categories = getValidCategories('  medical  ');
            expect(categories).toContain('vaccination');
        });

        test('should throw error for invalid event type', () => {
            expect(() => getValidCategories('invalid')).toThrow('Invalid event type');
        });

        test('should throw error for missing event type', () => {
            expect(() => getValidCategories()).toThrow('Event type is required');
            expect(() => getValidCategories('')).toThrow('Event type is required');
        });
    });

    describe('isValidCategory', () => {
        test('should return true for valid combinations', () => {
            expect(isValidCategory('intake', 'arrival')).toBe(true);
            expect(isValidCategory('medical', 'vaccination')).toBe(true);
            expect(isValidCategory('care', 'feeding')).toBe(true);
            expect(isValidCategory('transfer', 'foster')).toBe(true);
            expect(isValidCategory('outcome', 'adoption')).toBe(true);
        });

        test('should return false for invalid combinations', () => {
            expect(isValidCategory('intake', 'vaccination')).toBe(false);
            expect(isValidCategory('medical', 'feeding')).toBe(false);
            expect(isValidCategory('care', 'adoption')).toBe(false);
        });

        test('should be case-insensitive for event type', () => {
            expect(isValidCategory('MEDICAL', 'vaccination')).toBe(true);
            expect(isValidCategory('medical', 'vaccination')).toBe(true);
            expect(isValidCategory('MeDiCaL', 'vaccination')).toBe(true);
        });

        test('should be case-insensitive for category', () => {
            expect(isValidCategory('medical', 'VACCINATION')).toBe(true);
            expect(isValidCategory('medical', 'vaccination')).toBe(true);
            expect(isValidCategory('medical', 'VaCcInAtIoN')).toBe(true);
        });

        test('should trim whitespace', () => {
            expect(isValidCategory('  medical  ', '  vaccination  ')).toBe(true);
        });

        test('should return false for invalid event type', () => {
            expect(isValidCategory('invalid', 'arrival')).toBe(false);
        });

        test('should return false for missing parameters', () => {
            expect(isValidCategory('', 'arrival')).toBe(false);
            expect(isValidCategory('intake', '')).toBe(false);
            expect(isValidCategory()).toBe(false);
        });
    });

    describe('validateEventCategory', () => {
        test('should not throw for valid combinations', () => {
            expect(() => validateEventCategory('intake', 'arrival')).not.toThrow();
            expect(() => validateEventCategory('medical', 'vaccination')).not.toThrow();
            expect(() => validateEventCategory('care', 'feeding')).not.toThrow();
        });

        test('should return true for valid combinations', () => {
            expect(validateEventCategory('intake', 'arrival')).toBe(true);
            expect(validateEventCategory('medical', 'surgery')).toBe(true);
        });

        test('should throw error for invalid category', () => {
            expect(() => validateEventCategory('intake', 'vaccination'))
                .toThrow("Invalid category 'vaccination' for event type 'intake'");
        });

        test('should throw error with helpful message', () => {
            expect(() => validateEventCategory('medical', 'invalid'))
                .toThrow('Valid categories:');
        });

        test('should throw error for missing parameters', () => {
            expect(() => validateEventCategory('', 'arrival'))
                .toThrow('Both eventType and eventCategory are required');
            expect(() => validateEventCategory('intake', ''))
                .toThrow('Both eventType and eventCategory are required');
        });

        test('should be case-insensitive', () => {
            expect(() => validateEventCategory('MEDICAL', 'VACCINATION')).not.toThrow();
        });
    });

    describe('getAllEventTypes', () => {
        test('should return all 5 event types', () => {
            const types = getAllEventTypes();
            expect(types).toHaveLength(5);
            expect(types).toEqual(['intake', 'medical', 'care', 'transfer', 'outcome']);
        });

        test('should return array', () => {
            const types = getAllEventTypes();
            expect(Array.isArray(types)).toBe(true);
        });
    });

    describe('getEventTaxonomy', () => {
        test('should return complete taxonomy', () => {
            const taxonomy = getEventTaxonomy();
            expect(taxonomy).toHaveProperty('intake');
            expect(taxonomy).toHaveProperty('medical');
            expect(taxonomy).toHaveProperty('care');
            expect(taxonomy).toHaveProperty('transfer');
            expect(taxonomy).toHaveProperty('outcome');
        });

        test('should return a copy (not reference)', () => {
            const taxonomy = getEventTaxonomy();
            taxonomy.intake.push('TEST');
            
            const fresh = getEventTaxonomy();
            expect(fresh.intake).not.toContain('TEST');
        });
    });

    describe('Taxonomy Coverage', () => {
        test('each event type should have at least 3 categories', () => {
            const types = getAllEventTypes();
            types.forEach(type => {
                const categories = getValidCategories(type);
                expect(categories.length).toBeGreaterThanOrEqual(3);
            });
        });

        test('no duplicate categories within event type', () => {
            const types = getAllEventTypes();
            types.forEach(type => {
                const categories = getValidCategories(type);
                const unique = [...new Set(categories)];
                expect(unique.length).toBe(categories.length);
            });
        });

        test('all categories should be lowercase', () => {
            const types = getAllEventTypes();
            types.forEach(type => {
                const categories = getValidCategories(type);
                categories.forEach(category => {
                    expect(category).toBe(category.toLowerCase());
                });
            });
        });
    });
});
