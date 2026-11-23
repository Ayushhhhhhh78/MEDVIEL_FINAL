const { buildEddsa, buildPoseidon } = require('circomlibjs');
const crypto = require('crypto');

// Singleton references
let eddsaInstance = null;
let poseidonInstance = null;

// BN254 Scalar Field (r) order
const SNARK_FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

/**
 * Initializes and returns the circomlibjs EdDSA and Poseidon instances.
 */
async function getCryptoPrimitives() {
  if (!eddsaInstance) {
    eddsaInstance = await buildEddsa();
  }
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return { eddsa: eddsaInstance, poseidon: poseidonInstance };
}

/**
 * Validates and converts an arbitrary input (number, string, BigInt)
 * into a safe BN254 scalar field element as a BigInt.
 */
function toFieldElement(val, fieldName = 'value') {
  let bi;
  if (typeof val === 'bigint') {
    bi = val;
  } else if (typeof val === 'number') {
    if (!Number.isSafeInteger(val)) {
      throw new Error(`Unsafe integer conversion for ${fieldName}: ${val}`);
    }
    bi = BigInt(val);
  } else if (typeof val === 'string') {
    const cleanStr = val.trim();
    if (cleanStr.startsWith('0x') || cleanStr.startsWith('0X')) {
      bi = BigInt(cleanStr);
    } else if (/^\d+$/.test(cleanStr)) {
      bi = BigInt(cleanStr);
    } else {
      // Hash arbitrary string to field element
      const hashHex = crypto.createHash('sha256').update(cleanStr).digest('hex');
      bi = BigInt('0x' + hashHex) % SNARK_FIELD_SIZE;
    }
  } else {
    throw new Error(`Unsupported type for field element conversion (${fieldName})`);
  }

  // Ensure positive and strictly within BN254 scalar field
  bi = ((bi % SNARK_FIELD_SIZE) + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE;
  return bi;
}

/**
 * Generates a fresh BabyJubJub keypair from an optional 32-byte seed.
 * If no seed is provided, a cryptographically secure random 32-byte seed is generated.
 */
async function generateKeys(optionalSeed = null) {
  const { eddsa } = await getCryptoPrimitives();

  let privKey;
  if (optionalSeed) {
    if (typeof optionalSeed === 'string') {
      privKey = Buffer.from(optionalSeed.replace(/^0x/, ''), 'hex');
    } else if (Buffer.isBuffer(optionalSeed)) {
      privKey = optionalSeed;
    } else {
      throw new Error('Invalid seed format');
    }
  } else {
    privKey = crypto.randomBytes(32);
  }

  const pubKey = eddsa.prv2pub(privKey);

  return {
    privateKeyHex: privKey.toString('hex'),
    publicKey: {
      x: eddsa.F.toString(pubKey[0]),
      y: eddsa.F.toString(pubKey[1]),
      raw: pubKey,
    },
  };
}

/**
 * Computes canonical Poseidon hash of all claim parameters:
 * Poseidon([claimId, policyId, hospitalId, claimAmount, treatmentDate, procedureCode])
 */
async function hashClaim({
  claimId,
  policyId,
  hospitalId,
  claimAmount,
  treatmentDate,
  procedureCode,
}) {
  const { poseidon } = await getCryptoPrimitives();

  const cId = toFieldElement(claimId, 'claimId');
  const pId = toFieldElement(policyId, 'policyId');
  const hId = toFieldElement(hospitalId, 'hospitalId');
  const amt = toFieldElement(claimAmount, 'claimAmount');
  const date = toFieldElement(treatmentDate, 'treatmentDate');
  const proc = toFieldElement(procedureCode, 'procedureCode');

  const rawHash = poseidon([cId, pId, hId, amt, date, proc]);
  const hashString = poseidon.F.toString(rawHash);

  return {
    raw: rawHash,
    hashString,
    inputs: [cId, pId, hId, amt, date, proc],
  };
}

/**
 * Signs a claim using the hospital's BabyJubJub private key.
 */
async function signClaim(privateKeyHex, claimData) {
  const { eddsa } = await getCryptoPrimitives();
  const privKey = Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex');

  const { raw: claimHash, hashString } = await hashClaim(claimData);
  const signature = eddsa.signPoseidon(privKey, claimHash);

  return {
    claimHash: hashString,
    signature: {
      R8x: eddsa.F.toString(signature.R8[0]),
      R8y: eddsa.F.toString(signature.R8[1]),
      S: signature.S.toString(),
      raw: signature,
    },
  };
}

/**
 * Verifies a claim signature independently using BabyJubJub EdDSA.
 */
async function verifyClaimSignature(claimData, signature, publicKey) {
  const { eddsa } = await getCryptoPrimitives();

  const { raw: claimHash } = await hashClaim(claimData);

  let rawPubKey;
  if (publicKey.raw) {
    rawPubKey = publicKey.raw;
  } else {
    rawPubKey = [
      eddsa.F.e(publicKey.x || publicKey[0]),
      eddsa.F.e(publicKey.y || publicKey[1]),
    ];
  }

  let rawSig;
  if (signature.raw) {
    rawSig = signature.raw;
  } else {
    rawSig = {
      R8: [
        eddsa.F.e(signature.R8x || signature.r8x),
        eddsa.F.e(signature.R8y || signature.r8y),
      ],
      S: BigInt(signature.S || signature.s),
    };
  }

  return eddsa.verifyPoseidon(claimHash, rawSig, rawPubKey);
}

/**
 * Computes Poseidon hash for Merkle tree or custom inputs.
 */
async function poseidonHash(inputs) {
  const { poseidon } = await getCryptoPrimitives();
  const fieldInputs = inputs.map((x, idx) => toFieldElement(x, `input_${idx}`));
  const rawHash = poseidon(fieldInputs);
  return {
    raw: rawHash,
    hashString: poseidon.F.toString(rawHash),
  };
}

module.exports = {
  getCryptoPrimitives,
  toFieldElement,
  generateKeys,
  hashClaim,
  signClaim,
  verifyClaimSignature,
  poseidonHash,
  SNARK_FIELD_SIZE,
};
