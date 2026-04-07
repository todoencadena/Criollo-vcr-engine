# Quick Context for Claude

## What we're building
Zero-PII animal welfare verification on Solana. 
PostgreSQL backend, SHA-256 hashing, institutional-grade testing.

## Current state
- 310/310 tests passing
- Day 8 complete (Advanced Queries)
- Ready for Day 9 (Batch Operations)
- M4 Mac with Rosetta 2 for PostgreSQL

## When you join a session
1. `cd Desktop/criollo-vcr-engine`
2. `git log --oneline | head -3` to see progress
3. `npm test 2>&1 | tail -5` to verify (should show 310 passing)
4. Continue with current day's work

## Key patterns
- Always maintain 100% test coverage
- Use `testSalt = 'test-salt-2026'` or similar pattern
- Commit format: "Phase 2 - Week X Day Y: Module - N tests, Total passing"
- Zero-PII = no personal data, all SHA-256 hashes
- Event types: intake, medical, care, transfer, outcome
- 32 validated categories across all event types

## No need to re-explain
- Project history (we're on Day 8 of Phase 2 Week 2)
- Test setup (already working, 310/310 passing)
- Database config (PostgreSQL configured and running)
- Git workflow (established pattern)
- Architecture decisions (Zero-PII, SHA-256, JSONB metadata)

## File structure
- `packages/cel/` - Care Event Logger modules
- `packages/ier/` - Intake Environment Registry
- `packages/privacy/` - Hashing functions
- `packages/integration/` - Cross-phase integration
- `tests/` - All test files

## Common tasks
- Create new module: Create in `packages/cel/`, then create test in `tests/`
- Run specific test: `npm test tests/[filename].test.js`
- Commit: `git add . && git commit -m "message" && git push origin main`
- Check status: `git status && git log --oneline | head -5`
