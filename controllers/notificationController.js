const Notification = require('../models/notificationModel');
const { responseReturn } = require('../utiles/response');
const { mongo: { ObjectId } } = require('mongoose');

const getAdminRecipientId = () => 'admin'; // Centralized Admin ID

class NotificationController {
    // Create a new notification
    create_notification = async (req, res) => {
        const recipientId = req.body.recipientId || (req.role === 'admin' ? getAdminRecipientId() : req.id);
        const { type, message, link } = req.body;

        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });
        if (!type || !message) return responseReturn(res, 400, { error: 'Type and message are required.' });

        try {
            const newNotification = new Notification({
                recipientId,
                type,
                message,
                link,
                status: 'unread',
            });
            await newNotification.save();

            // Emit unread count update
            if (req.io) {
                const newUnreadCount = await Notification.countDocuments({ recipientId, status: 'unread' });
                req.io.to(recipientId).emit('unread_count_update', { unreadCount: newUnreadCount });
                console.log(`[NotificationController] Emitted unread_count_update (${newUnreadCount}) to room ${recipientId}`);
            }

            console.log(`Created notification for ${recipientId}: ${message}`);
            responseReturn(res, 201, { message: 'Notification created', notification: newNotification });
        } catch (error) {
            console.error(`Error creating notification for ${recipientId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error creating notification.' });
        }
    };

    // Get notifications for the logged-in user
    get_notifications = async (req, res) => {
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });

        const page = parseInt(req.query.page) || 1;
        const parPage = parseInt(req.query.parPage) || 15;
        const statusFilter = req.query.status || 'all';
        const skip = (page - 1) * parPage;

        console.log(`Fetching notifications for: ${recipientId}, page: ${page}, status: ${statusFilter}`);

        try {
            let query = { recipientId: recipientId };
            if (statusFilter !== 'all' && ['read', 'unread'].includes(statusFilter)) {
                query.status = statusFilter;
            }

            const [notifications, totalCount] = await Promise.all([
                Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parPage).lean(),
                Notification.countDocuments(query)
            ]);

            console.log(`Found ${notifications.length} notifications for ${recipientId} (Total: ${totalCount})`);
            responseReturn(res, 200, { notifications, totalNotifications: totalCount, currentPage: page, totalPages: Math.ceil(totalCount / parPage) });
        } catch (error) {
            console.error(`Error fetching notifications for ${recipientId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error fetching notifications.' });
        }
    };

    // Get unread count
    get_unread_count = async (req, res) => {
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });

        try {
            const unreadCount = await Notification.countDocuments({ recipientId: recipientId, status: 'unread' });
            responseReturn(res, 200, { unreadCount });
        } catch (error) {
            console.error(`Error fetching unread count for ${recipientId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error fetching unread count.' });
        }
    };

    // Mark specific notification as read
    mark_as_read = async (req, res) => {
        const { notificationId } = req.params;
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });
        if (!notificationId || !ObjectId.isValid(notificationId)) return responseReturn(res, 400, { error: 'Invalid notification ID format.' });

        try {
            const updatedNotification = await Notification.findOneAndUpdate(
                { _id: new ObjectId(notificationId), recipientId: recipientId, status: 'unread' },
                { $set: { status: 'read' } },
                { new: true }
            ).lean();

            if (!updatedNotification) {
                const exists = await Notification.findById(notificationId).lean();
                if (!exists) return responseReturn(res, 404, { error: 'Notification not found.' });
                if (exists.recipientId !== recipientId) return responseReturn(res, 403, { error: 'Access denied.' });
                return responseReturn(res, 200, { message: 'Notification was already marked as read.', notification: exists });
            }

            // Emit unread count update
            if (req.io) {
                const newUnreadCount = await Notification.countDocuments({ recipientId: recipientId, status: 'unread' });
                req.io.to(recipientId).emit('unread_count_update', { unreadCount: newUnreadCount });
                console.log(`[NotificationController] Emitted unread_count_update (${newUnreadCount}) to room ${recipientId}`);
            }

            responseReturn(res, 200, { message: 'Notification marked as read.', notification: updatedNotification });
        } catch (error) {
            console.error(`Error marking notification ${notificationId} as read:`, error);
            responseReturn(res, 500, { error: 'Internal server error marking notification as read.' });
        }
    };

    // Mark all notifications as read
    mark_all_as_read = async (req, res) => {
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });

        try {
            const result = await Notification.updateMany({ recipientId: recipientId, status: 'unread' }, { $set: { status: 'read' } });

            // Emit unread count update
            if (req.io && result.modifiedCount > 0) {
                req.io.to(recipientId).emit('unread_count_update', { unreadCount: 0 });
                console.log(`[NotificationController] Emitted unread_count_update (0) to room ${recipientId}`);
            }

            console.log(`Marked ${result.modifiedCount} notifications as read for recipient ${recipientId}.`);
            responseReturn(res, 200, { message: `Marked ${result.modifiedCount} notifications as read.` });
        } catch (error) {
            console.error(`Error marking all notifications as read for ${recipientId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error marking all as read.' });
        }
    };

    // Delete a specific notification
    delete_notification = async (req, res) => {
        const { notificationId } = req.params;
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });
        if (!notificationId || !ObjectId.isValid(notificationId)) return responseReturn(res, 400, { error: 'Invalid notification ID format.' });

        try {
            const notification = await Notification.findById(notificationId);
            if (!notification || notification.recipientId !== recipientId) {
                return responseReturn(res, 404, { error: 'Notification not found or access denied.' });
            }

            const wasUnread = notification.status === 'unread';
            await Notification.deleteOne({ _id: new ObjectId(notificationId) });

            // Emit unread count update if notification was unread
            if (req.io && wasUnread) {
                const newUnreadCount = await Notification.countDocuments({ recipientId: recipientId, status: 'unread' });
                req.io.to(recipientId).emit('unread_count_update', { unreadCount: newUnreadCount });
                console.log(`[NotificationController] Emitted unread_count_update (${newUnreadCount}) to room ${recipientId}`);
            }

            console.log(`Deleted notification ${notificationId} for recipient ${recipientId}.`);
            responseReturn(res, 200, { message: 'Notification deleted successfully.' });
        } catch (error) {
            console.error(`Error deleting notification ${notificationId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error deleting notification.' });
        }
    };

    // Clear all notifications for a user
    clear_all_notifications = async (req, res) => {
        const recipientId = req.role === 'admin' ? getAdminRecipientId() : req.id;
        if (!recipientId) return responseReturn(res, 401, { error: 'Could not identify recipient.' });

        try {
            const result = await Notification.deleteMany({ recipientId: recipientId });

            // Emit unread count update
            if (req.io) {
                req.io.to(recipientId).emit('unread_count_update', { unreadCount: 0 });
                console.log(`[NotificationController] Emitted unread_count_update (0) to room ${recipientId}`);
            }

            console.log(`Cleared ${result.deletedCount} notifications for recipient ${recipientId}.`);
            responseReturn(res, 200, { message: `Cleared ${result.deletedCount} notifications.` });
        } catch (error) {
            console.error(`Error clearing all notifications for ${recipientId}:`, error);
            responseReturn(res, 500, { error: 'Internal server error clearing notifications.' });
        }
    };
}

module.exports = new NotificationController();