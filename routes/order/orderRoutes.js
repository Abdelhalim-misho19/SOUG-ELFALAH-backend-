// routes/order/orderRoutes.js

const orderController = require('../../controllers/order/orderController'); // <--- CORRECTED PATH
// If the above path *still* gives an error, double-check your exact folder names and locations.
// Is it perhaps just '../controllers/order/orderController' if 'routes' and 'controllers' are direct siblings?

const router = require('express').Router();
const { authMiddleware } = require('../../middlewares/authMiddleware'); // Make sure this path is also correct

// --- Customer Routes ---
router.post('/home/order/place-order', orderController.place_order);
router.get('/home/coustomer/get-dashboard-data/:userId', orderController.get_customer_dashboard_data);
router.get('/home/coustomer/get-orders/:customerId/:status', orderController.get_orders);
router.get('/home/coustomer/get-order-details/:orderId', orderController.get_order_details);

// --- Payment/Confirmation Routes ---
router.post('/order/create-payment', orderController.create_payment); // Handler should now be found
router.get('/order/confirm/:orderId', orderController.order_confirm);

// --- Admin Routes ---
// Added authMiddleware for potentially protected admin routes
router.get('/admin/orders', authMiddleware, orderController.get_admin_orders);
router.get('/admin/order/:orderId', authMiddleware, orderController.get_admin_order);
router.put('/admin/order-status/update/:orderId', authMiddleware, orderController.admin_order_status_update);

// --- Seller Routes ---
// Added authMiddleware for potentially protected seller routes
router.get('/seller/orders/:sellerId', authMiddleware, orderController.get_seller_orders);
router.get('/seller/order/:orderId', authMiddleware, orderController.get_seller_order);
router.put('/seller/order-status/update/:orderId', authMiddleware, orderController.seller_order_status_update);

module.exports = router;