const router = require('express').Router();
const locationController = require('../controllers/locationController'); // Correct path

router.get('/locations', locationController.getLocations);

module.exports = router;