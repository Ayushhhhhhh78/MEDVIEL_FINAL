# MEDVEIL — Remix IDE Deployment Guide

This guide describes how to deploy the MEDVEIL smart contracts using [Remix IDE](https://remix.ethereum.org).

---

## 1. Required Deployment Order

Due to contract dependencies and verifier interfaces, deploy in this exact sequence:

1. **`contracts/Verifier.sol`** (`Groth16Verifier`)
2. **`contracts/HospitalRegistry.sol`**
3. **`contracts/PolicyRegistry.sol`**
4. **`contracts/PatientAccess.sol`**
5. **`contracts/TestToken.sol`** (MVT ERC-20)
6. **`contracts/ClaimSettlement.sol`**

---

## 2. Step-by-Step Instructions

### Step 1: Open Remix
- Navigate to [remix.ethereum.org](https://remix.ethereum.org).
- In the File Explorer, create a `contracts/` directory.
- Copy each `.sol` file from this repository into Remix:
  - `Verifier.sol`
  - `HospitalRegistry.sol`
  - `PolicyRegistry.sol`
  - `PatientAccess.sol`
  - `TestToken.sol`
  - `ClaimSettlement.sol`

### Step 2: Compiler Settings
- Solidity Compiler tab:
  - For `Verifier.sol`, choose compiler version `0.8.20`.
  - For all other contracts, choose `0.8.20` or `0.8.24`.
  - Enable **Optimization** (200 runs).

### Step 3: Deploy Contracts
1. Select Environment: `Injected Provider - MetaMask` (or Remix VM for testing).
2. Deploy `Groth16Verifier`. Note address `ADDR_VERIFIER`.
3. Deploy `HospitalRegistry`. Note address `ADDR_HOSPITAL_REGISTRY`.
4. Deploy `PolicyRegistry`. Note address `ADDR_POLICY_REGISTRY`.
5. Deploy `PatientAccess`. Note address `ADDR_PATIENT_ACCESS`.
6. Deploy `TestToken`. Note address `ADDR_TEST_TOKEN`.
7. Deploy `ClaimSettlement` with constructor arguments:
   - `_verifier`: `ADDR_VERIFIER`
   - `_hospitalRegistry`: `ADDR_HOSPITAL_REGISTRY`
   - `_policyRegistry`: `ADDR_POLICY_REGISTRY`
   - `_settlementToken`: `ADDR_TEST_TOKEN`

### Step 4: Post-Deployment Initialization
1. In `TestToken`: call `transfer(ADDR_CLAIM_SETTLEMENT, 1000000000000000000000000)` (1,000,000 tokens) to fund the settlement pool.
2. In `HospitalRegistry`:
   - Call `registerHospital(...)` with hospital ID, name, BabyJubJub coordinates, EVM address, and payout address.
   - Call `updateHospitalMerkleRoot(...)` with the hospital Merkle root from `deployed-addresses.json`.
3. In `PolicyRegistry`:
   - Call `registerPolicy(policyId, policyCommitment, coverageRoot)`.
