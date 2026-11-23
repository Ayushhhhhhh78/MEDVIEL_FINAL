const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', policyController.getAllPolicies);
router.get('/registry-config', policyController.getPolicyRegistryConfig);
router.post('/authorize-wallet', policyController.authorizeInsurerWallet);
router.post('/:id/publish', policyController.publishPolicyOnChain);
router.get('/:id', policyController.getPolicyById);
router.post('/', authenticateToken, requireRoles('INSURER', 'ADMIN'), policyController.createPolicy);

module.exports = router;
