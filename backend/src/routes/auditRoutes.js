const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, auditController.getAuditLogs);
router.get('/claims/:id', authenticateToken, auditController.getClaimAuditLogs);

module.exports = router;
