/**
 * Tests for Care Event Model
 * CRUD operations with zero-PII validation
 */

const { 
    createCareEvent, 
    getCareEventByHash,
    getCareEventsByAnimal,
    getCareEventsByEnvironment,
    getCareEventsByType,
    getCareEventsByDateRange,
    updateCareEvent,
    deleteCareEvent
} = require('../packages/cel/models/CareEvent');
const { hashAnimal, hashEnvironment, hashOperator } = require('../packages/privacy/hashing');
const { query } = require('../packages/ier/database/config');

describe('Care Event Model', () => {
    const testSalt = 'test-salt-2026';
    let testAnimalHash;
    let testEnvironmentHash;
    let testOperatorHash;
    let createdEventHash;

    beforeAll(async () => {
        // Generate test hashes
        testAnimalHash = hashAnimal('TEST123', '2024-01-15', testSalt);
        testEnvironmentHash = hashEnvironment('Test Shelter', 2024, testSalt);
        testOperatorHash = hashOperator('Dr. Test', 'VET', testSalt);

        // Clean up any existing test data
        await query('DELETE FROM care_events WHERE animal_hash = $1', [testAnimalHash]);
    });

    afterEach(async () => {
        // TRUNCATE with CASCADE skips row-level triggers, avoiding the FK violation
        // that occurs when the AFTER DELETE audit trigger fires after the parent row is gone.
        await query('TRUNCATE care_events CASCADE');
    });

    describe('createCareEvent', () => {
        test('should create a care event with all fields', async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                operatorHash: testOperatorHash,
                eventType: 'medical',
                eventCategory: 'vaccination',
                eventTimestamp: '2024-03-15T10:30:00Z',
                metadata: { vaccine_type: 'rabies', dose: '1ml' },
                notes: 'Annual rabies vaccination administered'
            };

            const result = await createCareEvent(eventData, testSalt);

            expect(result).toBeDefined();
            expect(result.event_hash).toBeDefined();
            expect(result.animal_hash).toBe(testAnimalHash);
            expect(result.environment_hash).toBe(testEnvironmentHash);
            expect(result.operator_hash).toBe(testOperatorHash);
            expect(result.event_type).toBe('medical');
            expect(result.event_category).toBe('vaccination');
            expect(result.event_date).toBe('2024-03-15');

            createdEventHash = result.event_hash;
        });

        test('should create event without optional fields', async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'care',
                eventCategory: 'feeding',
                eventTimestamp: '2024-03-15T08:00:00Z'
            };

            const result = await createCareEvent(eventData, testSalt);

            expect(result).toBeDefined();
            expect(result.operator_hash).toBeNull();
            expect(result.metadata).toBeNull();
            expect(result.notes).toBeNull();
        });

        test('should throw error if required fields are missing', async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'intake'
                // Missing eventCategory and eventTimestamp
            };

            await expect(createCareEvent(eventData, testSalt)).rejects.toThrow('Missing required fields');
        });

        test('should normalize event type to lowercase', async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'MEDICAL',
                eventCategory: 'checkup',
                eventTimestamp: '2024-03-15T09:00:00Z'
            };

            const result = await createCareEvent(eventData, testSalt);
            expect(result.event_type).toBe('medical');
        });
    });

    describe('getCareEventByHash', () => {
        beforeEach(async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'intake',
                eventCategory: 'arrival',
                eventTimestamp: '2024-03-15T10:00:00Z'
            };
            const created = await createCareEvent(eventData, testSalt);
            createdEventHash = created.event_hash;
        });

        test('should retrieve event by hash', async () => {
            const result = await getCareEventByHash(createdEventHash);

            expect(result).toBeDefined();
            expect(result.event_hash).toBe(createdEventHash);
            expect(result.animal_hash).toBe(testAnimalHash);
        });

        test('should return null for non-existent hash', async () => {
            const result = await getCareEventByHash('0000000000000000000000000000000000000000000000000000000000000000');
            expect(result).toBeNull();
        });
    });

    describe('getCareEventsByAnimal', () => {
        beforeEach(async () => {
            // Create multiple events for same animal
            const events = [
                { eventType: 'intake', eventCategory: 'arrival', eventTimestamp: '2024-03-15T10:00:00Z' },
                { eventType: 'medical', eventCategory: 'vaccination', eventTimestamp: '2024-03-16T11:00:00Z' },
                { eventType: 'care', eventCategory: 'feeding', eventTimestamp: '2024-03-17T08:00:00Z' }
            ];

            for (const event of events) {
                await createCareEvent({
                    animalHash: testAnimalHash,
                    environmentHash: testEnvironmentHash,
                    ...event
                }, testSalt);
            }
        });

        test('should retrieve all events for an animal', async () => {
            const results = await getCareEventsByAnimal(testAnimalHash);

            expect(results).toHaveLength(3);
            expect(results[0].animal_hash).toBe(testAnimalHash);
        });

        test('should return events in descending timestamp order', async () => {
            const results = await getCareEventsByAnimal(testAnimalHash);

            expect(new Date(results[0].event_timestamp).getTime())
                .toBeGreaterThan(new Date(results[1].event_timestamp).getTime());
            expect(new Date(results[1].event_timestamp).getTime())
                .toBeGreaterThan(new Date(results[2].event_timestamp).getTime());
        });

        test('should return empty array for animal with no events', async () => {
            const otherAnimalHash = hashAnimal('OTHER999', '2024-01-01', testSalt);
            const results = await getCareEventsByAnimal(otherAnimalHash);

            expect(results).toEqual([]);
        });
    });

    describe('getCareEventsByEnvironment', () => {
        beforeEach(async () => {
            await createCareEvent({
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'intake',
                eventCategory: 'arrival',
                eventTimestamp: '2024-03-15T10:00:00Z'
            }, testSalt);
        });

        test('should retrieve all events for an environment', async () => {
            const results = await getCareEventsByEnvironment(testEnvironmentHash);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].environment_hash).toBe(testEnvironmentHash);
        });
    });

    describe('getCareEventsByType', () => {
        beforeEach(async () => {
            const events = [
                { eventType: 'medical', eventCategory: 'vaccination', eventTimestamp: '2024-03-15T10:00:00Z' },
                { eventType: 'medical', eventCategory: 'surgery', eventTimestamp: '2024-03-16T11:00:00Z' },
                { eventType: 'care', eventCategory: 'feeding', eventTimestamp: '2024-03-17T08:00:00Z' }
            ];

            for (const event of events) {
                await createCareEvent({
                    animalHash: testAnimalHash,
                    environmentHash: testEnvironmentHash,
                    ...event
                }, testSalt);
            }
        });

        test('should retrieve events by type', async () => {
            const results = await getCareEventsByType('medical');

            expect(results).toHaveLength(2);
            results.forEach(event => {
                expect(event.event_type).toBe('medical');
            });
        });

        test('should handle case-insensitive event type', async () => {
            const results = await getCareEventsByType('MEDICAL');

            expect(results).toHaveLength(2);
        });
    });

    describe('getCareEventsByDateRange', () => {
        beforeEach(async () => {
            const events = [
                { eventTimestamp: '2024-03-10T10:00:00Z' },
                { eventTimestamp: '2024-03-15T10:00:00Z' },
                { eventTimestamp: '2024-03-20T10:00:00Z' }
            ];

            for (const event of events) {
                await createCareEvent({
                    animalHash: testAnimalHash,
                    environmentHash: testEnvironmentHash,
                    eventType: 'care',
                    eventCategory: 'feeding',
                    ...event
                }, testSalt);
            }
        });

        test('should retrieve events within date range', async () => {
            const results = await getCareEventsByDateRange('2024-03-12', '2024-03-18');

            expect(results).toHaveLength(1);
            expect(results[0].event_date).toBe('2024-03-15');
        });

        test('should include events on boundary dates', async () => {
            const results = await getCareEventsByDateRange('2024-03-10', '2024-03-20');

            expect(results).toHaveLength(3);
        });
    });

    describe('updateCareEvent', () => {
        beforeEach(async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'medical',
                eventCategory: 'vaccination',
                eventTimestamp: '2024-03-15T10:00:00Z',
                notes: 'Initial notes'
            };
            const created = await createCareEvent(eventData, testSalt);
            createdEventHash = created.event_hash;
        });

        test('should update event notes', async () => {
            const updates = { notes: 'Updated notes with additional information' };
            const result = await updateCareEvent(createdEventHash, updates);

            expect(result.notes).toBe('Updated notes with additional information');
        });

        test('should update event metadata', async () => {
            const updates = { metadata: { updated: true, reason: 'test' } };
            const result = await updateCareEvent(createdEventHash, updates);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.updated).toBe(true);
        });

        test('should update both notes and metadata', async () => {
            const updates = {
                notes: 'New notes',
                metadata: { key: 'value' }
            };
            const result = await updateCareEvent(createdEventHash, updates);

            expect(result.notes).toBe('New notes');
            expect(result.metadata.key).toBe('value');
        });

        test('should throw error if no updates provided', async () => {
            await expect(updateCareEvent(createdEventHash, {}))
                .rejects.toThrow('At least one field');
        });

        test('should return null for non-existent event', async () => {
            const result = await updateCareEvent('0000000000000000000000000000000000000000000000000000000000000000', { notes: 'test' });
            expect(result).toBeNull();
        });
    });

    describe('deleteCareEvent', () => {
        beforeEach(async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                eventType: 'care',
                eventCategory: 'feeding',
                eventTimestamp: '2024-03-15T10:00:00Z'
            };
            const created = await createCareEvent(eventData, testSalt);
            createdEventHash = created.event_hash;
        });

        test('should delete event and return true', async () => {
            const result = await deleteCareEvent(createdEventHash);
            expect(result).toBe(true);

            const retrieved = await getCareEventByHash(createdEventHash);
            expect(retrieved).toBeNull();
        });

        test('should return false for non-existent event', async () => {
            const result = await deleteCareEvent('0000000000000000000000000000000000000000000000000000000000000000');
            expect(result).toBe(false);
        });
    });
});
