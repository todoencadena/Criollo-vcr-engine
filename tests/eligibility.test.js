/**
 * Eligibility Validator Tests
 */

const {
    calculateEligibilityScore,
    getActiveCriteria,
    evaluateCriterion,
    evaluateEnvironment,
    getEligibilityBreakdown,
    checkMinimumRequirements
} = require('../packages/ier/eligibility/validator');

const { registerEnvironment } = require('../packages/ier/models/Environment');
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

describe('Eligibility Validator - Score Calculation', () => {
    test('should calculate weighted score correctly', () => {
        const evaluations = [
            { points_earned: 20, max_points: 20, weight: 0.25 }, // 100% of 25% = 25
            { points_earned: 15, max_points: 15, weight: 0.20 }, // 100% of 20% = 20
            { points_earned: 12, max_points: 25, weight: 0.30 }  // 48% of 30% = 14.4
        ];

        const score = calculateEligibilityScore(evaluations);

        // (25 + 20 + 14.4) / (0.25 + 0.20 + 0.30) = 59.4 / 0.75 = 79.2 ≈ 79
        expect(score).toBeGreaterThanOrEqual(78);
        expect(score).toBeLessThanOrEqual(80);
    });

    test('should return 0 for empty evaluations', () => {
        expect(calculateEligibilityScore([])).toBe(0);
        expect(calculateEligibilityScore(null)).toBe(0);
    });

    test('should handle perfect score', () => {
        const evaluations = [
            { points_earned: 20, max_points: 20, weight: 0.5 },
            { points_earned: 30, max_points: 30, weight: 0.5 }
        ];

        expect(calculateEligibilityScore(evaluations)).toBe(100);
    });
});

describe('Eligibility Validator - Criteria', () => {
    test('should get active criteria from database', async () => {
        const criteria = await getActiveCriteria();

        expect(criteria.length).toBeGreaterThan(0);
        expect(criteria[0]).toHaveProperty('criterion_name');
        expect(criteria[0]).toHaveProperty('max_points');
        expect(criteria[0]).toHaveProperty('weight');
    });

    test('should have default 7 criteria', async () => {
        const criteria = await getActiveCriteria();
        expect(criteria.length).toBe(7);
    });
});

describe('Eligibility Validator - Criterion Evaluation', () => {
    test('should evaluate operational_history correctly', () => {
        const currentYear = new Date().getFullYear();

        // 2+ years
        let result = evaluateCriterion('operational_history', { year: currentYear - 3 });
        expect(result.points).toBe(20);

        // 1 year
        result = evaluateCriterion('operational_history', { year: currentYear - 1 });
        expect(result.points).toBe(15);

        // New (current year)
        result = evaluateCriterion('operational_history', { year: currentYear });
        expect(result.points).toBe(0);
    });

    test('should evaluate monthly_capacity correctly', () => {
        let result = evaluateCriterion('monthly_capacity', { monthly_intake_capacity: 60 });
        expect(result.points).toBe(15);

        result = evaluateCriterion('monthly_capacity', { monthly_intake_capacity: 30 });
        expect(result.points).toBe(12);

        result = evaluateCriterion('monthly_capacity', { monthly_intake_capacity: 15 });
        expect(result.points).toBe(8);

        result = evaluateCriterion('monthly_capacity', { monthly_intake_capacity: 5 });
        expect(result.points).toBe(0);
    });

    test('should evaluate medical_certification correctly', () => {
        let result = evaluateCriterion('medical_certification', {
            specializations: ['medical', 'emergency']
        });
        expect(result.points).toBe(25);

        result = evaluateCriterion('medical_certification', {
            specializations: ['emergency']
        });
        expect(result.points).toBe(0);
    });

    test('should evaluate emergency_response correctly', () => {
        let result = evaluateCriterion('emergency_response', {
            specializations: ['emergency']
        });
        expect(result.points).toBe(10);

        result = evaluateCriterion('emergency_response', {
            specializations: ['medical']
        });
        expect(result.points).toBe(0);
    });
});

describe('Eligibility Validator - Full Evaluation', () => {
    let testEnvironmentId;

    beforeEach(async () => {
        const currentYear = new Date().getFullYear();
        const env = await registerEnvironment({
            name: 'Test Evaluation Shelter',
            year: currentYear - 2
        }, {
            type: 'high_intake',
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        testEnvironmentId = env.id;
    });

    test('should evaluate environment and calculate score', async () => {
        const currentYear = new Date().getFullYear();

        const result = await evaluateEnvironment(testEnvironmentId, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        expect(result).toHaveProperty('environment_id');
        expect(result).toHaveProperty('total_score');
        expect(result).toHaveProperty('evaluations');
        expect(result.total_score).toBeGreaterThan(0);
        expect(result.evaluations.length).toBe(7);
    });

    test('should store evaluation in database', async () => {
        const currentYear = new Date().getFullYear();

        await evaluateEnvironment(testEnvironmentId, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        const checkQuery = await query(
            'SELECT COUNT(*) as count FROM environment_eligibility WHERE environment_id = $1',
            [testEnvironmentId]
        );

        expect(parseInt(checkQuery.rows[0].count)).toBe(7);
    });

    test('should update environment eligibility_score', async () => {
        const currentYear = new Date().getFullYear();

        await evaluateEnvironment(testEnvironmentId, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        const envQuery = await query(
            'SELECT eligibility_score FROM environments WHERE id = $1',
            [testEnvironmentId]
        );

        expect(envQuery.rows[0].eligibility_score).toBeGreaterThan(0);
    });
});

describe('Eligibility Validator - Breakdown', () => {
    let testEnvironmentId;

    beforeEach(async () => {
        const currentYear = new Date().getFullYear();
        const env = await registerEnvironment({
            name: 'Breakdown Test Shelter',
            year: currentYear - 2
        }, {
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });

        testEnvironmentId = env.id;

        await evaluateEnvironment(testEnvironmentId, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical', 'emergency']
        });
    });

    test('should get eligibility breakdown', async () => {
        const breakdown = await getEligibilityBreakdown(testEnvironmentId);

        expect(breakdown).toHaveProperty('total_score');
        expect(breakdown).toHaveProperty('evaluations');
        expect(breakdown).toHaveProperty('breakdown');
        expect(breakdown.breakdown).toHaveProperty('required');
        expect(breakdown.breakdown).toHaveProperty('recommended');
        expect(breakdown.breakdown).toHaveProperty('bonus');
    });

    test('should categorize criteria correctly', async () => {
        const breakdown = await getEligibilityBreakdown(testEnvironmentId);

        expect(breakdown.breakdown.required.length).toBeGreaterThan(0);
        expect(breakdown.breakdown.recommended.length).toBeGreaterThan(0);
        expect(breakdown.breakdown.bonus.length).toBeGreaterThan(0);
    });
});

describe('Eligibility Validator - Minimum Requirements', () => {
    test('should pass when all required criteria met', async () => {
        const currentYear = new Date().getFullYear();
        const env = await registerEnvironment({
            name: 'Passing Shelter',
            year: currentYear - 2
        }, {
            monthly_intake_capacity: 50,
            specializations: ['medical']
        });

        await evaluateEnvironment(env.id, {
            year: currentYear - 2,
            monthly_intake_capacity: 50,
            specializations: ['medical']
        });

        const requirements = await checkMinimumRequirements(env.id);

        expect(requirements.meets_requirements).toBe(true);
        expect(requirements.missing_criteria.length).toBe(0);
    });

    test('should fail when required criteria missing', async () => {
        const currentYear = new Date().getFullYear();
        const env = await registerEnvironment({
            name: 'Failing Shelter',
            year: currentYear - 2
        }, {
            monthly_intake_capacity: 5, // Too low
            specializations: [] // No medical
        });

        await evaluateEnvironment(env.id, {
            year: currentYear - 2,
            monthly_intake_capacity: 5,
            specializations: []
        });

        const requirements = await checkMinimumRequirements(env.id);

        expect(requirements.meets_requirements).toBe(false);
        expect(requirements.missing_criteria.length).toBeGreaterThan(0);
    });
});
