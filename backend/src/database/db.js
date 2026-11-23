const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, '..', 'database', 'medveil.sqlite');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Initializes all database tables and indexes if they do not exist
 */
function initDatabase() {
  db.exec(`
    -- 1. Users table (authentication & credentials)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('PATIENT', 'HOSPITAL', 'INSURER', 'DOCTOR', 'ADMIN')),
      wallet_address TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Patients table
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      policy_id INTEGER,
      patient_secret TEXT NOT NULL, -- Kept securely in backend for prototype nullifier generation
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 3. Hospitals table
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      license_number TEXT NOT NULL,
      pubkey_ax TEXT NOT NULL,
      pubkey_ay TEXT NOT NULL,
      evm_address TEXT NOT NULL,
      payout_address TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 4. Insurers table
    CREATE TABLE IF NOT EXISTS insurers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      license_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      is_authorized INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 5. Doctors table
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      license_number TEXT NOT NULL,
      specialization TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      hospital_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(hospital_id) REFERENCES hospitals(id)
    );

    -- 6. Policies table
    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_number TEXT UNIQUE NOT NULL,
      insurer_id INTEGER NOT NULL,
      policy_limit INTEGER NOT NULL, -- Numeric amount
      expiry_date INTEGER NOT NULL,  -- YYYYMMDD
      coverage_root TEXT NOT NULL,
      policy_commitment TEXT UNIQUE NOT NULL,
      covered_procedures TEXT NOT NULL, -- JSON array of numeric procedure codes
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(insurer_id) REFERENCES insurers(id)
    );

    -- 7. Claims table
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_number TEXT UNIQUE NOT NULL,
      patient_id INTEGER NOT NULL,
      hospital_id INTEGER NOT NULL,
      policy_id INTEGER NOT NULL,
      claim_amount INTEGER NOT NULL,
      treatment_date INTEGER NOT NULL, -- YYYYMMDD
      procedure_code INTEGER NOT NULL, -- Kept private inside ZK proof
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN (
        'DRAFT', 'SIGNED', 'SIGNATURE_VERIFIED',
        'PROOF_GENERATING', 'PROOF_GENERATED', 'PROOF_VERIFIED',
        'SUBMITTED', 'ON_CHAIN_VERIFIED', 'SETTLED', 'REJECTED', 'FAILED'
      )),
      episode_id TEXT NOT NULL,
      nullifier TEXT UNIQUE,
      hospital_signature TEXT, -- JSON { R8x, R8y, S }
      tx_hash TEXT,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(hospital_id) REFERENCES hospitals(id),
      FOREIGN KEY(policy_id) REFERENCES policies(id)
    );

    -- 8. Claim proofs table
    CREATE TABLE IF NOT EXISTS claim_proofs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER UNIQUE NOT NULL,
      proof_json TEXT NOT NULL,
      public_signals_json TEXT NOT NULL,
      verified_locally INTEGER DEFAULT 0,
      verified_on_chain INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );

    -- 9. Medical records table (Encrypted off-chain)
    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      record_type TEXT NOT NULL,
      ipfs_cid TEXT NOT NULL,
      file_hash TEXT NOT NULL, -- SHA-256 of encrypted file
      iv_hex TEXT NOT NULL,
      auth_tag_hex TEXT NOT NULL,
      document_key_wrapped TEXT NOT NULL, -- Envelope encryption wrapped key
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT, -- Local encrypted file storage path
      on_chain_tx TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );

    -- 10. Record permissions table
    CREATE TABLE IF NOT EXISTS record_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      doctor_address TEXT NOT NULL,
      expires_at INTEGER DEFAULT 0, -- Unix timestamp (0 = no expiry)
      is_active INTEGER DEFAULT 1,
      on_chain_tx TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      FOREIGN KEY(record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id)
    );

    -- 11. Claim nullifiers table
    CREATE TABLE IF NOT EXISTS claim_nullifiers (
      nullifier TEXT PRIMARY KEY,
      claim_id INTEGER NOT NULL,
      consumed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tx_hash TEXT,
      FOREIGN KEY(claim_id) REFERENCES claims(id)
    );

    -- 12. Blockchain Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT UNIQUE NOT NULL,
      action TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT,
      status TEXT NOT NULL,
      block_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Audit logs table (Never contains private medical records or keys)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_claims_patient ON claims(patient_id);
    CREATE INDEX IF NOT EXISTS idx_claims_hospital ON claims(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_claims_nullifier ON claims(nullifier);
    CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_doctor ON record_permissions(doctor_id, is_active);
  `);
}

// Helper wrapper functions
const dbHelper = {
  db,
  initDatabase,
  get(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  all(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  run(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  },
};

// Initialize schema on load
initDatabase();

module.exports = dbHelper;
