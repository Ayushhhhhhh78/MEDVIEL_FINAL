const crypto = require('crypto');
const fs = require('fs');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

// Master key from environment or fallback secure 32-byte key for local dev
const MASTER_KEY_HEX =
  process.env.AES_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, 'hex');

/**
 * Computes SHA-256 integrity hash of a buffer or string
 */
function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypts a plaintext buffer or string using AES-256-GCM.
 * Generates a unique 12-byte IV and an authentication tag.
 * 
 * Supports envelope encryption: can generate a dedicated document key
 * and wrap it with the recipient's or master key.
 */
function encryptDocument(dataBuffer, customKey = null) {
  const key = customKey || crypto.randomBytes(32);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Compute file integrity hashes
  const plaintextHash = computeFileHash(dataBuffer);
  const ciphertextHash = computeFileHash(encrypted);

  return {
    ciphertext: encrypted,
    ciphertextBase64: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    plaintextHash,
    ciphertextHash,
    documentKeyHex: key.toString('hex'),
  };
}

/**
 * Decrypts AES-256-GCM ciphertext given key, IV, and authTag.
 * Throws a clean error if tampering is detected or authentication fails.
 */
function decryptDocument(ciphertextBuffer, keyHex, ivHex, authTagHex) {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(),
    ]);

    return {
      success: true,
      decrypted,
      plaintextHash: computeFileHash(decrypted),
    };
  } catch (err) {
    return {
      success: false,
      error: 'Decryption failed: ciphertext may have been tampered with or key is invalid.',
      details: err.message,
    };
  }
}

/**
 * Envelope encryption: Wraps a document key using a doctor's or patient's key
 */
function wrapKey(documentKeyHex, wrappingKeyBuffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, wrappingKeyBuffer, iv);
  const docKeyBuf = Buffer.from(documentKeyHex, 'hex');
  const wrapped = Buffer.concat([cipher.update(docKeyBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    wrappedKey: wrapped.toString('hex'),
    wrapIv: iv.toString('hex'),
    wrapTag: tag.toString('hex'),
  };
}

/**
 * Envelope encryption: Unwraps a document key
 */
function unwrapKey(wrappedKeyHex, wrapIvHex, wrapTagHex, wrappingKeyBuffer) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    wrappingKeyBuffer,
    Buffer.from(wrapIvHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(wrapTagHex, 'hex'));
  const unwrapped = Buffer.concat([
    decipher.update(Buffer.from(wrappedKeyHex, 'hex')),
    decipher.final(),
  ]);
  return unwrapped.toString('hex');
}

module.exports = {
  MASTER_KEY,
  computeFileHash,
  encryptDocument,
  decryptDocument,
  wrapKey,
  unwrapKey,
};
