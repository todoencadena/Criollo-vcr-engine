/**
 * Tests for Advanced Queries
 * Multi-criteria search, pagination, sorting, and metadata filters
 */

const {
    advancedSearch,
    searchByMetadata,
    getEventsGroupedByDate,
    findSimilarEvents
} = require('../packages/cel/queries/advancedQueries');
const { createCareEvent } = require('../packages/cel/models/CareEvent');
const { hashAnimal, hashEnvironment, hashOperator } = require('../packages/privacy/hashing');
const { query } = require('../packages/ier/database/config');

describe('Advanced Queries', () => {
    const testSalt = 'advanced-test-salt-2026';
    let testAnimalHash1, testAnimalHash2;
    let testEnvironmentHash1, testEnvironmentHash2;
    let testOperatorHash;
    let event1Hash, event2Hash, event3Hash, event4Hash, event5Hash;

    beforeAll(async () => {
        // Generate test hashes
        testAnimalHash1 = hashAnimal('ADV_ANIMAL_1', '2024-01-01', testSalt);
        testAnimalHash2 = hashAnimal('ADV_ANIMAL_2', '2024-01-01', testSalt);
        testEnvironmentHash1 = hashEnvironment('Advanced Test Shelter 1', 2024, testSalt);
        testEnvironmentHash2 = hashEnvironment('Advanced Test Shelter 2', 2024, testSalt);
        testOperatorHash = hashOperator('Advanced Operator', 'VET', testSalt);

        // Clean up
        await query('TRUNCATE care_events CASCADE');

        // Create diverse test events
        const event1 = await createCareEvent({
            animalHash: testAnimalHash1,
            environmentHash: testEnvironmentHash1,
            operatorHash: testOperatorHash,
            eventType: 'intake',
            eventCategory: 'arrival',
            eventTimestamp: '2024-04-01T10:00:00Z',
            metadata: { source: 'rescue', condition: 'good' },
            notes: 'Healthy arrival from rescue operation'
        }, testSalt);
        event1Hash = event1.event_hash;

        const event2 = await createCareEvent({
            animalHash: testAnimalHash1,
            environmentHash: testEnvironmentHash1,
            operatorHash: testOperatorHash,
            eventType: 'medical',
            eventCategory: 'vaccination',
            eventTimestamp: '2024-04-05T14:00:00Z',
            metadata: { vaccine_type: 'rabies', dose: '1ml', batch_number: 'BATCH123' },
            notes: 'Rabies vaccination administered'
        }, testSalt);
        event2Hash = event2.event_hash;

        const event3 = await createCareEvent({
            animalHash: testAnimalHash2,
            environmentHash: testEnvironmentHash1,
            operatorHash: testOperatorHash,
            eventType: 'care',
            eventCategory: 'feeding',
            eventTimestamp: '2024-04-10T08:00:00Z',
            metadata: { food_type: 'dry kibble', quantity: '2 cups', appetite: 'good' },
            notes: 'Morning feeding completed'
        }, testSalt);
        event3Hash = event3.event_hash;

        const event4 = await createCareEvent({
            animalHash: testAnimalHash2,
            environmentHash: testEnvironmentHash2,
            operatorHash: testOperatorHash,
            eventType: 'medical',
            eventCategory: 'vaccination',
            eventTimestamp: '2024-04-15T11:00:00Z',
            metadata: { vaccine_type: 'DHPP', dose: '1ml', batch_number: 'BATCH456' },
            notes: 'DHPP vaccination administered'
        }, testSalt);
        event4Hash = event4.event_hash;

        const event5 = await createCareEvent({
            animalHash: testAnimalHash1,
            environmentHash: testEnvironmentHash1,
            operatorHash: testOperatorHash,
            eventType: 'outcome',
            eventCategory: 'adoption',
            eventTimestamp: '2024-04-20T16:00:00Z',
            metadata: { adopter_verified: true, adoption_fee: 150 },
            notes: 'Successful adoption to verified family'
        }, testSalt);
        event5Hash = event5.event_hash;
    });

    afterAll(async () => {
        await query('TRUNCATE care_events CASCADE');
    });

    describe('advancedSearch', () => {
        test('should return all events with no filters', async () => {
            const result = await advancedSearch();

            expect(result.events.length).toBe(5);
            expect(result.total).toBe(5);
            expect(result.hasMore).toBe(false);
        });

        test('should filter by single event type', async () => {
            const result = await advancedSearch({ eventTypes: ['medical'] });

            expect(result.events.length).toBe(2);
            expect(result.total).toBe(2);
            result.events.forEach(event => {
                expect(event.event_type).toBe('medical');
            });
        });

        test('should filter by multiple event types', async () => {
            const result = await advancedSearch({ eventTypes: ['intake', 'outcome'] });

            expect(result.events.length).toBe(2);
            expect(result.total).toBe(2);
        });

        test('should filter by event categories', async () => {
            const result = await advancedSearch({ eventCategories: ['vaccination'] });

            expect(result.events.length).toBe(2);
            result.events.forEach(event => {
                expect(event.event_category).toBe('vaccination');
            });
        });

        test('should filter by date range', async () => {
            const result = await advancedSearch({
                startDate: '2024-04-05',
                endDate: '2024-04-15'
            });

            expect(result.events.length).toBe(3);
            expect(result.total).toBe(3);
        });

        test('should filter by animal hash', async () => {
            const result = await advancedSearch({ animalHash: testAnimalHash1 });

            expect(result.events.length).toBe(3);
            result.events.forEach(event => {
                expect(event.animal_hash).toBe(testAnimalHash1);
            });
        });

        test('should filter by environment hash', async () => {
            const result = await advancedSearch({ environmentHash: testEnvironmentHash2 });

            expect(result.events.length).toBe(1);
            expect(result.events[0].environment_hash).toBe(testEnvironmentHash2);
        });

        test('should search in notes using full-text', async () => {
            const result = await advancedSearch({ searchText: 'vaccination' });

            expect(result.events.length).toBeGreaterThan(0);
            result.events.forEach(event => {
                expect(event.notes.toLowerCase()).toContain('vaccination');
            });
        });

        test('should combine multiple filters', async () => {
            const result = await advancedSearch({
                eventTypes: ['medical'],
                startDate: '2024-04-01',
                endDate: '2024-04-10',
                environmentHash: testEnvironmentHash1
            });

            expect(result.events.length).toBe(1);
            expect(result.events[0].event_type).toBe('medical');
        });

        test('should sort by event_timestamp ascending', async () => {
            const result = await advancedSearch({}, { sortBy: 'event_timestamp', sortOrder: 'asc' });

            for (let i = 1; i < result.events.length; i++) {
                const prev = new Date(result.events[i - 1].event_timestamp);
                const curr = new Date(result.events[i].event_timestamp);
                expect(prev <= curr).toBe(true);
            }
        });

        test('should sort by event_timestamp descending (default)', async () => {
            const result = await advancedSearch();

            for (let i = 1; i < result.events.length; i++) {
                const prev = new Date(result.events[i - 1].event_timestamp);
                const curr = new Date(result.events[i].event_timestamp);
                expect(prev >= curr).toBe(true);
            }
        });

        test('should paginate results', async () => {
            const page1 = await advancedSearch({}, { limit: 2, offset: 0 });
            const page2 = await advancedSearch({}, { limit: 2, offset: 2 });

            expect(page1.events.length).toBe(2);
            expect(page2.events.length).toBe(2);
            expect(page1.events[0].event_hash).not.toBe(page2.events[0].event_hash);
            expect(page1.hasMore).toBe(true);
        });

        test('should enforce maximum limit of 1000', async () => {
            const result = await advancedSearch({}, { limit: 5000 });

            expect(result.limit).toBe(1000);
        });

        test('should handle zero results gracefully', async () => {
    const result = await advancedSearch({ 
        eventTypes: ['medical'],
        startDate: '2025-01-01',  // Fecha futura = sin resultados
        endDate: '2025-12-31'
    });

    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
    });

    describe('searchByMetadata', () => {
        test('should find events by metadata field', async () => {
            const results = await searchByMetadata('medical', 'vaccination', {
                vaccine_type: 'rabies'
            });

            expect(results.length).toBe(1);
            expect(results[0].metadata.vaccine_type).toBe('rabies');
        });

        test('should find events by multiple metadata fields', async () => {
            const results = await searchByMetadata('care', 'feeding', {
                food_type: 'dry kibble',
                appetite: 'good'
            });

            expect(results.length).toBe(1);
            expect(results[0].metadata.food_type).toBe('dry kibble');
        });

        test('should return empty array when no matches', async () => {
            const results = await searchByMetadata('medical', 'vaccination', {
                vaccine_type: 'nonexistent'
            });

            expect(results).toEqual([]);
        });

        test('should support pagination', async () => {
            const results = await searchByMetadata('medical', 'vaccination', {}, {
                limit: 1,
                offset: 0
            });

            expect(results.length).toBe(1);
        });
    });

    describe('getEventsGroupedByDate', () => {
        test('should group events by day', async () => {
            const results = await getEventsGroupedByDate('2024-04-01', '2024-04-30', 'day');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('period');
            expect(results[0]).toHaveProperty('event_type');
            expect(results[0]).toHaveProperty('count');
        });

        test('should filter by event type when grouping', async () => {
            const results = await getEventsGroupedByDate('2024-04-01', '2024-04-30', 'day', {
                eventType: 'medical'
            });

            results.forEach(group => {
                expect(group.event_type).toBe('medical');
            });
        });

        test('should filter by environment when grouping', async () => {
            const results = await getEventsGroupedByDate('2024-04-01', '2024-04-30', 'day', {
                environmentHash: testEnvironmentHash1
            });

            expect(results.length).toBeGreaterThan(0);
        });

        test('should order results by date ascending', async () => {
            const results = await getEventsGroupedByDate('2024-04-01', '2024-04-30', 'day');

            for (let i = 1; i < results.length; i++) {
                const prev = new Date(results[i - 1].period);
                const curr = new Date(results[i].period);
                expect(prev <= curr).toBe(true);
            }
        });
    });

    describe('findSimilarEvents', () => {
        test('should find similar events by type and category', async () => {
            const similar = await findSimilarEvents(event2Hash);

            expect(similar.length).toBeGreaterThan(0);
            similar.forEach(event => {
                expect(event.event_type).toBe('medical');
                expect(event.event_category).toBe('vaccination');
                expect(event.event_hash).not.toBe(event2Hash);
            });
        });

        test('should limit number of similar events', async () => {
            const similar = await findSimilarEvents(event2Hash, 1);

            expect(similar.length).toBeLessThanOrEqual(1);
        });

        test('should return empty array for non-existent event', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const similar = await findSimilarEvents(fakeHash);

            expect(similar).toEqual([]);
        });

        test('should exclude the reference event itself', async () => {
            const similar = await findSimilarEvents(event2Hash);

            similar.forEach(event => {
                expect(event.event_hash).not.toBe(event2Hash);
            });
        });
    });
});
});
