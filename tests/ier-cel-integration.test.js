/**
 * Tests for IER + CEL Integration
 * End-to-end integration tests connecting Phase 1 and Phase 2
 */

const {
    validateEnvironmentExists,
    createValidatedCareEvent,
    getEnvironmentWithEventSummary,
    getEnvironmentAnimalEvents,
    getEnvironmentsWithActivity,
    validateEnvironmentEligibility
} = require('../packages/integration/ierCelIntegration');
const { registerEnvironment } = require('../packages/ier/models/Environment');
const { evaluateEnvironment } = require('../packages/ier/eligibility/validator');
const { hashAnimal, hashEnvironment, hashOperator } = require('../packages/privacy/hashing');
const { query } = require('../packages/ier/database/config');

describe('IER + CEL Integration', () => {
    const testSalt = 'integration-salt-2026';
    let testEnvironmentHash;
    let testAnimalHash;
    let testOperatorHash;
    let environmentId;

    beforeAll(async () => {
        // Clean up
        await query('TRUNCATE care_events CASCADE');
        await query('TRUNCATE environments CASCADE');

        // Generate test hashes
        testEnvironmentHash = hashEnvironment('Integration Test Shelter', 2024, testSalt);
        testAnimalHash = hashAnimal('INT_ANIMAL_1', '2024-01-01', testSalt);
        testOperatorHash = hashOperator('Integration Operator', 'VET', testSalt);
        // Environment data
        const environmentData = {
            environment_type: 'shelter',
            year: 2024,
            monthly_intake_capacity: 50,
            specializations: ['dogs', 'cats']
        };

        // Register environment in IER
        const registered = await registerEnvironment(
            { name: 'Integration Test Shelter', year: 2024 },
           environmentData

        );
        environmentId = registered.id;
        testEnvironmentHash = registered.environment_hash;

        // Evaluate environment
        const evaluationData = {
            year: 2020,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency', 'spay_neuter']
        };

        await evaluateEnvironment(environmentId, evaluationData);
    });

    afterAll(async () => {
        await query('TRUNCATE care_events CASCADE');
        await query('TRUNCATE environments CASCADE');
    });

    describe('validateEnvironmentExists', () => {
        test('should return true for registered environment', async () => {
            const exists = await validateEnvironmentExists(testEnvironmentHash);
            expect(exists).toBe(true);
        });

        test('should return false for non-existent environment', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const exists = await validateEnvironmentExists(fakeHash);
            expect(exists).toBe(false);
        });
    });

    describe('createValidatedCareEvent', () => {
        test('should create event for valid environment', async () => {
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                operatorHash: testOperatorHash,
                eventType: 'intake',
                eventCategory: 'arrival',
                eventTimestamp: '2024-03-15T10:00:00Z',
                metadata: { source: 'rescue' }
            };

            const event = await createValidatedCareEvent(eventData, testSalt);

            expect(event).toBeDefined();
            expect(event.environment_hash).toBe(testEnvironmentHash);
            expect(event.event_type).toBe('intake');
        });

        test('should throw error for non-existent environment', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: fakeHash,
                operatorHash: testOperatorHash,
                eventType: 'care',
                eventCategory: 'feeding',
                eventTimestamp: '2024-03-15T11:00:00Z'
            };

            await expect(createValidatedCareEvent(eventData, testSalt))
                .rejects.toThrow('Environment');
        });

        test('should include helpful error message', async () => {
            const fakeHash = '1111111111111111111111111111111111111111111111111111111111111111';
            const eventData = {
                animalHash: testAnimalHash,
                environmentHash: fakeHash,
                operatorHash: testOperatorHash,
                eventType: 'care',
                eventCategory: 'feeding',
                eventTimestamp: '2024-03-15T11:00:00Z'
            };

            await expect(createValidatedCareEvent(eventData, testSalt))
                .rejects.toThrow('not found in IER');
        });
    });

    describe('getEnvironmentWithEventSummary', () => {
        beforeAll(async () => {
            // Create test events
            const events = [
                { eventType: 'intake', eventCategory: 'arrival', eventTimestamp: '2024-03-20T10:00:00Z' },
                { eventType: 'medical', eventCategory: 'vaccination', eventTimestamp: '2024-03-21T11:00:00Z' },
                { eventType: 'care', eventCategory: 'feeding', eventTimestamp: '2024-03-22T08:00:00Z' }
            ];

            for (const event of events) {
                await createValidatedCareEvent({
                    animalHash: testAnimalHash,
                    environmentHash: testEnvironmentHash,
                    operatorHash: testOperatorHash,
                    eventType: event.eventType,
                    eventCategory: event.eventCategory,
                    eventTimestamp: event.eventTimestamp
                }, testSalt);
            }
        });

        test('should return environment with event summary', async () => {
            const result = await getEnvironmentWithEventSummary(testEnvironmentHash);

            expect(result).toBeDefined();
            expect(result.environment_hash).toBe(testEnvironmentHash);
            expect(result.event_summary).toBeDefined();
        });

        test('should include total events count', async () => {
            const result = await getEnvironmentWithEventSummary(testEnvironmentHash);

            expect(result.event_summary.total_events).toBeGreaterThan(0);
        });

        test('should include unique animals count', async () => {
            const result = await getEnvironmentWithEventSummary(testEnvironmentHash);

            expect(result.event_summary.unique_animals).toBeGreaterThan(0);
        });

        test('should break down events by type', async () => {
            const result = await getEnvironmentWithEventSummary(testEnvironmentHash);

            expect(result.event_summary.events_by_type).toBeDefined();
            expect(result.event_summary.events_by_type.intake).toBeGreaterThan(0);
        });

        test('should return null for non-existent environment', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const result = await getEnvironmentWithEventSummary(fakeHash);

            expect(result).toBeNull();
        });
    });

    describe('getEnvironmentAnimalEvents', () => {
        test('should return events for environment', async () => {
            const events = await getEnvironmentAnimalEvents(testEnvironmentHash);

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].environment_hash).toBe(testEnvironmentHash);
        });

        test('should filter by date range', async () => {
            const events = await getEnvironmentAnimalEvents(testEnvironmentHash, {
                startDate: '2024-03-16',
                endDate: '2024-03-31'
            });

            expect(events.length).toBeGreaterThan(0);
        });

        test('should filter by event type', async () => {
            const events = await getEnvironmentAnimalEvents(testEnvironmentHash, {
                eventType: 'medical'
            });

            events.forEach(event => {
                expect(event.event_type).toBe('medical');
            });
        });

        test('should return empty array for non-existent environment', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const events = await getEnvironmentAnimalEvents(fakeHash);

            expect(events).toEqual([]);
        });
    });

    describe('getEnvironmentsWithActivity', () => {
        test('should return all environments with activity metrics', async () => {
            const environments = await getEnvironmentsWithActivity();

            expect(environments.length).toBeGreaterThan(0);
            expect(environments[0]).toHaveProperty('environment_hash');
            expect(environments[0]).toHaveProperty('total_events');
            expect(environments[0]).toHaveProperty('unique_animals');
        });

        test('should filter by minimum events', async () => {
            const environments = await getEnvironmentsWithActivity({ minEvents: 1 });

            environments.forEach(env => {
                expect(env.total_events).toBeGreaterThanOrEqual(1);
            });
        });

        test('should filter environments with activity', async () => {
            const environments = await getEnvironmentsWithActivity({ hasActivity: true });

            environments.forEach(env => {
                expect(env.total_events).toBeGreaterThan(0);
            });
        });

        test('should show environments ordered by activity', async () => {
            const environments = await getEnvironmentsWithActivity();

            for (let i = 1; i < environments.length; i++) {
                expect(environments[i - 1].total_events).toBeGreaterThanOrEqual(
                    environments[i].total_events
                );
            }
        });
    });

    describe('validateEnvironmentEligibility', () => {
        test('should validate eligible environment', async () => {
            const result = await validateEnvironmentEligibility(testEnvironmentHash);

            expect(result.valid).toBe(true);
            expect(result.eligibility_score).toBeDefined();
        });

        test('should respect custom minimum score', async () => {
            const result = await validateEnvironmentEligibility(testEnvironmentHash, 50);

            expect(result.valid).toBe(true);
        });

        test('should reject environment below minimum score', async () => {
            const result = await validateEnvironmentEligibility(testEnvironmentHash, 150);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('below minimum');
        });

        test('should return false for non-existent environment', async () => {
            const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
            const result = await validateEnvironmentEligibility(fakeHash);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('not found');
        });
    });

    describe('End-to-End Integration Scenarios', () => {
        test('complete workflow: register -> evaluate -> create events -> query', async () => {
            // 1. Environment already registered and evaluated in beforeAll
            
            // 2. Validate environment exists
            const exists = await validateEnvironmentExists(testEnvironmentHash);
            expect(exists).toBe(true);

            // 3. Create care event with validation
            const event = await createValidatedCareEvent({
                animalHash: testAnimalHash,
                environmentHash: testEnvironmentHash,
                operatorHash: testOperatorHash,
                eventType: 'outcome',
                eventCategory: 'adoption',
                eventTimestamp: '2024-03-20T14:00:00Z',
                metadata: { adopter_verified: true }
            }, testSalt);

            expect(event).toBeDefined();

            // 4. Query environment with summary
            const summary = await getEnvironmentWithEventSummary(testEnvironmentHash);
            expect(summary.event_summary.total_events).toBeGreaterThan(0);

            // 5. Get all events for environment
            const events = await getEnvironmentAnimalEvents(testEnvironmentHash);
            expect(events.length).toBeGreaterThan(0);
        });

        test('institutional reporting workflow', async () => {
            // Get all environments with activity
            const activeEnvironments = await getEnvironmentsWithActivity({ hasActivity: true });
            expect(activeEnvironments.length).toBeGreaterThan(0);

            // Get detailed summary for each
            for (const env of activeEnvironments) {
                const summary = await getEnvironmentWithEventSummary(env.environment_hash);
                expect(summary).toBeDefined();
                expect(summary.event_summary).toBeDefined();
            }
        });

        test('proof of care validation', async () => {
            // Validate environment eligibility
            const eligibility = await validateEnvironmentEligibility(testEnvironmentHash);
            expect(eligibility.valid).toBe(true);

            // Get environment with full event summary
            const envWithSummary = await getEnvironmentWithEventSummary(testEnvironmentHash);
            expect(envWithSummary.eligibility_score).toBeDefined();
            expect(envWithSummary.event_summary.total_events).toBeGreaterThan(0);

            // Verify cross-phase data integrity
            expect(envWithSummary.environment_hash).toBe(testEnvironmentHash);
            expect(envWithSummary.event_summary.events_by_type).toBeDefined();
        });
    });
});
