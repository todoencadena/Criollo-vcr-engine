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

### Phase 0 Deliverables - Privacy Foundation (40% Complete)

- [x] **Entity hashing functions** (environment, animal, operator) ✅
  - `hashAnimal()` - Privacy-preserving animal identity hashing
  - `hashEnvironment()` - Shelter/refuge hashing with name normalization
  - `hashOperator()` - Veterinarian/operator credential hashing
  - 29 tests, 100% coverage
  - SHA-256 algorithm with salt protection

- [x] **Module documentation** ✅
  - Comprehensive README with examples
  - Security properties documented
  - Usage patterns for VCR architecture

- [ ] NPI compliance middleware
- [ ] PII vault schema + encryption
- [ ] Access control system
- [ ] Audit logging
- [ ] Privacy test suite expansion
- [ ] Hash collision probability analysis
- [ ] Phase 0 completion documentation

### Recent Commits
```
d86bd67 - Add comprehensive README for privacy hashing module
875a763 - Add hashOperator function with 9 tests (29 total, 100% coverage)
6f363fc - Add hashEnvironment function with 11 tests
a419215 - Add hashAnimal function with 100% test coverage
0670712 - Initial setup: project structure, Jest configuration
```

### Test Results
```
✓ 29 tests passing
✓ 100% code coverage (Statements, Branch, Functions, Lines)
✓ 1.2s execution time
```

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
