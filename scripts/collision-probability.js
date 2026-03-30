/**
 * Hash Collision Probability Calculator
 *
 * Calculates SHA-256 collision probability for different entity volumes.
 * Based on Birthday Paradox formula: P(collision) ≈ n² / (2 × 2^256)
 */

// Constants
const HASH_SPACE = Math.pow(2, 256); // Total possible SHA-256 hashes
const DENOMINATOR = 2 * HASH_SPACE; // For birthday paradox formula

/**
 * Calculate collision probability for given number of hashes
 * @param {number} n - Number of hashes generated
 * @returns {object} Probability in different formats
 */
function calculateCollisionProbability(n) {
    // P(collision) ≈ n² / (2 × 2^256)
    const nSquared = Math.pow(n, 2);

    // Use logarithms for very large numbers
    // log(P) = log(n²) - log(2 × 2^256)
    //        = 2×log(n) - log(2) - 256×log(2)

    const logN = Math.log10(n);
    const logDenominator = Math.log10(2) + 256 * Math.log10(2);
    const logProbability = 2 * logN - logDenominator;

    const probability = Math.pow(10, logProbability);
    const exponent = Math.floor(logProbability);
    const mantissa = Math.pow(10, logProbability - exponent);

    return {
        n: n,
        probability: probability,
        scientific: `${mantissa.toFixed(2)} × 10^${exponent}`,
        percentage: (probability * 100).toExponential(2) + '%',
        exponent: exponent
    };
}

/**
 * Format large numbers with commas
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Print scenario analysis
 */
function printScenario(title, n, context = '') {
    const result = calculateCollisionProbability(n);

    console.log('\n' + '='.repeat(70));
    console.log(`  ${title}`);
    console.log('='.repeat(70));
    console.log(`Number of hashes (n): ${formatNumber(n)}`);
    if (context) {
        console.log(`Context: ${context}`);
    }
    console.log(`\nCollision Probability:`);
    console.log(`  Scientific notation: ${result.scientific}`);
    console.log(`  Percentage: ${result.percentage}`);
    console.log(`  Order of magnitude: 10^${result.exponent}`);
    console.log('='.repeat(70));
}

// Run scenarios
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                                                                    ║');
console.log('║        SHA-256 COLLISION PROBABILITY ANALYSIS                      ║');
console.log('║        Criollo VCR Minting Engine - Phase 0                        ║');
console.log('║                                                                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// Scenario 1: Small scale
printScenario(
    'SCENARIO 1: Small Scale',
    1000,
    'Early stage deployment - 1,000 entities'
);

// Scenario 2: Medium scale
printScenario(
    'SCENARIO 2: Medium Scale',
    1000000,
    'Regional deployment - 1 million entities'
);

// Scenario 3: Large scale
printScenario(
    'SCENARIO 3: Large Scale',
    10000000,
    '10 years operation - 1M entities/year'
);

// Scenario 4: Global scale
printScenario(
    'SCENARIO 4: Global Scale',
    1000000000,
    'Global deployment - 1 billion entities'
);

// Scenario 5: Extreme scale
printScenario(
    'SCENARIO 5: Extreme Scale (50 years)',
    5500000000,
    '50 years: 100M animals + 10M environments + 1M operators'
);

// Summary
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                          CONCLUSION                                ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log('\nEven at EXTREME global scale (5.5 billion entities over 50 years):');
console.log('  → Collision probability: ~10^-57');
console.log('  → Essentially ZERO risk');
console.log('  → Cryptographically secure for institutional investment\n');

console.log('For comparison:');
console.log('  • Winning lottery: ~10^-7');
console.log('  • Lightning strike (lifetime): ~10^-5');
console.log('  • SHA-256 collision: ~10^-57 to 10^-72');
console.log('  → SHA-256 is 50+ orders of magnitude safer\n');

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateCollisionProbability,
        printScenario
    };
}
