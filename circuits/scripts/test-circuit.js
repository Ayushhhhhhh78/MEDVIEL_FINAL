const assert = require('assert');
const { generateKeys, signClaim, hashClaim } = require('../../backend/src/services/eddsaService');
const {
  buildHospitalRegistryTree,
  buildCoveredProceduresTree,
} = require('../../backend/src/utils/merkleTree');
const {
  buildWitness,
  generateProof,
  verifyProofLocally,
  formatProofForSolidity,
} = require('../../backend/src/services/zkService');

async function runCircuitTests() {
  console.log('=== Running Circom & Groth16 Proving System Tests ===\n');

  // 1. Setup synthetic entities
  console.log('1. Setting up synthetic hospital & policy trees...');
  const hospitalSeed = '4c696665536176657273486f73706974616c5365656432303236303130313031';
  const hospitalKeys = await generateKeys(hospitalSeed);

  const hospitals = [
    {
      hospitalId: 101,
      name: 'Apollo Synthetic Hospital',
      pubKeyAx: hospitalKeys.publicKey.x,
      pubKeyAy: hospitalKeys.publicKey.y,
    },
    {
      hospitalId: 102,
      name: 'Fortis Synthetic Care',
      pubKeyAx: '11111111111111111111',
      pubKeyAy: '22222222222222222222',
    },
  ];

  const hospitalTree = await buildHospitalRegistryTree(hospitals);
  const hospitalProof = hospitalTree.getProof(0); // Apollo at index 0

  // Covered procedures: 7701 = Appendectomy, 7702 = Cholecystectomy, 7703 = Knee Replacement
  const coveredProcedures = [7701, 7702, 7703];
  const procedureTree = await buildCoveredProceduresTree(coveredProcedures);
  const procedureProof = procedureTree.getProof(0); // 7701 at index 0

  const policy = {
    policyId: 5001,
    policyLimit: 500000,      // ₹5,00,000 policy limit
    policyExpiryDate: 20261231, // Dec 31, 2026
    coverageRoot: procedureTree.getRootString(),
  };

  const claim = {
    claimId: 9001,
    policyId: 5001,
    hospitalId: 101,
    claimAmount: 250000,      // ₹2,50,000 claim amount
    treatmentDate: 20260515,  // May 15, 2026
    procedureCode: 7701,
  };

  const patientSecret = '98765432101234567890';
  const claimEpisodeId = '2026051501';

  // 2. Hospital signs claim
  console.log('2. Hospital signing claim using BabyJubJub EdDSA Poseidon...');
  const { signature } = await signClaim(hospitalKeys.privateKeyHex, claim);
  console.log('   ✓ Hospital signature created');

  // 3. Build witness
  console.log('3. Building circuit witness...');
  const { witnessInput, computedNullifier } = await buildWitness({
    claim,
    hospital: hospitals[0],
    hospitalProof,
    policy,
    procedureProof,
    patientSecret,
    claimEpisodeId,
    signature,
  });
  console.log('   ✓ Witness dictionary constructed');
  console.log('   - Nullifier:', computedNullifier);

  // 4. Generate actual Groth16 proof
  console.log('4. Generating actual Groth16 ZK proof using snarkjs...');
  const startTime = Date.now();
  const { proof, publicSignals } = await generateProof(witnessInput);
  const duration = (Date.now() - startTime) / 1000;
  console.log(`   ✓ Proof generated successfully in ${duration.toFixed(2)}s`);
  console.log(`   - Public signals count: ${publicSignals.length}`);
  assert.strictEqual(publicSignals.length, 7, 'Must have exactly 7 public signals');

  // 5. Verify proof locally
  console.log('5. Verifying proof locally with verification_key.json...');
  const isValid = await verifyProofLocally(proof, publicSignals);
  assert.strictEqual(isValid, true, 'Valid Groth16 proof must verify locally');
  console.log('   ✓ Local proof verification PASSED!');

  // 6. Test formatting for Solidity
  console.log('6. Formatting proof for Solidity Calldata...');
  const calldata = formatProofForSolidity(proof, publicSignals);
  assert(calldata.a.length === 2, 'a must have length 2');
  assert(calldata.b.length === 2 && calldata.b[0].length === 2, 'b must be 2x2');
  assert(calldata.c.length === 2, 'c must have length 2');
  assert(calldata.input.length === 7, 'input must have length 7');
  console.log('   ✓ Solidity Calldata formatted properly');

  // 7. Negative test: Tampered public signal
  console.log('7. Testing negative case: Tampered public signal...');
  const tamperedSignals = [...publicSignals];
  tamperedSignals[0] = '999999'; // Tampered claim amount
  const tamperedValid = await verifyProofLocally(proof, tamperedSignals);
  assert.strictEqual(tamperedValid, false, 'Proof with tampered public signal must be rejected');
  console.log('   ✓ Tampered proof correctly rejected');

  console.log('\n>>> All Circom & Groth16 ZK Proving Tests PASSED! <<<\n');
}

runCircuitTests().catch((err) => {
  console.error('Circuit test failed:', err);
  process.exit(1);
});
