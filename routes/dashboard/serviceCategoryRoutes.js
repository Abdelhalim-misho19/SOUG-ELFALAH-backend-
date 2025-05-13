// routes/dashboard/serviceCategoryRoutes.js
const express = require('express');
const router = express.Router();
const serviceCategoryController = require('../../controllers/dasboard/serviceCategoryController');
const { authMiddleware } = require('../../middlewares/authMiddleware');

router.post('/service-category-add', authMiddleware, serviceCategoryController.add_serviceCategory);
router.get('/service-category-get', authMiddleware, serviceCategoryController.get_serviceCategory);
router.put('/service-category-update/:id', authMiddleware, serviceCategoryController.update_serviceCategory);
router.delete('/service-category/:id', serviceCategoryController.delete_serviceCategory);

module.exports = router;
