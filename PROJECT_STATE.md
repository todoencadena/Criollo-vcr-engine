# CRIOLLO VCR ENGINE - PROJECT STATE

## Current Status
- Commit: ad929c7
- Tests: 310/310 passing (100%)
- Phase: 2 Week 2 Day 8 complete
- Next: Day 9 (Batch Operations)

## Tech Stack
- Node.js v23.3.0 (ARM64)
- PostgreSQL@14 (via Rosetta 2)
- Jest for testing
- Mac M4

## Key Hashes
- testSalt pattern: 'test-salt-2026' or similar
- Environment: hashEnvironment(name, year, salt)
- Animal: hashAnimal(id, birthdate, salt)
- Operator: hashOperator(name, role, salt)

## Common Commands
- Test all: `npm test`
- Test specific: `npm test tests/[name].test.js`
- Commit pattern: `git commit -m "Phase 2 - Week X Day Y: [Module] - N tests, Total passing"`
- Git log: `git log --oneline | head -10`

## Active Modules (Phase 2)
1. Event Hashing (25 tests)
2. Care Event Model (21 tests)
3. Event Taxonomy (32 tests)
4. Metadata Validators (36 tests)
5. Timeline Queries (25 tests)
6. Aggregations (28 tests)
7. IER+CEL Integration (25 tests)
8. Advanced Queries (26 tests)

## Stakeholders
- Medici: Strategic/Capital coordination
- SoftBank, UntroD: Sovereign Compute cohort (Tier 1)
- SWARM grant: 50k pending

## Capital Status
- BTC: ~$68.5k (below $69.8k Hard Deck)
- Status: ABSOLUTE FREEZE
- Trigger: $70.2k for posture change

## Architecture
- Zero-PII: All personal data hashed with SHA-256
- Database: PostgreSQL with JSONB metadata
- Event types: intake, medical, care, transfer, outcome
- 32 validated event categories
- Parameterized queries (SQL injection prevention)
