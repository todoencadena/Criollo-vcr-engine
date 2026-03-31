/**
 * Integration Tests - Full Workflow
 * Tests the complete IER system end-to-end
 */

const { registerEnvironment, getEnvironmentById } = require('../packages/ier/models/Environment');
const {
    evaluateEnvironment,
    getEligibilityBreakdown,
    checkMinimumRequirements
} = require('../packages/ier/eligibility/validator');
const { hashEnvironment } = require('../packages/privacy/hashing');
const { query, close } = require('../packages/ier/database/config');

// Clean up before and after tests
beforeEach(async () => {
    await query('DELETE FROM environment_audit_log');
    await query('DELETE FROM environment_eligibility');
    await query('DELETE FROM environments');
});

afterAll(async () => {
    await query('DELETE FROM environment_audit_log');
    await query('DELETE FROM environment_eligibility');
    await query('DELETE FROM environments');
    await close();
});

describe('IER Integration - Full Workflow', () => {
    test('Complete workflow: Register -> Evaluate -> Breakdown -> Requirements', async () => {
        const currentYear = new Date().getFullYear();

        // Step 1: Register a high-quality environment
        const environmentInput = {
            name: 'Excellence Animal Rescue',
            year: currentYear - 3  // 3 years operating
        };

        const environmentData = {
            type: 'high_intake',
            monthly_intake_capacity: 60,
            specializations: ['medical', 'emergency', 'spay_neuter']
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        expect(registered).toHaveProperty('id');
        expect(registered.environment_hash).toBe(hashEnvironment(environmentInput.name, environmentInput.year));
        expect(registered.status).toBe('pending');
        expect(registered.eligibility_score).toBeNull();

        // Step 2: Evaluate environment against criteria
        const evaluation = await evaluateEnvironment(registered.id, {
            year: currentYear - 3,
            monthly_intake_capacity: 60,
            specializations: ['medical', 'emergency', 'spay_neuter']
        });

        expect(evaluation.environment_id).toBe(registered.id);
        expect(evaluation.total_score).toBeGreaterThan(0);
        expect(evaluation.evaluations.length).toBe(7);

        // Step 3: Get detailed breakdown
        const breakdown = await getEligibilityBreakdown(registered.id);

        expect(breakdown.total_score).toBe(evaluation.total_score);
        expect(breakdown.breakdown).toHaveProperty('required');
        expect(breakdown.breakdown).toHaveProperty('recommended');
        expect(breakdown.breakdown).toHaveProperty('bonus');

        // Step 4: Check minimum requirements
        const requirements = await checkMinimumRequirements(registered.id);

        expect(requirements.meets_requirements).toBe(true);
        expect(requirements.missing_criteria.length).toBe(0);
        expect(requirements.score).toBe(evaluation.total_score);

        // Step 5: Verify environment was updated
        const updated = await getEnvironmentById(registered.id);

        expect(updated.eligibility_score).toBe(evaluation.total_score);
    });

    test('Should fail requirements with low-quality environment', async () => {
        const currentYear = new Date().getFullYear();

        // Register a low-quality environment
        const environmentInput = {
            name: 'Basic Shelter',
            year: currentYear  // New, no history
        };

        const environmentData = {
            type: 'sanctuary',
            monthly_intake_capacity: 5,  // Too low
            specializations: []  // No specializations
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        // Evaluate
        const evaluation = await evaluateEnvironment(registered.id, {
            year: currentYear,
            monthly_intake_capacity: 5,
            specializations: []
        });

        // Check requirements
        const requirements = await checkMinimumRequirements(registered.id);

        expect(requirements.meets_requirements).toBe(false);
        expect(requirements.missing_criteria.length).toBeGreaterThan(0);
        expect(evaluation.total_score).toBeLessThan(50);
    });

    test('Should handle medium-quality environment correctly', async () => {
        const currentYear = new Date().getFullYear();

        // Register a medium-quality environment
        const environmentInput = {
            name: 'Good Rescue Center',
            year: currentYear - 1  // 1 year operating
        };

        const environmentData = {
            type: 'medical',
            monthly_intake_capacity: 30,
            specializations: ['medical']  // Only medical
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        // Evaluate
        const evaluation = await evaluateEnvironment(registered.id, {
            year: currentYear - 1,
            monthly_intake_capacity: 30,
            specializations: ['medical']
        });

        const breakdown = await getEligibilityBreakdown(registered.id);

        // Should have some points but not maximum
        expect(evaluation.total_score).toBeGreaterThan(30);
        expect(evaluation.total_score).toBeLessThan(90);

        // Should have medical certification points
        const medicalCriterion = breakdown.evaluations.find(e => e.criterion === 'medical_certification');
        expect(medicalCriterion.points_earned).toBe(25);

        // Should NOT have emergency or spay_neuter points
        const emergencyCriterion = breakdown.evaluations.find(e => e.criterion === 'emergency_response');
        expect(emergencyCriterion.points_earned).toBe(0);
    });
});

describe('IER Integration - Edge Cases', () => {
    test('Should handle re-evaluation of same environment', async () => {
        const currentYear = new Date().getFullYear();

        const environmentInput = {
            name: 'Re-Eval Shelter',
            year: currentYear - 2
        };

        const environmentData = {
            type: 'high_intake',
            monthly_intake_capacity: 50,
            specializations: ['medical']
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        // First evaluation
        const eval1 = await evaluateEnvironment(registered.id, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical']
        });

        const score1 = eval1.total_score;

        // Second evaluation (improved - added emergency)
        const eval2 = await evaluateEnvironment(registered.id, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        const score2 = eval2.total_score;

        // Score should improve
        expect(score2).toBeGreaterThan(score1);

        // Should only have 7 evaluation records (upsert, not duplicate)
        const countQuery = await query(
            'SELECT COUNT(*) as count FROM environment_eligibility WHERE environment_id = $1',
            [registered.id]
        );

        expect(parseInt(countQuery.rows[0].count)).toBe(7);
    });

    test('Should maintain data integrity across operations', async () => {
        const currentYear = new Date().getFullYear();

        const environmentInput = {
            name: 'Integrity Test Shelter',
            year: currentYear - 2
        };

        const environmentData = {
            type: 'high_intake',
            monthly_intake_capacity: 40,
            specializations: ['medical', 'emergency']
        };

        // Register
        const registered = await registerEnvironment(environmentInput, environmentData);
        const registeredHash = registered.environment_hash;

        // Evaluate
        await evaluateEnvironment(registered.id, {
            year: currentYear - 2,
            monthly_intake_capacity: 40,
            specializations: ['medical', 'emergency']
        });

        // Retrieve
        const retrieved = await getEnvironmentById(registered.id);

        // Verify all data maintained
        expect(retrieved.environment_hash).toBe(registeredHash);
        expect(retrieved.environment_type).toBe('high_intake');
        expect(retrieved.monthly_intake_capacity).toBe(40);
        expect(retrieved.specializations).toEqual(['medical', 'emergency']);
        expect(retrieved.eligibility_score).toBeGreaterThan(0);
        expect(retrieved.status).toBe('pending');
    });

    test('Should handle environment with no evaluations', async () => {
        const currentYear = new Date().getFullYear();

        const environmentInput = {
            name: 'No Eval Shelter',
            year: currentYear - 1
        };

        const environmentData = {
            type: 'sanctuary',
            monthly_intake_capacity: 25,
            specializations: []
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        // Try to get breakdown before evaluation
        const breakdown = await getEligibilityBreakdown(registered.id);
        expect(breakdown).toBeNull();

        // Check requirements before evaluation
        const requirements = await checkMinimumRequirements(registered.id);
        expect(requirements.meets_requirements).toBe(false);
        expect(requirements.missing_criteria).toContain('No evaluation found');
    });
});

describe('IER Integration - Scoring Accuracy', () => {
    test('Should calculate weighted scores correctly for perfect environment', async () => {
        const currentYear = new Date().getFullYear();

        const environmentInput = {
            name: 'Perfect Rescue',
            year: currentYear - 5  // Long history
        };

        const environmentData = {
            type: 'high_intake',
            monthly_intake_capacity: 100,  // High capacity
            specializations: ['medical', 'emergency', 'spay_neuter']  // All specializations
        };

        const registered = await registerEnvironment(environmentInput, environmentData);

        const evaluation = await evaluateEnvironment(registered.id, {
            year: currentYear - 5,
            monthly_intake_capacity: 100,
            specializations: ['medical', 'emergency', 'spay_neuter']
        });

        // Perfect environment should score very high
        expect(evaluation.total_score).toBeGreaterThanOrEqual(90);

        const breakdown = await getEligibilityBreakdown(registered.id);

        // Verify individual criterion scores
        const operational = breakdown.evaluations.find(e => e.criterion === 'operational_history');
        expect(operational.points_earned).toBe(20);  // Max points for 5+ years

        const capacity = breakdown.evaluations.find(e => e.criterion === 'monthly_capacity');
        expect(capacity.points_earned).toBe(15);  // Max points for 100 capacity

        const medical = breakdown.evaluations.find(e => e.criterion === 'medical_certification');
        expect(medical.points_earned).toBe(25);  // Has medical

        const emergency = breakdown.evaluations.find(e => e.criterion === 'emergency_response');
        expect(emergency.points_earned).toBe(10);  // Has emergency

        const spayNeuter = breakdown.evaluations.find(e => e.criterion === 'spay_neuter_program');
        expect(spayNeuter.points_earned).toBe(10);  // Has spay_neuter
    });
});
