/**
 * Tests for Care Event Hashing
 * Validates hashCareEvent function with all event types
 */

const { hashCareEvent, hashAnimal, hashEnvironment } = require('../packages/privacy/hashing');

describe('hashCareEvent', () => {
    const testSalt = 'test-salt-2026';
    
    // Generate valid animal and environment hashes for testing
    const validAnimalHash = hashAnimal('123456789', '2024-01-15', testSalt);
    const validEnvironmentHash = hashEnvironment('Test Shelter', 2024, testSalt);

    describe('Basic Functionality', () => {
        test('should generate consistent hash for same inputs', () => {
            const hash1 = hashCareEvent(
                validAnimalHash,
                validEnvironmentHash,
                'intake',
                '2024-01-15T10:30:00Z',
                testSalt
            );
            const hash2 = hashCareEvent(
                validAnimalHash,
                validEnvironmentHash,
                'intake',
                '2024-01-15T10:30:00Z',
                testSalt
            );

            expect(hash1).toBe(hash2);
        });

        test('should generate different hash for different animal', () => {
            const differentAnimalHash = hashAnimal('987654321', '2024-01-15', testSalt);
            
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(differentAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);

            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hash for different environment', () => {
            const differentEnvironmentHash = hashEnvironment('Different Shelter', 2024, testSalt);
            
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(validAnimalHash, differentEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);

            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hash for different event type', () => {
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'medical', '2024-01-15T10:30:00Z', testSalt);

            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hash for different timestamp', () => {
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:31:00Z', testSalt);

            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hash for different salt', () => {
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', 'salt1');
            const hash2 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', 'salt2');

            expect(hash1).not.toBe(hash2);
        });

        test('hash should be 64 characters long (SHA-256)', () => {
            const hash = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            expect(hash).toHaveLength(64);
        });

        test('hash should be hexadecimal', () => {
            const hash = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    describe('Event Type Validation', () => {
        test('should accept "intake" event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should accept "medical" event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'medical', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should accept "care" event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'care', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should accept "transfer" event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'transfer', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should accept "outcome" event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'outcome', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should be case-insensitive for event type', () => {
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'INTAKE', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            expect(hash1).toBe(hash2);
        });

        test('should throw error for invalid event type', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'invalid', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow('Invalid event type');
        });
    });

    describe('Parameter Validation', () => {
        test('should throw error if animalHash is missing', () => {
            expect(() => {
                hashCareEvent('', validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow('All parameters are required');
        });

        test('should throw error if environmentHash is missing', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, '', 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow('All parameters are required');
        });

        test('should throw error if eventType is missing', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, '', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow();
        });

        test('should throw error if eventTimestamp is missing', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '', testSalt);
            }).toThrow('All parameters are required');
        });

        test('should throw error if salt is missing', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', '');
            }).toThrow('All parameters are required');
        });

        test('should throw error for invalid animalHash format', () => {
            expect(() => {
                hashCareEvent('invalid-hash', validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow('Invalid animalHash format');
        });

        test('should throw error for invalid environmentHash format', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, 'invalid-hash', 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).toThrow('Invalid environmentHash format');
        });
    });

    describe('Timestamp Handling', () => {
        test('should handle ISO 8601 timestamps', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            }).not.toThrow();
        });

        test('should handle timestamps with timezone', () => {
            expect(() => {
                hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00-05:00', testSalt);
            }).not.toThrow();
        });

        test('should trim whitespace from timestamp', () => {
            const hash1 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '2024-01-15T10:30:00Z', testSalt);
            const hash2 = hashCareEvent(validAnimalHash, validEnvironmentHash, 'intake', '  2024-01-15T10:30:00Z  ', testSalt);
            expect(hash1).toBe(hash2);
        });
    });
});
