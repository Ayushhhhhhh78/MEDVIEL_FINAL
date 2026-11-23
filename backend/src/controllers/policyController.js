const db = require('../database/db');
const { randomUUID } = require('crypto');
const { buildCoveredProceduresTree } = require('../utils/merkleTree');
const { computePolicyCommitment } = require('../services/zkService');
const { checkPolicyActive, getDeploymentConfig, authorizeInsurerOnChain, getContract } = require('../services/blockchainService');

async function getAllPolicies(req, res) {
  try {
    const policies = db.all(`
      SELECT p.*, i.company_name as insurer_name
      FROM policies p
      JOIN insurers i ON p.insurer_id = i.id
      ORDER BY p.id DESC
    `);

    // Parse covered_procedures JSON & check on-chain status
    const formatted = await Promise.all(
      policies.map(async (p) => {
        let isOnChain = false;
        try {
          if (p.policy_commitment && !p.policy_commitment.startsWith('PENDING')) {
            isOnChain = await checkPolicyActive(p.policy_commitment);
          }
        } catch (_) {}
        return {
          ...p,
          covered_procedures: JSON.parse(p.covered_procedures || '[]'),
          isOnChainActive: isOnChain,
        };
      })
    );

    res.json({ success: true, count: formatted.length, policies: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getPolicyRegistryConfig(req, res) {
  try {
    const deployment = getDeploymentConfig();
    if (!deployment.policyRegistryAddress) {
      return res.status(503).json({ success: false, error: 'PolicyRegistry is not deployed' });
    }

    res.json({
      success: true,
      chainId: deployment.chainId,
      network: deployment.network,
      policyRegistryAddress: deployment.policyRegistryAddress,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getPolicyById(req, res) {
  try {
    const { id } = req.params;
    const policy = db.get(
      `SELECT p.*, i.company_name as insurer_name
       FROM policies p
       JOIN insurers i ON p.insurer_id = i.id
       WHERE p.id = ?`,
      id
    );
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const isOnChain = await checkPolicyActive(policy.policy_commitment);

    res.json({
      success: true,
      policy: {
        ...policy,
        covered_procedures: JSON.parse(policy.covered_procedures || '[]'),
        isOnChainActive: isOnChain,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function createPolicy(req, res) {
  try {
    const { policyNumber, policyLimit, expiryDate, coveredProcedures } = req.body;
    if (!policyNumber || !policyLimit || !expiryDate || !Array.isArray(coveredProcedures)) {
      return res.status(400).json({
        success: false,
        error: 'policyNumber, policyLimit, expiryDate, and coveredProcedures array are required',
      });
    }

    // Get insurer record for current user
    const insurer = db.get('SELECT id FROM insurers WHERE user_id = ?', req.user.id);
    if (!insurer && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Insurer profile not found for user' });
    }
    const insurerId = insurer ? insurer.id : 1;

    // 1. Build Merkle tree for covered procedures
    const procTree = await buildCoveredProceduresTree(coveredProcedures);
    const coverageRoot = procTree.getRootString();

    db.db.exec('BEGIN IMMEDIATE');
    let resDb;
    let commitment;
    try {
      resDb = db.run(
        `INSERT INTO policies (policy_number, insurer_id, policy_limit, expiry_date, coverage_root, policy_commitment, covered_procedures)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        policyNumber,
        insurerId,
        policyLimit,
        expiryDate,
        coverageRoot,
        `PENDING-${randomUUID()}`,
        JSON.stringify(coveredProcedures)
      );

      const policyId = Number(resDb.lastInsertRowid);
      commitment = await computePolicyCommitment(policyId, policyLimit, expiryDate, coverageRoot);
      db.run('UPDATE policies SET policy_commitment = ? WHERE id = ?', commitment, policyId);
      db.db.exec('COMMIT');
    } catch (err) {
      db.db.exec('ROLLBACK');
      throw err;
    }

    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      policy: {
        id: Number(resDb.lastInsertRowid),
        policyNumber,
        policyLimit,
        expiryDate,
        coverageRoot,
        policyCommitment: commitment,
        coveredProcedures,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function authorizeInsurerWallet(req, res) {
  try {
    const { address } = req.body;
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return res.status(400).json({ success: false, error: 'A valid EVM wallet address is required' });
    }

    const result = await authorizeInsurerOnChain(address);
    res.json({
      success: true,
      message: `Wallet ${address} successfully authorized on-chain in PolicyRegistry!`,
      txHash: result.txHash,
      authorizedAddress: result.authorizedAddress,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function publishPolicyOnChain(req, res) {
  try {
    const { id } = req.params;
    const policy = db.get('SELECT * FROM policies WHERE id = ?', id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const contract = getContract('PolicyRegistry');

    // Check if already active or registered on-chain
    const isAlreadyActive = await contract.isPolicyActive(policy.policy_commitment);
    const existingCommitment = await contract.policyIdToCommitment(policy.id);

    if (isAlreadyActive || (existingCommitment !== 0n && existingCommitment.toString() === policy.policy_commitment)) {
      db.run('UPDATE policies SET is_active = 1 WHERE id = ?', policy.id);
      return res.json({
        success: true,
        alreadyRegistered: true,
        message: `Policy #${policy.policy_number} is already registered and active on-chain!`,
        policyId: policy.id,
      });
    }

    // Check if this policy commitment was already registered under any policy ID
    const existingPolicyForCommitment = await contract.policiesByCommitment(policy.policy_commitment);
    if (existingPolicyForCommitment && existingPolicyForCommitment.policyCommitment !== 0n) {
      db.run('UPDATE policies SET is_active = 1 WHERE id = ?', policy.id);
      return res.json({
        success: true,
        alreadyRegistered: true,
        message: `Policy commitment for #${policy.policy_number} is already registered on-chain!`,
        policyId: policy.id,
      });
    }

    const tx = await contract.registerPolicy(
      policy.id,
      policy.policy_commitment,
      policy.coverage_root
    );
    const receipt = await tx.wait(1);

    db.run('UPDATE policies SET is_active = 1 WHERE id = ?', policy.id);

    res.json({
      success: true,
      message: `Policy #${policy.policy_number} successfully registered on-chain!`,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      policyId: policy.id,
    });
  } catch (err) {
    const errorMsg = err.reason || err.shortMessage || err.message || '';
    if (
      errorMsg.includes('Policy commitment already registered') ||
      errorMsg.includes('Policy ID already registered')
    ) {
      db.run('UPDATE policies SET is_active = 1 WHERE id = ?', req.params.id);
      return res.json({
        success: true,
        alreadyRegistered: true,
        message: `Policy is already registered and active on-chain!`,
        policyId: Number(req.params.id),
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAllPolicies,
  getPolicyRegistryConfig,
  getPolicyById,
  createPolicy,
  authorizeInsurerWallet,
  publishPolicyOnChain,
};
