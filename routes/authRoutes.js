// routes/authRoutes.js
const router = require('express').Router();
const authControllers = require('../controllers/authControllers');
const { authMiddleware } = require('../middlewares/authMiddleware');

// --- Standard Login/Info Routes ---
router.post('/admin-login', authControllers.admin_login);
router.post('/seller-login', authControllers.seller_login);
router.get('/get-user', authMiddleware, authControllers.getUser);
router.post('/profile-image-upload', authMiddleware, authControllers.profile_image_upload);
router.post('/profile-info-add', authMiddleware, authControllers.profile_info_add);
router.get('/logout', authMiddleware, authControllers.logout);
router.post('/change-password', authMiddleware, authControllers.change_password);

// --- Seller Registration with OTP ---
router.post('/request-seller-otp', authControllers.request_seller_otp);
router.post('/verify-seller-otp', authControllers.verify_seller_otp);

// --- Password Reset Routes ---
router.post('/request-password-reset', authControllers.requestPasswordReset); // Route to request reset email
router.post('/reset-password/:token', authControllers.resetPassword);       // Route to submit new password using token from URL

module.exports = router;