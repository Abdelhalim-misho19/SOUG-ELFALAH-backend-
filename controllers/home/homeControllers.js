const categoryModel = require('../../models/categoryModel');
const productModel = require('../../models/productModel');
const serviceModel = require('../../models/serviceModel');
const serviceCategoryModel = require('../../models/serviceCategoryModel');
const reviewModel = require('../../models/reviewModel');
const { responseReturn } = require('../../utiles/response');
const queryProducts = require('../../utiles/queryProducts');
const moment = require('moment');
const { mongo: { ObjectId } } = require('mongoose');

class homeControllers {
    formateProduct = (items) => {
        const itemArray = [];
        let i = 0;
        while (i < items.length) {
            let temp = [];
            let j = i;
            while (j < i + 3) {
                if (items[j]) {
                    temp.push(items[j]);
                }
                j++;
            }
            itemArray.push([...temp]);
            i = j;
        }
        return itemArray;
    };

    service_details = async (req, res) => {
        const { slug } = req.params;
        try {
            const service = await serviceModel.findOne({ slug });
            if (!service) {
                return responseReturn(res, 404, { message: "Service not found" });
            }

            const relatedServices = await serviceModel.find({
                $and: [
                    { _id: { $ne: service._id } },
                    { category: { $eq: service.category } }
                ]
            }).limit(12);

            const moreServices = await serviceModel.find({
                $and: [
                    { _id: { $ne: service._id } },
                    { sellerId: { $eq: service.sellerId } }
                ]
            }).limit(3);

            responseReturn(res, 200, { service, relatedServices, moreServices });
        } catch (error) {
            console.log(error.message);
            responseReturn(res, 500, { message: "Server error" });
        }
    };

    get_categorys = async (req, res) => {
        try {
            const categorys = await categoryModel.find({});
            responseReturn(res, 200, { categorys });
        } catch (error) {
            console.log(error.message);
        }
    };

    get_service_categories = async (req, res) => {
        try {
            const serviceCategories = await serviceCategoryModel.find({});
            responseReturn(res, 200, { serviceCategories });
        } catch (error) {
            console.log(error.message);
        }
    };

    get_products = async (req, res) => {
        try {
            const products = await productModel.find({}).limit(12).sort({ createdAt: -1 });
            const allProduct1 = await productModel.find({}).limit(9).sort({ createdAt: -1 });
            const latest_product = this.formateProduct(allProduct1);
            const allProduct2 = await productModel.find({}).limit(9).sort({ rating: -1 });
            const topRated_product = this.formateProduct(allProduct2);
            const allProduct3 = await productModel.find({}).limit(9).sort({ discount: -1 });
            const discount_product = this.formateProduct(allProduct3);

            responseReturn(res, 200, {
                products,
                latest_product,
                topRated_product,
                discount_product
            });
        } catch (error) {
            console.log(error.message);
        }
    };

    price_range_product = async (req, res) => {
        try {
            const priceRange = { low: 0, high: 0 };
            const products = await productModel.find({}).limit(9).sort({ createdAt: -1 });
            const latest_product = this.formateProduct(products);
            const getForPrice = await productModel.find({}).sort({ price: 1 });
            if (getForPrice.length > 0) {
                priceRange.high = getForPrice[getForPrice.length - 1].price;
                priceRange.low = getForPrice[0].price;
            }
            responseReturn(res, 200, { latest_product, priceRange });
        } catch (error) {
            console.log(error.message);
        }
    };

    query_products = async (req, res) => {
        const parPage = 12;
        req.query.parPage = parPage;

        try {
            const products = await productModel.find({}).sort({ createdAt: -1 });
            const totalProduct = new queryProducts(products, req.query)
                .categoryQuery()
                .ratingQuery()
                .searchQuery()
                .priceQuery()
                .sortByPrice()
                .countProducts();
            const result = new queryProducts(products, req.query)
                .categoryQuery()
                .ratingQuery()
                .priceQuery()
                .searchQuery()
                .sortByPrice()
                .skip()
                .limit()
                .getProducts();

            responseReturn(res, 200, { products: result, totalProduct, parPage });
        } catch (error) {
            console.log(error.message);
        }
    };

    product_details = async (req, res) => {
        const { slug } = req.params;
        try {
            const product = await productModel.findOne({ slug });
            const relatedProducts = await productModel.find({
                $and: [
                    { _id: { $ne: product._id } },
                    { category: { $eq: product.category } }
                ]
            }).limit(12);
            const moreProducts = await productModel.find({
                $and: [
                    { _id: { $ne: product._id } },
                    { sellerId: { $eq: product.sellerId } }
                ]
            }).limit(3);
            responseReturn(res, 200, { product, relatedProducts, moreProducts });
        } catch (error) {
            console.log(error.message);
        }
    };

    submit_review = async (req, res) => {
        const { productId, rating, review, name } = req.body;
        try {
            await reviewModel.create({
                productId,
                name,
                rating,
                review,
                date: moment(Date.now()).format('LLL') // Updated to include time
            });

            let rat = 0;
            const reviews = await reviewModel.find({ productId });
            for (let i = 0; i < reviews.length; i++) {
                rat += reviews[i].rating;
            }
            let itemRating = reviews.length !== 0 ? (rat / reviews.length).toFixed(1) : 0;

            let updatedItem = await productModel.findByIdAndUpdate(productId, { rating: itemRating }, { new: true });
            if (!updatedItem) {
                updatedItem = await serviceModel.findByIdAndUpdate(productId, { rating: itemRating }, { new: true });
                if (!updatedItem) {
                    throw new Error('Item not found as either product or service');
                }
            }

            responseReturn(res, 201, { message: "Review Added Successfully" });
        } catch (error) {
            console.log(error.message);
            responseReturn(res, 500, { message: "Failed to submit review" });
        }
    };

    get_reviews = async (req, res) => {
        const { productId } = req.params;
        let { pageNo } = req.query;
        pageNo = parseInt(pageNo);
        const limit = 5;
        const skipPage = limit * (pageNo - 1);

        try {
            let getRating = await reviewModel.aggregate([
                { $match: { productId: { $eq: new ObjectId(productId) }, rating: { $not: { $size: 0 } } } },
                { $unwind: "$rating" },
                { $group: { _id: "$rating", count: { $sum: 1 } } }
            ]);
            let rating_review = [
                { rating: 5, sum: 0 }, { rating: 4, sum: 0 }, { rating: 3, sum: 0 },
                { rating: 2, sum: 0 }, { rating: 1, sum: 0 }
            ];
            for (let i = 0; i < rating_review.length; i++) {
                for (let j = 0; j < getRating.length; j++) {
                    if (rating_review[i].rating === getRating[j]._id) {
                        rating_review[i].sum = getRating[j].count;
                        break;
                    }
                }
            }

            const getAll = await reviewModel.find({ productId });
            const reviews = await reviewModel.find({ productId })
                .skip(skipPage)
                .limit(limit)
                .sort({ createdAt: -1 });

            responseReturn(res, 200, { reviews, totalReview: getAll.length, rating_review });
        } catch (error) {
            console.log(error.message);
        }
    };

    delete_review = async (req, res) => {
        const { reviewId, productId } = req.body;

        try {
            const review = await reviewModel.findById(reviewId);
            if (!review) {
                return responseReturn(res, 404, { message: "Review not found" });
            }

            await reviewModel.findByIdAndDelete(reviewId);

            // Recalculate rating
            let rat = 0;
            const reviews = await reviewModel.find({ productId });
            for (let i = 0; i < reviews.length; i++) {
                rat += reviews[i].rating;
            }
            let itemRating = reviews.length !== 0 ? (rat / reviews.length).toFixed(1) : 0;

            let updatedItem = await productModel.findByIdAndUpdate(productId, { rating: itemRating }, { new: true });
            if (!updatedItem) {
                updatedItem = await serviceModel.findByIdAndUpdate(productId, { rating: itemRating }, { new: true });
                if (!updatedItem) {
                    throw new Error('Item not found as either product or service');
                }
            }

            responseReturn(res, 200, { message: "Review Deleted Successfully" });
        } catch (error) {
            console.log(error.message);
            responseReturn(res, 500, { message: "Failed to delete review" });
        }
    };

    price_range_service = async (req, res) => {
        try {
            const priceRange = { low: 0, high: 0 };
            const services = await serviceModel.find({}).limit(9).sort({ createdAt: -1 });
            const latest_service = this.formateProduct(services);
            const getForPrice = await serviceModel.find({}).sort({ price: 1 });
            if (getForPrice.length > 0) {
                priceRange.high = getForPrice[getForPrice.length - 1].price;
                priceRange.low = getForPrice[0].price;
            }
            responseReturn(res, 200, { latest_service, priceRange });
        } catch (error) {
            console.log(error.message);
        }
    };

    query_services = async (req, res) => {
        const parPage = 12;
        req.query.parPage = parPage;

        try {
            const services = await serviceModel.find({}).sort({ createdAt: -1 });
            const totalService = new queryProducts(services, req.query)
                .categoryQuery()
                .ratingQuery()
                .priceQuery()
                .sortByPrice()
                .countProducts();
            const result = new queryProducts(services, req.query)
                .categoryQuery()
                .ratingQuery()
                .priceQuery()
                .sortByPrice()
                .skip()
                .limit()
                .getProducts();

            responseReturn(res, 200, { services: result, totalService, parPage });
        } catch (error) {
            console.log(error.message);
        }
    };

    get_banners = async (req, res) => {
        try {
            responseReturn(res, 200, { banners: [] });
        } catch (error) {
            console.log(error.message);
        }
    };
}

module.exports = new homeControllers();