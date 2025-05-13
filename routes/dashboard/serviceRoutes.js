const serviceController = require('../../controllers/dasboard/serviceController');
const { authMiddleware } = require('../../middlewares/authMiddleware');
const router = require('express').Router();

// Existing routes
router.post('/service-add', authMiddleware, serviceController.add_service);
router.get('/services-get', authMiddleware, serviceController.services_get);

// +++ New Routes +++
router.get('/service-get/:serviceId', authMiddleware, serviceController.get_service); // Get single for edit
router.put('/service-update/:serviceId', authMiddleware, serviceController.update_service); // Update (using PUT)
router.delete('/service-delete/:serviceId', authMiddleware, serviceController.delete_service); // Delete

module.exports = router;