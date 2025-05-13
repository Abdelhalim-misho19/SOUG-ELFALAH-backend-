const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response");
const cloudinary = require('cloudinary').v2;
const serviceModel = require('../../models/serviceModel');
const { mongo: { ObjectId } } = require('mongoose'); // Import ObjectId

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
    secure: true
});

class ServiceController {
    // --- Existing add_service method ---
    add_service = async (req, res) => {
        const { id } = req; // sellerId
        const form = formidable({ multiples: true });

        form.parse(req, async (err, field, files) => {
             if (err) {
                 console.error("Form parsing error:", err);
                 return responseReturn(res, 400, { error: "Error parsing form data" });
             }

             let { name, category, description, price, phoneNumber, province, municipality, shopName } = field;
             let { images } = files;

             // Basic validation
             if (!name || !category || !description || !price || !phoneNumber || !province || !municipality || !shopName ) {
                  return responseReturn(res, 400, { error: "Please fill all required text fields." });
             }
             // Image validation handled separately

             name = name.trim();
             const slug = name.split(' ').join('-');

             try {
                 let allImageUrl = [];
                 // Ensure images is always an array if provided
                 if (images && !Array.isArray(images)) {
                     images = [images];
                 } else if (!images || images.length === 0 || (images.length === 1 && !images[0].originalFilename)) {
                     // Check if images is undefined, empty array, or an array with a placeholder empty file object from formidable
                      return responseReturn(res, 400, { error: "Please upload at least one image." });
                 }


                 for (let i = 0; i < images.length; i++) {
                     if (images[i] && images[i].filepath && images[i].originalFilename) { // Check if it's a valid uploaded file
                         const result = await cloudinary.uploader.upload(images[i].filepath, { folder: 'services' });
                         allImageUrl.push(result.url);
                     } else {
                          console.warn(`Skipping invalid image file at index ${i}`);
                     }
                 }

                  if (allImageUrl.length === 0) {
                     // This case should ideally be caught by the earlier check, but double-check
                     return responseReturn(res, 400, { error: "Valid image upload failed or no valid images provided." });
                 }


                 const service = await serviceModel.create({ // Get the created service
                     sellerId: id,
                     name,
                     slug,
                     shopName: shopName ? shopName.trim() : '', // Handle optional shopName
                     category: category.trim(),
                     description: description.trim(),
                     price: parseInt(price),
                     phoneNumber: phoneNumber.trim(),
                     province: province.trim(),
                     municipality: municipality.trim(),
                     images: allImageUrl
                 });
                 // Return the created service along with the message
                 responseReturn(res, 201, { message: 'Service Added Successfully', service });
             } catch (error) {
                 console.error("Error adding service:", error);
                 responseReturn(res, 500, { error: "Failed to add service. " + error.message });
             }
         });
    };

    // --- Existing services_get method ---
    services_get = async (req, res) => {
        const { page, searchValue, parPage } = req.query;
        const { id } = req; // sellerId from authMiddleware

        // Validate and sanitize input
        const pageNum = parseInt(page) || 1;
        const limit = parseInt(parPage) || 5;
        const skip = limit * (pageNum - 1);
        const search = searchValue ? searchValue.trim() : '';


        try {
            let query = { sellerId: id };
            if (search) {
                 const searchRegex = new RegExp(search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i'); // Escape regex special chars
                query = {
                    ...query,
                    $or: [
                         { name: searchRegex },
                         { category: searchRegex },
                         { description: searchRegex },
                         { province: searchRegex },
                         { municipality: searchRegex },
                    ]
                };
            }

            const services = await serviceModel.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(); // Use lean for performance if not modifying docs

            const totalService = await serviceModel.countDocuments(query);

            responseReturn(res, 200, { services, totalService });

        } catch (error) {
            console.error("Error fetching services:", error.message);
            responseReturn(res, 500, { error: "Failed to fetch services: " + error.message });
        }
    };

    // +++ Get Single Service +++
    get_service = async (req, res) => {
        const { serviceId } = req.params;
        const { id: sellerId } = req; // Seller's ID from token

        try {
             if (!ObjectId.isValid(serviceId)) {
                 return responseReturn(res, 400, { error: 'Invalid Service ID format' });
             }

            const service = await serviceModel.findById(serviceId);

            if (!service) {
                return responseReturn(res, 404, { error: 'Service not found' });
            }

            // Authorization check: Ensure the service belongs to the requesting seller
            if (service.sellerId.toString() !== sellerId) {
                return responseReturn(res, 403, { error: 'Unauthorized: You do not own this service' });
            }


            responseReturn(res, 200, { service });
        } catch (error) {
            console.error("Error fetching single service:", error);
            responseReturn(res, 500, { error: error.message });
        }
    };

    // +++ Update Service +++
    update_service = async (req, res) => {
        const { serviceId } = req.params;
        const { id: sellerId } = req; // Seller's ID from token
        // For updates, we'll initially assume data comes in req.body
        // Image updates would require formidable parsing again (more complex)
        let { name, category, description, price, phoneNumber, province, municipality, shopName } = req.body;

         if (!ObjectId.isValid(serviceId)) {
            return responseReturn(res, 400, { error: 'Invalid Service ID format' });
         }


        // Basic validation for required fields during update
        if (!name || !category || !description || !price || !phoneNumber || !province || !municipality ) {
             return responseReturn(res, 400, { error: "Please fill all required text fields." });
        }


        try {
            const service = await serviceModel.findById(serviceId);

            if (!service) {
                return responseReturn(res, 404, { error: 'Service not found for update' });
            }

            // Authorization check
            if (service.sellerId.toString() !== sellerId) {
                return responseReturn(res, 403, { error: 'Unauthorized: You cannot update this service' });
            }

            // Prepare update data
            name = name.trim();
            const slug = name.split(' ').join('-');
            const updateData = {
                name,
                slug,
                category: category.trim(),
                description: description.trim(),
                price: parseInt(price),
                phoneNumber: phoneNumber.trim(),
                province: province.trim(),
                municipality: municipality.trim(),
                shopName: shopName ? shopName.trim() : service.shopName, // Keep old if not provided
                 // NOTE: Image update logic is NOT included here for simplicity.
                 // Adding image updates requires handling file uploads (formidable),
                 // comparing old/new images, uploading new ones to Cloudinary,
                 // and potentially deleting old ones from Cloudinary.
            };

            const updatedService = await serviceModel.findByIdAndUpdate(serviceId, updateData, { new: true }); // {new: true} returns the updated document

            responseReturn(res, 200, { service: updatedService, message: 'Service updated successfully' });

        } catch (error) {
            console.error("Error updating service:", error);
            responseReturn(res, 500, { error: `Error updating service: ${error.message}` });
        }
    };

    // +++ Delete Service +++
    delete_service = async (req, res) => {
        const { serviceId } = req.params;
        const { id: sellerId } = req; // Seller's ID from token

        try {
            if (!ObjectId.isValid(serviceId)) {
                 return responseReturn(res, 400, { error: 'Invalid Service ID format' });
             }

            const service = await serviceModel.findById(serviceId);

            if (!service) {
                return responseReturn(res, 404, { error: 'Service not found for deletion' });
            }

            // Authorization check
            if (service.sellerId.toString() !== sellerId) {
                return responseReturn(res, 403, { error: 'Unauthorized: You cannot delete this service' });
            }

            // --- Optional: Delete images from Cloudinary ---
            // This adds complexity but is good practice
            if (service.images && service.images.length > 0) {
                const imageDeletePromises = service.images.map(imageUrl => {
                    // Extract public_id from URL (adjust based on your Cloudinary folder structure)
                    // Example: "http://res.cloudinary.com/cloud_name/image/upload/v12345/services/filename.jpg" -> "services/filename"
                    try {
                        const urlParts = imageUrl.split('/');
                        const publicIdWithExtension = urlParts.slice(urlParts.indexOf('services')).join('/'); // Find 'services' folder
                        const publicId = publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));
                         if (publicId) {
                            console.log(`Attempting to delete Cloudinary image: ${publicId}`);
                            return cloudinary.uploader.destroy(publicId);
                        }
                    } catch (e) {
                        console.error(`Error extracting public_id from ${imageUrl}:`, e);
                    }
                    return Promise.resolve(); // Resolve promise even if extraction fails to not block DB deletion
                });
                await Promise.all(imageDeletePromises);
                console.log("Cloudinary images deletion attempted.");
            }
            // --- End Optional Cloudinary Delete ---

            await serviceModel.findByIdAndDelete(serviceId);

            responseReturn(res, 200, { message: 'Service deleted successfully', serviceId }); // Return ID for frontend removal

        } catch (error) {
            console.error("Error deleting service:", error);
            responseReturn(res, 500, { error: `Error deleting service: ${error.message}` });
        }
    };

}

module.exports = new ServiceController();