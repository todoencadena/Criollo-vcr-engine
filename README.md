# Criollo VCR Minting Engine

> Privacy-first blockchain infrastructure for verifiable animal care events

## 🎯 Status

**Current Phase:** Phase 0 - Privacy Foundation (40% Complete)

**Timeline:** 11 weeks to Base Sepolia deployment

**Partners:** Animoca Brands, UntroD, Japan Sovereign Compute

## 🏗️ Architecture

5-Layer VCR (Verifiable Care Record) Minting Engine:

- **Phase 0:** Privacy Foundation (Weeks 1-2) ← IN PROGRESS
- **Phase 1:** Intake Environment Registry (IER) (Weeks 3-4)
- **Phase 2:** Care Event Logger (CEL) (Weeks 5-6)
- **Phase 3:** Operator Attestation Layer (OAL) (Week 7)
- **Phase 4:** Criollo Witness Engine (CWE) (Week 8)
- **Phase 5:** VCR Minting Logic (ERC-1155) (Weeks 9-10)
- **Phase 6:** Testing & Documentation (Week 11)

## 🔐 Core Principles

1. **Zero PII on-chain** - "Care without coercion"
2. **Verifiable provisioning** over subjective narratives
3. **Institutional compliance** - NPI liability protection
4. **Sovereign data asset** - Investible by institutional capital

## 📊 Progress

### Phase 0 Deliverables - Privacy Foundation ✅ COMPLETE (100%)

- [x] **Entity hashing functions** ✅
  - `hashAnimal()` - Privacy-preserving animal identity hashing
  - `hashEnvironment()` - Shelter/refuge hashing with name normalization
  - `hashOperator()` - Veterinarian/operator credential hashing
  - 29 tests, 100% coverage
  - SHA-256 algorithm with salt protection

- [x] **NPI compliance middleware** ✅
  - 57 forbidden PII fields identified and enforced
  - `validateNPICompliance()` with comprehensive validation
  - Helper functions (`isForbiddenField`, `getForbiddenFields`)
  - 21 tests, 100% coverage

- [x] **Module documentation** ✅
  - Comprehensive README with examples
  - Security properties documented
  - Usage patterns for VCR architecture

- [x] **Hash collision probability analysis** ✅
  - Formal mathematical analysis (222 lines)
  - Calculation script for scenarios
  - Proof of SHA-256 security at global scale
  - Probability: 10^-58 to 10^-72 (essentially zero)

### Phase 0 Signal - Ready for Medici ✅

All deliverables complete:
- ✅ Privacy architecture documentation
- ✅ NPI compliance test suite (50 tests, 100% coverage)
- ✅ Hash collision probability analysis

**Phase 0 Status:** COMPLETE - Ready for Phase 1

### Recent Commits
```
7797f4a - Add hash collision probability analysis (mathematical proof)
a6c99ff - Add privacy module index for centralized exports
a063a20 - Add NPI compliance middleware (50 total tests, 100% coverage)
63f4319 - Add comprehensive project README
d86bd67 - Add comprehensive README for privacy hashing module
875a763 - Add hashOperator function (29 total tests)
6f363fc - Add hashEnvironment function (11 tests)
a419215 - Add hashAnimal function (100% test coverage)
0670712 - Initial setup
```

### Test Results
```
✓ 50 tests passing
✓ 100% code coverage (Statements, Branch, Functions, Lines)
✓ 2 test suites (hashing, npi-compliance)
✓ ~1.5s execution time
```

### Next Phase

**Phase 1:** Intake Environment Registry (IER) - Weeks 3-4
- Environment eligibility system
- PostgreSQL database schema
- Registration API

## 🚀 Quick Start
```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check coverage
npm run test:coverage
```

## 📁 Project Structure
```
criollo-vcr-engine/
├── packages/
│   └── privacy/          # Phase 0 - Privacy Foundation
│       ├── hashing.js    # Entity hashing functions
│       └── README.md     # Module documentation
├── tests/                # Test files
│   └── hashing.test.js   # Hashing function tests (29 tests)
├── docs/                 # Documentation
├── scripts/              # Utility scripts
└── README.md             # This file
```

## 📚 Documentation

- [Privacy Hashing Module](./packages/privacy/README.md) - Entity hashing functions and security properties

## 👤 Contact

Built by [@todoencadena](https://twitter.com/todoencadena)

Partnership: Animoca Brands

---

**"If the event is untamperable and the subject is private, the yield modeling becomes a standard accounting exercise."**

— Medici, Animoca Brands
