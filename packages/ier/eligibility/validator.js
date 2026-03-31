/**
 * Eligibility Validator
 * Evaluates environments against eligibility criteria
 * Calculates scores and manages eligibility data
 */

const { query, getClient } = require('../database/config');

/**
 * Calculate weighted eligibility score
 * @param {Array} evaluations - Array of {criterion, points_earned, max_points, weight}
 * @returns {number} Total weighted score (0-100)
 */
function calculateEligibilityScore(evaluations) {
    if (!evaluations || evaluations.length === 0) {
        return 0;
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const evaluation of evaluations) {
        const percentage = (evaluation.points_earned / evaluation.max_points) || 0;
        const weightedContribution = percentage * evaluation.weight * 100;
        totalWeightedScore += weightedContribution;
        totalWeight += evaluation.weight;
    }

    // Normalize to 0-100 scale
    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    return Math.round(finalScore);
}

/**
 * Get all active eligibility criteria
 * @returns {Promise<Array>} Array of criteria
 */
async function getActiveCriteria() {
    const selectQuery = `
        SELECT * FROM eligibility_criteria
        WHERE is_active = true
        ORDER BY criterion_type, criterion_name
    `;
    const result = await query(selectQuery, []);
    return result.rows;
}

/**
 * Evaluate a single criterion for an environment
 * @param {string} criterionName - Name of criterion
 * @param {object} environmentData - Data to evaluate
 * @returns {object} Evaluation result {points_earned, notes}
 */
function evaluateCriterion(criterionName, environmentData) {
    const evaluators = {
        operational_history: (data) => {
            // Award points based on years of operation
            const currentYear = new Date().getFullYear();
            const yearsOperating = currentYear - (data.year || currentYear);

            if (yearsOperating >= 2) return { points: 20, notes: `${yearsOperating} years operating` };
            if (yearsOperating >= 1) return { points: 15, notes: `${yearsOperating} year operating` };
            if (yearsOperating >= 0.5) return { points: 10, notes: `6+ months operating` };
            return { points: 0, notes: 'Less than 6 months operating' };
        },

        monthly_capacity: (data) => {
            const capacity = data.monthly_intake_capacity || 0;

            if (capacity >= 50) return { points: 15, notes: `${capacity} monthly capacity (excellent)` };
            if (capacity >= 25) return { points: 12, notes: `${capacity} monthly capacity (good)` };
            if (capacity >= 10) return { points: 8, notes: `${capacity} monthly capacity (adequate)` };
            return { points: 0, notes: `${capacity} monthly capacity (insufficient)` };
        },

        medical_certification: (data) => {
            const specializations = data.specializations || [];
            const hasMedical = specializations.includes('medical') || specializations.includes('surgical');

            if (hasMedical) return { points: 25, notes: 'Medical certification verified' };
            return { points: 0, notes: 'No medical certification' };
        },

        transparency_score: (data) => {
            // For now, award partial points by default
            // In production, this would check external transparency metrics
            return { points: 7, notes: 'Basic transparency metrics met' };
        },

        network_participation: (data) => {
            // Award points if environment participates in network
            // For now, default scoring
            return { points: 5, notes: 'Network participation confirmed' };
        },

        emergency_response: (data) => {
            const specializations = data.specializations || [];
            const hasEmergency = specializations.includes('emergency');

            if (hasEmergency) return { points: 10, notes: 'Emergency response capability confirmed' };
            return { points: 0, notes: 'No emergency response capability' };
        },

        spay_neuter_program: (data) => {
            const specializations = data.specializations || [];
            const hasSpayNeuter = specializations.includes('spay_neuter');

            if (hasSpayNeuter) return { points: 10, notes: 'Active spay/neuter program' };
            return { points: 0, notes: 'No spay/neuter program' };
        }
    };

    const evaluator = evaluators[criterionName];
    if (!evaluator) {
        return { points: 0, notes: 'Criterion evaluator not implemented' };
    }

    return evaluator(environmentData);
}

/**
 * Evaluate environment against all criteria
 * @param {string} environmentId - Environment UUID
 * @param {object} environmentData - Environment data for evaluation
 * @returns {Promise<object>} Evaluation result with score and breakdown
 */
async function evaluateEnvironment(environmentId, environmentData) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Get all active criteria
        const criteriaResult = await client.query(
            'SELECT * FROM eligibility_criteria WHERE is_active = true ORDER BY criterion_type, criterion_name'
        );
        const criteria = criteriaResult.rows;

        // Evaluate each criterion
        const evaluations = [];

        for (const criterion of criteria) {
            const evaluation = evaluateCriterion(criterion.criterion_name, environmentData);

            // Insert or update evaluation
            const upsertQuery = `
                INSERT INTO environment_eligibility (
                    environment_id,
                    criterion_id,
                    points_earned,
                    notes
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT (environment_id, criterion_id)
                DO UPDATE SET
                    points_earned = EXCLUDED.points_earned,
                    notes = EXCLUDED.notes,
                    evaluated_at = NOW(),
                    updated_at = NOW()
                RETURNING *
            `;

            await client.query(upsertQuery, [
                environmentId,
                criterion.id,
                evaluation.points,
                evaluation.notes
            ]);

            evaluations.push({
                criterion: criterion.criterion_name,
                criterion_type: criterion.criterion_type,
                points_earned: evaluation.points,
                max_points: criterion.max_points,
                weight: parseFloat(criterion.weight),
                notes: evaluation.notes
            });
        }

        // Calculate total score
        const totalScore = calculateEligibilityScore(evaluations);

        // Update environment score
        await client.query(
            'UPDATE environments SET eligibility_score = $1, updated_at = NOW() WHERE id = $2',
            [totalScore, environmentId]
        );

        await client.query('COMMIT');

        return {
            environment_id: environmentId,
            total_score: totalScore,
            evaluations: evaluations
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get eligibility breakdown for an environment
 * @param {string} environmentId - Environment UUID
 * @returns {Promise<object>} Breakdown of scores by criterion
 */
async function getEligibilityBreakdown(environmentId) {
    const selectQuery = `
        SELECT
            ec.criterion_name,
            ec.criterion_type,
            ec.max_points,
            ec.weight,
            ee.points_earned,
            ee.notes,
            ee.evaluated_at
        FROM environment_eligibility ee
        JOIN eligibility_criteria ec ON ee.criterion_id = ec.id
        WHERE ee.environment_id = $1
        ORDER BY ec.criterion_type, ec.criterion_name
    `;

    const result = await query(selectQuery, [environmentId]);

    if (result.rows.length === 0) {
        return null;
    }

    const evaluations = result.rows.map(row => ({
        criterion: row.criterion_name,
        type: row.criterion_type,
        points_earned: row.points_earned,
        max_points: row.max_points,
        weight: parseFloat(row.weight),
        notes: row.notes,
        evaluated_at: row.evaluated_at
    }));

    const totalScore = calculateEligibilityScore(evaluations);

    return {
        total_score: totalScore,
        evaluations: evaluations,
        breakdown: {
            required: evaluations.filter(e => e.type === 'required'),
            recommended: evaluations.filter(e => e.type === 'recommended'),
            bonus: evaluations.filter(e => e.type === 'bonus')
        }
    };
}

/**
 * Check if environment meets minimum requirements
 * @param {string} environmentId - Environment UUID
 * @returns {Promise<object>} {meets_requirements, missing_criteria, score}
 */
async function checkMinimumRequirements(environmentId) {
    const breakdown = await getEligibilityBreakdown(environmentId);

    if (!breakdown) {
        return {
            meets_requirements: false,
            missing_criteria: ['No evaluation found'],
            score: 0
        };
    }

    const requiredCriteria = breakdown.breakdown.required;
    const missingCriteria = [];

    for (const criterion of requiredCriteria) {
        if (criterion.points_earned === 0) {
            missingCriteria.push(criterion.criterion);
        }
    }

    return {
        meets_requirements: missingCriteria.length === 0,
        missing_criteria: missingCriteria,
        score: breakdown.total_score
    };
}

module.exports = {
    calculateEligibilityScore,
    getActiveCriteria,
    evaluateCriterion,
    evaluateEnvironment,
    getEligibilityBreakdown,
    checkMinimumRequirements
};
