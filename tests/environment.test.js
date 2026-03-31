/**
 * Environment Model Tests
 * Tests for CRUD operations on environments table
 */

const {
    registerEnvironment,
    getEnvironmentById,
    getEnvironmentByHash,
    getAllEnvironments,
    updateEnvironmentStatus,
    updateEligibilityScore,
    deleteEnvironment,
    getEnvironmentAuditHistory
} = require('../packages/ier/models/Environment');

const { query, close } = require('../packages/ier/database/config');

// Clean up test data before and after tests
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

describe('Environment Model - Registration', () => {
    test('should register a new environment with valid data', async () => {
        const environmentData = {
            name: 'Hope Rescue Shelter',
            year: 2024
        };

        const metadata = {
            type: 'high_intake',
            monthly_intake_capacity: 50,
            specializations: ['emergency', 'medical']
        };

        const result = await registerEnvironment(environmentData, metadata);

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('environment_hash');
        expect(result.environment_type).toBe('high_intake');
        expect(result.year).toBe(2024);
        expect(result.status).toBe('pending');
        expect(result.monthly_intake_capacity).toBe(50);
        expect(result.specializations).toEqual(['emergency', 'medical']);
    });

    test('should throw error for duplicate environment', async () => {
        const environmentData = {
            name: 'Hope Rescue Shelter',
            year: 2024
        };

        // Register once
        await registerEnvironment(environmentData);

        // Try to register again (same name + year = same hash)
        await expect(registerEnvironment(environmentData))
            .rejects
            .toThrow('Environment already registered');
    });

      test('should use default values when metadata is not provided', async () => {
        const environmentData = {
            name: 'Simple Shelter',
            year: 2024
        };

        const result = await registerEnvironment(environmentData);

        expect(result.environment_type).toBe('high_intake');
        expect(result.specializations).toEqual([]);
    });
});

describe('Environment Model - Read Operations', () => {
    let testEnvironmentId;
    let testEnvironmentHash;

    beforeEach(async () => {
        const result = await registerEnvironment({
            name: 'Test Shelter',
            year: 2024
        }, {
            type: 'medical',
            monthly_intake_capacity: 30
        });

        testEnvironmentId = result.id;
        testEnvironmentHash = result.environment_hash;
    });

    test('should get environment by ID', async () => {
        const result = await getEnvironmentById(testEnvironmentId);

        expect(result).not.toBeNull();
        expect(result.id).toBe(testEnvironmentId);
        expect(result.environment_type).toBe('medical');
    });

    test('should return null for non-existent ID', async () => {
        const result = await getEnvironmentById('00000000-0000-0000-0000-000000000000');
        expect(result).toBeNull();
    });

    test('should get environment by hash', async () => {
        const result = await getEnvironmentByHash(testEnvironmentHash);

        expect(result).not.toBeNull();
        expect(result.environment_hash).toBe(testEnvironmentHash);
    });

    test('should get all environments', async () => {
        // Register additional environments
        await registerEnvironment({ name: 'Shelter A', year: 2024 });
        await registerEnvironment({ name: 'Shelter B', year: 2024 });

        const result = await getAllEnvironments();

        expect(result.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter environments by status', async () => {
        // Approve one environment
        await updateEnvironmentStatus(testEnvironmentId, 'approved', 'test');

        const approvedEnvs = await getAllEnvironments({ status: 'approved' });
        const pendingEnvs = await getAllEnvironments({ status: 'pending' });

        expect(approvedEnvs.length).toBeGreaterThanOrEqual(1);
        expect(approvedEnvs[0].status).toBe('approved');
    });

    test('should filter environments by type', async () => {
        await registerEnvironment({ name: 'Sanctuary A', year: 2024 }, { type: 'sanctuary' });

        const medicalEnvs = await getAllEnvironments({ type: 'medical' });
        const sanctuaryEnvs = await getAllEnvironments({ type: 'sanctuary' });

        expect(medicalEnvs.length).toBeGreaterThanOrEqual(1);
        expect(sanctuaryEnvs.length).toBeGreaterThanOrEqual(1);
    });

    test('should respect limit and offset for pagination', async () => {
        // Register 5 more environments
        for (let i = 0; i < 5; i++) {
            await registerEnvironment({ name: `Shelter ${i}`, year: 2024 });
        }

        const page1 = await getAllEnvironments({}, 2, 0);
        const page2 = await getAllEnvironments({}, 2, 2);

        expect(page1.length).toBe(2);
        expect(page2.length).toBe(2);
        expect(page1[0].id).not.toBe(page2[0].id);
    });
});

describe('Environment Model - Update Operations', () => {
    let testEnvironmentId;

    beforeEach(async () => {
        const result = await registerEnvironment({
            name: 'Update Test Shelter',
            year: 2024
        });
        testEnvironmentId = result.id;
    });

    test('should update environment status', async () => {
        const result = await updateEnvironmentStatus(
            testEnvironmentId,
            'approved',
            'test_admin',
            'Meets all criteria'
        );

        expect(result.status).toBe('approved');
        expect(result.approved_at).not.toBeNull();
    });

    test('should create audit log when status changes', async () => {
        await updateEnvironmentStatus(testEnvironmentId, 'approved', 'test_admin');

        const auditHistory = await getEnvironmentAuditHistory(testEnvironmentId);

        expect(auditHistory.length).toBe(1);
        expect(auditHistory[0].action).toBe('status_changed');
        expect(auditHistory[0].old_status).toBe('pending');
        expect(auditHistory[0].new_status).toBe('approved');
        expect(auditHistory[0].changed_by).toBe('test_admin');
    });

    test('should update eligibility score', async () => {
        const result = await updateEligibilityScore(testEnvironmentId, 75, 'scorer');

        expect(result.eligibility_score).toBe(75);
    });

    test('should throw error for invalid score', async () => {
        await expect(updateEligibilityScore(testEnvironmentId, 150))
            .rejects
            .toThrow('Eligibility score must be between 0 and 100');

        await expect(updateEligibilityScore(testEnvironmentId, -10))
            .rejects
            .toThrow('Eligibility score must be between 0 and 100');
    });

    test('should create audit log when score changes', async () => {
        await updateEligibilityScore(testEnvironmentId, 80, 'scorer');

        const auditHistory = await getEnvironmentAuditHistory(testEnvironmentId);

        expect(auditHistory.length).toBe(1);
        expect(auditHistory[0].action).toBe('score_updated');
        expect(auditHistory[0].new_score).toBe(80);
    });

    test('should throw error when updating non-existent environment', async () => {
        await expect(updateEnvironmentStatus('00000000-0000-0000-0000-000000000000', 'approved'))
            .rejects
            .toThrow('Environment not found');
    });
});

describe('Environment Model - Delete Operations', () => {
    let testEnvironmentId;

    beforeEach(async () => {
        const result = await registerEnvironment({
            name: 'Delete Test Shelter',
            year: 2024
        });
        testEnvironmentId = result.id;
    });

    test('should soft delete environment', async () => {
        const result = await deleteEnvironment(testEnvironmentId, 'admin', 'Closed facility');

        expect(result.status).toBe('suspended');
    });

    test('should create audit log for deletion', async () => {
        await deleteEnvironment(testEnvironmentId, 'admin', 'Closed facility');

        const auditHistory = await getEnvironmentAuditHistory(testEnvironmentId);

        expect(auditHistory.length).toBe(1);
        expect(auditHistory[0].action).toBe('status_changed');
        expect(auditHistory[0].new_status).toBe('suspended');
        expect(auditHistory[0].change_reason).toBe('Closed facility');
    });
});

describe('Environment Model - Audit History', () => {
    let testEnvironmentId;

    beforeEach(async () => {
        const result = await registerEnvironment({
            name: 'Audit Test Shelter',
            year: 2024
        });
        testEnvironmentId = result.id;
    });

    test('should track multiple changes in order', async () => {
        // Make multiple changes
        await updateEligibilityScore(testEnvironmentId, 50);
        await updateEnvironmentStatus(testEnvironmentId, 'approved');
        await updateEligibilityScore(testEnvironmentId, 75);

        const history = await getEnvironmentAuditHistory(testEnvironmentId);

        expect(history.length).toBe(3);
        // Most recent first (DESC order)
        expect(history[0].action).toBe('score_updated');
        expect(history[1].action).toBe('status_changed');
        expect(history[2].action).toBe('score_updated');
    });
});
