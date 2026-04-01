/**
 * Tests for Timeline Queries
 * Tests event timeline and activity log functions
 */

const {
    getAnimalTimeline,
    getEnvironmentActivityLog,
    getOperatorActivityLog,
    getRecentEvents,
    getEventsByCategory
} = require('../packages/cel/queries/timeline');
const { createCareEvent } = require('../packages/cel/models/CareEvent');
const { hashAnimal, hashEnvironment, hashOperator } = require('../packages/privacy/hashing');
const { query } = require('../packages/ier/database/config');

describe('Timeline Queries', () => {
    const testSalt = 'test-salt-2026';
    let testAnimalHash;
    let testEnvironmentHash;
    let testOperatorHash;
    let event1Hash, event2Hash, event3Hash;

    beforeAll(async () => {
        // Generate test hashes
        testAnimalHash = hashAnimal('TIMELINE123', '2024-01-01', testSalt);
        testEnvironmentHash = hashEnvironment('Timeline Test Shelter', 2024, testSalt);
        testOperatorHash = hashOperator('Test Operator', 'STAFF', testSalt);

        // Clean up any existing test data
        await query('TRUNCATE care_events CASCADE');

        // Create test events
        const event1 = await createCareEvent({
            animalHash: testAnimalHash,
            environmentHash: testEnvironmentHash,
            operatorHash: testOperatorHash,
            eventType: 'intake',
            eventCategory: 'arrival',
            eventTimestamp: '2024-03-01T10:00:00Z',
            metadata: { source: 'rescue' }
        }, testSalt);
        event1Hash = event1.event_hash;

        const event2 = await createCareEvent({
            animalHash: testAnimalHash,
            environmentHash: testEnvironmentHash,
            operatorHash: testOperatorHash,
            eventType: 'medical',
            eventCategory: 'vaccination',
            eventTimestamp: '2024-03-05T14:00:00Z',
            metadata: { vaccine_type: 'rabies', dose: '1ml' }
        }, testSalt);
        event2Hash = event2.event_hash;

        const event3 = await createCareEvent({
            animalHash: testAnimalHash,
            environmentHash: testEnvironmentHash,
            operatorHash: testOperatorHash,
            eventType: 'care',
            eventCategory: 'feeding',
            eventTimestamp: '2024-03-10T08:00:00Z',
            metadata: { food_type: 'kibble', quantity: '2 cups' }
        }, testSalt);
        event3Hash = event3.event_hash;
    });

    afterAll(async () => {
        // Clean up
        await query('TRUNCATE care_events CASCADE');
    });

    describe('getAnimalTimeline', () => {
        test('should return all events for an animal in chronological order', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash);

            expect(timeline).toHaveLength(3);
            expect(timeline[0].event_type).toBe('intake');
            expect(timeline[1].event_type).toBe('medical');
            expect(timeline[2].event_type).toBe('care');
        });

        test('should filter by start date', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash, {
                startDate: '2024-03-05'
            });

            expect(timeline).toHaveLength(2);
            expect(timeline[0].event_type).toBe('medical');
            expect(timeline[1].event_type).toBe('care');
        });

        test('should filter by end date', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash, {
                endDate: '2024-03-05'
            });

            expect(timeline).toHaveLength(2);
            expect(timeline[0].event_type).toBe('intake');
            expect(timeline[1].event_type).toBe('medical');
        });

        test('should filter by date range', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash, {
                startDate: '2024-03-02',
                endDate: '2024-03-08'
            });

            expect(timeline).toHaveLength(1);
            expect(timeline[0].event_type).toBe('medical');
        });

        test('should filter by event types', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash, {
                eventTypes: ['medical', 'care']
            });

            expect(timeline).toHaveLength(2);
            expect(timeline[0].event_type).toBe('medical');
            expect(timeline[1].event_type).toBe('care');
        });

        test('should return empty array for non-existent animal', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const timeline = await getAnimalTimeline(fakeHash);

            expect(timeline).toEqual([]);
        });
    });

    describe('getEnvironmentActivityLog', () => {
        test('should return all events for an environment', async () => {
            const log = await getEnvironmentActivityLog(testEnvironmentHash);

            expect(log).toHaveLength(3);
            expect(log[0].environment_hash).toBe(testEnvironmentHash);
        });

        test('should return events in reverse chronological order', async () => {
            const log = await getEnvironmentActivityLog(testEnvironmentHash);

            expect(log[0].event_type).toBe('care'); // Most recent
            expect(log[2].event_type).toBe('intake'); // Oldest
        });

        test('should filter by date range', async () => {
            const log = await getEnvironmentActivityLog(testEnvironmentHash, {
                startDate: '2024-03-05',
                endDate: '2024-03-10'
            });

            expect(log).toHaveLength(2);
        });

        test('should limit results', async () => {
            const log = await getEnvironmentActivityLog(testEnvironmentHash, {
                limit: 2
            });

            expect(log).toHaveLength(2);
        });

        test('should filter by event types', async () => {
            const log = await getEnvironmentActivityLog(testEnvironmentHash, {
                eventTypes: ['medical']
            });

            expect(log).toHaveLength(1);
            expect(log[0].event_type).toBe('medical');
        });
    });

    describe('getOperatorActivityLog', () => {
        test('should return all events performed by operator', async () => {
            const log = await getOperatorActivityLog(testOperatorHash);

            expect(log).toHaveLength(3);
            expect(log[0].operator_hash).toBe(testOperatorHash);
        });

        test('should return events in reverse chronological order', async () => {
            const log = await getOperatorActivityLog(testOperatorHash);

            expect(log[0].event_type).toBe('care');
            expect(log[2].event_type).toBe('intake');
        });

        test('should filter by date range', async () => {
            const log = await getOperatorActivityLog(testOperatorHash, {
                startDate: '2024-03-01',
                endDate: '2024-03-05'
            });

            expect(log).toHaveLength(2);
        });

        test('should limit results', async () => {
            const log = await getOperatorActivityLog(testOperatorHash, {
                limit: 1
            });

            expect(log).toHaveLength(1);
        });
    });

    describe('getRecentEvents', () => {
        test('should return recent events with default limit', async () => {
            const events = await getRecentEvents();

            expect(events.length).toBeGreaterThan(0);
            expect(events.length).toBeLessThanOrEqual(50);
        });

        test('should respect custom limit', async () => {
            const events = await getRecentEvents(2);

            expect(events).toHaveLength(2);
        });

        test('should filter by event types', async () => {
            const events = await getRecentEvents(10, ['medical']);

            events.forEach(event => {
                expect(event.event_type).toBe('medical');
            });
        });

        test('should return events in reverse chronological order', async () => {
            const events = await getRecentEvents(3);

            const timestamps = events.map(e => new Date(e.event_timestamp).getTime());
            for (let i = 1; i < timestamps.length; i++) {
                expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
            }
        });
    });

    describe('getEventsByCategory', () => {
        test('should return events by specific category', async () => {
            const events = await getEventsByCategory('medical', 'vaccination');

            expect(events).toHaveLength(1);
            expect(events[0].event_category).toBe('vaccination');
        });

        test('should filter by date range', async () => {
            const events = await getEventsByCategory('care', 'feeding', {
                startDate: '2024-03-10',
                endDate: '2024-03-15'
            });

            expect(events).toHaveLength(1);
        });

        test('should limit results', async () => {
            const events = await getEventsByCategory('medical', 'vaccination', {
                limit: 1
            });

            expect(events).toHaveLength(1);
        });

        test('should return empty array for non-existent category', async () => {
            const events = await getEventsByCategory('care', 'nonexistent');

            expect(events).toEqual([]);
        });
    });

    describe('Integration scenarios', () => {
        test('should track complete animal journey', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash);

            expect(timeline[0].event_category).toBe('arrival');
            expect(timeline[1].event_category).toBe('vaccination');
            expect(timeline[2].event_category).toBe('feeding');
        });

        test('should combine filters effectively', async () => {
            const timeline = await getAnimalTimeline(testAnimalHash, {
                startDate: '2024-03-01',
                endDate: '2024-03-31',
                eventTypes: ['medical', 'care']
            });

            expect(timeline).toHaveLength(2);
            expect(timeline.every(e => ['medical', 'care'].includes(e.event_type))).toBe(true);
        });
    });
});
