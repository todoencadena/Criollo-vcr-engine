/**
 * Tests for Event Aggregations
 * Tests statistical analysis and metrics functions
 */

const {
    getEventStatsByType,
    getEventStatsByCategory,
    getDailyEventCounts,
    getAnimalCareMetrics,
    getEnvironmentActivitySummary,
    getOperatorActivitySummary
} = require('../packages/cel/queries/aggregations');
const { createCareEvent } = require('../packages/cel/models/CareEvent');
const { hashAnimal, hashEnvironment, hashOperator } = require('../packages/privacy/hashing');
const { query } = require('../packages/ier/database/config');

describe('Event Aggregations', () => {
    const testSalt = 'test-salt-2026';
    let testAnimalHash1, testAnimalHash2;
    let testEnvironmentHash;
    let testOperatorHash1, testOperatorHash2;

    beforeAll(async () => {
        // Generate test hashes
        testAnimalHash1 = hashAnimal('AGG_ANIMAL_1', '2024-01-01', testSalt);
        testAnimalHash2 = hashAnimal('AGG_ANIMAL_2', '2024-01-01', testSalt);
        testEnvironmentHash = hashEnvironment('Aggregation Test Shelter', 2024, testSalt);
        testOperatorHash1 = hashOperator('Operator 1', 'VET', testSalt);
        testOperatorHash2 = hashOperator('Operator 2', 'STAFF', testSalt);

        // Clean up
        await query('TRUNCATE care_events CASCADE');

        // Create diverse test events
        const events = [
            // Animal 1 - Multiple event types
            { animalHash: testAnimalHash1, operatorHash: testOperatorHash1, eventType: 'intake', eventCategory: 'arrival', eventTimestamp: '2024-03-01T10:00:00Z' },
            { animalHash: testAnimalHash1, operatorHash: testOperatorHash1, eventType: 'medical', eventCategory: 'vaccination', eventTimestamp: '2024-03-02T11:00:00Z' },
            { animalHash: testAnimalHash1, operatorHash: testOperatorHash2, eventType: 'care', eventCategory: 'feeding', eventTimestamp: '2024-03-03T08:00:00Z' },
            { animalHash: testAnimalHash1, operatorHash: testOperatorHash2, eventType: 'care', eventCategory: 'exercise', eventTimestamp: '2024-03-03T14:00:00Z' },
            { animalHash: testAnimalHash1, operatorHash: testOperatorHash1, eventType: 'medical', eventCategory: 'checkup', eventTimestamp: '2024-03-05T09:00:00Z' },
            
            // Animal 2 - Different pattern
            { animalHash: testAnimalHash2, operatorHash: testOperatorHash2, eventType: 'intake', eventCategory: 'rescue', eventTimestamp: '2024-03-10T12:00:00Z' },
            { animalHash: testAnimalHash2, operatorHash: testOperatorHash1, eventType: 'medical', eventCategory: 'surgery', eventTimestamp: '2024-03-11T10:00:00Z' },
            { animalHash: testAnimalHash2, operatorHash: testOperatorHash2, eventType: 'outcome', eventCategory: 'adoption', eventTimestamp: '2024-03-15T15:00:00Z' }
        ];

        for (const event of events) {
            await createCareEvent({
                animalHash: event.animalHash,
                environmentHash: testEnvironmentHash,
                operatorHash: event.operatorHash,
                eventType: event.eventType,
                eventCategory: event.eventCategory,
                eventTimestamp: event.eventTimestamp,
                metadata: { test: true }
            }, testSalt);
        }
    });

    afterAll(async () => {
        await query('TRUNCATE care_events CASCADE');
    });

    describe('getEventStatsByType', () => {
        test('should return counts grouped by event type', async () => {
            const stats = await getEventStatsByType();

            expect(stats.length).toBeGreaterThan(0);
            expect(stats[0]).toHaveProperty('event_type');
            expect(stats[0]).toHaveProperty('count');
            expect(typeof stats[0].count).toBe('number');
        });

        test('should include all event types', async () => {
            const stats = await getEventStatsByType();
            const types = stats.map(s => s.event_type);

            expect(types).toContain('intake');
            expect(types).toContain('medical');
            expect(types).toContain('care');
        });

        test('should filter by date range', async () => {
            const stats = await getEventStatsByType({
                startDate: '2024-03-01',
                endDate: '2024-03-05'
            });

            const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
            expect(totalCount).toBeLessThan(8); // Should exclude later events
        });

        test('should filter by animal', async () => {
            const stats = await getEventStatsByType({
                animalHash: testAnimalHash1
            });

            const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
            expect(totalCount).toBe(5);
        });

        test('should filter by environment', async () => {
            const stats = await getEventStatsByType({
                environmentHash: testEnvironmentHash
            });

            expect(stats.length).toBeGreaterThan(0);
        });
    });

    describe('getEventStatsByCategory', () => {
        test('should return counts grouped by type and category', async () => {
            const stats = await getEventStatsByCategory();

            expect(stats.length).toBeGreaterThan(0);
            expect(stats[0]).toHaveProperty('event_type');
            expect(stats[0]).toHaveProperty('event_category');
            expect(stats[0]).toHaveProperty('count');
        });

        test('should show multiple categories per type', async () => {
            const stats = await getEventStatsByCategory();
            const medicalStats = stats.filter(s => s.event_type === 'medical');

            expect(medicalStats.length).toBeGreaterThan(1);
        });

        test('should filter by date range', async () => {
            const stats = await getEventStatsByCategory({
                startDate: '2024-03-10',
                endDate: '2024-03-31'
            });

            const categories = stats.map(s => s.event_category);
            expect(categories).not.toContain('arrival'); // Before date range
        });
    });

    describe('getDailyEventCounts', () => {
        test('should return daily counts for date range', async () => {
            const counts = await getDailyEventCounts('2024-03-01', '2024-03-15');

            expect(counts.length).toBeGreaterThan(0);
            expect(counts[0]).toHaveProperty('date');
            expect(counts[0]).toHaveProperty('count');
        });

        test('should be ordered by date ascending', async () => {
            const counts = await getDailyEventCounts('2024-03-01', '2024-03-15');

            for (let i = 1; i < counts.length; i++) {
                expect(new Date(counts[i].date) >= new Date(counts[i - 1].date)).toBe(true);
            }
        });

        test('should filter by animal', async () => {
            const counts = await getDailyEventCounts('2024-03-01', '2024-03-15', {
                animalHash: testAnimalHash1
            });

            const totalCount = counts.reduce((sum, c) => sum + c.count, 0);
            expect(totalCount).toBe(5);
        });

        test('should filter by event type', async () => {
            const counts = await getDailyEventCounts('2024-03-01', '2024-03-15', {
                eventType: 'medical'
            });

            const totalCount = counts.reduce((sum, c) => sum + c.count, 0);
            expect(totalCount).toBe(3);
        });
    });

    describe('getAnimalCareMetrics', () => {
        test('should return comprehensive metrics for animal', async () => {
            const metrics = await getAnimalCareMetrics(testAnimalHash1);

            expect(metrics).toHaveProperty('animal_hash');
            expect(metrics).toHaveProperty('total_events');
            expect(metrics).toHaveProperty('events_by_type');
            expect(metrics).toHaveProperty('first_event_date');
            expect(metrics).toHaveProperty('last_event_date');
            expect(metrics).toHaveProperty('days_in_care');
        });

        test('should calculate total events correctly', async () => {
            const metrics = await getAnimalCareMetrics(testAnimalHash1);
            expect(metrics.total_events).toBe(5);
        });

        test('should break down events by type', async () => {
            const metrics = await getAnimalCareMetrics(testAnimalHash1);

            expect(metrics.events_by_type.intake).toBe(1);
            expect(metrics.events_by_type.medical).toBe(2);
            expect(metrics.events_by_type.care).toBe(2);
        });

        test('should calculate days in care', async () => {
            const metrics = await getAnimalCareMetrics(testAnimalHash1);

            expect(metrics.days_in_care).toBeGreaterThanOrEqual(0);
            expect(typeof metrics.days_in_care).toBe('number');
        });

        test('should handle animal with no events', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const metrics = await getAnimalCareMetrics(fakeHash);

            expect(metrics.total_events).toBe(0);
            expect(metrics.first_event_date).toBeNull();
            expect(metrics.last_event_date).toBeNull();
            expect(metrics.days_in_care).toBe(0);
        });
    });

    describe('getEnvironmentActivitySummary', () => {
        test('should return activity summary for environment', async () => {
            const summary = await getEnvironmentActivitySummary(testEnvironmentHash);

            expect(summary).toHaveProperty('environment_hash');
            expect(summary).toHaveProperty('total_events');
            expect(summary).toHaveProperty('unique_animals');
            expect(summary).toHaveProperty('events_by_type');
        });

        test('should count total events correctly', async () => {
            const summary = await getEnvironmentActivitySummary(testEnvironmentHash);
            expect(summary.total_events).toBe(8);
        });

        test('should count unique animals', async () => {
            const summary = await getEnvironmentActivitySummary(testEnvironmentHash);
            expect(summary.unique_animals).toBe(2);
        });

        test('should filter by date range', async () => {
            const summary = await getEnvironmentActivitySummary(testEnvironmentHash, {
                startDate: '2024-03-10',
                endDate: '2024-03-31'
            });

            expect(summary.total_events).toBe(3);
        });

        test('should handle environment with no events', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const summary = await getEnvironmentActivitySummary(fakeHash);

            expect(summary.total_events).toBe(0);
            expect(summary.unique_animals).toBe(0);
        });
    });

    describe('getOperatorActivitySummary', () => {
        test('should return activity summary for operator', async () => {
            const summary = await getOperatorActivitySummary(testOperatorHash1);

            expect(summary).toHaveProperty('operator_hash');
            expect(summary).toHaveProperty('total_events');
            expect(summary).toHaveProperty('unique_animals');
            expect(summary).toHaveProperty('events_by_type');
        });

        test('should count total events per operator', async () => {
            const summary1 = await getOperatorActivitySummary(testOperatorHash1);
            const summary2 = await getOperatorActivitySummary(testOperatorHash2);

            expect(summary1.total_events + summary2.total_events).toBe(8);
        });

        test('should count unique animals per operator', async () => {
            const summary = await getOperatorActivitySummary(testOperatorHash1);
            expect(summary.unique_animals).toBe(2);
        });

        test('should filter by date range', async () => {
            const summary = await getOperatorActivitySummary(testOperatorHash1, {
                startDate: '2024-03-01',
                endDate: '2024-03-05'
            });

            expect(summary.total_events).toBeLessThan(8);
        });
    });

    describe('Integration scenarios', () => {
        test('should provide complete analytics workflow', async () => {
            // Get overall stats
            const typeStats = await getEventStatsByType();
            expect(typeStats.length).toBeGreaterThan(0);

            // Get animal metrics
            const animalMetrics = await getAnimalCareMetrics(testAnimalHash1);
            expect(animalMetrics.total_events).toBeGreaterThan(0);

            // Get environment summary
            const envSummary = await getEnvironmentActivitySummary(testEnvironmentHash);
            expect(envSummary.total_events).toBeGreaterThan(0);
        });

        test('should support institutional reporting', async () => {
            // Simulated monthly report
            const monthlyStats = await getEventStatsByType({
                startDate: '2024-03-01',
                endDate: '2024-03-31'
            });

            const dailyCounts = await getDailyEventCounts('2024-03-01', '2024-03-31');

            expect(monthlyStats.length).toBeGreaterThan(0);
            expect(dailyCounts.length).toBeGreaterThan(0);
        });
    });
});
