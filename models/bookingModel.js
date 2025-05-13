// src/models/bookingModel.js
const { Schema, model } = require('mongoose');

const bookingSchema = new Schema({
    // --- User Information ---
    userId: { // ID of the customer making the booking
        type: Schema.Types.ObjectId,
        ref: 'customer', // Assuming your user model is named 'customer'
        required: true
    },
    userName: { // Name provided by user during booking
        type: String,
        required: true,
    },
    userPhone: { // Phone provided by user during booking
        type: String,
        required: true,
    },

    // --- Service Information ---
    serviceId: { // ID of the booked service
        type: Schema.Types.ObjectId,
        ref: 'services', // Link to your services collection
        required: true // Make this required
    },
    serviceName: {
        type: String,
        required: true,
    },
    servicePrice: {
        type: Number,
        required: true,
    },

    // --- Provider Information ---
    // *** ADD providerId ***
    providerId: { // ID of the seller providing the service
        type: Schema.Types.ObjectId,
        ref: 'sellers', // Link to your seller model (MAKE SURE THIS NAME IS CORRECT)
        required: true, // Essential for filtering bookings for a seller
        index: true // Add index for faster lookups
    },
    providerName: { // Store name at time of booking (optional but useful)
        type: String,
        required: true,
    },
    providerPhone: { // Provider's contact number stored at time of booking
        type: String,
        required: false,
    },

    // --- Booking Details ---
    date: { // Requested date
        type: String, // Or Date type
        required: true,
    },
    time: { // Requested time
        type: String,
        required: true,
    },
    notes: { // Optional notes from the user
        type: String,
        default: '',
    },
    status: { // Status of the booking request
        type: String,
        // 'Confirmed' means Accepted, 'Cancelled' means Refused
        enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'No Show'],
        default: 'Pending',
        required: true,
    },

}, { timestamps: true }); // Automatically add createdAt and updatedAt fields

module.exports = model('bookings', bookingSchema);