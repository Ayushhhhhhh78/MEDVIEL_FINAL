const assert = require('assert');
const { ethers } = require('hardhat');
const { generateKeys, signClaim, verifyClaimSignature } = require('../../backend/src/services/eddsaService');
const { buildHospitalRegistryTree, buildCoveredProceduresTree } = require('../../backend/src/utils/merkleTree');
const {
  buildWitness,
  generateProof,
  verifyProofLocally,
  formatProofForSolidity,
  computePolicyCommitment,
} = require('../../backend/src/services/zkService');

async function runEndToEndScenario() {
  console.log('=================================================================');
  console.log('MEDVEIL END-TO-END SCENARIO: RAHUL SURGICAL CLAIM VERIFICATION');
  console.log('=================================================================\n');

  const [deployer, hospitalWallet, hospitalPayout, insurerWallet, rahulWallet, doctorWallet] =
    await ethers.getSigners();

  // -------------------------------------------------------------
  // STEP 1: Deploy Smart Contracts & Settlement Pool
  // -------------------------------------------------------------
  console.log('STEP 1: Deploying Smart Contracts...');
  const VerifierFactory = await ethers.getContractFactory('Groth16Verifier');
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();

  const HospitalRegistryFactory = await ethers.getContractFactory('HospitalRegistry');
  const hospitalRegistry = await HospitalRegistryFactory.deploy();
  await hospitalRegistry.waitForDeployment();

  const PolicyRegistryFactory = await ethers.getContractFactory('PolicyRegistry');
  const policyRegistry = await PolicyRegistryFactory.deploy();
  await policyRegistry.waitForDeployment();

  const PatientAccessFactory = await ethers.getContractFactory('PatientAccess');
  const patientAccess = await PatientAccessFactory.deploy();
  await patientAccess.waitForDeployment();

  const TestTokenFactory = await ethers.getContractFactory('TestToken');
  const testToken = await TestTokenFactory.deploy();
  await testToken.waitForDeployment();

  const ClaimSettlementFactory = await ethers.getContractFactory('ClaimSettlement');
  const claimSettlement = await ClaimSettlementFactory.deploy(
    await verifier.getAddress(),
    await hospitalRegistry.getAddress(),
    await policyRegistry.getAddress(),
    await testToken.getAddress()
  );
  await claimSettlement.waitForDeployment();

  // Fund ClaimSettlement contract with 5,000,000 MVT tokens
  await testToken.transfer(await claimSettlement.getAddress(), ethers.parseEther('5000000'));
  console.log('   ✓ Contracts deployed and settlement pool funded with 5,000,000 MVT');

  // -------------------------------------------------------------
  // STEP 2: Hospital & Policy Registration
  // -------------------------------------------------------------
  console.log('\nSTEP 2: Registering Hospital & Insurance Policy...');
  const hospitalSeed = '4c696665536176657273486f73706974616c5365656432303236303130313031';
  const hospitalKeys = await generateKeys(hospitalSeed);

  const hospitals = [
    {
      hospitalId: 101,
      name: 'Apollo Synthetic Hospital',
      pubKeyAx: hospitalKeys.publicKey.x,
      pubKeyAy: hospitalKeys.publicKey.y,
    },
  ];
  const hospitalTree = await buildHospitalRegistryTree(hospitals);
  const hospitalRoot = hospitalTree.getRootString();

  await hospitalRegistry.registerHospital(
    101,
    'Apollo Synthetic Hospital',
    'APOLLO-DELHI-9921',
    hospitalKeys.publicKey.x,
    hospitalKeys.publicKey.y,
    hospitalWallet.address,
    hospitalPayout.address
  );
  await hospitalRegistry.updateHospitalMerkleRoot(hospitalRoot);

  const coveredProcedures = [7701, 7702, 7703];
  const procedureTree = await buildCoveredProceduresTree(coveredProcedures);
  const coverageRoot = procedureTree.getRootString();

  const policy = {
    policyId: 5001,
    policyLimit: 500000,      // ₹5,00,000
    policyExpiryDate: 20261231, // Dec 31, 2026
    coverageRoot,
  };
  const commitment = await computePolicyCommitment(
    policy.policyId,
    policy.policyLimit,
    policy.policyExpiryDate,
    policy.coverageRoot
  );

  await policyRegistry.setInsurerAuthorization(insurerWallet.address, true);
  await policyRegistry.connect(insurerWallet).registerPolicy(
    policy.policyId,
    commitment,
    coverageRoot
  );
  console.log('   ✓ Hospital & Policy registered on-chain with commitments');

  // -------------------------------------------------------------
  // STEP 3: Patient Rahul Treated & Hospital Signs Claim
  // -------------------------------------------------------------
  console.log('\nSTEP 3: Preparing & Signing Claim for Patient Rahul...');
  const claim = {
    claimId: 9001,
    policyId: 5001,
    hospitalId: 101,
    claimAmount: 250000,      // ₹2,50,000
    treatmentDate: 20260515,  // May 15, 2026
    procedureCode: 7701,      // Appendectomy
  };
  const patientSecret = '98765432101234567890';
  const claimEpisodeId = '2026051501';

  const { signature, claimHash } = await signClaim(hospitalKeys.privateKeyHex, claim);
  console.log('   ✓ BabyJubJub EdDSA signature created over Poseidon hash');

  // -------------------------------------------------------------
  // STEP 4: Backend Independent Signature Verification
  // -------------------------------------------------------------
  console.log('\nSTEP 4: Backend Signature Verification...');
  const isSigValid = await verifyClaimSignature(claim, signature, hospitalKeys.publicKey);
  assert.strictEqual(isSigValid, true, 'Backend signature verification must pass');
  console.log('   ✓ Backend EdDSA signature verification PASSED');

  // -------------------------------------------------------------
  // STEP 5: Witness Preparation & Groth16 Proof Generation
  // -------------------------------------------------------------
  console.log('\nSTEP 5: Generating Groth16 Zero-Knowledge Proof...');
  const hospitalProof = hospitalTree.getProof(0);
  const procedureProof = procedureTree.getProof(0);

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

  const { proof, publicSignals } = await generateProof(witnessInput);
  console.log('   ✓ Real Groth16 proof generated successfully');
  console.log('   - Public Nullifier:', computedNullifier);

  // -------------------------------------------------------------
  // STEP 6: Local Proof Verification
  // -------------------------------------------------------------
  console.log('\nSTEP 6: Verifying Proof Locally...');
  const isLocallyValid = await verifyProofLocally(proof, publicSignals);
  assert.strictEqual(isLocallyValid, true, 'Local proof verification must pass');
  console.log('   ✓ Local proof verification PASSED');

  // -------------------------------------------------------------
  // STEP 7: Submit Proof On-Chain & Settle Claim
  // -------------------------------------------------------------
  console.log('\nSTEP 7: Submitting Proof to ClaimSettlement Smart Contract...');
  const calldata = formatProofForSolidity(proof, publicSignals);

  const initialPayoutBalance = await testToken.balanceOf(hospitalPayout.address);

  const tx = await claimSettlement.verifyAndSettleClaim(
    calldata.a,
    calldata.b,
    calldata.c,
    calldata.input
  );
  const receipt = await tx.wait();
  console.log('   ✓ Transaction confirmed on-chain! TxHash:', receipt.hash);

  const finalPayoutBalance = await testToken.balanceOf(hospitalPayout.address);
  const settledAmount = finalPayoutBalance - initialPayoutBalance;
  assert.strictEqual(settledAmount, BigInt(claim.claimAmount), 'Payout address must receive exact claim amount');
  console.log(`   ✓ Token settlement verified: Hospital payout received ₹${claim.claimAmount} (MVT tokens)`);

  // Verify nullifier consumed
  const isConsumed = await claimSettlement.isNullifierUsed(computedNullifier);
  assert.strictEqual(isConsumed, true, 'Nullifier must be marked used');
  console.log('   ✓ Claim nullifier marked as consumed on-chain');

  // -------------------------------------------------------------
  // STEP 8: Duplicate Claim Submission (Nullifier Replay Protection)
  // -------------------------------------------------------------
  console.log('\nSTEP 8: Testing Duplicate Claim Rejection...');
  let duplicateRejected = false;
  try {
    const txDup = await claimSettlement.verifyAndSettleClaim(
      calldata.a,
      calldata.b,
      calldata.c,
      calldata.input
    );
    await txDup.wait();
  } catch (err) {
    console.log('   Expected rejection caught:', err.message);
    duplicateRejected = err.message.includes('Claim nullifier already consumed') || err.message.includes('reverted');
  }
  assert.strictEqual(duplicateRejected, true, 'Smart contract must reject duplicate submission of consumed nullifier');
  console.log('   ✓ Duplicate claim rejected: Contract strictly enforces nullifier uniqueness');

  // -------------------------------------------------------------
  // STEP 9: Patient Access Permissions (Grant & Revoke)
  // -------------------------------------------------------------
  console.log('\nSTEP 9: Patient Access Control (Grant & Revoke)...');
  const recordId = 99101;
  const ipfsCid = 'QmZtmD2qt8fJv3CLnDhEGnxVMRdBk5uSFsFjeJF28NNkWv';
  const fileHash = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';

  // Rahul registers record
  await patientAccess.connect(rahulWallet).registerRecord(recordId, ipfsCid, fileHash, 'SURGICAL_REPORT');

  // Rahul grants access to Dr. Sharma
  await patientAccess.connect(rahulWallet).grantAccess(recordId, doctorWallet.address, 0);
  let docHasAccess = await patientAccess.hasAccess(recordId, doctorWallet.address);
  assert.strictEqual(docHasAccess, true, 'Doctor should have access after grant');
  console.log('   ✓ Patient granted record access to Dr. Sharma');

  // Rahul revokes access
  await patientAccess.connect(rahulWallet).revokeAccess(recordId, doctorWallet.address);
  docHasAccess = await patientAccess.hasAccess(recordId, doctorWallet.address);
  assert.strictEqual(docHasAccess, false, 'Doctor must not have access after revocation');
  console.log('   ✓ Patient revoked record access: Dr. Sharma access removed');

  console.log('\n=================================================================');
  console.log('>>> COMPLETE END-TO-END RAHUL SCENARIO PASSED SUCCESSFULLY! <<<');
  console.log('=================================================================\n');
}

runEndToEndScenario().catch((err) => {
  console.error('End-to-End Scenario Failed:', err);
  process.exit(1);
});
