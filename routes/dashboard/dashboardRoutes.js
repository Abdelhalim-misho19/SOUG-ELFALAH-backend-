const router = require('express').Router();
const { authMiddleware } = require('../../middlewares/authMiddleware'); // Verify this path
// Make sure the path to the controller is correct (e.g., 'dashboard' folder name)
const dashboardController = require('../../controllers/dasboard/dashboardController');

// === Admin Routes ===
router.get('/admin/get-dashboard-data', authMiddleware, dashboardController.get_admin_dashboard_data);

// === Seller Routes ===
router.get('/seller/get-dashboard-data', authMiddleware, dashboardController.get_seller_dashboard_data);
// Use the RENAMED controller method for this route
router.get('/seller/chart-data', authMiddleware, dashboardController.get_seller_chart_data);
// Remove the duplicate /seller/analytics-data route if it existed

// === Banner Routes (Seller related) ===
// These routes might require seller role checks within the controller or specific seller middleware
router.post('/banner/add', authMiddleware, dashboardController.add_banner);
router.get('/banner/get/:productId', authMiddleware, dashboardController.get_banner); // Added authMiddleware assuming only logged-in users see banners? Adjust if public.
router.put('/banner/update/:bannerId', authMiddleware, dashboardController.update_banner);
router.get('/banners', dashboardController.get_banners); // Assumed public route for homepage/etc.

// === Ad Banner Routes (Admin related) ===
// These routes require admin role checks, either via middleware or inside the controller
router.post('/admin/ad-banner/add', authMiddleware, dashboardController.add_ad_banner);
router.get('/admin/ad-banners', authMiddleware, dashboardController.get_admin_ad_banners);
router.put('/admin/ad-banner/update/:adBannerId', authMiddleware, dashboardController.update_ad_banner);
router.delete('/admin/ad-banner/delete/:adBannerId', authMiddleware, dashboardController.delete_ad_banner);
router.get('/ad-banners/active', dashboardController.get_active_ad_banners); // Assumed public route

module.exports = router;