const { getCryptoPrimitives, toFieldElement } = require('../services/eddsaService');

const TREE_DEPTH = 4;
const NUM_LEAVES = 2 ** TREE_DEPTH; // 16

/**
 * Builds a depth-4 Merkle Tree using Poseidon(2)
 */
class PoseidonMerkleTree {
  constructor(depth = TREE_DEPTH) {
    this.depth = depth;
    this.capacity = 2 ** depth;
    this.leaves = [];
    this.layers = [];
  }

  async init(leafValues = []) {
    const { poseidon } = await getCryptoPrimitives();
    this.poseidon = poseidon;

    // Pad leaves up to capacity with 0
    this.leaves = new Array(this.capacity).fill(0n);
    for (let i = 0; i < leafValues.length && i < this.capacity; i++) {
      this.leaves[i] = toFieldElement(leafValues[i]);
    }

    // Build layers
    this.layers = [this.leaves.slice()];
    let currentLayer = this.leaves.slice();

    for (let d = 0; d < this.depth; d++) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = currentLayer[i + 1] !== undefined ? currentLayer[i + 1] : 0n;
        const parentHash = poseidon([left, right]);
        nextLayer.push(BigInt(poseidon.F.toString(parentHash)));
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    this.root = this.layers[this.depth][0];
    return this.root;
  }

  getRootString() {
    return this.root.toString();
  }

  /**
   * Generates Merkle proof for leaf at index
   */
  getProof(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.capacity) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (0-${this.capacity - 1})`);
    }

    const pathElements = [];
    const pathIndices = [];

    let currentIndex = leafIndex;
    for (let d = 0; d < this.depth; d++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      const sibling = this.layers[d][siblingIndex] || 0n;

      pathElements.push(sibling.toString());
      pathIndices.push(isRight ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      root: this.getRootString(),
      leaf: this.leaves[leafIndex].toString(),
      pathElements,
      pathIndices,
    };
  }
}

/**
 * Creates hospital registry Merkle tree and leaf proof
 */
async function buildHospitalRegistryTree(hospitals) {
  const { poseidon } = await getCryptoPrimitives();

  const leafValues = [];
  for (const h of hospitals) {
    const hId = toFieldElement(h.hospitalId);
    const ax = toFieldElement(h.pubKeyAx);
    const ay = toFieldElement(h.pubKeyAy);
    const leafHash = poseidon([hId, ax, ay]);
    leafValues.push(BigInt(poseidon.F.toString(leafHash)));
  }

  const tree = new PoseidonMerkleTree(TREE_DEPTH);
  await tree.init(leafValues);
  return tree;
}

/**
 * Creates covered procedure Merkle tree and leaf proof
 */
async function buildCoveredProceduresTree(procedureCodes) {
  const { poseidon } = await getCryptoPrimitives();

  const leafValues = [];
  for (const code of procedureCodes) {
    const c = toFieldElement(code);
    const leafHash = poseidon([c]);
    leafValues.push(BigInt(poseidon.F.toString(leafHash)));
  }

  const tree = new PoseidonMerkleTree(TREE_DEPTH);
  await tree.init(leafValues);
  return tree;
}

module.exports = {
  PoseidonMerkleTree,
  buildHospitalRegistryTree,
  buildCoveredProceduresTree,
  TREE_DEPTH,
};
