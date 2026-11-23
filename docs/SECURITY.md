# MEDVEIL — Security & Cryptographic Model

## 1. Threat Model & Mitigations

| Threat | Attack Vector | Mitigation in MEDVEIL |
| :--- | :--- | :--- |
| **Claim Replay / Double Spend** | Submitting the same valid claim twice to collect multiple payouts. | **Deterministic Nullifiers:** Derived from `Poseidon(patientSecret, episodeId, 1001)`. The contract checks `nullifierUsed[nullifier] == false` and burns it before transferring tokens. |
| **Medical Data Leakage** | Insurer scraping patient diagnoses or procedure details. | **Zero-Knowledge Witness:** Procedure code `7701` is private in the Circom circuit. The insurer only receives the Groth16 proof and public signals. |
| **Hospital Impersonation** | Rogue actor fabricating an insurance claim. | **Dual Signature & Registry:** BabyJubJub EdDSA signature verified in backend and circuit. Signer's public key $(A_x, A_y)$ must belong to the on-chain approved `HospitalRegistry` Merkle root. |
| **Unauthorized Payout Redirection** | Attacker submitting a valid claim but redirecting payout to their own wallet. | **Strict Registry Binding:** In `ClaimSettlement.sol`, tokens are sent *only* to the pre-registered `payoutAddress` bound to $(A_x, A_y)$ in `HospitalRegistry.sol`. |
| **Tampered Medical Files** | Modifying encrypted records in off-chain storage. | **AES-256-GCM + SHA-256:** 128-bit authentication tag detected tampering immediately. SHA-256 integrity hash verified against on-chain registration. |
| **Unauthorized Record Decryption** | Doctor attempting to read records after patient revocation. | **Smart Contract Access Gate:** Decryption capability is blocked immediately upon patient revocation. |
| **Reentrancy Attacks** | Contract calling external token/wallet before updating claim state. | **Checks-Effects-Interactions & OpenZeppelin ReentrancyGuard:** Nullifier marked used and state updated before token transfer. |

---

## 2. Key Management & Separation

- **Never Expose Private Keys:** Hospital BabyJubJub private seeds are managed via backend environment / KMS. They are never sent to the frontend or browser.
- **Envelope Encryption:** Each medical record uses a unique, random 256-bit AES key. The document key is wrapped using master/patient keys.
- **Unique IVs:** A fresh, cryptographically secure 12-byte initialization vector (IV) is generated for every single encryption operation, eliminating IV reuse attacks.

---

## 3. Trusted Setup Ceremony

The current prototype utilizes a development Phase 1 & Phase 2 Groth16 ceremony generated via `circuits/scripts/setup.js` with $2^{13} = 8,192$ constraints.

**Production Requirement:**  
Before any mainnet or live testnet deployment, a multi-party computation (MPC) Powers of Tau ceremony with independent participants must be executed to ensure toxic waste is destroyed.
