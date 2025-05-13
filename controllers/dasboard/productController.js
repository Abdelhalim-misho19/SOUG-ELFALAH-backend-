const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response"); // Ensure path is correct
const cloudinary = require('cloudinary').v2;
const productModel = require('../../models/productModel'); // Ensure path is correct
const bannerModel = require('../../models/bannerModel'); // Import banner model for potential cleanup
 const mongoose = require('mongoose');
 const { ObjectId } = mongoose.Types;

cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
    secure: true,
});

class productController {

    add_product = async (req, res) => {
        const { id } = req; // Seller ID from auth middleware
        if (!id) return responseReturn(res, 401, { error: 'Unauthorized. Seller ID missing.' });

        const form = formidable({ multiples: true });

        form.parse(req, async (err, field, files) => {
            if (err) {
                console.error("Formidable parsing error:", err);
                return responseReturn(res, 400, { error: 'Error parsing form data.' });
            }

            // Validate required fields
            let { name, category, description, stock, price, discount, shopName, brand } = field;
            let { images } = files;

            if (!name || !category || !description || !stock || !price || !brand) {
                return responseReturn(res, 400, { error: 'Missing required product fields (Name, Category, Description, Stock, Price, Brand).' });
            }
            if (!images) {
                return responseReturn(res, 400, { error: 'At least one product image is required.' });
            }

            name = name.trim();
            const slug = name.split(' ').join('-').toLowerCase(); // Generate slug

            try {
                let allImageUrl = [];

                // Handle single or multiple images consistently
                const imageFiles = Array.isArray(images) ? images : [images];

                if (imageFiles.length === 0 || !imageFiles[0].filepath) {
                     return responseReturn(res, 400, { error: 'Valid image file is required.' });
                }

                console.log(`Uploading ${imageFiles.length} images for product: ${name}`);
                for (let i = 0; i < imageFiles.length; i++) {
                     if (imageFiles[i] && imageFiles[i].filepath) { // Check if file exists and has path
                        const result = await cloudinary.uploader.upload(imageFiles[i].filepath, { folder: 'products' });
                        allImageUrl.push(result.secure_url); // Use secure_url
                     } else {
                          console.warn(`Skipping invalid image file at index ${i}`);
                     }
                }
                console.log(`Uploaded image URLs:`, allImageUrl);

                if (allImageUrl.length === 0) {
                     return responseReturn(res, 400, { error: 'Image upload failed for all provided files.' });
                }

                // Ensure numeric fields are parsed correctly
                const stockInt = parseInt(stock);
                const priceInt = parseInt(price);
                const discountInt = parseInt(discount || "0"); // Default discount to 0 if not provided

                if (isNaN(stockInt) || isNaN(priceInt) || isNaN(discountInt)) {
                     return responseReturn(res, 400, { error: 'Stock, Price, and Discount must be valid numbers.' });
                }

                const newProduct = await productModel.create({
                    sellerId: id,
                    name,
                    slug,
                    shopName: shopName?.trim() || '', // Add shopName if available
                    category: category.trim(),
                    description: description.trim(),
                    stock: stockInt,
                    price: priceInt,
                    discount: discountInt,
                    images: allImageUrl,
                    brand: brand.trim()
                });
                console.log(`Product added successfully: ${newProduct._id}`);
                responseReturn(res, 201, { message: 'Product Added Successfully', product: newProduct });

            } catch (error) {
                console.error("Error adding product:", error);
                // Attempt to delete uploaded images if DB insert fails
                if (allImageUrl.length > 0) {
                     console.log("Attempting to delete uploaded Cloudinary images due to DB error...");
                     allImageUrl.forEach(async (url) => {
                         try {
                             const parts = url.split('/');
                             const publicIdWithFolder = parts.slice(-2).join('/').split('.')[0]; // e.g., products/filename
                             if (publicIdWithFolder) {
                                 await cloudinary.uploader.destroy(publicIdWithFolder);
                                 console.log("Deleted Cloudinary image:", publicIdWithFolder);
                             }
                         } catch (cleanupError) {
                             console.error("Error deleting Cloudinary image during cleanup:", cleanupError);
                         }
                     });
                }
                responseReturn(res, 500, { error: error.message || 'Internal Server Error' });
            }
        });
    }
    // End add_product

    products_get = async (req, res) => {
        const { page, searchValue, parPage } = req.query;
        const { id } = req; // Seller ID from auth middleware
        if (!id) return responseReturn(res, 401, { error: 'Unauthorized. Seller ID missing.' });

        try {
            const pageNum = parseInt(page) || 1;
            const limit = parseInt(parPage) || 5;
            const skip = (pageNum - 1) * limit;

            let query = { sellerId: id };
            let countQuery = { sellerId: id };

            if (searchValue) {
                // Using regex for broader search (case-insensitive) - ensure you have indexes on name, category, brand
                const regex = new RegExp(searchValue, 'i');
                query = {
                    ...query,
                    $or: [
                        { name: regex },
                        { category: regex },
                        { brand: regex }
                    ]
                };
                countQuery = { ...query }; // Use the same query for counting
                 // Alternatively, if using MongoDB text index:
                 // query.$text = { $search: searchValue };
                 // countQuery.$text = { $search: searchValue };
            }

            const products = await productModel.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(); // Use lean for performance

            const totalProduct = await productModel.countDocuments(countQuery);

            responseReturn(res, 200, { products, totalProduct });

        } catch (error) {
            console.error("Error getting products:", error.message);
            responseReturn(res, 500, { error: 'Internal server error fetching products' });
        }
    }
    // End products_get

    product_get = async (req, res) => {
        const { productId } = req.params;
         const { id: sellerId } = req; // Seller ID from auth middleware

        try {
            if (!productId || !ObjectId.isValid(productId)) {
                return responseReturn(res, 400, { error: 'Invalid Product ID provided.' });
            }

            const product = await productModel.findById(productId).lean();

             // Optional: Check if product belongs to the requesting seller
             if (product && product.sellerId.toString() !== sellerId) {
                  return responseReturn(res, 403, { error: 'Access denied. Product does not belong to this seller.' });
             }

            if (!product) {
                 return responseReturn(res, 404, { error: 'Product not found.' });
            }

            responseReturn(res, 200, { product });
        } catch (error) {
            console.error(`Error getting product ${productId}:`, error.message);
            responseReturn(res, 500, { error: 'Internal server error fetching product' });
        }
    }
    // End product_get

    product_update = async (req, res) => {
        const { id: sellerId } = req; // Seller ID from auth middleware
        // Assuming data comes in req.body for simple fields update
        // The frontend sends { productId, formData } for image updates, but just fields here?
        // Let's assume fields come directly in body for this specific action
        let { name, description, stock, price, category, discount, brand, productId } = req.body;

        if (!productId || !ObjectId.isValid(productId)) {
             return responseReturn(res, 400, { error: 'Valid Product ID is required.' });
        }
         if (!name || !description || stock === undefined || price === undefined || !category || discount === undefined || !brand) {
             return responseReturn(res, 400, { error: 'Missing required fields for update.' });
         }

        try {
            name = name.trim();
            const slug = name.split(' ').join('-').toLowerCase();

            // Ensure numeric fields are numbers
             const stockNum = parseInt(stock);
             const priceNum = parseFloat(price); // Use parseFloat for price
             const discountNum = parseInt(discount);

             if (isNaN(stockNum) || isNaN(priceNum) || isNaN(discountNum)) {
                  return responseReturn(res, 400, { error: 'Stock, Price, and Discount must be valid numbers.' });
             }


            // Verify the product belongs to the seller before updating
             const existingProduct = await productModel.findOne({ _id: productId, sellerId: sellerId });
             if (!existingProduct) {
                 return responseReturn(res, 404, { error: 'Product not found or you do not have permission to update it.' });
             }


            const updatedProduct = await productModel.findByIdAndUpdate(productId, {
                name, description, stock: stockNum, price: priceNum, category: category.trim(), discount: discountNum, brand: brand.trim(), slug
            }, { new: true }).lean(); // {new: true} returns the updated document

            if (!updatedProduct) {
                 return responseReturn(res, 404, { error: 'Product update failed.' });
            }

            responseReturn(res, 200, { product: updatedProduct, message: 'Product Updated Successfully' });
        } catch (error) {
             console.error(`Error updating product ${productId}:`, error.message);
            responseReturn(res, 500, { error: error.message || 'Internal server error updating product' });
        }
    }
    // End product_update

    product_image_update = async (req, res) => {
        const { id: sellerId } = req; // Seller ID from auth middleware
        const form = formidable({ multiples: true });

        form.parse(req, async (err, field, files) => {
            if (err) { return responseReturn(res, 400, { error: err.message }); }

            const { oldImage, productId } = field; // oldImage is the URL string
            const { newImage } = files; // newImage is the File object

            if (!oldImage || !productId || !newImage || !newImage.filepath) {
                return responseReturn(res, 400, { error: 'Missing required fields: oldImage URL, productId, newImage file.' });
            }
            if (!ObjectId.isValid(productId)) {
                 return responseReturn(res, 400, { error: 'Invalid Product ID format.' });
            }

            try {
                 // Verify product belongs to seller
                 const product = await productModel.findOne({ _id: productId, sellerId: sellerId });
                 if (!product) {
                     return responseReturn(res, 404, { error: 'Product not found or permission denied.' });
                 }

                // Upload new image
                const result = await cloudinary.uploader.upload(newImage.filepath, { folder: 'products' });
                if (!result || !result.secure_url) {
                     throw new Error('Cloudinary upload failed.');
                }

                // Update image array in DB
                let images = product.images;
                const index = images.findIndex(img => img === oldImage);

                if (index === -1) {
                     // Old image not found, maybe append or handle differently?
                     // For now, let's just replace the first image if old one not found, or append
                     // This logic might need adjustment based on your UI/requirements
                     console.warn(`Old image URL not found in product ${productId}. Appending new image.`);
                     images.push(result.secure_url); // Append if not found
                } else {
                    images[index] = result.secure_url; // Replace if found
                }

                await productModel.findByIdAndUpdate(productId, { images });

                // Delete old image from Cloudinary *after* DB update succeeds
                 if (index !== -1 && oldImage) { // Only delete if old image was found and existed
                     try {
                         const parts = oldImage.split('/');
                         const publicIdWithFolder = parts.slice(-2).join('/').split('.')[0];
                         if (publicIdWithFolder.startsWith('products/')) { // Safety check for folder
                             await cloudinary.uploader.destroy(publicIdWithFolder);
                             console.log(`Deleted old Cloudinary image: ${publicIdWithFolder}`);
                         } else {
                              console.warn(`Skipping Cloudinary delete for potentially invalid public ID derived from: ${oldImage}`);
                         }
                     } catch (destroyError) {
                         console.error('Failed to delete old Cloudinary image (non-critical):', destroyError);
                         // Log this error but don't fail the request because the image was updated in DB
                     }
                 }

                const updatedProduct = await productModel.findById(productId).lean(); // Fetch updated product
                responseReturn(res, 200, { product: updatedProduct, message: 'Product Image Updated Successfully' });

            } catch (error) {
                console.error(`Error updating product image for ${productId}:`, error);
                // If upload succeeded but DB failed, try deleting the newly uploaded image
                 if (result && result.public_id) {
                     try { await cloudinary.uploader.destroy(result.public_id); console.log("Cleaned up newly uploaded Cloudinary image due to error."); } catch (e) {}
                 }
                responseReturn(res, 500, { error: error.message || 'Internal server error updating product image' });
            }
        });
    }
    // End product_image_update


    // +++ START: Add product_delete Method +++
    product_delete = async (req, res) => {
        const { productId } = req.params;
        const { id: sellerId } = req; // Seller ID from auth middleware

        if (!sellerId) {
             return responseReturn(res, 401, { error: 'Unauthorized. Seller ID missing.' });
        }
        if (!productId || !ObjectId.isValid(productId)) {
            return responseReturn(res, 400, { error: 'Invalid Product ID provided.' });
        }

        try {
            // Find the product first to verify ownership and get image URLs
            const productToDelete = await productModel.findOne({ _id: productId, sellerId: sellerId });

            if (!productToDelete) {
                return responseReturn(res, 404, { error: 'Product not found or you do not have permission to delete it.' });
            }

            // Delete product from database
            await productModel.findByIdAndDelete(productId);

            // Delete associated product banner if it exists
             try {
                 const bannerToDelete = await bannerModel.findOneAndDelete({ productId: productId });
                 if (bannerToDelete && bannerToDelete.banner) {
                      // Delete banner image from Cloudinary
                      try {
                          const urlParts = bannerToDelete.banner.split('/');
                          const filename = urlParts[urlParts.length - 1].split('.')[0];
                          const publicId = `banners/${filename}`; // Assuming 'banners' folder
                          await cloudinary.uploader.destroy(publicId);
                          console.log(`Deleted associated banner image from Cloudinary: ${publicId}`);
                      } catch (destroyError) {
                          console.error('Failed to delete associated banner Cloudinary image (non-critical):', destroyError);
                      }
                 }
             } catch(bannerDeleteError) {
                  console.error(`Error deleting associated banner for product ${productId}:`, bannerDeleteError);
                  // Continue even if banner deletion fails
             }


            // Delete product images from Cloudinary
            if (productToDelete.images && productToDelete.images.length > 0) {
                console.log(`Attempting to delete ${productToDelete.images.length} Cloudinary images for product ${productId}...`);
                for (const imageUrl of productToDelete.images) {
                    try {
                        const parts = imageUrl.split('/');
                        // Assumes structure like .../folder/filename.ext
                        const publicIdWithFolder = parts.slice(-2).join('/').split('.')[0];
                        if (publicIdWithFolder.startsWith('products/')) { // Safety check folder name
                             await cloudinary.uploader.destroy(publicIdWithFolder);
                             console.log(`Deleted Cloudinary image: ${publicIdWithFolder}`);
                        } else {
                              console.warn(`Skipping Cloudinary delete for potentially invalid public ID derived from: ${imageUrl}`);
                        }
                    } catch (destroyError) {
                        // Log error but continue trying to delete others
                        console.error(`Failed to delete Cloudinary image ${imageUrl}:`, destroyError);
                    }
                }
            }

            responseReturn(res, 200, { message: 'Product Deleted Successfully', productId });

        } catch (error) {
            console.error(`Error deleting product ${productId}:`, error);
            responseReturn(res, 500, { error: error.message || 'Internal server error deleting product' });
        }
    }
    // +++ END: Add product_delete Method +++

} // End productController Class

module.exports = new productController();