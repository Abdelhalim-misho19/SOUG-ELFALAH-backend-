// models/customerModel.js
const { Schema, model } = require("mongoose");
const crypto = require('crypto'); // Import crypto

const customerSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,     // Ensure email is unique
        lowercase: true   // Store emails consistently
    },
    password: {
        type: String,
        // Required: true is removed - handled during OTP/reset
        select: false     // Keep password hidden by default
    },
    method: {
        type: String,
        required: true,
        enum: ['manually', 'google', 'facebook'] // Define allowed methods
    },
    // --- OTP Fields ---
    otp: {
        type: String,
        select: false, // Hide OTP by default
    },
    otpExpires: {
        type: Date,
        select: false, // Hide expiry by default
    },
    isVerified: {
        type: Boolean,
        default: false, // Start as not verified for manual registration
    },
    // --- Password Reset Fields (NEW) ---
    passwordResetToken: {
        type: String,
        select: false // Don't expose token hash by default
    },
    passwordResetTokenExpires: {
        type: Date,
        select: false // Don't expose expiry by default
    }
    // --- End Password Reset Fields ---
}, { timestamps: true });

module.exports = model('customers', customerSchema);