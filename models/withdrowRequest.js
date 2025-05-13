const { Schema, model } = require('mongoose');

const withdrowRequestSchema = new Schema({
    sellerId: {
        type: Schema.Types.ObjectId, // Store as ObjectId reference
        ref: 'sellers', // Reference to the sellers collection
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending'
    }
}, { timestamps: true });

module.exports = model('withdrowRequests', withdrowRequestSchema);