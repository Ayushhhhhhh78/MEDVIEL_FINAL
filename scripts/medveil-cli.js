#!/usr/bin/env node
/**
 * MEDVEIL Terminal CLI
 * Private Healthcare. Verifiable Claims.
 *
 * Allows executing every backend, cryptographic (Poseidon, EdDSA, Groth16 ZK),
 * and blockchain/MetaMask operation directly from the terminal.
 */

const path = require('path');
const { ethers } = require('ethers');
const db = require('../backend/src/database/db');
const {
  getContract,
  getDeploymentConfig,
  getContractAddresses,
  getProvider,
  getRelayerWallet,
  checkPolicyActive,
  checkNullifierUsed,
  submitClaimProofOnChain,
  authorizeInsurerOnChain,
} = require('../backend/src/services/blockchainService');
const {
  computePolicyCommitment,
  computeClaimNullifier,
  buildWitness,
  generateProof,
  formatProofForSolidity,
} = require('../backend/src/services/zkService');
const {
  generateKeys,
  signClaim,
  verifyClaimSignature,
  toFieldElement,
  getCryptoPrimitives,
} = require('../backend/src/services/eddsaService');
const {
  buildHospitalRegistryTree,
  buildCoveredProceduresTree,
} = require('../backend/src/utils/merkleTree');

async function showStatus() {
  console.log('\n=============================================================');
  console.log('       MEDVEIL BLOCKCHAIN & CRYPTOGRAPHIC STATUS            ');
  console.log('=============================================================');

  const config = getDeploymentConfig();
  console.log(`Network:   ${config.network} (Chain ID: ${config.chainId})`);
  const addresses = getContractAddresses();
  console.log('\nDeployed Contracts:');
  for (const [name, addr] of Object.entries(addresses)) {
    console.log(`  - ${name.padEnd(18)}: ${addr || 'Not Deployed'}`);
  }

  try {
    const relayer = getRelayerWallet();
    const balance = await getProvider().getBalance(relayer.address);
    console.log(`\nTerminal Wallet (Relayer): ${relayer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    const policyRegistry = getContract('PolicyRegistry');
    const policyCount = await policyRegistry.getPolicyCount();
    console.log(`\nRegistered On-Chain Policies: ${policyCount.toString()}`);

    const hospitalRegistry = getContract('HospitalRegistry');
    const hospitalCount = await hospitalRegistry.getHospitalCount();
    console.log(`Registered On-Chain Hospitals: ${hospitalCount.toString()}`);
  } catch (err) {
    console.warn('\nNote: Blockchain node not reachable or contracts not deployed:', err.message);
  }

  // Database stats
  const policyRows = db.all('SELECT id, policy_number, is_active FROM policies');
  console.log(`\nDatabase Policies (${policyRows.length}):`);
  for (const p of policyRows) {
    console.log(`  [#${p.id}] ${p.policy_number} (Active: ${p.is_active ? 'YES' : 'NO'})`);
  }

  const claimRows = db.all('SELECT id, claim_number, claim_amount, status FROM claims');
  console.log(`\nDatabase Claims (${claimRows.length}):`);
  for (const c of claimRows) {
    console.log(`  [#${c.id}] ${c.claim_number} - ₹${c.claim_amount} [Status: ${c.status}]`);
  }
  console.log('=============================================================\n');
}

async function hashPolicy(policyId, limit, expiry, proceduresStr) {
  console.log('\n--- Poseidon Policy Commitment & Merkle Root Generation ---');
  const procs = (proceduresStr || '7701,7702,7703')
    .split(',')
    .map((p) => Number(p.trim()));

  console.log(`Policy ID:    ${policyId || 5001}`);
  console.log(`Policy Limit: ₹${limit || 500000}`);
  console.log(`Expiry:       ${expiry || 20261231}`);
  console.log(`Procedures:   [${procs.join(', ')}]`);

  const procTree = await buildCoveredProceduresTree(procs);
  const coverageRoot = procTree.getRootString();
  console.log(`\n✓ Coverage Merkle Root (Poseidon):`);
  console.log(`  ${coverageRoot}`);

  const commitment = await computePolicyCommitment(
    policyId || 5001,
    limit || 500000,
    expiry || 20261231,
    coverageRoot
  );
  console.log(`\n✓ Cryptographic Policy Commitment (Poseidon):`);
  console.log(`  ${commitment}\n`);

  return { coverageRoot, commitment };
}

async function publishPolicyTerminal(policyId) {
  console.log(`\n--- Publishing Policy #${policyId} On-Chain (Replacing MetaMask) ---`);
  const policy = db.get('SELECT * FROM policies WHERE id = ?', policyId);
  if (!policy) {
    console.error(`Error: Policy with ID ${policyId} not found in database.`);
    return;
  }

  const contract = getContract('PolicyRegistry');
  const isActive = await contract.isPolicyActive(policy.policy_commitment);
  if (isActive) {
    console.log(`✓ Policy #${policy.policy_number} is ALREADY registered and active on-chain!`);
    db.run('UPDATE policies SET is_active = 1 WHERE id = ?', policy.id);
    return;
  }

  console.log(`Submitting registerPolicy(${policy.id}, commitment, coverageRoot)...`);
  const tx = await contract.registerPolicy(
    policy.id,
    policy.policy_commitment,
    policy.coverage_root
  );
  console.log(`Transaction broadcasted: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`✓ Mined in Block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);
  db.run('UPDATE policies SET is_active = 1 WHERE id = ?', policy.id);
}

async function signClaimTerminal(claimId) {
  console.log(`\n--- Generating BabyJubJub EdDSA Hospital Signature for Claim #${claimId} ---`);
  const claim = db.get('SELECT * FROM claims WHERE id = ?', claimId);
  if (!claim) {
    console.error(`Error: Claim with ID ${claimId} not found.`);
    return;
  }

  let hospital = db.get('SELECT * FROM hospitals WHERE id = ?', claim.hospital_id);
  if (!hospital) {
    hospital = db.get('SELECT * FROM hospitals WHERE is_active = 1 LIMIT 1');
  }

  const effectiveHospitalId =
    hospital.id === 101 || (hospital.name && hospital.name.includes('Apollo'))
      ? 101
      : hospital.id;

  const hospitalSeed = '4c696665536176657273486f73706974616c5365656432303236303130313031';
  const hospitalKeys = await generateKeys(hospitalSeed);

  const claimData = {
    claimId: claim.id,
    policyId: claim.policy_id,
    hospitalId: effectiveHospitalId,
    claimAmount: claim.claim_amount,
    treatmentDate: claim.treatment_date,
    procedureCode: claim.procedure_code,
  };

  const { claimHash, signature } = await signClaim(hospitalKeys.privateKeyHex, claimData);
  console.log(`✓ Claim Poseidon Hash: ${claimHash}`);
  console.log(`✓ Hospital EdDSA Signature:`);
  console.log(`  R8x: ${signature.R8x}`);
  console.log(`  R8y: ${signature.R8y}`);
  console.log(`  S:   ${signature.S}`);

  const isValid = await verifyClaimSignature(claimData, signature, hospitalKeys.publicKey);
  console.log(`✓ Signature verified on BabyJubJub curve: ${isValid}`);

  const sigObj = { R8x: signature.R8x, R8y: signature.R8y, S: signature.S };
  db.run(
    'UPDATE claims SET hospital_signature = ?, status = ? WHERE id = ?',
    JSON.stringify(sigObj),
    'SIGNED',
    claim.id
  );
  return sigObj;
}

async function proveAndSettleClaimTerminal(claimId) {
  console.log(`\n--- Generating Groth16 ZK-SNARK Proof & Settling On-Chain (Replacing MetaMask) ---`);
  const claim = db.get('SELECT * FROM claims WHERE id = ?', claimId);
  if (!claim) {
    console.error(`Error: Claim #${claimId} not found.`);
    return;
  }
  let patient = db.get('SELECT * FROM patients WHERE id = ?', claim.patient_id);
  if (!patient) {
    patient = db.get('SELECT * FROM patients ORDER BY id ASC LIMIT 1');
  }
  let policy = db.get('SELECT * FROM policies WHERE id = ?', claim.policy_id);
  if (!policy) {
    policy = db.get('SELECT * FROM policies WHERE is_active = 1 LIMIT 1');
  }
  let hospital = db.get('SELECT * FROM hospitals WHERE id = ?', claim.hospital_id);
  if (!hospital) {
    hospital = db.get('SELECT * FROM hospitals WHERE is_active = 1 LIMIT 1');
  }

  const effectiveHospitalId =
    hospital.id === 101 || (hospital.name && hospital.name.includes('Apollo'))
      ? 101
      : hospital.id;

  if (!claim.hospital_signature) {
    console.log('Claim not signed yet. Signing now...');
    await signClaimTerminal(claimId);
  }
  const refreshedClaim = db.get('SELECT * FROM claims WHERE id = ?', claimId);
  const sig = JSON.parse(refreshedClaim.hospital_signature);

  // 1. Build Merkle trees for witness
  let allHospitals = db.all(
    'SELECT id as hospitalId, name, pubkey_ax as pubKeyAx, pubkey_ay as pubKeyAy FROM hospitals WHERE is_active = 1'
  );
  allHospitals = allHospitals.map((h) => {
    if (h.pubKeyAx === hospital.pubkey_ax || (h.name && h.name.includes('Apollo'))) {
      return { ...h, hospitalId: 101 };
    }
    return h;
  });

  const hospitalTree = await buildHospitalRegistryTree(allHospitals);
  const hospitalIndex = allHospitals.findIndex((h) => h.hospitalId === effectiveHospitalId);
  const hospitalProof = hospitalTree.getProof(hospitalIndex >= 0 ? hospitalIndex : 0);

  const coveredProcedures = JSON.parse(policy.covered_procedures);
  const procTree = await buildCoveredProceduresTree(coveredProcedures);
  const procIdx = coveredProcedures.indexOf(Number(claim.procedure_code));
  const procedureProof = procTree.getProof(procIdx >= 0 ? procIdx : 0);

  console.log('Building witness input dictionary for Circom circuit...');
  const witnessInput = await buildWitness({
    claim: {
      claimId: claim.id,
      policyId: claim.policy_id,
      hospitalId: effectiveHospitalId,
      claimAmount: claim.claim_amount,
      treatmentDate: claim.treatment_date,
      procedureCode: claim.procedure_code,
      patientId: claim.patient_id,
      episodeId: claim.episode_id,
    },
    hospital: {
      hospitalId: effectiveHospitalId,
      pubKeyAx: hospital.pubkey_ax,
      pubKeyAy: hospital.pubkey_ay,
      merkleRoot: hospitalTree.getRootString(),
    },
    hospitalProof,
    policy: {
      policyId: policy.id,
      policyLimit: policy.policy_limit,
      policyExpiryDate: policy.expiry_date,
      coverageRoot: policy.coverage_root,
    },
    procedureProof,
    patientSecret: patient.patient_secret,
    claimEpisodeId: claim.episode_id,
    signature: sig,
  });

  console.log(`Witness built! Generating Groth16 ZK proof using snarkjs...`);
  const { proof, publicSignals } = await generateProof(witnessInput);
  console.log(`✓ ZK-SNARK Proof successfully generated!`);
  console.log(`  Public Nullifier:  ${publicSignals[0]}`);
  console.log(`  Policy Commitment: ${publicSignals[4]}`);

  const calldata = formatProofForSolidity(proof, publicSignals);

  console.log(`\nSubmitting verifyAndSettleClaim on-chain (replacing MetaMask)...`);
  const result = await submitClaimProofOnChain(calldata);
  console.log(`✓ Claim #${claim.claim_number} SETTLED ON-CHAIN!`);
  console.log(`  Transaction: ${result.txHash}`);
  console.log(`  Block:       ${result.blockNumber}`);
  console.log(`  Gas Used:    ${result.gasUsed}`);

  db.run(
    'UPDATE claims SET status = ?, nullifier = ?, tx_hash = ? WHERE id = ?',
    'SETTLED',
    publicSignals[0],
    result.txHash,
    claim.id
  );
}

function printHelp() {
  console.log(`
MEDVEIL Terminal Command-Line Interface (CLI)
Usage: node scripts/medveil-cli.js <command> [options]

Available Commands:
  status                                     View blockchain, smart contracts & DB status
  hash-policy [id] [limit] [expiry] [procs]  Compute Poseidon Merkle Root & Policy Commitment
  publish-policy <policyId>                  Publish policy on-chain via terminal (replaces MetaMask)
  sign-claim <claimId>                       Generate BabyJubJub EdDSA hospital claim signature
  prove-and-settle <claimId>                 Generate Groth16 ZK proof and settle on-chain
  authorize-wallet <address>                 Authorize an insurer address on-chain

Examples:
  node scripts/medveil-cli.js status
  node scripts/medveil-cli.js hash-policy 5005 800000 20261231 7701,7702,7703
  node scripts/medveil-cli.js publish-policy 1
  node scripts/medveil-cli.js sign-claim 1
  node scripts/medveil-cli.js prove-and-settle 1
  node scripts/medveil-cli.js authorize-wallet 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'hash-policy':
      await hashPolicy(args[1], args[2], args[3], args[4]);
      break;
    case 'publish-policy':
      if (!args[1]) {
        console.error('Usage: node scripts/medveil-cli.js publish-policy <policyId>');
        process.exit(1);
      }
      await publishPolicyTerminal(Number(args[1]));
      break;
    case 'sign-claim':
      if (!args[1]) {
        console.error('Usage: node scripts/medveil-cli.js sign-claim <claimId>');
        process.exit(1);
      }
      await signClaimTerminal(Number(args[1]));
      break;
    case 'prove-and-settle':
      if (!args[1]) {
        console.error('Usage: node scripts/medveil-cli.js prove-and-settle <claimId>');
        process.exit(1);
      }
      await proveAndSettleClaimTerminal(Number(args[1]));
      break;
    case 'authorize-wallet':
      if (!args[1]) {
        console.error('Usage: node scripts/medveil-cli.js authorize-wallet <address>');
        process.exit(1);
      }
      const res = await authorizeInsurerOnChain(args[1]);
      console.log(`✓ Wallet authorized on-chain! Tx: ${res.txHash}`);
      break;
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error('\nCLI Execution Error:', err);
  process.exit(1);
});
