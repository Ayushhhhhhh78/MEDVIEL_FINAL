pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Merkle proof verifier for fixed depth
 * Uses Poseidon(2) to reconstruct root from leaf and path elements
 */
template MerkleVerifier(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    signal nodes[depth + 1];
    nodes[0] <== leaf;

    component hashers[depth];
    signal left[depth];
    signal right[depth];

    for (var i = 0; i < depth; i++) {
        // Enforce pathIndices[i] is binary (0 or 1)
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Multiplexing between leaf/current node and sibling element
        left[i] <== nodes[i] + pathIndices[i] * (pathElements[i] - nodes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (nodes[i] - pathElements[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];

        nodes[i + 1] <== hashers[i].out;
    }

    root <== nodes[depth];
}

/**
 * MEDVEIL Claim Verification Circuit
 * 
 * Proves in Zero-Knowledge:
 * 1. Hospital belongs to the authorized hospital Merkle tree (depth 4)
 * 2. Hospital signed the claim using BabyJubJub EdDSA with Poseidon hash
 * 3. Policy is active (treatmentDate <= policyExpiryDate)
 * 4. Claim amount does not exceed policy limit (claimAmount <= policyLimit)
 * 5. Procedure is covered under policy coverage Merkle tree (depth 4)
 * 6. Policy terms match on-chain registered policy commitment
 * 7. Deterministic nullifier prevents double-claim attacks
 */
template ClaimVerification() {
    var TREE_DEPTH = 4;

    // ==========================================
    // 1. PUBLIC SIGNALS
    // ==========================================
    signal input claimAmount;              // Public claim settlement amount
    signal input treatmentDate;            // Format: YYYYMMDD (numeric)
    signal input hospitalRegistryRoot;     // Merkle root of approved hospitals
    signal input policyCommitment;         // Poseidon(policyId, limit, expiry, coverageRoot)
    signal input claimNullifier;           // Deterministic unique nullifier
    signal input hospitalAx;               // Hospital BabyJubJub public key coordinate X
    signal input hospitalAy;               // Hospital BabyJubJub public key coordinate Y

    // ==========================================
    // 2. PRIVATE SIGNALS (WITNESS)
    // ==========================================
    // Claim identifiers
    signal input claimId;
    signal input policyId;
    signal input hospitalId;

    // Policy private parameters
    signal input policyLimit;
    signal input policyExpiryDate;
    signal input coverageRoot;

    // Procedure details (kept completely private from insurer & chain)
    signal input procedureCode;
    signal input procedureMerklePath[TREE_DEPTH];
    signal input procedurePathIndices[TREE_DEPTH];

    // Hospital registry Merkle proof
    signal input hospitalMerklePath[TREE_DEPTH];
    signal input hospitalPathIndices[TREE_DEPTH];

    // Patient nullifier inputs
    signal input patientSecret;
    signal input claimEpisodeId;

    // Hospital EdDSA BabyJubJub signature components
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // ==========================================
    // 3. POLICY COMMITMENT VERIFICATION
    // ==========================================
    // Enforce that policyId, limit, expiryDate, and coverageRoot match the public commitment
    component policyCommitmentHasher = Poseidon(4);
    policyCommitmentHasher.inputs[0] <== policyId;
    policyCommitmentHasher.inputs[1] <== policyLimit;
    policyCommitmentHasher.inputs[2] <== policyExpiryDate;
    policyCommitmentHasher.inputs[3] <== coverageRoot;
    policyCommitmentHasher.out === policyCommitment;

    // ==========================================
    // 4. POLICY VALIDITY CHECKS
    // ==========================================
    // 4a. Active date check: treatmentDate <= policyExpiryDate
    // Meaning: policyExpiryDate < treatmentDate MUST be false (0)
    component dateCheck = LessThan(64);
    dateCheck.in[0] <== policyExpiryDate;
    dateCheck.in[1] <== treatmentDate;
    dateCheck.out === 0;

    // 4b. Claim amount check: claimAmount <= policyLimit
    // Meaning: policyLimit < claimAmount MUST be false (0)
    component amountCheck = LessThan(64);
    amountCheck.in[0] <== policyLimit;
    amountCheck.in[1] <== claimAmount;
    amountCheck.out === 0;

    // ==========================================
    // 5. COVERED PROCEDURE MERKLE PROOF
    // ==========================================
    // Leaf is Poseidon(procedureCode)
    component procedureLeafHasher = Poseidon(1);
    procedureLeafHasher.inputs[0] <== procedureCode;

    component procedureTreeVerifier = MerkleVerifier(TREE_DEPTH);
    procedureTreeVerifier.leaf <== procedureLeafHasher.out;
    for (var i = 0; i < TREE_DEPTH; i++) {
        procedureTreeVerifier.pathElements[i] <== procedureMerklePath[i];
        procedureTreeVerifier.pathIndices[i] <== procedurePathIndices[i];
    }
    procedureTreeVerifier.root === coverageRoot;

    // ==========================================
    // 6. HOSPITAL REGISTRY MERKLE PROOF
    // ==========================================
    // Leaf is Poseidon(hospitalId, hospitalAx, hospitalAy)
    component hospitalLeafHasher = Poseidon(3);
    hospitalLeafHasher.inputs[0] <== hospitalId;
    hospitalLeafHasher.inputs[1] <== hospitalAx;
    hospitalLeafHasher.inputs[2] <== hospitalAy;

    component hospitalTreeVerifier = MerkleVerifier(TREE_DEPTH);
    hospitalTreeVerifier.leaf <== hospitalLeafHasher.out;
    for (var j = 0; j < TREE_DEPTH; j++) {
        hospitalTreeVerifier.pathElements[j] <== hospitalMerklePath[j];
        hospitalTreeVerifier.pathIndices[j] <== hospitalPathIndices[j];
    }
    hospitalTreeVerifier.root === hospitalRegistryRoot;

    // ==========================================
    // 7. EDDSA HOSPITAL SIGNATURE VERIFICATION
    // ==========================================
    // Hash of all claim parameters (canonical BN254 scalar field order)
    component claimHasher = Poseidon(6);
    claimHasher.inputs[0] <== claimId;
    claimHasher.inputs[1] <== policyId;
    claimHasher.inputs[2] <== hospitalId;
    claimHasher.inputs[3] <== claimAmount;
    claimHasher.inputs[4] <== treatmentDate;
    claimHasher.inputs[5] <== procedureCode;

    // Verify BabyJubJub EdDSA signature over claimHash using hospital public key (Ax, Ay)
    component eddsaVerifier = EdDSAPoseidonVerifier();
    eddsaVerifier.enabled <== 1;
    eddsaVerifier.Ax <== hospitalAx;
    eddsaVerifier.Ay <== hospitalAy;
    eddsaVerifier.R8x <== sigR8x;
    eddsaVerifier.R8y <== sigR8y;
    eddsaVerifier.S <== sigS;
    eddsaVerifier.M <== claimHasher.out;

    // ==========================================
    // 8. DETERMINISTIC NULLIFIER DERIVATION
    // ==========================================
    // Domain separated nullifier = Poseidon(patientSecret, claimEpisodeId, 1001)
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== patientSecret;
    nullifierHasher.inputs[1] <== claimEpisodeId;
    nullifierHasher.inputs[2] <== 1001; // Domain separator
    nullifierHasher.out === claimNullifier;
}

component main {public [claimAmount, treatmentDate, hospitalRegistryRoot, policyCommitment, claimNullifier, hospitalAx, hospitalAy]} = ClaimVerification();
