# MEDVEIL — Demo & User Journey Guide

This guide walks through the complete synthetic **Rahul Surgical Claim** demonstration.

---

## Synthetic Personas & Credentials

| Role | Persona | Username | Password | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **PATIENT** | Rahul Sharma | `rahul` | `Password123!` | Policy #POL-MED-5001 (₹5,00,000 limit) |
| **HOSPITAL** | Apollo Synthetic | `apollo_hospital` | `Password123!` | Registered provider, BabyJubJub EdDSA signer |
| **INSURER** | MediCare Provider | `medicare_insurer` | `Password123!` | Policy underwriter, mathematical proof verifier |
| **DOCTOR** | Dr. A. K. Sharma | `dr_sharma` | `Password123!` | Surgeon granted medical record access |
| **ADMIN** | System Admin | `admin` | `AdminPassword123!` | Registry & governance operator |

---

## 6-Scene Demonstration Walkthrough

### Scene 1: Patient Rahul Inspects Encrypted Records
1. Go to `http://localhost:3000/login`.
2. Click **Patient (Rahul)** 1-click login button.
3. Observe:
   - Registered policy: MediCare National Health (₹5,00,000 limit).
   - Encrypted Medical Record: "Laparoscopic Appendectomy Discharge Summary" with IPFS CID and SHA-256 hash.
4. Click **Decrypt**: The client decrypts the AES-256-GCM ciphertext on-the-fly and downloads the clinical summary.

### Scene 2: Hospital Apollo Prepares & Signs Claim
1. Open new window or logout and click **Hospital (Apollo)**.
2. Observe verified badge linked to `HospitalRegistry.sol`.
3. Under "Create New Healthcare Claim":
   - Patient: Rahul Sharma
   - Claim Amount: ₹2,50,000
   - Treatment Date: 20260515
   - Private Procedure Code: `7701` (Covered Laparoscopic Appendectomy)
4. Click **Initialize Claim**.

### Scene 3: Cryptographic Proof Generation
1. In the Cryptographic Claim Lifecycle stepper:
   - Click **1. EdDSA Sign**: Hospital generates BabyJubJub signature over Poseidon claim hash.
   - Click **2. Generate ZK Proof**: Backend independently verifies signature, compiles Circom witness, and generates actual Groth16 proof using snarkjs in <1 second!
   - Click **3. Verify Locally**: Verifies proof locally with `verification_key.json`.
2. Note the deterministic claim nullifier generated.

### Scene 4: Blockchain Proof Verification & Settlement
1. Click **4. Submit & Settle On-Chain**.
2. Smart contract executes:
   - Groth16 pairing check in `Verifier.sol`.
   - Replay check: ensures nullifier is unconsumed.
   - Payout transfer: Sends 250,000 MVT tokens directly to hospital's pre-registered payout address.
3. Observe real transaction hash and block confirmation.

### Scene 5: Duplicate Claim Protection Test
1. Click submit again or run:
   ```bash
   npx hardhat run test/integration/workflow.test.js
   ```
2. Observe: Contract immediately reverts with `Claim nullifier already consumed`. Double-settlement is mathematically prevented!

### Scene 6: Patient-Controlled Doctor Access
1. Sign back in as **Rahul**.
2. Click **Revoke Dr. Sharma** on the surgical record.
3. Sign in as **Dr. Sharma** (`dr_sharma` / `Password123!`).
4. Attempt to decrypt the record -> Access is immediately blocked!
