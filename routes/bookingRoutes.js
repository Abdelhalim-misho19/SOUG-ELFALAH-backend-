// src/routes/bookingRoutes.js
const router = require('express').Router();
const bookingController = require('../controllers/bookingController');
// const { authMiddleware } = require('../middlewares/authMiddleware'); // Add auth later if needed

// POST /api/bookings/create
// Make sure you adjust the frontend to send providerId
router.post('/create', /* authMiddleware, */ bookingController.create_booking);

// GET /api/bookings/customer/:userId - Get bookings for a specific customer
router.get('/customer/:userId', /* authMiddleware, */ bookingController.get_my_bookings);

// *** NEW ROUTE: GET /api/bookings/seller/:sellerId ***
// Get bookings for a specific seller (provider) with pagination/search
router.get('/seller/:sellerId', /* authMiddleware, */ bookingController.get_seller_bookings);

// GET /api/bookings/:bookingId - Get details for a single booking (used by both customer/seller)
router.get('/:bookingId', /* authMiddleware, */ bookingController.get_booking_details);

// *** NEW ROUTE: PUT /api/bookings/status/:bookingId ***
// Update the status of a specific booking (Accept/Refuse/etc.)
router.put('/status/:bookingId', /* authMiddleware, */ bookingController.update_booking_status);


module.exports = router;