// models/adBannerModel.js
const { Schema, model } = require("mongoose");

const adBannerSchema = new Schema({
    title: {
        type: String,
        required: false
    },
    bannerImage: {
        type: String, // URL from Cloudinary
        required: true
    },
    link: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    // +++ Add Start and End Dates +++
    startDate: {
        type: Date,
        required: false // Optional start date
    },
    endDate: {
        type: Date,
        required: false // Optional end date
    }
}, { timestamps: true });

// Optional: Add an index for efficient querying of active banners
adBannerSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = model('adBanners', adBannerSchema);