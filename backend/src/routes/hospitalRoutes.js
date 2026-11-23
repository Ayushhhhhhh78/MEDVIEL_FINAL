const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', hospitalController.getAllHospitals);
router.get('/registry-config', hospitalController.getHospitalRegistryConfig);
router.get('/:id', hospitalController.getHospitalById);
router.get('/:id/verification', hospitalController.getHospitalVerification);
router.post('/register', authenticateToken, requireRoles('ADMIN', 'HOSPITAL'), hospitalController.registerHospital);

module.exports = router;
