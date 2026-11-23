const multer = require('multer');
const db = require('../database/db');
const {
  encryptDocument,
  decryptDocument,
  wrapKey,
  unwrapKey,
  MASTER_KEY,
} = require('../services/encryptionService');
const { saveEncryptedRecord, readEncryptedRecord } = require('../services/storageService');
const {
  registerRecordOnChain,
  grantDoctorAccessOnChain,
  revokeDoctorAccessOnChain,
} = require('../services/blockchainService');

// In-memory multer upload handler
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

/**
 * 1. Upload & Encrypt Medical Record (AES-256-GCM)
 */
async function uploadRecord(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { title, recordType, patientId } = req.body;
    if (!title || !recordType) {
      return res.status(400).json({ success: false, error: 'title and recordType are required' });
    }

    // Determine target patient
    let targetPatientId;
    if (req.user.role === 'PATIENT') {
      const p = db.get('SELECT id FROM patients WHERE user_id = ?', req.user.id);
      if (!p) {
        return res.status(403).json({ success: false, error: 'Patient profile not found' });
      }
      targetPatientId = p.id;
    } else {
      targetPatientId = patientId || 1;
    }

    // Step A: Encrypt buffer with AES-256-GCM before saving anywhere
    const encryptionResult = encryptDocument(req.file.buffer);

    // Step B: Envelope encryption - wrap document key with master key
    const wrapped = wrapKey(encryptionResult.documentKeyHex, MASTER_KEY);

    // Step C: Save ONLY ciphertext to off-chain storage
    const storageResult = await saveEncryptedRecord(
      encryptionResult.ciphertext,
      req.file.originalname
    );

    // Step D: Store metadata in database
    const resDb = db.run(
      `INSERT INTO medical_records (
        patient_id, title, record_type, ipfs_cid, file_hash,
        iv_hex, auth_tag_hex, document_key_wrapped, file_size, mime_type, storage_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      targetPatientId,
      title,
      recordType,
      storageResult.cid,
      encryptionResult.ciphertextHash,
      encryptionResult.iv,
      encryptionResult.authTag,
      JSON.stringify(wrapped),
      req.file.size,
      req.file.mimetype,
      storageResult.storagePath
    );

    const recordId = resDb.lastInsertRowid;

    // Optional on-chain registration in PatientAccess
    const onChainTx = await registerRecordOnChain(
      recordId,
      storageResult.cid,
      encryptionResult.ciphertextHash,
      recordType
    );

    if (onChainTx) {
      db.run('UPDATE medical_records SET on_chain_tx = ? WHERE id = ?', onChainTx, recordId);
    }

    db.run(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'RECORD_ENCRYPTED_UPLOAD', 'RECORD', ?, ?)`,
      req.user.id,
      recordId,
      `Encrypted medical record uploaded. CID: ${storageResult.cid}, SHA-256: ${encryptionResult.ciphertextHash}`
    );

    res.status(201).json({
      success: true,
      message: 'Medical record encrypted and stored off-chain successfully',
      record: {
        id: recordId,
        title,
        recordType,
        ipfsCid: storageResult.cid,
        fileHash: encryptionResult.ciphertextHash,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        onChainTx,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * 2. Get all records accessible to the requesting user
 */
async function getAllRecords(req, res) {
  try {
    let records = [];

    if (req.user.role === 'PATIENT') {
      const p = db.get('SELECT id FROM patients WHERE user_id = ?', req.user.id);
      if (p) {
        records = db.all('SELECT * FROM medical_records WHERE patient_id = ? ORDER BY id DESC', p.id);
      }
    } else if (req.user.role === 'DOCTOR') {
      const doc = db.get('SELECT id FROM doctors WHERE user_id = ?', req.user.id);
      if (doc) {
        // Query records where doctor has active permission
        records = db.all(
          `SELECT r.*, p.expires_at, p.is_active as permission_active
           FROM medical_records r
           JOIN record_permissions p ON r.id = p.record_id
           WHERE p.doctor_id = ? AND p.is_active = 1
           ORDER BY r.id DESC`,
          doc.id
        );
      }
    } else if (req.user.role === 'ADMIN' || req.user.role === 'HOSPITAL') {
      records = db.all('SELECT * FROM medical_records ORDER BY id DESC');
    } else {
      // Insurers do NOT have access to medical records!
      return res.status(403).json({
        success: false,
        error: 'Insurers are prohibited from accessing private medical records',
      });
    }

    // Sanitize: Never return encryption keys or IV in list response!
    const sanitized = records.map((r) => ({
      id: r.id,
      title: r.title,
      recordType: r.record_type,
      ipfsCid: r.ipfs_cid,
      fileHash: r.file_hash,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      onChainTx: r.on_chain_tx,
      createdAt: r.created_at,
      hasAccess: true,
    }));

    res.json({ success: true, count: sanitized.length, records: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * 3. Download & Decrypt Medical Record (Strict Permission Check)
 */
async function downloadRecord(req, res) {
  try {
    const { id } = req.params;
    const record = db.get('SELECT * FROM medical_records WHERE id = ?', id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Permission check
    let authorized = false;
    if (req.user.role === 'ADMIN') {
      authorized = true;
    } else if (req.user.role === 'PATIENT') {
      const patient = db.get('SELECT id FROM patients WHERE user_id = ?', req.user.id);
      if (patient && patient.id === record.patient_id) {
        authorized = true;
      }
    } else if (req.user.role === 'DOCTOR') {
      const doctor = db.get('SELECT id FROM doctors WHERE user_id = ?', req.user.id);
      if (doctor) {
        const permission = db.get(
          'SELECT * FROM record_permissions WHERE record_id = ? AND doctor_id = ? AND is_active = 1',
          id,
          doctor.id
        );
        if (permission) {
          if (permission.expires_at === 0 || Math.floor(Date.now() / 1000) <= permission.expires_at) {
            authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have valid doctor authorization or ownership for this medical record.',
      });
    }

    // Step A: Load encrypted ciphertext from storage
    const encryptedBuffer = readEncryptedRecord(record.storage_path, record.ipfs_cid);

    // Step B: Unwrap document key using master key
    const wrapped = JSON.parse(record.document_key_wrapped);
    const docKeyHex = unwrapKey(wrapped.wrappedKey, wrapped.wrapIv, wrapped.wrapTag, MASTER_KEY);

    // Step C: Decrypt document
    const decryptResult = decryptDocument(
      encryptedBuffer,
      docKeyHex,
      record.iv_hex,
      record.auth_tag_hex
    );

    if (!decryptResult.success) {
      return res.status(500).json({ success: false, error: decryptResult.error });
    }

    // Audit log
    db.run(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'RECORD_DECRYPT_DOWNLOAD', 'RECORD', ?, ?)`,
      req.user.id,
      record.id,
      `Record downloaded and decrypted by user ${req.user.username} (${req.user.role})`
    );

    res.setHeader('Content-Type', record.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${record.title.replace(/\s+/g, '_')}.pdf"`);
    res.send(decryptResult.decrypted);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * 4. Grant Doctor Access
 */
async function grantAccess(req, res) {
  try {
    const { id } = req.params;
    const { doctorId, expiresAt = 0 } = req.body;
    if (!doctorId) {
      return res.status(400).json({ success: false, error: 'doctorId is required' });
    }

    const record = db.get('SELECT * FROM medical_records WHERE id = ?', id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Verify patient owns record
    if (req.user.role === 'PATIENT') {
      const patient = db.get('SELECT id FROM patients WHERE user_id = ?', req.user.id);
      if (!patient || patient.id !== record.patient_id) {
        return res.status(403).json({ success: false, error: 'Only record owner can grant access' });
      }
    }

    const doctor = db.get('SELECT * FROM doctors WHERE id = ?', doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, error: 'Doctor not found' });
    }

    // Register on-chain
    const onChainTx = await grantDoctorAccessOnChain(record.id, doctor.wallet_address, expiresAt);

    // Insert or update permission in DB
    db.run(
      `INSERT OR REPLACE INTO record_permissions (record_id, doctor_id, doctor_address, expires_at, is_active, on_chain_tx)
       VALUES (?, ?, ?, ?, 1, ?)`,
      record.id,
      doctor.id,
      doctor.wallet_address,
      expiresAt,
      onChainTx
    );

    db.run(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'ACCESS_GRANTED', 'PERMISSION', ?, ?)`,
      req.user.id,
      record.id,
      `Access granted to Dr. ${doctor.full_name}. Expiration: ${expiresAt || 'Never'}`
    );

    res.json({
      success: true,
      message: `Access granted to Dr. ${doctor.full_name}`,
      doctorId: doctor.id,
      recordId: record.id,
      expiresAt,
      onChainTx,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * 5. Revoke Doctor Access
 */
async function revokeAccess(req, res) {
  try {
    const { id } = req.params;
    const { doctorId } = req.body;
    if (!doctorId) {
      return res.status(400).json({ success: false, error: 'doctorId is required' });
    }

    const record = db.get('SELECT * FROM medical_records WHERE id = ?', id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const doctor = db.get('SELECT * FROM doctors WHERE id = ?', doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, error: 'Doctor not found' });
    }

    // Revoke on-chain
    const onChainTx = await revokeDoctorAccessOnChain(record.id, doctor.wallet_address);

    // Update DB
    db.run(
      `UPDATE record_permissions SET is_active = 0, revoked_at = CURRENT_TIMESTAMP WHERE record_id = ? AND doctor_id = ?`,
      record.id,
      doctor.id
    );

    db.run(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'ACCESS_REVOKED', 'PERMISSION', ?, ?)`,
      req.user.id,
      record.id,
      `Access revoked for Dr. ${doctor.full_name}`
    );

    res.json({
      success: true,
      message: `Access revoked for Dr. ${doctor.full_name}`,
      doctorId: doctor.id,
      recordId: record.id,
      onChainTx,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * 6. Get Permissions for Record
 */
async function getPermissions(req, res) {
  try {
    const { id } = req.params;
    const permissions = db.all(
      `SELECT p.*, d.full_name as doctor_name, d.specialization, d.license_number
       FROM record_permissions p
       JOIN doctors d ON p.doctor_id = d.id
       WHERE p.record_id = ?
       ORDER BY p.id DESC`,
      id
    );

    res.json({ success: true, count: permissions.length, permissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  upload,
  uploadRecord,
  getAllRecords,
  downloadRecord,
  grantAccess,
  revokeAccess,
  getPermissions,
};
