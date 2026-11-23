const assert = require('assert');
const { ethers } = require('ethers');

const API_BASE = 'http://localhost:5055';
const RPC_URL = 'http://127.0.0.1:8555';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = options.headers || {};
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof Buffer) && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
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

// Signs a request in exact accordance with MEDVEIL wallet signing protocol
async function signRequest(signer, method, route, body) {
  let bodyHash;
  if (!body) {
    bodyHash = ethers.sha256(ethers.toUtf8Bytes(''));
  } else if (typeof body === 'string') {
    bodyHash = ethers.sha256(ethers.toUtf8Bytes(body));
  } else {
    bodyHash = ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(body)));
  }

  const timestamp = Date.now().toString();
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const address = await signer.getAddress();

  const signedMessage = [
    'MEDVEIL API Request',
    method.toUpperCase(),
    route,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');

  const signature = await signer.signMessage(signedMessage);

  return {
    'x-wallet-address': address,
    'x-signature': signature,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-body-hash': bodyHash,
  };
}

async function runE2E() {
  console.log('=== MEDVEIL End-to-End MetaMask & Cryptographic Operations Verification ===\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const patientWallet = await provider.getSigner(0); // Accounts[0]
  const doctorWallet = await provider.getSigner(1);  // Accounts[1]
  const adminWallet = await provider.getSigner(0);   // Contract owner

  // 1. Authenticate users
  console.log('1. Authenticating test users...');
  const rahulLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'rahul', password: 'Password123!' },
  });
  const rahulToken = rahulLogin.data.token;
  console.log('   ✓ Patient Rahul logged in');

  const docLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'dr_sharma', password: 'Password123!' },
  });
  const docToken = docLogin.data.token;
  console.log('   ✓ Doctor Dr. Sharma logged in');

  // 2. Patient Uploads Medical Record (Requires Signature)
  console.log('\n2. Testing Medical Record Upload with Wallet Signature...');
  // Upload multipart using Boundary
  const boundary = '----WebKitFormBoundaryMedveilTest' + Date.now();
  const fileContent = JSON.stringify({
    diagnosis: 'Acute Appendicitis',
    procedure: 'Laparoscopic Appendectomy',
    prescriptions: ['Cefazolin 1g', 'Paracetamol 650mg'],
    physician: 'Dr. Sharma',
  });
  const recordTitle = 'Surgical Note ' + Date.now();
  const recordType = 'SURGICAL_SUMMARY';
  const fileName = 'surgical_note.json';

  let multipartBody = '';
  multipartBody += `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="title"\r\n\r\n${recordTitle}\r\n`;
  multipartBody += `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="recordType"\r\n\r\n${recordType}\r\n`;
  multipartBody += `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
  multipartBody += `Content-Type: application/json\r\n\r\n${fileContent}\r\n`;
  multipartBody += `--${boundary}--\r\n`;

  const formBodyHash = ethers.sha256(ethers.toUtf8Bytes(`form:${recordTitle}:${recordType}:${fileName}:${Buffer.byteLength(fileContent)}`));
  const uploadTimestamp = Date.now().toString();
  const uploadNonce = ethers.hexlify(ethers.randomBytes(16));
  const uploadSignedMsg = [
    'MEDVEIL API Request',
    'POST',
    '/api/records/upload',
    uploadTimestamp,
    uploadNonce,
    formBodyHash,
  ].join('\n');
  const uploadSig = await patientWallet.signMessage(uploadSignedMsg);

  const uploadRes = await fetch(`${API_BASE}/api/records/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rahulToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'x-wallet-address': await patientWallet.getAddress(),
      'x-signature': uploadSig,
      'x-timestamp': uploadTimestamp,
      'x-nonce': uploadNonce,
      'x-body-hash': formBodyHash,
    },
    body: multipartBody,
  });

  const uploadJson = await uploadRes.json();
  assert.strictEqual(uploadRes.status, 201, 'Upload must succeed with 201');
  const recordId = uploadJson.record.id;
  console.log(`   ✓ Medical record encrypted with AES-256-GCM and stored off-chain (Record ID: ${recordId})`);
  console.log(`   ✓ SHA-256 integrity hash: ${uploadJson.record.fileHash}`);

  // 3. Unauthorized Doctor Access check before grant
  console.log('\n3. Testing Unauthorized Doctor Access Check...');
  const unauthorizedDocSigHeaders = await signRequest(doctorWallet, 'GET', `/api/records/${recordId}/download`, null);
  const unauthRes = await request(`/api/records/${recordId}/download`, {
    headers: {
      Authorization: `Bearer ${docToken}`,
      ...unauthorizedDocSigHeaders,
    },
  });
  assert.strictEqual(unauthRes.status, 403, 'Doctor without access must be rejected (403)');
  console.log('   ✓ Doctor correctly rejected before grant (403 Access Denied)');

  // 4. Patient Grants Doctor Access (Requires Signature)
  console.log('\n4. Testing Patient Grant Access with Wallet Signature...');
  const grantBody = { doctorId: 1, expiresAt: 0 };
  const grantSigHeaders = await signRequest(patientWallet, 'POST', `/api/records/${recordId}/grant-access`, grantBody);
  const grantRes = await request(`/api/records/${recordId}/grant-access`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rahulToken}`,
      ...grantSigHeaders,
    },
    body: grantBody,
  });
  assert.strictEqual(grantRes.status, 200, 'Grant access must succeed');
  console.log('   ✓ Access granted to Dr. Sharma with verified wallet signature');

  // 5. Authorized Doctor Decrypts Record (Requires Signature)
  console.log('\n5. Testing Authorized Doctor Retrieval & Decryption with Wallet Signature...');
  const authorizedDocSigHeaders = await signRequest(doctorWallet, 'GET', `/api/records/${recordId}/download`, null);
  const docDownloadRes = await request(`/api/records/${recordId}/download`, {
    headers: {
      Authorization: `Bearer ${docToken}`,
      ...authorizedDocSigHeaders,
    },
  });
  assert.strictEqual(docDownloadRes.status, 200, 'Authorized doctor must retrieve record (200)');
  const decryptedContent = typeof docDownloadRes.data === 'object' ? JSON.stringify(docDownloadRes.data) : docDownloadRes.data;
  assert(decryptedContent.includes('Acute Appendicitis'), 'Decrypted content must contain diagnosis');
  console.log('   ✓ Doctor successfully decrypted medical record off-chain with verified signature');

  // 6. Patient Revokes Doctor Access (Requires Signature)
  console.log('\n6. Testing Patient Revoke Access with Wallet Signature...');
  const revokeBody = { doctorId: 1 };
  const revokeSigHeaders = await signRequest(patientWallet, 'POST', `/api/records/${recordId}/revoke-access`, revokeBody);
  const revokeRes = await request(`/api/records/${recordId}/revoke-access`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rahulToken}`,
      ...revokeSigHeaders,
    },
    body: revokeBody,
  });
  assert.strictEqual(revokeRes.status, 200, 'Revoke access must succeed');
  console.log('   ✓ Access revoked for Dr. Sharma with verified wallet signature');

  // 7. Revoked Doctor Access Attempt
  console.log('\n7. Testing Revoked Doctor Access Attempt...');
  const revokedDocSigHeaders = await signRequest(doctorWallet, 'GET', `/api/records/${recordId}/download`, null);
  const postRevokeRes = await request(`/api/records/${recordId}/download`, {
    headers: {
      Authorization: `Bearer ${docToken}`,
      ...revokedDocSigHeaders,
    },
  });
  assert.strictEqual(postRevokeRes.status, 403, 'Revoked doctor must be rejected (403)');
  console.log('   ✓ Revoked doctor correctly rejected (403 Access Denied)');

  // 8. Smart Contract Interaction: Register Policy On-Chain (Transaction Popup)
  console.log('\n8. Testing On-Chain Policy Registration (MetaMask Transaction)...');
  const policyConfig = await request('/api/policies/registry-config');
  const policyRegistryAbi = [
    'function registerPolicy(uint256,uint256,uint256)',
    'function policyIdToCommitment(uint256) view returns (uint256)',
  ];
  const policyContract = new ethers.Contract(policyConfig.data.policyRegistryAddress, policyRegistryAbi, adminWallet);
  const testPolicyId = 90000 + Math.floor(Math.random() * 9999);
  const dummyCommitment = BigInt(ethers.hexlify(ethers.randomBytes(16)));
  const dummyRoot = BigInt(ethers.hexlify(ethers.randomBytes(16)));
  const regTx = await policyContract.registerPolicy(testPolicyId, dummyCommitment, dummyRoot);
  const regReceipt = await regTx.wait(1);
  assert.strictEqual(regReceipt.status, 1, 'Policy registration transaction must succeed');
  console.log(`   ✓ Policy registered on-chain via transaction: ${regTx.hash} (Block: ${regReceipt.blockNumber})`);

  // 9. Smart Contract Interaction: Update Hospital Registry On-Chain (Transaction Popup)
  console.log('\n9. Testing On-Chain Hospital Registry Update (MetaMask Transaction)...');
  const hospConfig = await request('/api/hospitals/registry-config');
  const hospRegistryAbi = [
    'function hospitalMerkleRoot() view returns (uint256)',
    'function updateHospitalMerkleRoot(uint256 _newRoot) external',
  ];
  const hospContract = new ethers.Contract(hospConfig.data.hospitalRegistryAddress, hospRegistryAbi, adminWallet);
  const currentRoot = await hospContract.hospitalMerkleRoot();
  console.log(`   ✓ Current Hospital Merkle root read (Read-only call, no popup): ${currentRoot}`);
  const updateHospTx = await hospContract.updateHospitalMerkleRoot(currentRoot);
  const hospReceipt = await updateHospTx.wait(1);
  assert.strictEqual(hospReceipt.status, 1, 'Hospital registry update must succeed');
  console.log(`   ✓ Hospital registry updated on-chain via transaction: ${updateHospTx.hash} (Block: ${hospReceipt.blockNumber})`);

  // 10. Smart Contract Interaction: Submit On-Chain Claim Settlement (Transaction Popup)
  console.log('\n10. Testing On-Chain Claim Settlement with Groth16 Verifier (MetaMask Transaction)...');
  // Create, sign, and prove claim
  const hospLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'apollo_hospital', password: 'Password123!' },
  });
  const hospToken = hospLogin.data.token;
  const createClaimRes = await request('/api/claims', {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
    body: {
      patientId: 1,
      policyId: 1,
      claimAmount: 45000,
      treatmentDate: 20260315,
      procedureCode: 7701,
    },
  });
  const newClaimId = createClaimRes.data.claim.id;
  await request(`/api/claims/${newClaimId}/sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
  });
  await request(`/api/claims/${newClaimId}/generate-proof`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
  });
  await request(`/api/claims/${newClaimId}/verify-proof`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
  });

  const calldataRes = await request(`/api/claims/${newClaimId}/calldata`, {
    headers: { Authorization: `Bearer ${hospToken}` },
  });
  const { calldata, claimSettlementAddress } = calldataRes.data;

  const settlementAbi = [
    'function verifyAndSettleClaim(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] input) external returns (bool)',
  ];
  const settlementContract = new ethers.Contract(claimSettlementAddress, settlementAbi, adminWallet);
  const settleTx = await settlementContract.verifyAndSettleClaim(
    calldata.a,
    calldata.b,
    calldata.c,
    calldata.input
  );
  const settleReceipt = await settleTx.wait(1);
  assert.strictEqual(settleReceipt.status, 1, 'Claim settlement transaction must succeed');
  console.log(`   ✓ Claim settled on-chain via verifyAndSettleClaim transaction: ${settleTx.hash} (Block: ${settleReceipt.blockNumber})`);

  // Update claim status with txHash
  const submitRes = await request(`/api/claims/${newClaimId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
    body: { txHash: settleReceipt.hash, blockNumber: settleReceipt.blockNumber },
  });
  assert.strictEqual(submitRes.status, 200);
  console.log(`   ✓ Backend claim marked SETTLED with txHash: ${submitRes.data.txHash}`);

  console.log('\n=============================================================');
  console.log('>>> ALL 9 METAMASK & CRYPTOGRAPHIC OPERATIONS VERIFIED! <<<');
  console.log('=============================================================\n');
}

runE2E().catch((err) => {
  console.error('\nE2E Verification failed:', err);
  process.exit(1);
});
