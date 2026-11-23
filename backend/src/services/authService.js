const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const crypto = require('crypto');
const db = require('../database/db');
const { JWT_SECRET } = require('../middleware/authMiddleware');

// In-memory challenge nonces for Web3 wallet authentication
const walletChallenges = new Map(); // address.toLowerCase() => { nonce, expiresAt }

/**
 * Generates JWT for authenticated user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      walletAddress: user.wallet_address,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Registers a new user with password hashing and role-specific profile
 */
async function registerUser({
  username,
  email,
  password,
  role,
  walletAddress = null,
  profileDetails = {},
}) {
  const existing = db.get(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    username,
    email
  );
  if (existing) {
    throw new Error('Username or email already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const normalizedWallet = walletAddress ? walletAddress.toLowerCase() : null;

  // Insert base user
  const userRes = db.run(
    `INSERT INTO users (username, email, password_hash, role, wallet_address)
     VALUES (?, ?, ?, ?, ?)`,
    username,
    email,
    passwordHash,
    role,
    normalizedWallet
  );
  const userId = userRes.lastInsertRowid;

  // Create role-specific record
  if (role === 'PATIENT') {
    const patientSecret = profileDetails.patientSecret || crypto.randomBytes(16).toString('hex');
    db.run(
      `INSERT INTO patients (user_id, full_name, policy_id, patient_secret)
       VALUES (?, ?, ?, ?)`,
      userId,
      profileDetails.fullName || username,
      profileDetails.policyId || null,
      patientSecret
    );
  } else if (role === 'HOSPITAL') {
    db.run(
      `INSERT INTO hospitals (user_id, name, license_number, pubkey_ax, pubkey_ay, evm_address, payout_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      profileDetails.name || username,
      profileDetails.licenseNumber || 'HOSP-LIC-100',
      profileDetails.pubKeyAx || '0',
      profileDetails.pubKeyAy || '0',
      profileDetails.evmAddress || normalizedWallet || '0x0000000000000000000000000000000000000000',
      profileDetails.payoutAddress || normalizedWallet || '0x0000000000000000000000000000000000000000'
    );
  } else if (role === 'INSURER') {
    db.run(
      `INSERT INTO insurers (user_id, company_name, license_id, wallet_address)
       VALUES (?, ?, ?, ?)`,
      userId,
      profileDetails.companyName || username,
      profileDetails.licenseId || 'INS-LIC-500',
      normalizedWallet || '0x0000000000000000000000000000000000000000'
    );
  } else if (role === 'DOCTOR') {
    db.run(
      `INSERT INTO doctors (user_id, full_name, license_number, specialization, wallet_address, hospital_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      profileDetails.fullName || username,
      profileDetails.licenseNumber || 'DOC-LIC-700',
      profileDetails.specialization || 'General Surgery',
      normalizedWallet || '0x0000000000000000000000000000000000000000',
      profileDetails.hospitalId || 1
    );
  }

  const createdUser = db.get('SELECT id, username, email, role, wallet_address FROM users WHERE id = ?', userId);
  const token = generateToken(createdUser);

  return { user: createdUser, token };
}

/**
 * Authenticates user with username/email and password
 */
async function loginUser(identifier, password) {
  const user = db.get(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    identifier,
    identifier
  );
  if (!user) {
    throw new Error('Invalid username or password');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid username or password');
  }

  const safeUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    wallet_address: user.wallet_address,
  };

  const token = generateToken(safeUser);
  return { user: safeUser, token };
}

/**
 * Generates a challenge nonce for Web3 wallet authentication
 */
function getWalletChallenge(walletAddress) {
  const normalized = walletAddress.toLowerCase();
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min validity

  walletChallenges.set(normalized, { nonce, expiresAt });

  const message = `Sign this message to verify identity with MEDVEIL Healthcare.\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
  return { message, nonce };
}

/**
 * Verifies wallet signature and returns user + JWT
 */
async function verifyWalletLogin(walletAddress, signature, message) {
  const normalized = walletAddress.toLowerCase();
  const challenge = walletChallenges.get(normalized);

  if (!challenge || Date.now() > challenge.expiresAt) {
    throw new Error('Challenge expired or not found. Request a fresh challenge.');
  }

  // Recover address from signature
  const recoveredAddress = ethers.verifyMessage(message, signature);
  if (recoveredAddress.toLowerCase() !== normalized) {
    throw new Error('Invalid wallet signature.');
  }

  // Consume nonce (replay prevention)
  walletChallenges.delete(normalized);

  // Find user by wallet address
  let user = db.get('SELECT id, username, email, role, wallet_address FROM users WHERE LOWER(wallet_address) = ?', normalized);
  if (!user) {
    // Seamless Web3 Onboarding: Automatically provision a new Patient account linked to this wallet
    const shortAddress = normalized.slice(2, 8);
    let username = `patient_${shortAddress}`;
    let email = `patient_${shortAddress}@medveil.health`;

    const existing = db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, email);
    if (existing) {
      username = `patient_${shortAddress}_${Date.now() % 1000}`;
      email = `${username}@medveil.health`;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), salt);

    const userRes = db.run(
      `INSERT INTO users (username, email, password_hash, role, wallet_address)
       VALUES (?, ?, ?, 'PATIENT', ?)`,
      username,
      email,
      passwordHash,
      normalized
    );
    const userId = userRes.lastInsertRowid;

    // Link patient to active policy #5001
    const policy = db.get('SELECT id FROM policies WHERE is_active = 1 LIMIT 1');
    const policyId = policy ? policy.id : 5001;
    const patientSecret = crypto.randomBytes(16).toString('hex');

    db.run(
      `INSERT INTO patients (user_id, full_name, policy_id, patient_secret)
       VALUES (?, ?, ?, ?)`,
      userId,
      `Web3 Patient (${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)})`,
      policyId,
      patientSecret
    );

    user = db.get('SELECT id, username, email, role, wallet_address FROM users WHERE id = ?', userId);
  }

  const token = generateToken(user);
  return { user, token };
}

async function linkWallet(userId, walletAddress) {
  const normalized = walletAddress.toLowerCase();
  db.run('UPDATE users SET wallet_address = ? WHERE id = ?', normalized, userId);
  const updatedUser = db.get('SELECT id, username, email, role, wallet_address FROM users WHERE id = ?', userId);
  return updatedUser;
}

module.exports = {
  registerUser,
  loginUser,
  getWalletChallenge,
  verifyWalletLogin,
  linkWallet,
  generateToken,
};
