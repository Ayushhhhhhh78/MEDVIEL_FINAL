const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'encrypted');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Computes deterministic IPFS-compatible mock CIDv0 (Qm...) using SHA-256 of the content
 */
function generateMockCid(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  // IPFS multihash prefix for SHA256: 0x12 (sha256), 0x20 (32 bytes)
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), hash]);
  // Base58-btc encoding simulation
  const bs58 = (buf) => {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + buf.toString('hex'));
    let str = '';
    while (num > 0n) {
      str = ALPHABET[Number(num % 58n)] + str;
      num = num / 58n;
    }
    return str;
  };
  return 'Qm' + bs58(multihash).slice(0, 44);
}

/**
 * Saves encrypted file to off-chain storage (local adapter or IPFS)
 */
async function saveEncryptedRecord(encryptedBuffer, originalName = 'record.enc') {
  const fileHash = crypto.createHash('sha256').update(encryptedBuffer).digest('hex');
  const cid = generateMockCid(encryptedBuffer);

  const fileName = `${cid}_${Date.now()}.enc`;
  const filePath = path.join(STORAGE_DIR, fileName);

  fs.writeFileSync(filePath, encryptedBuffer);

  return {
    cid,
    storagePath: filePath,
    fileHash,
    fileSize: encryptedBuffer.length,
    storageProvider: 'LOCAL_ENCRYPTED_ADAPTER',
  };
}

/**
 * Reads encrypted record buffer by storage path or CID
 */
function readEncryptedRecord(storagePath, cid = null) {
  if (storagePath && fs.existsSync(storagePath)) {
    return fs.readFileSync(storagePath);
  }

  // Lookup in storage dir by CID prefix
  if (cid) {
    const files = fs.readdirSync(STORAGE_DIR);
    const match = files.find((f) => f.startsWith(cid));
    if (match) {
      return fs.readFileSync(path.join(STORAGE_DIR, match));
    }
  }

  throw new Error('Encrypted medical record not found in storage');
}

module.exports = {
  saveEncryptedRecord,
  readEncryptedRecord,
  STORAGE_DIR,
};
