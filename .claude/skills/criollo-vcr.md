---
name: criollo-vcr
description: Expert knowledge of the Criollo VCR Engine — a privacy-first Verifiable Care Receipt minting system for animal rescue networks on Solana. Use when working on VCR hashing, attestation layers, witness engine, Solana minting, or test suites in this project.
---

# Criollo VCR Engine Skill

## What is Criollo?
Criollo is a 6-phase infrastructure engine that mints Verifiable Care Receipts (VCRs) on Solana for animal rescue networks in Latin America. Every animal care event — vaccination, rescue, surgery — is hashed and recorded permanently on-chain, allowing rescue foundations to prove to donors that funds reached the right animal.

## Core VCR Structure
Every VCR contains exactly 6 hashes + metadata:
- vcrHash — root hash connecting everything
- attestationHash — proof of attestation
- eventHash — the care event (vaccination, rescue, etc.)
- animalHash — the specific animal
- environmentHash — geographic/contextual data
- operatorHash — the verified operator who performed care
- operatorRole — role string (VetTechnician, Rescuer, etc.)
- attestedAt — ISO timestamp of attestation
- witnessedAt — ISO timestamp of witnessing

All hashes are SHA-256.

## Project Structure
criollo-vcr-engine/
  packages/
    cel/          - Care Event Logger
    ier/          - Intake Environment Registry
    cwe/          - Criollo Witness Engine (Phase 4)
    minting/
      scripts/
        solana/
          mintVCR.ts   - Solana Devnet minting script
    integration/
    privacy/
  tests/
  scripts/

## Development Phases
- Phase 0: Privacy Foundation complete
- Phase 1: Intake Environment Registry complete
- Phase 2: Care Event Logger complete
- Phase 3: Operator Attestation Layer complete
- Phase 4: Criollo Witness Engine complete
- Phase 5: Solana Devnet Minting complete

## Running Tests
cd ~/Desktop/criollo-vcr-engine
npm test
Expected: 432/432 tests passing across 17 modules

## Minting a VCR on Solana Devnet
cd ~/Desktop/criollo-vcr-engine
export PATH="/Users/juangarciaamador/.local/share/solana/install/active_release/bin:$PATH"
npx ts-node packages/minting/scripts/solana/mintVCR.ts

## Live Devnet VCR
- Mint Address: JRtnkj4qouPryh9HTuN1yTrJmpMGKbJ4Nbp5CwYkcEy
- Explorer: https://explorer.solana.com/address/JRtnkj4qouPryh9HTuN1yTrJmpMGKbJ4Nbp5CwYkcEy?cluster=devnet
- VCR Hash: 82f8ec4127498c94038370255ba0fd92fcd6db152fb7a8de0a1806b0c0f844d2

## Key Principles
- Privacy-first: no PII stored on-chain, only hashes
- Immutable: once minted, a VCR cannot be altered
- Verifiable: anyone can verify a VCR hash without accessing raw data
- LATAM-focused: built for animal rescue networks in Colombia and Miami

## Stack
- TypeScript + Jest (testing)
- Solana Web3.js + Metaplex (minting)
- SHA-256 hashing (privacy layer)
- Node.js 23+

## GitHub
https://github.com/todoencadena/Criollo-vcr-engine
