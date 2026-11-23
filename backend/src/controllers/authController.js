const authService = require('../services/authService');
const db = require('../database/db');

async function register(req, res) {
  try {
    const { username, email, password, role, walletAddress, profileDetails } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'username, email, password, and role are required',
      });
    }

    const validRoles = ['PATIENT', 'HOSPITAL', 'INSURER', 'DOCTOR', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Role must be one of: ${validRoles.join(', ')}`,
      });
    }

    const result = await authService.registerUser({
      username,
      email,
      password,
      role,
      walletAddress,
      profileDetails,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function login(req, res) {
  try {
    const identifier = req.body.identifier || req.body.username || req.body.email;
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Identifier (username/email) and password are required',
      });
    }

    const result = await authService.loginUser(identifier, password);
    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
}

async function getMe(req, res) {
  try {
    const user = req.user;
    let profile = null;

    if (user.role === 'PATIENT') {
      profile = db.get('SELECT * FROM patients WHERE user_id = ?', user.id);
    } else if (user.role === 'HOSPITAL') {
      profile = db.get('SELECT * FROM hospitals WHERE user_id = ?', user.id);
    } else if (user.role === 'INSURER') {
      profile = db.get('SELECT * FROM insurers WHERE user_id = ?', user.id);
    } else if (user.role === 'DOCTOR') {
      profile = db.get('SELECT * FROM doctors WHERE user_id = ?', user.id);
    }

    res.json({
      success: true,
      user,
      profile,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getWalletChallenge(req, res) {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    const challenge = authService.getWalletChallenge(address);
    res.json({ success: true, ...challenge });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function verifyWalletLogin(req, res) {
  try {
    const { address, signature, message } = req.body;
    if (!address || !signature || !message) {
      return res.status(400).json({
        success: false,
        error: 'address, signature, and message are required',
      });
    }

    const result = await authService.verifyWalletLogin(address, signature, message);
    res.json({
      success: true,
      message: 'Wallet authentication successful',
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
}

async function linkWallet(req, res) {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
      return res.status(400).json({ success: false, error: 'A valid EVM wallet address is required' });
    }
    const updatedUser = await authService.linkWallet(req.user.id, walletAddress);
    res.json({
      success: true,
      message: `Wallet ${walletAddress} successfully linked to your account!`,
      user: updatedUser,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

function logout(req, res) {
  res.json({ success: true, message: 'Logged out successfully' });
}

module.exports = {
  register,
  login,
  getMe,
  getWalletChallenge,
  verifyWalletLogin,
  linkWallet,
  logout,
};
