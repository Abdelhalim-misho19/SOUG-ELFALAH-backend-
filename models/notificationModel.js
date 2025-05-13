const { Schema, model } = require('mongoose');

const notificationSchema = new Schema({
    recipientId: {
        type: String,
        required: [true, "Recipient ID is required."],
        index: true,
    },
    type: {
        type: String,
        required: [true, "Notification type is required."],
        enum: {
            values: ['order', 'message', 'seller_request', 'general', 'withdrawal','booking'],
            message: '{VALUE} is not a supported notification type.'
        },
    },
    message: {
        type: String,
        required: [true, "Notification message is required."],
        trim: true,
    },
    link: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['read', 'unread'],
        default: 'unread',
        index: true,
    },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

module.exports = model('notifications', notificationSchema);