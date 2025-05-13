const router = require('express').Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Create a new notification
router.post('/notifications', notificationController.create_notification);

// Fetch notifications for the logged-in user
router.get('/notifications', notificationController.get_notifications);

// Get the count of unread notifications
router.get('/notifications/unread-count', notificationController.get_unread_count);

// Mark a specific notification as read
router.patch('/notifications/:notificationId/read', notificationController.mark_as_read);

// Mark all notifications as read
router.patch('/notifications/read-all', notificationController.mark_all_as_read);

// Delete ALL notifications for the user
router.delete('/notifications/clear-all', notificationController.clear_all_notifications);

// Delete a specific notification
router.delete('/notifications/:notificationId', notificationController.delete_notification);

module.exports = router;