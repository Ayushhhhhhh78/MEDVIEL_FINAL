# MEDVEIL Circuits

This directory contains the Zero-Knowledge SNARK circuits for MEDVEIL.

- **`ClaimVerification.circom`**: Main circuit template verifying:
  - Hospital BabyJubJub EdDSA signature over Poseidon claim hash
  - Hospital membership in authorized `hospitalRegistryRoot` (depth-4 Merkle tree)
  - Policy active date check: `treatmentDate <= policyExpiryDate`
  - Policy financial limit check: `claimAmount <= policyLimit`
  - Covered procedure membership in `coverageRoot` (depth-4 Merkle tree)
  - Insurer policy commitment binding: `Poseidon(policyId, limit, expiry, coverageRoot)`
  - Replay-resistant deterministic claim nullifier derivation
- **`build/`**: Compiled R1CS, WASM, and Groth16 zkey artifacts.
- **`scripts/compile.js`**: Compiles `ClaimVerification.circom` using `bin/circom.exe`.
- **`scripts/setup.js`**: Executes Groth16 Powers of Tau trusted setup and exports `contracts/Verifier.sol`.
- **`scripts/test-circuit.js`**: Automated circuit test suite.
