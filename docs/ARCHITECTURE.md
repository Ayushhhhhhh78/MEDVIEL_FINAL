# MEDVEIL — System Architecture

**Private Healthcare. Verifiable Claims.**

---

## 1. Executive Summary

MEDVEIL is a decentralized, privacy-preserving healthcare claim verification and medical record management protocol. It eliminates the traditional trade-off between health insurance claim verifiability and patient privacy.

By pairing **Zero-Knowledge SNARKs (Groth16 on BN254)** with **BabyJubJub EdDSA signatures**, **Poseidon cryptographic hashing**, **Solidity smart contracts**, and **AES-256-GCM off-chain envelope encryption**, hospitals can mathematically prove that:
1. An approved hospital rendered care.
2. The patient's insurance policy was active on the treatment date.
3. The procedure is covered under the policy terms.
4. The requested reimbursement is within the financial policy limit.
5. The claim has not been previously submitted or settled (deterministic nullifier).

All without revealing the diagnosis, prescriptions, procedure code, or complete medical record to the insurer or the public blockchain.

---

## 2. Four Connected Architectural Layers

```
+-----------------------------------------------------------------------------------+
|                           LAYER A: FRONTEND APPLICATIONS                          |
|  - Patient Dashboard (Encrypted records, doctor access management, claims)        |
|  - Hospital Dashboard (Claim creation, EdDSA signing, ZK workflow progression)    |
|  - Insurer Dashboard (Commitment underwriting, mathematical proof verification)   |
|  - Web3 MetaMask Integration & Challenge Signing                                  |
+-----------------------------------------------------------------------------------+
                                        | (REST APIs / Web3 JSON-RPC)
+-----------------------------------------------------------------------------------+
|                        LAYER B: BACKEND & CRYPTOGRAPHIC ENGINE                    |
|  - Express.js API with Helmet, CORS, and Rate Limiting                            |
|  - BabyJubJub EdDSA Service (circomlibjs, prv2pub, signPoseidon, verifyPoseidon)  |
|  - ZK Prover Service (snarkjs fullProve, witness builder, local verification)     |
|  - Poseidon Merkle Tree Generator (depth-4 hospital and procedure trees)          |
|  - AES-256-GCM Envelope Encryption Service & Key Separation                       |
|  - Blockchain Service (ethers.js v6, transaction receipts, calldata formatting)   |
|  - SQLite Database (Synchronous Node 24 native engine)                            |
+-----------------------------------------------------------------------------------+
                      |                                         |
     (Groth16 Proof & Inputs)                     (Encrypted Ciphertext)
                      v                                         v
+-------------------------------------+   +-----------------------------------------+
|      LAYER C: SMART CONTRACTS       |   |       LAYER D: OFF-CHAIN STORAGE        |
|  - Groth16Verifier.sol              |   |  - AES-256-GCM Encrypted Payloads       |
|  - HospitalRegistry.sol             |   |  - IPFS-Compatible Addressing (CID)     |
|  - PolicyRegistry.sol               |   |  - SHA-256 File Integrity Verification  |
|  - ClaimSettlement.sol              |   |  - Doctor Key Wrapping & Unwrapping     |
|  - PatientAccess.sol                |   |  - Local Storage Adapter Fallback       |
|  - TestToken.sol (MVT ERC-20)       |   +-----------------------------------------+
+-------------------------------------+
```

---

## 3. Cryptographic Primitives & Field Constraints

### 3.1 BN254 Scalar Field (Alt-bn128)
All cryptographic operations (Poseidon hashing, BabyJubJub curve points, and Groth16 proving) operate over the prime scalar field:
$$r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$$

### 3.2 BabyJubJub EdDSA Signatures
- **Curve Equation**: $168700 x^2 + y^2 = 1 + 168696 x^2 y^2$
- **Base Point**: $B8 = (x, y)$
- **Key Generation**: 32-byte cryptographically secure seed -> scalar multiplication -> public key $(A_x, A_y)$.
- **Claim Hash**:
  $$\text{ClaimHash} = \text{Poseidon}(\text{claimId}, \text{policyId}, \text{hospitalId}, \text{claimAmount}, \text{treatmentDate}, \text{procedureCode})$$
- **Signature**: $(R_{8x}, R_{8y}, S)$ where $R8$ is a curve point and $S$ is a field scalar.

### 3.3 Circom Circuit (`ClaimVerification.circom`)
- **Total Non-linear Constraints**: 7,662
- **Powers of Tau**: Exponent 13 ($2^{13} = 8,192$ constraints)
- **Public Signals (7)**:
  1. `claimAmount`
  2. `treatmentDate`
  3. `hospitalRegistryRoot`
  4. `policyCommitment`
  5. `claimNullifier`
  6. `hospitalAx`
  7. `hospitalAy`
- **Private Witness (28 signals)**:
  `claimId`, `policyId`, `hospitalId`, `policyLimit`, `policyExpiryDate`, `coverageRoot`, `procedureCode`, `procedureMerklePath[4]`, `procedurePathIndices[4]`, `hospitalMerklePath[4]`, `hospitalPathIndices[4]`, `patientSecret`, `claimEpisodeId`, `sigR8x`, `sigR8y`, `sigS`.

### 3.4 Deterministic Claim Nullifiers
To prevent double-spending and duplicate submissions across hospitals or episodes:
$$\text{Nullifier} = \text{Poseidon}(\text{patientSecret}, \text{claimEpisodeId}, 1001)$$
The constant `1001` serves as a domain separator. `ClaimSettlement.sol` records `nullifierUsed[nullifier] = true` before transferring tokens.

---

## 4. Off-Chain Medical Record Encryption (Layer D)
Plaintext medical data is never written to disk or the blockchain:
1. Patient or hospital uploads document.
2. A random 256-bit symmetric key $K_{\text{doc}}$ is generated.
3. A random 96-bit (12-byte) initialization vector $\text{IV}$ is generated.
4. Data is encrypted using AES-256-GCM, producing ciphertext $C$ and a 128-bit authentication tag $T$.
5. $K_{\text{doc}}$ is envelope-encrypted with master/patient keys.
6. The ciphertext is saved to off-chain storage with an IPFS CID reference and SHA-256 integrity hash.
7. `PatientAccess.sol` manages on-chain authorization mappings. When a doctor requests decryption, authorization is checked against the smart contract.
