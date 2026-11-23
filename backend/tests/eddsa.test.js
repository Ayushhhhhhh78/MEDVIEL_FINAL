const assert = require('assert');
const {
  generateKeys,
  hashClaim,
  signClaim,
  verifyClaimSignature,
  poseidonHash,
} = require('../src/services/eddsaService');

async function runEdDSATests() {
  console.log('=== Running EdDSA Cryptography Unit Tests ===');

  // 1. Key Generation
  console.log('1. Testing BabyJubJub Key Generation...');
  const keys = await generateKeys();
  assert(keys.privateKeyHex.length === 64, 'Private key should be 32 bytes hex');
  assert(typeof keys.publicKey.x === 'string', 'Public key X should be string');
  assert(typeof keys.publicKey.y === 'string', 'Public key Y should be string');
  console.log('   ✓ Keypair generated successfully');

  // 2. Claim Hashing & Canonical Fields
  console.log('2. Testing Poseidon Claim Hashing...');
  const claimData = {
    claimId: 1001,
    policyId: 5001,
    hospitalId: 301,
    claimAmount: 250000,
    treatmentDate: 20260515,
    procedureCode: 7701,
  };
  const { hashString } = await hashClaim(claimData);
  assert(typeof hashString === 'string' && hashString.length > 0, 'Hash string should be non-empty');
  console.log('   ✓ Claim hashed consistently:', hashString);

  // 3. Valid Claim Signing & Verification
  console.log('3. Testing Valid Claim Signing & Verification...');
  const { signature } = await signClaim(keys.privateKeyHex, claimData);
  assert(signature.R8x && signature.R8y && signature.S, 'Signature components missing');

  const isValid = await verifyClaimSignature(claimData, signature, keys.publicKey);
  assert.strictEqual(isValid, true, 'Valid signature must verify as true');
  console.log('   ✓ Valid signature verified successfully');

  // 4. Tampered Claim Amount
  console.log('4. Testing Tampered Claim Amount Detection...');
  const tamperedAmountClaim = { ...claimData, claimAmount: 300000 };
  const tamperedAmountValid = await verifyClaimSignature(tamperedAmountClaim, signature, keys.publicKey);
  assert.strictEqual(tamperedAmountValid, false, 'Tampered amount signature must be rejected');
  console.log('   ✓ Tampered claim amount correctly rejected');

  // 5. Tampered Procedure Code
  console.log('5. Testing Tampered Procedure Code Detection...');
  const tamperedProcClaim = { ...claimData, procedureCode: 9999 };
  const tamperedProcValid = await verifyClaimSignature(tamperedProcClaim, signature, keys.publicKey);
  assert.strictEqual(tamperedProcValid, false, 'Tampered procedure code must be rejected');
  console.log('   ✓ Tampered procedure code correctly rejected');

  // 6. Wrong Public Key
  console.log('6. Testing Wrong Public Key Detection...');
  const otherKeys = await generateKeys();
  const wrongKeyValid = await verifyClaimSignature(claimData, signature, otherKeys.publicKey);
  assert.strictEqual(wrongKeyValid, false, 'Signature with wrong public key must be rejected');
  console.log('   ✓ Wrong public key correctly rejected');

  // 7. Merkle Tree Poseidon Hash
  console.log('7. Testing Poseidon Multi-Input Hashing...');
  const hash2 = await poseidonHash([123, 456]);
  assert(typeof hash2.hashString === 'string', 'Merkle Poseidon hash should return string');
  console.log('   ✓ Poseidon hashing verified');

  console.log('\n>>> All EdDSA Cryptography Unit Tests PASSED! <<<\n');
}

runEdDSATests().catch((err) => {
  console.error('EdDSA Test Failed:', err);
  process.exit(1);
});
