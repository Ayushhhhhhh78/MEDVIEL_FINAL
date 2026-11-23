const bcrypt = require('../backend/node_modules/bcryptjs');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const db = require('../backend/src/database/db');
const { generateKeys } = require('../backend/src/services/eddsaService');
const { buildCoveredProceduresTree, buildHospitalRegistryTree } = require('../backend/src/utils/merkleTree');
const { computePolicyCommitment } = require('../backend/src/services/zkService');
const { encryptDocument, wrapKey, MASTER_KEY } = require('../backend/src/services/encryptionService');
const { saveEncryptedRecord } = require('../backend/src/services/storageService');

async function seed() {
  console.log('=== Seeding MEDVEIL Database with Synthetic Demo Data ===\n');

  // Clear existing records to ensure clean state
  db.db.exec(`
    DELETE FROM audit_logs;
    DELETE FROM record_permissions;
    DELETE FROM medical_records;
    DELETE FROM claim_proofs;
    DELETE FROM claim_nullifiers;
    DELETE FROM claims;
    DELETE FROM policies;
    DELETE FROM doctors;
    DELETE FROM insurers;
    DELETE FROM hospitals;
    DELETE FROM patients;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);

  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('Password123!', salt);
  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', salt);

  // 1. Create ADMIN User
  console.log('1. Creating System Admin user...');
  const adminRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, 'ADMIN', ?)`,
    'admin',
    'admin@medveil.health',
    adminPasswordHash,
    '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
  );
  console.log('   ✓ Admin created: admin / AdminPassword123!');

  // 2. Create Synthetic Hospital (Apollo)
  console.log('2. Creating Approved Synthetic Hospital (Apollo)...');
  const hospitalSeed = process.env.HOSPITAL_EDDSA_SEED || '4c696665536176657273486f73706974616c5365656432303236303130313031';
  const hospitalKeys = await generateKeys(hospitalSeed);

  const hospUserRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, 'HOSPITAL', ?)`,
    'apollo_hospital',
    'apollo@healthcare.synth',
    defaultPasswordHash,
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
  );

  const hospRes = db.run(
    `INSERT INTO hospitals (id, user_id, name, license_number, pubkey_ax, pubkey_ay, evm_address, payout_address, is_active)
     VALUES (101, ?, ?, ?, ?, ?, ?, ?, 1)`,
    hospUserRes.lastInsertRowid,
    'Apollo Synthetic Hospital',
    'APOLLO-DELHI-9921',
    hospitalKeys.publicKey.x,
    hospitalKeys.publicKey.y,
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'
  );
  const hospitalId = 101;
  console.log('   ✓ Hospital created: apollo_hospital / Password123!');

  // 3. Create Insurer (MediCare)
  console.log('3. Creating Insurer (MediCare Insurance)...');
  const insUserRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, 'INSURER', ?)`,
    'medicare_insurer',
    'claims@medicare.synth',
    defaultPasswordHash,
    '0x90f79bf6eb2c4f870365e785982e1f101e93b906'
  );

  const insRes = db.run(
    `INSERT INTO insurers (user_id, company_name, license_id, wallet_address, is_authorized)
     VALUES (?, ?, ?, ?, 1)`,
    insUserRes.lastInsertRowid,
    'MediCare National Health Insurance',
    'IRDAI-MED-2026-88',
    '0x90f79bf6eb2c4f870365e785982e1f101e93b906'
  );
  const insurerId = insRes.lastInsertRowid;
  console.log('   ✓ Insurer created: medicare_insurer / Password123!');

  // 4. Create Policy
  console.log('4. Creating Insurance Policy with Covered Procedures Merkle Tree...');
  const coveredProcedures = [7701, 7702, 7703]; // 7701: Appendectomy, 7702: Cholecystectomy, 7703: Orthopedic
  const procedureTree = await buildCoveredProceduresTree(coveredProcedures);
  const coverageRoot = procedureTree.getRootString();

  const policyLimit = 500000;      // ₹5,00,000 policy limit
  const expiryDate = 20261231;     // Valid through Dec 31, 2026
  const commitment = await computePolicyCommitment(5001, policyLimit, expiryDate, coverageRoot);

  const polRes = db.run(
    `INSERT INTO policies (id, policy_number, insurer_id, policy_limit, expiry_date, coverage_root, policy_commitment, covered_procedures, is_active)
     VALUES (5001, 'POL-MED-5001', ?, ?, ?, ?, ?, ?, 1)`,
    insurerId,
    policyLimit,
    expiryDate,
    coverageRoot,
    commitment,
    JSON.stringify(coveredProcedures)
  );
  const policyId = 5001;
  console.log('   ✓ Policy #POL-MED-5001 created (Limit: ₹5,00,000, Expiry: 2026-12-31)');

  // 5. Create Patient (Rahul)
  console.log('5. Creating Synthetic Patient (Rahul)...');
  const patientSecret = '98765432101234567890';
  const patUserRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, 'PATIENT', ?)`,
    'rahul',
    'rahul@synthetic.health',
    defaultPasswordHash,
    '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'
  );

  const patRes = db.run(
    `INSERT INTO patients (user_id, full_name, policy_id, patient_secret)
     VALUES (?, 'Rahul Sharma', ?, ?)`,
    patUserRes.lastInsertRowid,
    policyId,
    patientSecret
  );
  const patientId = patRes.lastInsertRowid;
  console.log('   ✓ Patient created: rahul / Password123!');

  // 6. Create Doctor (Dr. Sharma)
  console.log('6. Creating Doctor (Dr. Sharma)...');
  const docUserRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, 'DOCTOR', ?)`,
    'dr_sharma',
    'dr.sharma@apollo.synth',
    defaultPasswordHash,
    '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'
  );

  const docRes = db.run(
    `INSERT INTO doctors (user_id, full_name, license_number, specialization, wallet_address, hospital_id)
     VALUES (?, 'Dr. A. K. Sharma', 'MCI-SURG-7712', 'General Surgery & Laparoscopy', ?, ?)`,
    docUserRes.lastInsertRowid,
    '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    hospitalId
  );
  const doctorId = docRes.lastInsertRowid;
  console.log('   ✓ Doctor created: dr_sharma / Password123!');

  // 7. Create Encrypted Medical Records for Rahul
  console.log('7. Creating & Encrypting synthetic medical records with AES-256-GCM...');
  const sampleMedicalDoc = `
CONFIDENTIAL MEDICAL SUMMARY
Patient Name: Rahul Sharma
DOB: 15-Aug-1994 | Age: 31 | Sex: Male
Diagnosis: Acute appendicitis with localized peritonitis
Procedure Performed: Laparoscopic Appendectomy (Code: 7701)
Operating Surgeon: Dr. A. K. Sharma
Hospital: Apollo Synthetic Hospital
Date of Admission: 14-May-2026
Date of Procedure: 15-May-2026
Date of Discharge: 17-May-2026
Total Procedure Cost: INR 2,50,000
Post-Op Status: Hemodynamically stable. Clean incision sites. Prescribed oral analgesics and antibiotic course.
  `.trim();

  const encDoc = encryptDocument(Buffer.from(sampleMedicalDoc, 'utf-8'));
  const wrapped = wrapKey(encDoc.documentKeyHex, MASTER_KEY);
  const storage = await saveEncryptedRecord(encDoc.ciphertext, 'Rahul_Surgical_Discharge_Summary.pdf');

  const recRes = db.run(
    `INSERT INTO medical_records (
      patient_id, title, record_type, ipfs_cid, file_hash,
      iv_hex, auth_tag_hex, document_key_wrapped, file_size, mime_type, storage_path
    ) VALUES (?, ?, 'SURGICAL_DISCHARGE_SUMMARY', ?, ?, ?, ?, ?, ?, 'application/pdf', ?)`,
    patientId,
    'Laparoscopic Appendectomy Discharge Summary',
    storage.cid,
    encDoc.ciphertextHash,
    encDoc.iv,
    encDoc.authTag,
    JSON.stringify(wrapped),
    encDoc.ciphertext.length,
    storage.storagePath
  );
  const recordId = recRes.lastInsertRowid;
  console.log('   ✓ Encrypted medical record created (CID: ' + storage.cid + ')');

  // 8. Grant initial doctor access
  console.log('8. Granting Doctor Access for Dr. Sharma...');
  db.run(
    `INSERT INTO record_permissions (record_id, doctor_id, doctor_address, expires_at, is_active)
     VALUES (?, ?, '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc', ?, 1)`,
    recordId,
    doctorId,
    Math.floor(Date.now() / 1000) + 30 * 86400 // 30 days
  );
  console.log('   ✓ Record permission granted to Dr. Sharma');

  console.log('\n>>> Database Seeding COMPLETED Successfully! <<<\n');
  console.log('Demo Login Credentials:');
  console.log('----------------------------------------------------');
  console.log('Role       | Username          | Password');
  console.log('----------------------------------------------------');
  console.log('PATIENT    | rahul             | Password123!');
  console.log('HOSPITAL   | apollo_hospital   | Password123!');
  console.log('INSURER    | medicare_insurer  | Password123!');
  console.log('DOCTOR     | dr_sharma         | Password123!');
  console.log('ADMIN      | admin             | AdminPassword123!');
  console.log('----------------------------------------------------');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
