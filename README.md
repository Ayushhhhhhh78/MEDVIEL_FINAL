# MEDVEIL
### Private Healthcare. Verifiable Claims.

MEDVEIL is a privacy-preserving healthcare and insurance claim infrastructure. It enables hospitals to prove that an insurance claim satisfies policy criteria without exposing the patient's diagnosis, clinical notes, prescriptions, procedure details, or medical records to the insurance company or public blockchain.

---

## 1. Problem Statement

In conventional health insurance:
- Patients must surrender their entire confidential medical history and diagnosis codes to insurance adjusters to receive reimbursement.
- Centralized insurance databases become prime targets for identity theft, health discrimination, and extortion.
- In manual claim processing, sensitive details pass through multiple administrative intermediaries, creating privacy leaks.

---

## 2. Proposed Solution

MEDVEIL solves this with Zero-Knowledge Cryptography:
1. **Zero-Knowledge Proofs (Groth16 on BN254):** Proves policy limits, coverage, and dates mathematically.
2. **BabyJubJub EdDSA Signatures:** Authenticates the hospital claim over a canonical Poseidon hash.
3. **Smart Contract Settlement:** On-chain verification and test-token payout to registered hospital addresses.
4. **AES-256-GCM Off-Chain Storage:** Full medical records remain encrypted off-chain.
5. **Deterministic Nullifiers:** Consumed on-chain to strictly prevent duplicate claim submissions.

---

## 3. System Architecture

```
Layer A: Frontend (Next.js App Router, Tailwind CSS, Web3 Wallet Challenge)
   │
Layer B: Backend & ZK Engine (Express.js, circomlibjs, snarkjs, node:sqlite)
   │
Layer C: Smart Contracts (Verifier.sol, HospitalRegistry, PolicyRegistry, ClaimSettlement, PatientAccess)
   │
Layer D: Encrypted Off-Chain Storage (AES-256-GCM, IPFS CID Addressing, SHA-256 Integrity)
```

---

## 4. Cryptographic Core

### 4.1 BabyJubJub EdDSA & Poseidon Hashing
- **Curve:** Twisted Edwards BabyJubJub over BN254 scalar field.
- **Signed Payload:**
  $$\text{Poseidon}(\text{claimId}, \text{policyId}, \text{hospitalId}, \text{claimAmount}, \text{treatmentDate}, \text{procedureCode})$$
- Verified in both Express backend and inside the Circom circuit.

### 4.2 What the ZK Circuit Proves
- **Hospital Membership:** Hospital leaf belongs to `hospitalRegistryRoot` Merkle tree.
- **Hospital Signature:** Hospital $(A_x, A_y)$ signed the claim Poseidon hash.
- **Active Policy:** $\text{treatmentDate} \le \text{policyExpiryDate}$.
- **Financial Limit:** $\text{claimAmount} \le \text{policyLimit}$.
- **Covered Procedure:** Procedure code belongs to `coverageRoot` Merkle tree.
- **Policy Commitment:** Terms match $\text{Poseidon}(\text{policyId}, \text{limit}, \text{expiry}, \text{coverageRoot})$.
- **Deterministic Nullifier:** $\text{Poseidon}(\text{patientSecret}, \text{episodeId}, 1001) = \text{claimNullifier}$.

### 4.3 Public vs Private Signals
- **Public (7 signals):** `claimAmount`, `treatmentDate`, `hospitalRegistryRoot`, `policyCommitment`, `claimNullifier`, `hospitalAx`, `hospitalAy`.
- **Private (Witness):** `claimId`, `policyId`, `hospitalId`, `policyLimit`, `policyExpiryDate`, `coverageRoot`, `procedureCode`, Merkle paths, `patientSecret`, `claimEpisodeId`, EdDSA signature components.

---

## 5. Quickstart & Installation

### Step 1: Install Dependencies
```bash
# Root
npm install

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Step 2: Compile Circuit & Trusted Setup
```bash
# Compiles Circom circuit (ClaimVerification.circom)
npm run circuit:compile

# Runs Phase 1 & 2 trusted setup and exports contracts/Verifier.sol
npm run circuit:setup
```

### Step 3: Compile & Deploy Smart Contracts
```bash
# Compiles Solidity contracts
npm run contracts:compile

# Deploys to local Hardhat network and updates deployed-addresses.json
npx hardhat run scripts/deploy.js
```

### Deploy to Sepolia testnet
1. Add `SEPOLIA_RPC_URL` from an RPC provider and `SEPOLIA_DEPLOYER_PRIVATE_KEY` for a dedicated, funded Sepolia test wallet to `.env`. Never use the example Hardhat key or a mainnet wallet key.
2. Optionally set `SEPOLIA_INSURER_ADDRESS` to the MetaMask wallet that should be authorized to publish policies.
3. Compile and deploy:
   ```bash
   npm run contracts:compile
   npm run contracts:deploy:sepolia
   ```
4. Restart the backend so it loads the Sepolia deployment. Add/switch MetaMask to Sepolia and publish with the authorized insurer wallet or deployment owner. Deployment gas requires Sepolia test ETH.

### Step 4: Seed Database with Synthetic Data
```bash
npm run seed
```

### Step 5: Start Development Servers
In Terminal 1 (Backend):
```bash
npm run backend:dev
```
In Terminal 2 (Frontend):
```bash
npm run frontend:dev
```
Open **`http://localhost:3000`** in your browser.

---

## 6. Synthetic Demo Accounts

All demo accounts can be logged into via **1-Click** on `http://localhost:3000/login`:

| Role | Username | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **PATIENT** | `rahul` | `Password123!` | View encrypted records, grant/revoke doctor access, view settled claims |
| **HOSPITAL** | `apollo_hospital` | `Password123!` | Submit claim, sign with EdDSA, generate Groth16 proof, settle |
| **INSURER** | `medicare_insurer` | `Password123!` | Underwrite policies, register commitments, mathematically verify |
| **DOCTOR** | `dr_sharma` | `Password123!` | View authorized patient clinical records and decrypt summaries |
| **ADMIN** | `admin` | `AdminPassword123!` | System registry governance and privacy-preserving audit trail |

---

## 7. Running the Automated Test Suites

```bash
# Run EdDSA BabyJubJub unit tests
npm run test:eddsa

# Run Circom & Groth16 circuit proving tests
npm run test:circuits

# Run Hardhat Solidity smart contract tests (11 passing tests)
npm run test:contracts

# Run Backend Express API integration tests
npm run test:backend

# Run End-to-End Rahul Surgical Claim workflow scenario
npm run test:integration

# Or run ALL tests sequentially
npm run test:all
```

---

## 8. Documentation Index

- [Architecture & Protocol Specification](docs/ARCHITECTURE.md)
- [REST API Reference](docs/API.md)
- [Security Model & Cryptographic Guarantees](docs/SECURITY.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Remix IDE Deployment Walkthrough](docs/REMIX_GUIDE.md)
- [Demo & User Journey Guide](docs/DEMO_GUIDE.md)
- [Technical Limitations & Disclosures](docs/LIMITATIONS.md)
- [Current Build Status & Checklist](BUILD_STATUS.md)

---

## 9. License

MIT License. Designed and engineered for the Web3 Healthcare Privacy Hackathon.
