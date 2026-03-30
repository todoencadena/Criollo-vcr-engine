# Privacy Module - Entity Hashing

> SHA-256 hashing functions for privacy-preserving entity identification

## Overview

This module provides cryptographic hashing functions that convert real-world entity identities into irreversible hash values, enabling verification of care events without exposing personally identifiable information (PII).

## Core Principle

**"The wall between care and coercion"**

By hashing entity identities, we create a privacy layer that allows institutional investors to verify that care events occurred without knowing the biological subjects, locations, or individuals involved.

## Functions

### hashAnimal(microchipId, intakeDate, salt)

Generates a privacy-preserving hash for animal subjects.

**Parameters:**
- `microchipId` (string) - Animal's microchip ID
- `intakeDate` (string) - Rescue date (YYYY-MM-DD format)
- `salt` (string) - Secret salt for additional security

**Returns:** 64-character hexadecimal hash (SHA-256)

**Example:**
```javascript
const { hashAnimal } = require('./hashing');

const animalHash = hashAnimal('985112345678901', '2026-03-25', 'secret_salt');
// Returns: "a3f2c8b9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0"
```

**Why these parameters:**
- Microchip ID: Technical identifier (not name/breed)
- Intake date: Temporal marker
- Salt: Prevents rainbow table attacks

---

### hashEnvironment(name, year, salt)

Generates a privacy-preserving hash for shelters/refuges.

**Parameters:**
- `name` (string) - Environment/shelter name
- `year` (number) - Year of operation
- `salt` (string) - Secret salt

**Returns:** 64-character hexadecimal hash (SHA-256)

**Example:**
```javascript
const { hashEnvironment } = require('./hashing');

const envHash = hashEnvironment('Refugio Patitas', 2026, 'secret_salt');
// Returns: "b4e3d2c1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a39281706"
```

**Special features:**
- Normalizes name (lowercase, trim whitespace)
- Case-insensitive: "Refugio Patitas" === "REFUGIO PATITAS"
- Year allows temporal tracking without revealing identity

---

### hashOperator(licenseNumber, jurisdiction, salt)

Generates a privacy-preserving hash for veterinarians/operators.

**Parameters:**
- `licenseNumber` (string) - Professional license number
- `jurisdiction` (string) - State/country of license
- `salt` (string) - Secret salt

**Returns:** 64-character hexadecimal hash (SHA-256)

**Example:**
```javascript
const { hashOperator } = require('./hashing');

const opHash = hashOperator('VET-FL-123456', 'Florida', 'secret_salt');
// Returns: "c5f4e3d2b1a0987654321fedcba9876543210fedcba98765432fedcba9876"
```

**Why these parameters:**
- License number: Verifiable credential (not personal name)
- Jurisdiction: Scope of authority
- Protects operator privacy while enabling verification

---

## Security Properties

### One-Way Function
- Cannot reverse hash to get original data
- SHA-256 collision probability: ~0 (2^256 space)

### Deterministic
- Same inputs always produce same hash
- Enables verification without re-exposing identity

### Collision Resistant
- Different inputs produce different hashes
- Microchip "123" ≠ Microchip "456" → different hashes

### Salt Protection
- Unique salt per deployment prevents rainbow table attacks
- Without salt, attacker could pre-compute common values

---

## Test Coverage

**29 tests, 100% coverage**

- 9 tests for `hashAnimal()`
- 11 tests for `hashEnvironment()`
- 9 tests for `hashOperator()`

**Verified behaviors:**
- ✅ Consistency (same input → same output)
- ✅ Uniqueness (different inputs → different outputs)
- ✅ Format validation (64-char hex)
- ✅ Parameter validation (throws errors)
- ✅ Normalization (hashEnvironment case handling)

---

## Usage in VCR Architecture

### On-Chain Data (Blockchain):
```javascript
{
  animal_hash: "0xa3f2c8b9...",
  environment_hash: "0xb4e3d2c1...",
  operator_hash: "0xc5f4e3d2...",
  event_type: "clinical_vaccination",
  timestamp: 1711382400
}
```

### Off-Chain Data (PII Vault - Encrypted):
```javascript
{
  "0xa3f2c8b9...": { name: "Max", breed: "Golden Retriever" },
  "0xb4e3d2c1...": { name: "Refugio Patitas", location: "Miami" },
  "0xc5f4e3d2...": { name: "Dr. García", license: "VET-FL-123456" }
}
```

**Investor sees:** Only hashes (can verify care occurred)
**Investor NEVER sees:** Names, locations, descriptions

---

## NPI Compliance

**Zero PII on-chain:**
- ❌ No animal names
- ❌ No shelter names/addresses
- ❌ No operator names/contact info
- ✅ Only irreversible hashes

This eliminates investor liability while proving care integrity.

---

## Development

**Run tests:**
```bash
npm test
```

**Check coverage:**
```bash
npm run test:coverage
```

---

## License

MIT

---

Built for **Criollo VCR Minting Engine**
Phase 0 - Privacy Foundation
Partnership: Animoca Brands
