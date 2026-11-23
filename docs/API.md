# MEDVEIL — API Documentation

Base URL: `http://localhost:5000` (or configured `PORT`)

All authenticated endpoints require an `Authorization: Bearer <JWT>` header.

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Registers a new user and role profile.
- **Roles**: `PATIENT`, `HOSPITAL`, `INSURER`, `DOCTOR`, `ADMIN`
- **Body**:
  ```json
  {
    "username": "rahul",
    "email": "rahul@synthetic.health",
    "password": "Password123!",
    "role": "PATIENT",
    "walletAddress": "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    "profileDetails": { "fullName": "Rahul Sharma" }
  }
  ```
- **Response**: `201 Created` with `{ user, token }`.

### `POST /api/auth/login`
Authenticates with username/email and password.
- **Body**: `{ "identifier": "rahul", "password": "Password123!" }`
- **Response**: `200 OK` with `{ user, token }`.

### `GET /api/auth/me`
Returns current authenticated user profile.
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` with `{ user, profile }`.

### `GET /api/auth/wallet-challenge?address=0x...`
Generates a replay-resistant cryptographic nonce for MetaMask wallet login.

### `POST /api/auth/wallet-verify`
Validates recovered wallet signature and returns session JWT.

---

## 2. Hospital Endpoints

### `GET /api/hospitals`
Returns list of approved active healthcare providers.

### `GET /api/hospitals/:id/verification`
Queries on-chain `HospitalRegistry.sol` to verify whether the hospital's BabyJubJub public key $(A_x, A_y)$ and payout address are active.

### `POST /api/hospitals/register`
Registers a new hospital (Requires `ADMIN` or `HOSPITAL` role).

---

## 3. Policy Endpoints

### `GET /api/policies`
Returns list of registered insurance policies.

### `POST /api/policies`
Creates a new policy with covered procedures Merkle tree and Poseidon commitment (Requires `INSURER` or `ADMIN`).
- **Body**:
  ```json
  {
    "policyNumber": "POL-MED-5001",
    "policyLimit": 500000,
    "expiryDate": 20261231,
    "coveredProcedures": [7701, 7702, 7703]
  }
  ```

### `POST /api/policies/:id/register-on-chain`
Submits a blockchain transaction to register the commitment in `PolicyRegistry.sol`.

---

## 4. Claim Endpoints (ZK Workflow)

### `POST /api/claims`
Hospital creates a draft claim.
- **Body**:
  ```json
  {
    "patientId": 1,
    "policyId": 5001,
    "claimAmount": 250000,
    "treatmentDate": 20260515,
    "procedureCode": 7701
  }
  ```

### `POST /api/claims/:id/sign`
Signs the claim with hospital's BabyJubJub EdDSA private key over the Poseidon claim hash.

### `POST /api/claims/:id/generate-proof`
1. Backend verifies hospital signature independently.
2. Compiles Circom witness dictionary.
3. Generates Groth16 proof using snarkjs.
4. Returns public signals and unique nullifier.

### `POST /api/claims/:id/verify-proof`
Verifies proof locally against `verification_key.json`.

### `POST /api/claims/:id/submit`
Formats proof into Solidity calldata and executes `ClaimSettlement.verifyAndSettleClaim`.

### `GET /api/claims`
Returns claims. **Privacy Rule:** When viewed by an `INSURER`, `procedure_code` and private witness elements are strictly stripped.

---

## 5. Medical Records Endpoints

### `POST /api/records/upload`
Multipart upload. Encrypts file with AES-256-GCM, uploads ciphertext to off-chain storage, and logs on-chain hash.

### `GET /api/records`
Returns accessible records for patient or authorized doctor. (Insurers are blocked with 403 Forbidden).

### `GET /api/records/:id/download`
Verifies authorization against `PatientAccess.sol`, decrypts ciphertext, and returns file.

### `POST /api/records/:id/grant-access`
Patient grants a doctor decryption permission with optional expiration.

### `POST /api/records/:id/revoke-access`
Patient revokes doctor permission.

---

## 6. Audit Trail Endpoints

### `GET /api/audit`
Returns system audit events. Confidential diagnoses, patient secrets, and keys are strictly omitted.
