const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticateToken, authController.getMe);
router.get('/wallet-challenge', authController.getWalletChallenge);
router.post('/wallet-verify', authController.verifyWalletLogin);
router.post('/link-wallet', authenticateToken, authController.linkWallet);

module.exports = router;
