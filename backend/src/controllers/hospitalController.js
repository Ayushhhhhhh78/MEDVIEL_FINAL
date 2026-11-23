const db = require('../database/db');
const { getContract } = require('../services/blockchainService');

async function getAllHospitals(req, res) {
  try {
    const hospitals = db.all(
      `SELECT id, name, license_number, pubkey_ax, pubkey_ay, evm_address, payout_address, is_active, created_at
       FROM hospitals WHERE is_active = 1`
    );
    res.json({ success: true, count: hospitals.length, hospitals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getHospitalById(req, res) {
  try {
    const { id } = req.params;
    const hospital = db.get(
      `SELECT id, name, license_number, pubkey_ax, pubkey_ay, evm_address, payout_address, is_active, created_at
       FROM hospitals WHERE id = ?`,
      id
    );
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }
    res.json({ success: true, hospital });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getHospitalVerification(req, res) {
  try {
    const { id } = req.params;
    const hospital = db.get('SELECT * FROM hospitals WHERE id = ?', id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    let onChainStatus = null;
    try {
      const hospitalContract = getContract('HospitalRegistry');
      const [isActive, payoutAddress, hId] = await hospitalContract.verifyHospitalAndGetPayout(
        hospital.pubkey_ax,
        hospital.pubkey_ay
      );
      onChainStatus = {
        registeredOnChain: Number(hId) > 0,
        isActiveOnChain: isActive,
        payoutAddress,
        contractHospitalId: Number(hId),
      };
    } catch (contractErr) {
      onChainStatus = {
        registeredOnChain: false,
        error: contractErr.message,
      };
    }

    res.json({
      success: true,
      hospital: {
        id: hospital.id,
        name: hospital.name,
        licenseNumber: hospital.license_number,
        pubKeyAx: hospital.pubkey_ax,
        pubKeyAy: hospital.pubkey_ay,
        evmAddress: hospital.evm_address,
        payoutAddress: hospital.payout_address,
      },
      verification: onChainStatus,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function registerHospital(req, res) {
  try {
    const { name, licenseNumber, pubKeyAx, pubKeyAy, evmAddress, payoutAddress } = req.body;
    if (!name || !licenseNumber || !pubKeyAx || !pubKeyAy || !evmAddress || !payoutAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required hospital fields',
      });
    }

    const resDb = db.run(
      `INSERT INTO hospitals (user_id, name, license_number, pubkey_ax, pubkey_ay, evm_address, payout_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      req.user.id,
      name,
      licenseNumber,
      pubKeyAx,
      pubKeyAy,
      evmAddress,
      payoutAddress
    );

    res.status(201).json({
      success: true,
      message: 'Hospital registered successfully',
      hospitalId: resDb.lastInsertRowid,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function getHospitalRegistryConfig(req, res) {
  try {
    const { getContractAddresses, getDeploymentConfig, getContract } = require('../services/blockchainService');
    const addresses = getContractAddresses();
    const config = getDeploymentConfig();
    let currentRoot = '0';
    try {
      const contract = getContract('HospitalRegistry');
      currentRoot = (await contract.hospitalMerkleRoot()).toString();
    } catch (e) {
      console.warn('Could not read hospitalMerkleRoot from contract:', e.message);
    }

    res.json({
      success: true,
      hospitalRegistryAddress: addresses.HospitalRegistry,
      chainId: config.chainId,
      network: config.network,
      currentRoot,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAllHospitals,
  getHospitalById,
  getHospitalVerification,
  getHospitalRegistryConfig,
  registerHospital,
};
