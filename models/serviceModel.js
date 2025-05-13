const { Schema, model } = require("mongoose");

const serviceSchema = new Schema({
    sellerId: { type: Schema.ObjectId, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    phoneNumber: { type: String, required: true },
    province: { type: String, required: true },
    municipality: { type: String, required: true },
    description: { type: String, required: true },
    shopName: { type: String, required: true },
    images: { type: Array, required: true },
    rating: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = model('services', serviceSchema);