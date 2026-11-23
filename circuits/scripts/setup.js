const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function runSetup() {
  console.log('=== MEDVEIL Groth16 Trusted Setup Ceremony ===');
  const projectRoot = path.join(__dirname, '..', '..');
  const buildDir = path.join(__dirname, '..', 'build');
  const contractsDir = path.join(projectRoot, 'contracts');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const r1csPath = path.join(buildDir, 'ClaimVerification.r1cs');
  if (!fs.existsSync(r1csPath)) {
    throw new Error('ClaimVerification.r1cs not found! Run circuit compilation first.');
  }

  const ptau0 = path.join(buildDir, 'pot13_0000.ptau');
  const ptau1 = path.join(buildDir, 'pot13_0001.ptau');
  const ptauFinal = path.join(buildDir, 'pot13_final.ptau');
  const zkey0 = path.join(buildDir, 'claim_0000.zkey');
  const zkeyFinal = path.join(buildDir, 'claim_final.zkey');
  const vkeyPath = path.join(buildDir, 'verification_key.json');
  const verifierSolPath = path.join(contractsDir, 'Verifier.sol');

  const execOptions = { cwd: projectRoot, stdio: 'inherit' };

  if (!fs.existsSync(ptau0)) {
    console.log('1. Generating new Powers of Tau (power 13 = 8,192 constraints)...');
    execSync(`npx snarkjs powersoftau new bn128 13 "${ptau0}" -v`, execOptions);
  }

  if (!fs.existsSync(ptau1)) {
    console.log('2. Contributing randomness to Powers of Tau ceremony...');
    execSync(`npx snarkjs powersoftau contribute "${ptau0}" "${ptau1}" --name="Contributor 1" -v -e="entropy_medveil_private_claims_zk_2026"`, execOptions);
  }

  if (!fs.existsSync(ptauFinal)) {
    console.log('3. Preparing Phase 2...');
    execSync(`npx snarkjs powersoftau prepare phase2 "${ptau1}" "${ptauFinal}" -v`, execOptions);
  }

  if (!fs.existsSync(zkey0)) {
    console.log('4. Performing Groth16 circuit-specific setup...');
    execSync(`npx snarkjs groth16 setup "${r1csPath}" "${ptauFinal}" "${zkey0}"`, execOptions);
  }

  if (!fs.existsSync(zkeyFinal)) {
    console.log('5. Contributing phase 2 randomness...');
    execSync(`npx snarkjs zkey contribute "${zkey0}" "${zkeyFinal}" --name="Phase 2 Contributor" -v -e="entropy_hospital_claim_verification_key_seed"`, execOptions);
  }

  console.log('6. Exporting verification key JSON...');
  execSync(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkeyPath}"`, execOptions);

  console.log('7. Exporting Solidity Verifier to contracts/Verifier.sol...');
  execSync(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierSolPath}"`, execOptions);

  // Clean intermediate files
  if (fs.existsSync(ptau0)) fs.unlinkSync(ptau0);
  if (fs.existsSync(ptau1)) fs.unlinkSync(ptau1);
  if (fs.existsSync(zkey0)) fs.unlinkSync(zkey0);

  console.log('\n>>> Groth16 Trusted Setup COMPLETE! <<<\n');
}

try {
  runSetup();
} catch (err) {
  console.error('Setup failed:', err.message);
  process.exit(1);
}
