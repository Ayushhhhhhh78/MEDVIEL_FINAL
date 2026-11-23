const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, claimController.getAllClaims);
router.get('/:id', authenticateToken, claimController.getClaimById);
router.get('/:id/status', authenticateToken, claimController.getClaimById);
router.get('/:id/calldata', authenticateToken, claimController.getClaimCalldata);
router.post('/', authenticateToken, requireRoles('HOSPITAL', 'ADMIN'), claimController.createClaim);
router.post('/:id/sign', authenticateToken, requireRoles('HOSPITAL', 'ADMIN'), claimController.signClaimHandler);
router.post('/:id/generate-proof', authenticateToken, requireRoles('HOSPITAL', 'ADMIN'), claimController.generateProofHandler);
router.post('/:id/verify-proof', authenticateToken, requireRoles('HOSPITAL', 'ADMIN'), claimController.verifyProofHandler);
router.post('/:id/submit', authenticateToken, requireRoles('HOSPITAL', 'ADMIN', 'INSURER'), claimController.submitClaimHandler);

module.exports = router;
