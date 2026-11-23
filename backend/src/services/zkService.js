const path = require('path');
const fs = require('fs');
const snarkjs = require('snarkjs');
const { getCryptoPrimitives, toFieldElement } = require('./eddsaService');

const CIRCUIT_DIR = path.join(__dirname, '..', '..', '..', 'circuits', 'build');
const WASM_PATH = path.join(CIRCUIT_DIR, 'ClaimVerification_js', 'ClaimVerification.wasm');
const ZKEY_PATH = path.join(CIRCUIT_DIR, 'claim_final.zkey');
const VKEY_PATH = path.join(CIRCUIT_DIR, 'verification_key.json');

/**
 * Computes deterministic claim nullifier = Poseidon(patientSecret, claimEpisodeId, 1001)
 */
async function computeClaimNullifier(patientSecret, claimEpisodeId) {
  const { poseidon } = await getCryptoPrimitives();
  const sec = toFieldElement(patientSecret, 'patientSecret');
  const ep = toFieldElement(claimEpisodeId, 'claimEpisodeId');
  const dom = 1001n;
  const raw = poseidon([sec, ep, dom]);
  return poseidon.F.toString(raw);
}

/**
 * Computes policy commitment = Poseidon(policyId, policyLimit, policyExpiryDate, coverageRoot)
 */
async function computePolicyCommitment(policyId, policyLimit, policyExpiryDate, coverageRoot) {
  const { poseidon } = await getCryptoPrimitives();
  const pId = toFieldElement(policyId, 'policyId');
  const lim = toFieldElement(policyLimit, 'policyLimit');
  const exp = toFieldElement(policyExpiryDate, 'policyExpiryDate');
  const cov = toFieldElement(coverageRoot, 'coverageRoot');
  const raw = poseidon([pId, lim, exp, cov]);
  return poseidon.F.toString(raw);
}

/**
 * Validates and constructs the circuit witness input dictionary
 */
async function buildWitness({
  claim,
  hospital,
  hospitalProof,
  policy,
  procedureProof,
  patientSecret,
  claimEpisodeId,
  signature,
}) {
  const nullifier = await computeClaimNullifier(patientSecret, claimEpisodeId);
  const policyCommitment = await computePolicyCommitment(
    policy.policyId,
    policy.policyLimit,
    policy.policyExpiryDate,
    policy.coverageRoot
  );

  const witnessInput = {
    // 1. Public signals
    claimAmount: toFieldElement(claim.claimAmount, 'claimAmount').toString(),
    treatmentDate: toFieldElement(claim.treatmentDate, 'treatmentDate').toString(),
    hospitalRegistryRoot: toFieldElement(hospitalProof.root, 'hospitalRegistryRoot').toString(),
    policyCommitment: toFieldElement(policyCommitment, 'policyCommitment').toString(),
    claimNullifier: toFieldElement(nullifier, 'claimNullifier').toString(),
    hospitalAx: toFieldElement(hospital.pubKeyAx, 'hospitalAx').toString(),
    hospitalAy: toFieldElement(hospital.pubKeyAy, 'hospitalAy').toString(),

    // 2. Private claim identifiers
    claimId: toFieldElement(claim.claimId ?? claim.id, 'claimId').toString(),
    policyId: toFieldElement(claim.policyId ?? claim.policy_id, 'policyId').toString(),
    hospitalId: toFieldElement(claim.hospitalId ?? claim.hospital_id, 'hospitalId').toString(),

    // 3. Private policy details
    policyLimit: toFieldElement(policy.policyLimit, 'policyLimit').toString(),
    policyExpiryDate: toFieldElement(policy.policyExpiryDate, 'policyExpiryDate').toString(),
    coverageRoot: toFieldElement(policy.coverageRoot, 'coverageRoot').toString(),

    // 4. Covered procedure private details & Merkle proof
    procedureCode: toFieldElement(claim.procedureCode, 'procedureCode').toString(),
    procedureMerklePath: procedureProof.pathElements.map((x) => toFieldElement(x, 'procedureMerklePath').toString()),
    procedurePathIndices: procedureProof.pathIndices.map((x) => Number(x)),

    // 5. Hospital registry Merkle proof
    hospitalMerklePath: hospitalProof.pathElements.map((x) => toFieldElement(x, 'hospitalMerklePath').toString()),
    hospitalPathIndices: hospitalProof.pathIndices.map((x) => Number(x)),

    // 6. Patient nullifier private inputs
    patientSecret: toFieldElement(patientSecret, 'patientSecret').toString(),
    claimEpisodeId: toFieldElement(claimEpisodeId, 'claimEpisodeId').toString(),

    // 7. Hospital BabyJubJub EdDSA signature
    sigR8x: toFieldElement(signature?.R8x, 'signature.R8x').toString(),
    sigR8y: toFieldElement(signature?.R8y, 'signature.R8y').toString(),
    sigS: toFieldElement(signature?.S, 'signature.S').toString(),
  };

  return {
    witnessInput,
    computedNullifier: nullifier,
    computedPolicyCommitment: policyCommitment,
  };
}

/**
 * Generates an actual Groth16 Zero-Knowledge Proof using snarkjs
 */
async function generateProof(witnessInput) {
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`Circuit WASM not found at ${WASM_PATH}. Run circuit compilation.`);
  }
  if (!fs.existsSync(ZKEY_PATH)) {
    throw new Error(`Circuit ZKEY not found at ${ZKEY_PATH}. Run trusted setup.`);
  }

  // Full Groth16 proof generation: witness calculation + proof calculation
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witnessInput,
    WASM_PATH,
    ZKEY_PATH
  );

  return { proof, publicSignals };
}

/**
 * Verifies the proof locally using the exported verification key
 */
async function verifyProofLocally(proof, publicSignals) {
  if (!fs.existsSync(VKEY_PATH)) {
    throw new Error(`Verification key not found at ${VKEY_PATH}`);
  }

  const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, 'utf-8'));
  const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  return isValid;
}

/**
 * Converts snarkjs proof into Solidity calldata formatting:
 * uint[2] a, uint[2][2] b, uint[2] c, uint[7] input
 */
function formatProofForSolidity(proof, publicSignals) {
  const a = [proof.pi_a[0], proof.pi_a[1]];
  // G2 coordinate swap for Ethereum pairing check precompile
  const b = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const c = [proof.pi_c[0], proof.pi_c[1]];
  const input = publicSignals;

  return { a, b, c, input };
}

module.exports = {
  computeClaimNullifier,
  computePolicyCommitment,
  buildWitness,
  generateProof,
  verifyProofLocally,
  formatProofForSolidity,
  VKEY_PATH,
  WASM_PATH,
  ZKEY_PATH,
};
