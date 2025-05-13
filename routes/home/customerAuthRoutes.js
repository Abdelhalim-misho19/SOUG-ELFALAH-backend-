// routes/auth/customerAuthRouter.js
const customerAuthController = require('../../controllers/home/customerAuthController');
const router = require('express').Router();

// *** === IMPORT YOUR AUTH MIDDLEWARE HERE === ***
// Example: Replace with your actual middleware import
 const { authMiddleware } = require('../../middlewares/authMiddleware');
// *** ======================================== ***

// --- OTP Registration Flow ---
router.post('/customer/send-otp', customerAuthController.send_registration_otp);
router.post('/customer/verify-otp', customerAuthController.verify_otp_and_register);

// --- Standard Login/Logout ---
router.post('/customer/customer-login', customerAuthController.customer_login);
router.get('/customer/logout', customerAuthController.customer_logout); // Consider POST

// --- Password Reset Flow ---
router.post('/customer/forgot-password', customerAuthController.forgotPassword);
router.patch('/customer/reset-password/:token', customerAuthController.resetPassword);

// --- Change Password (NEW - PROTECTED) ---
router.patch(
    '/customer/change-password',
    // *** === APPLY YOUR AUTH MIDDLEWARE HERE === ***
    // Example: uncomment and use your actual middleware
     authMiddleware, // <-- This ensures only logged-in users can access
    // *** ======================================= ***
    customerAuthController.changePassword
);


module.exports = router;