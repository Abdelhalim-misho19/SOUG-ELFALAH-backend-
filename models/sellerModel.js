// models/sellerModel.js
const { Schema, model } = require("mongoose");

const sellerSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Seller name is required.']
    },
    email: {
        type: String,
        required: [true, 'Seller email is required.'],
        unique: true, // Ensures email addresses are unique
        lowercase: true,
        match: [ // Basic email format validation
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            'Please provide a valid email address.'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
        minlength: [8, 'Password must be at least 8 characters long.'],
        select: false // Hide password field by default when querying
    },
    role: {
        type: String,
        default: 'seller'
    },
    status: {
        type: String,
        enum: {
            values: ['pending', 'active', 'deactive', 'unverified'],
            message: 'Invalid status value: {VALUE}. Allowed values are pending, active, deactive, unverified.'
        },
        default: 'unverified' // New sellers start as unverified
    },
    payment: {
        type: String,
        default: 'inactive' // Example payment status field
    },
    method: {
        type: String,
        required: true // e.g., 'manual', 'google', 'facebook'
    },
    image: {
        type: String,
        default: '' // URL to profile image
    },
    shopInfo: {
        shopName: { type: String, default: '' },
        division: { type: String, default: '' },
        district: { type: String, default: '' },
        sub_district: { type: String, default: '' },
        eccp: { type: String, default: '' } // Example extra field
    },

    // --- Fields for OTP Verification ---
    otp: {
        type: String,
        select: false // Do not return OTP in normal queries
    },
    otpExpires: {
        type: Date,
        select: false // Do not return OTP expiry in normal queries
    },

    // --- Fields for Password Reset ---
    passwordResetToken: {
        type: String,
        select: false // Do not return reset token in normal queries
    },
    passwordResetExpires: {
        type: Date,
        select: false // Do not return reset expiry in normal queries
    }

}, { timestamps: true }); // Adds createdAt and updatedAt timestamps

// Text index for searching sellers (optional)
sellerSchema.index({
    name: 'text',
    email: 'text',
}, {
    weights: {
        name: 5,
        email: 4,
    }
});

// --- Optional: Method to check if password changed after token was issued ---
// (Useful if you want to invalidate tokens if password changes, more complex)
// sellerSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
//   if (this.passwordChangedAt) {
//     const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
//     return JWTTimestamp < changedTimestamp;
//   }
//   // False means NOT changed
//   return false;
// };

module.exports = model('sellers', sellerSchema); // Model name 'sellers'