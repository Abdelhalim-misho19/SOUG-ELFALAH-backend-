const mongoose = require('mongoose');

const sellerWalletSchema = new mongoose.Schema(
    {
        sellerId: {
            type: String,
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            default: 0,
        },
        month: {
            type: Number,
            required: true,
        },
        year: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('SellerWallet', sellerWalletSchema);