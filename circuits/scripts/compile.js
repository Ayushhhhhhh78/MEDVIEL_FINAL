const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function compileCircuit() {
  console.log('=== Compiling Circom ClaimVerification Circuit ===');
  const projectRoot = path.join(__dirname, '..', '..');
  const circuitPath = path.join(projectRoot, 'circuits', 'ClaimVerification.circom');
  const buildDir = path.join(projectRoot, 'circuits', 'build');
  const circomBin = path.join(projectRoot, 'bin', 'circom.exe');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const cmd = `"${circomBin}" "${circuitPath}" --r1cs --wasm --sym -o "${buildDir}" -l "${path.join(projectRoot, 'node_modules')}"`;
  console.log('Running:', cmd);

  execSync(cmd, { cwd: projectRoot, stdio: 'inherit' });
  console.log('\n>>> Circuit compilation completed successfully! <<<\n');
}

try {
  compileCircuit();
} catch (err) {
  console.error('Compilation failed:', err.message);
  process.exit(1);
}
