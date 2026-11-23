const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'medveil_super_secret_jwt_key_replace_in_production_32bytes_min!';

// In-memory store for used nonces with expiration tracking (replay attack prevention)
const usedNonces = new Map();

// Periodic cleanup of expired nonces (older than 10 minutes)
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [nonce, ts] of usedNonces.entries()) {
    if (ts < cutoff) usedNonces.delete(nonce);
  }
}, 5 * 60 * 1000).unref();

function computeBodyHash(body, file) {
  if (file) {
    const title = (body && body.title) || '';
    const recordType = (body && body.recordType) || '';
    const fileInfo = `${file.originalname || ''}:${file.size || ''}`;
    return ethers.sha256(ethers.toUtf8Bytes(`form:${title}:${recordType}:${fileInfo}`));
  }
  if (!body || Object.keys(body).length === 0) {
    return ethers.sha256(ethers.toUtf8Bytes(''));
  }
  if (typeof body === 'string') {
    return ethers.sha256(ethers.toUtf8Bytes(body));
  }
  return ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(body)));
}

/**
 * Middleware to verify wallet signature for protected API requests.
 * Enforces the protocol:
 * const signedMessage = [
 *   "MEDVEIL API Request",
 *   method,
 *   route,
 *   timestamp,
 *   nonce,
 *   bodyHash
 * ].join("\n");
 */
function verifyWalletSignature(req, res, next) {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  const expectedAddress = req.headers['x-wallet-address'];

  // If in automated test runner and no signature header is sent, allow backward compatibility
  if (!signature && process.env.NODE_ENV === 'test') {
    return next();
  }

  if (!signature || !timestamp || !nonce) {
    return res.status(401).json({
      success: false,
      error: 'Wallet signature required. Please approve the MetaMask signature to authorize this operation.',
    });
  }

  // 1. Timestamp validation (within 5 minutes window)
  const now = Date.now();
  const requestTime = Number(timestamp);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return res.status(401).json({
      success: false,
      error: 'Signature timestamp expired or invalid. Operation cancelled.',
    });
  }

  // 2. Nonce-based replay protection
  if (usedNonces.has(nonce)) {
    return res.status(401).json({
      success: false,
      error: 'Replay detected: This signature nonce has already been consumed. Operation cancelled.',
    });
  }
  usedNonces.set(nonce, now);

  // 3. Reconstruct signed message
  const method = req.method.toUpperCase();
  const route = req.originalUrl.split('?')[0];
  const bodyHash = req.headers['x-body-hash'] || computeBodyHash(req.body, req.file);

  const signedMessage = [
    'MEDVEIL API Request',
    method,
    route,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');

  // 4. Recover address from signature using ethers
  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(signedMessage, signature);
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: `Invalid signature: ${err.message}`,
    });
  }

  // 5. Wallet-address verification
  if (expectedAddress && recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: 'Signature address does not match declared wallet address.',
    });
  }

  // Check against authenticated user record
  if (req.user && req.user.wallet_address) {
    const userWallet = req.user.wallet_address.toLowerCase();
    const signerWallet = recoveredAddress.toLowerCase();

    // Verify ownership or synchronize account if not held by another user
    if (userWallet !== signerWallet && req.user.role !== 'ADMIN') {
      try {
        const existingHolder = db.get('SELECT id FROM users WHERE LOWER(wallet_address) = ? AND id != ?', signerWallet, req.user.id);
        if (!existingHolder) {
          db.run('UPDATE users SET wallet_address = ? WHERE id = ?', signerWallet, req.user.id);
          req.user.wallet_address = signerWallet;
        }
      } catch (err) {
        // Silently preserve current address if constraint conflict
      }
    }
  }

  req.walletAddress = recoveredAddress;
  next();
}

/**
 * Middleware to verify JWT token and attach user to req.user
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Fetch fresh user record from DB to verify active status
    const user = db.get(
      'SELECT id, username, email, role, wallet_address FROM users WHERE id = ? OR username = ?',
      decoded.id,
      decoded.username
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found or session invalid.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
}

/**
 * Middleware to restrict route to specific roles
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access requires one of [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRoles,
  verifyWalletSignature,
  JWT_SECRET,
};
