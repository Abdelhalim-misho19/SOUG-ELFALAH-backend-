// models/serviceCategoryModel.js
const { Schema, model } = require("mongoose");

const serviceCategorySchema = new Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Create a text index for search if needed
serviceCategorySchema.index({
    name: 'text'
});

module.exports = model('servicecategories', serviceCategorySchema);
