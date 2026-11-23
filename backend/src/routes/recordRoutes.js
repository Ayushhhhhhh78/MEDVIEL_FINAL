const express = require('express');
const router = express.Router();
const recordController = require('../controllers/recordController');
const { authenticateToken, requireRoles, verifyWalletSignature } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, recordController.getAllRecords);
router.get('/:id/download', authenticateToken, verifyWalletSignature, recordController.downloadRecord);
router.get('/:id/permissions', authenticateToken, recordController.getPermissions);
router.post('/upload', authenticateToken, requireRoles('PATIENT', 'HOSPITAL', 'ADMIN'), recordController.upload.single('file'), verifyWalletSignature, recordController.uploadRecord);
router.post('/:id/grant-access', authenticateToken, requireRoles('PATIENT', 'ADMIN'), verifyWalletSignature, recordController.grantAccess);
router.post('/:id/revoke-access', authenticateToken, requireRoles('PATIENT', 'ADMIN'), verifyWalletSignature, recordController.revokeAccess);

module.exports = router;
