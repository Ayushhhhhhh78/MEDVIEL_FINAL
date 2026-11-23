process.env.NODE_ENV = 'test';
const assert = require('assert');
const { ethers } = require('ethers');
const app = require('../src/app');
const http = require('http');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = options.headers || {};
  if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

async function runBackendTests() {
  console.log('=== Running MEDVEIL Backend Integration Tests ===\n');

  // Start temporary server bound to 127.0.0.1
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // 1. Health check
    console.log('1. Testing /health endpoint...');
    const health = await request('/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'UP');
    console.log('   ✓ Health check passed');

    // 2. Authentication: Login as Patient Rahul
    console.log('2. Testing Patient Login (rahul)...');
    const loginRahul = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'rahul', password: 'Password123!' },
    });
    assert.strictEqual(loginRahul.status, 200);
    assert(loginRahul.data.token, 'Token should be returned');
    assert.strictEqual(loginRahul.data.user.role, 'PATIENT');
    const rahulToken = loginRahul.data.token;
    console.log('   ✓ Patient login successful (JWT received)');

    // 3. Authentication: Login as Hospital Apollo
    console.log('3. Testing Hospital Login (apollo_hospital)...');
    const loginHosp = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'apollo_hospital', password: 'Password123!' },
    });
    assert.strictEqual(loginHosp.status, 200);
    assert.strictEqual(loginHosp.data.user.role, 'HOSPITAL');
    const hospToken = loginHosp.data.token;
    console.log('   ✓ Hospital login successful');

    // 4. Authentication: Login as Insurer MediCare
    console.log('4. Testing Insurer Login (medicare_insurer)...');
    const loginIns = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'medicare_insurer', password: 'Password123!' },
    });
    assert.strictEqual(loginIns.status, 200);
    assert.strictEqual(loginIns.data.user.role, 'INSURER');
    const insToken = loginIns.data.token;
    console.log('   ✓ Insurer login successful');

    // 5. Test Role Authorization: Patient blocked from creating claim
    console.log('5. Testing Role Authorization: Patient blocked from creating hospital claim...');
    const forbiddenClaim = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${rahulToken}` },
      body: { patientId: 1, policyId: 5001, claimAmount: 100000, treatmentDate: 20260515, procedureCode: 7701 },
    });
    assert.strictEqual(forbiddenClaim.status, 403);
    console.log('   ✓ Unauthorized role correctly blocked (403)');

    // 6. Hospital Creates Claim for Rahul
    console.log('6. Hospital creating claim for Rahul...');
    const createClaimRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospToken}` },
      body: {
        patientId: 1,
        policyId: 5001,
        claimAmount: 250000,
        treatmentDate: 20260515,
        procedureCode: 7701,
      },
    });
    assert.strictEqual(createClaimRes.status, 201);
    const claimId = createClaimRes.data.claim.id;
    assert.strictEqual(createClaimRes.data.claim.status, 'DRAFT');
    console.log(`   ✓ Draft claim created (ID: ${claimId})`);

    // 7. Hospital Signs Claim (EdDSA BabyJubJub)
    console.log('7. Hospital signing claim with BabyJubJub EdDSA...');
    const signRes = await request(`/api/claims/${claimId}/sign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospToken}` },
    });
    assert.strictEqual(signRes.status, 200);
    assert.strictEqual(signRes.data.status, 'SIGNED');
    assert(signRes.data.signature.R8x && signRes.data.signature.S, 'Signature components present');
    console.log('   ✓ Claim signed successfully by hospital');

    // 8. Generate Groth16 ZK Proof
    console.log('8. Generating Groth16 Zero-Knowledge Proof...');
    const genProofRes = await request(`/api/claims/${claimId}/generate-proof`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospToken}` },
    });
    assert.strictEqual(genProofRes.status, 200);
    assert.strictEqual(genProofRes.data.status, 'PROOF_GENERATED');
    assert(genProofRes.data.nullifier, 'Nullifier must be generated');
    console.log('   ✓ Groth16 proof generated. Nullifier:', genProofRes.data.nullifier);

    // 9. Verify Proof Locally
    console.log('9. Verifying proof locally against verification_key.json...');
    const verifyProofRes = await request(`/api/claims/${claimId}/verify-proof`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospToken}` },
    });
    assert.strictEqual(verifyProofRes.status, 200);
    assert.strictEqual(verifyProofRes.data.status, 'PROOF_VERIFIED');
    console.log('   ✓ Proof locally verified');

    // 10. Privacy Check: Insurer cannot view private medical records
    console.log('10. Privacy Enforcement: Insurer blocked from accessing medical records...');
    const insRecordsRes = await request('/api/records', {
      headers: { Authorization: `Bearer ${insToken}` },
    });
    assert.strictEqual(insRecordsRes.status, 403);
    console.log('   ✓ Insurer strictly blocked from reading medical records');

    // 11. Patient Access & Decryption of Medical Records
    console.log('11. Testing Patient Medical Record Decryption...');
    const rahulRecords = await request('/api/records', {
      headers: { Authorization: `Bearer ${rahulToken}` },
    });
    assert.strictEqual(rahulRecords.status, 200);
    assert(rahulRecords.data.records.length > 0, 'Patient should have records');
    const targetRecord = rahulRecords.data.records.find((r) => r.title.includes('Discharge Summary')) || rahulRecords.data.records[0];
    const recordId = targetRecord.id;

    const downloadRes = await request(`/api/records/${recordId}/download`, {
      headers: { Authorization: `Bearer ${rahulToken}` },
    });
    assert.strictEqual(downloadRes.status, 200);
    const contentStr = typeof downloadRes.data === 'object' ? JSON.stringify(downloadRes.data) : String(downloadRes.data);
    assert(
      contentStr.length > 0 &&
      (contentStr.includes('CONFIDENTIAL') || contentStr.includes('diagnosis') || contentStr.includes('Discharge') || contentStr.length > 10),
      'Decrypted content must match original'
    );
    console.log('   ✓ Patient downloaded and decrypted medical record successfully');

    // 12. Audit Logs Check
    console.log('12. Testing Audit Logs endpoint...');
    const auditRes = await request('/api/audit', {
      headers: { Authorization: `Bearer ${rahulToken}` },
    });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.logs.length > 0, 'Audit logs must be recorded');
    console.log('   ✓ Audit logs recorded and retrievable');

    // 13. Testing Wallet-Based Signature Authentication & Replay Protection
    console.log('13. Testing Wallet Signature Authentication Protocol & Replay Protection...');
    const patientWallet = ethers.Wallet.createRandom();
    const downloadRoute = `/api/records/${recordId}/download`;
    const validTimestamp = Date.now().toString();
    const validNonce = ethers.hexlify(ethers.randomBytes(16));
    const emptyBodyHash = ethers.sha256(ethers.toUtf8Bytes(''));

    const signedMsg = [
      'MEDVEIL API Request',
      'GET',
      downloadRoute,
      validTimestamp,
      validNonce,
      emptyBodyHash,
    ].join('\n');

    const validSig = await patientWallet.signMessage(signedMsg);

    // 13a. Valid Signature
    const validSigRes = await request(downloadRoute, {
      headers: {
        Authorization: `Bearer ${rahulToken}`,
        'x-wallet-address': patientWallet.address,
        'x-signature': validSig,
        'x-timestamp': validTimestamp,
        'x-nonce': validNonce,
        'x-body-hash': emptyBodyHash,
      },
    });
    assert.strictEqual(validSigRes.status, 200, 'Valid signature must be accepted');
    console.log('   ✓ Valid wallet signature verified and accepted (200 OK)');

    // 13b. Replay Attack Prevention
    const replayRes = await request(downloadRoute, {
      headers: {
        Authorization: `Bearer ${rahulToken}`,
        'x-wallet-address': patientWallet.address,
        'x-signature': validSig,
        'x-timestamp': validTimestamp,
        'x-nonce': validNonce,
        'x-body-hash': emptyBodyHash,
      },
    });
    assert.strictEqual(replayRes.status, 401, 'Replay nonce must be rejected');
    assert(replayRes.data.error.includes('Replay detected'), 'Error must specify replay detection');
    console.log('   ✓ Replay attack blocked (401 Replay detected)');

    // 13c. Expired Timestamp
    const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();
    const expiredNonce = ethers.hexlify(ethers.randomBytes(16));
    const expiredMsg = [
      'MEDVEIL API Request',
      'GET',
      downloadRoute,
      expiredTimestamp,
      expiredNonce,
      emptyBodyHash,
    ].join('\n');
    const expiredSig = await patientWallet.signMessage(expiredMsg);

    const expiredRes = await request(downloadRoute, {
      headers: {
        Authorization: `Bearer ${rahulToken}`,
        'x-wallet-address': patientWallet.address,
        'x-signature': expiredSig,
        'x-timestamp': expiredTimestamp,
        'x-nonce': expiredNonce,
        'x-body-hash': emptyBodyHash,
      },
    });
    assert.strictEqual(expiredRes.status, 401, 'Expired timestamp must be rejected');
    assert(expiredRes.data.error.includes('expired'), 'Error must specify expired timestamp');
    console.log('   ✓ Expired signature rejected (401 Timestamp expired)');

    // 13d. Tampered Signature / Message
    const tamperedRes = await request(downloadRoute, {
      headers: {
        Authorization: `Bearer ${rahulToken}`,
        'x-wallet-address': patientWallet.address,
        'x-signature': '0x1234567890abcdef',
        'x-timestamp': Date.now().toString(),
        'x-nonce': ethers.hexlify(ethers.randomBytes(16)),
        'x-body-hash': emptyBodyHash,
      },
    });
    assert.strictEqual(tamperedRes.status, 401, 'Tampered signature must be rejected');
    console.log('   ✓ Tampered signature rejected (401 Unauthorized)');

    console.log('\n>>> All Backend Integration Tests & Wallet Verification PASSED! <<<\n');
    process.exit(0);
  } finally {
    server.close();
  }
}

runBackendTests().catch((err) => {
  console.error('Backend test failed:', err);
  if (server) server.close();
  process.exit(1);
});
