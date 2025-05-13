// controllers/dashboard/serviceCategoryController.js
const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response");
const cloudinary = require('cloudinary').v2;
const serviceCategoryModel = require('../../models/serviceCategoryModel');

class ServiceCategoryController {

    add_serviceCategory = async (req, res) => {
        const form = formidable();
        form.parse(req, async (err, fields, files) => {
            if (err) {
                return responseReturn(res, 404, { error: 'Something went wrong' });
            }
            let { name } = fields;
            let { image } = files;
            name = name.trim();
            const slug = name.split(' ').join('-');

            cloudinary.config({
                cloud_name: process.env.cloud_name,
                api_key: process.env.api_key,
                api_secret: process.env.api_secret,
                secure: true
            });

            try {
                const result = await cloudinary.uploader.upload(image.filepath, { folder: 'serviceCategories' });
                if (result) {
                    const serviceCategory = await serviceCategoryModel.create({
                        name,
                        slug,
                        image: result.url
                    });
                    return responseReturn(res, 201, { serviceCategory, message: 'Service Category Added Successfully' });
                } else {
                    return responseReturn(res, 404, { error: 'Image Upload Failed' });
                }
            } catch (error) {
                return responseReturn(res, 500, { error: 'Internal Server Error' });
            }
        });
    };

    get_serviceCategory = async (req, res) => {
        const { page, searchValue, parPage } = req.query;
        try {
            let skipPage = '';
            if (parPage && page) {
                skipPage = parseInt(parPage) * (parseInt(page) - 1);
            }
            let serviceCategories, totalServiceCategory;
            if (searchValue && page && parPage) {
                serviceCategories = await serviceCategoryModel.find({
                    $text: { $search: searchValue }
                }).skip(skipPage).limit(parseInt(parPage)).sort({ createdAt: -1 });
                totalServiceCategory = await serviceCategoryModel.find({
                    $text: { $search: searchValue }
                }).countDocuments();
            } else if (searchValue === '' && page && parPage) {
                serviceCategories = await serviceCategoryModel.find({}).skip(skipPage).limit(parseInt(parPage)).sort({ createdAt: -1 });
                totalServiceCategory = await serviceCategoryModel.find({}).countDocuments();
            } else {
                serviceCategories = await serviceCategoryModel.find({}).sort({ createdAt: -1 });
                totalServiceCategory = await serviceCategoryModel.find({}).countDocuments();
            }
            responseReturn(res, 200, { serviceCategories, totalServiceCategory });
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };

    update_serviceCategory = async (req, res) => {
        const form = formidable();
        form.parse(req, async (err, fields, files) => {
            if (err) {
                return responseReturn(res, 404, { error: 'Something went wrong' });
            }
            let { name } = fields;
            let { image } = files;
            const { id } = req.params;
            name = name.trim();
            const slug = name.split(' ').join('-');

            try {
                let result = null;
                if (image) {
                    cloudinary.config({
                        cloud_name: process.env.cloud_name,
                        api_key: process.env.api_key,
                        api_secret: process.env.api_secret,
                        secure: true
                    });
                    result = await cloudinary.uploader.upload(image.filepath, { folder: 'serviceCategories' });
                }
                const updateData = { name, slug };
                if (result) {
                    updateData.image = result.url;
                }
                const serviceCategory = await serviceCategoryModel.findByIdAndUpdate(id, updateData, { new: true });
                responseReturn(res, 200, { serviceCategory, message: 'Service Category Updated successfully' });
            } catch (error) {
                responseReturn(res, 500, { error: 'Internal Server Error' });
            }
        });
    };

    delete_serviceCategory = async (req, res) => {
        try {
            const serviceCategoryId = req.params.id;
            const deletedCategory = await serviceCategoryModel.findByIdAndDelete(serviceCategoryId);            const serviceModel = require('../../models/serviceModel');
            if (!deletedCategory) {
                return res.status(404).json({ message: 'Service Category not found' });
            }
            res.status(200).json({ message: 'Service Category deleted successfully' });
        } catch (error) {
            console.log(`Error deleting service category with id ${req.params.id}:`, error);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    };
}

module.exports = new ServiceCategoryController();
