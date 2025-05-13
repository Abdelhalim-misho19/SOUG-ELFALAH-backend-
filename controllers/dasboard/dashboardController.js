const myShopWallet = require('../../models/myShopWallet');
const productModel = require('../../models/productModel');
const customerOrder = require('../../models/customerOrder'); // Keep if used elsewhere, otherwise can remove
const sellerModel = require('../../models/sellerModel');
const adminSellerMessage = require('../../models/chat/adminSellerMessage');
const sellerWallet = require('../../models/sellerWallet');
const authOrder = require('../../models/authOrder');
const sellerCustomerMessage = require('../../models/chat/sellerCustomerMessage');
const bannerModel = require('../../models/bannerModel');
const AdBanner = require('../../models/adBannerModel');
const { responseReturn } = require('../../utiles/response');
const { mongo: { ObjectId } } = require('mongoose');
const cloudinary = require('cloudinary').v2;
const formidable = require('formidable');
const moment = require('moment');

// Ensure Cloudinary config is set
cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
    secure: true,
});

class dashboardController {

    // --- get_admin_dashboard_data (ENHANCED - From previous step) ---
    get_admin_dashboard_data = async (req, res) => {
        const { period = 'year' } = req.query;
        console.log(`get_admin_dashboard_data: Starting request for period: ${period}`);
        try {
            if (!['week', 'month', 'year'].includes(period)) {
                console.warn('get_admin_dashboard_data: Invalid period query:', period);
                return responseReturn(res, 400, { error: 'Invalid period specified. Use week, month, or year.' });
            }
            console.log('get_admin_dashboard_data: Fetching totals and recent items...');
            const [
                totalSaleResult, totalProduct, totalOrder, totalSeller, totalPendingOrder,
                totalPendingSellerRequests, recentOrders, recentMessages, recentSellerRequests
            ] = await Promise.all([
                myShopWallet.aggregate([{ $group: { _id: null, totalAmount: { $sum: '$amount' } } }]).catch(err => { console.error('TotalSale Query Error:', err.message); return [{ totalAmount: 0 }]; }),
                productModel.countDocuments({}).catch(err => { console.error('TotalProduct Query Error:', err.message); return 0; }),
                authOrder.countDocuments({}).catch(err => { console.error('TotalOrder Query Error:', err.message); return 0; }),
                sellerModel.countDocuments({ status: 'active' }).catch(err => { console.error('TotalActiveSeller Query Error:', err.message); return 0; }),
                authOrder.countDocuments({ delivery_status: 'pending' }).catch(err => { console.error('PendingOrder Query Error:', err.message); return 0; }),
                sellerModel.countDocuments({ status: 'pending' }).catch(err => { console.error('PendingSellerRequests Query Error:', err.message); return 0; }),
                authOrder.find({}).sort({ createdAt: -1 }).limit(5).lean().catch(err => { console.error('RecentOrders Query Error:', err.message); return []; }),
                adminSellerMessage.find({}).sort({ createdAt: -1 }).limit(5).lean().catch(err => { console.error('RecentMessages Query Error:', err.message); return []; }),
                sellerModel.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean().catch(err => { console.error('RecentSellerRequests Query Error:', err.message); return []; })
            ]).catch(err => {
                 console.error('get_admin_dashboard_data: Promise.all error (Totals/Recent):', err.message);
                 return responseReturn(res, 500, { error: 'Failed to fetch some dashboard data components' });
            });
            console.log('get_admin_dashboard_data: Fetched totals and recent items successfully.');

            let startDate, groupBy, dataLength;
            console.log(`get_admin_dashboard_data: Calculating chart data start date for period: ${period}`);
            if (period === 'year') {
                startDate = moment().startOf('year').toDate(); groupBy = { $month: '$createdAt' }; dataLength = 12;
            } else if (period === 'month') {
                startDate = moment().startOf('month').toDate(); groupBy = { $dayOfMonth: '$createdAt' }; dataLength = moment().daysInMonth();
            } else { // week
                startDate = moment().subtract(6, 'days').startOf('day').toDate(); groupBy = { $dayOfWeek: '$createdAt' }; dataLength = 7;
            }
            const buckets = Array(dataLength).fill(0);
            console.log(`get_admin_dashboard_data: StartDate: ${startDate}, GroupBy: ${JSON.stringify(groupBy)}, Buckets: ${dataLength}`);

            console.log('get_admin_dashboard_data: Fetching chart aggregate data...');
             const [salesData, ordersData, sellersData] = await Promise.all([
                myShopWallet.aggregate([ { $match: { createdAt: { $gte: startDate } } }, { $group: { _id: groupBy, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } } ]).catch(err => { console.error('Chart Sales Aggregation Error:', err.message); return []; }),
                authOrder.aggregate([ { $match: { createdAt: { $gte: startDate } } }, { $group: { _id: groupBy, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ]).catch(err => { console.error('Chart Orders Aggregation Error:', err.message); return []; }),
                sellerModel.aggregate([ { $match: { createdAt: { $gte: startDate } } }, { $group: { _id: groupBy, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ]).catch(err => { console.error('Chart Sellers Aggregation Error:', err.message); return []; })
            ]).catch(err => {
                console.error('get_admin_dashboard_data: Chart Promise.all error:', err.message);
                return responseReturn(res, 500, { error: 'Failed to fetch chart data aggregates' });
            });
            console.log('get_admin_dashboard_data: Fetched chart aggregate data successfully.');

            console.log('get_admin_dashboard_data: Populating chart arrays...');
            const salesArray = [...buckets]; const ordersArray = [...buckets]; const sellersArray = [...buckets];
            const getIndex = (item_id) => (period === 'year' || period === 'month') ? item_id - 1 : item_id - 1; // Sun=1 -> 0

            salesData.forEach((s) => { const index = getIndex(s._id); if (index >= 0 && index < dataLength) salesArray[index] = s.amount || 0; else console.warn(`Sales index out of bounds: _id=${s._id}`); });
            ordersData.forEach((o) => { const index = getIndex(o._id); if (index >= 0 && index < dataLength) ordersArray[index] = o.count || 0; else console.warn(`Orders index out of bounds: _id=${o._id}`); });
            sellersData.forEach((s) => { const index = getIndex(s._id); if (index >= 0 && index < dataLength) sellersArray[index] = s.count || 0; else console.warn(`Sellers index out of bounds: _id=${s._id}`); });
            console.log('get_admin_dashboard_data: Populated chart arrays.');

            const currentSale = totalSaleResult.length > 0 ? totalSaleResult[0].totalAmount : 0;
            const responseData = {
                totalSale: currentSale, totalOrder, totalProduct, totalSeller, totalPendingOrder,
                totalPendingSellerRequests, recentOrders, recentMessages, recentSellerRequests,
                chartData: { sales: salesArray, orders: ordersArray, sellers: sellersArray, period: period },
            };
            console.log(`get_admin_dashboard_data: Successfully prepared response for period: ${period}`);
            responseReturn(res, 200, responseData);
        } catch (error) {
            console.error('get_admin_dashboard_data: Uncaught Error in handler:', error.message, error.stack);
            responseReturn(res, 500, { error: 'Internal server error fetching admin dashboard data' });
        }
    };

    // --- get_seller_dashboard_data (Keep as is - From previous step) ---
    get_seller_dashboard_data = async (req, res) => {
        const { id } = req;
        console.log('get_seller_dashboard_data: sellerId:', id);
        try {
            if (!id) {
                console.warn('get_seller_dashboard_data: Missing sellerId');
                return responseReturn(res, 400, { error: 'Seller ID is required' });
            }
            let sellerObjectId;
             try { sellerObjectId = new ObjectId(id); } catch (e) {
                 console.warn('get_seller_dashboard_data: Invalid ObjectId format for sellerId:', id);
                 return responseReturn(res, 400, { error: 'Invalid seller ID format' });
             }

            const [
                totalSaleResult, lastMonthSaleResult, totalProduct, totalOrder,
                totalPendingOrder, messages, recentOrders
            ] = await Promise.all([
                 sellerWallet.aggregate([{ $match: { sellerId: id } }, { $group: { _id: null, totalAmount: { $sum: '$amount' } } }]).catch(err => { console.error('Seller TotalSale Query Error:', err.message); return [{ totalAmount: 0 }]; }),
                 sellerWallet.aggregate([{ $match: { sellerId: id, createdAt: { $gte: moment().subtract(1, 'month').startOf('month').toDate(), $lte: moment().subtract(1, 'month').endOf('month').toDate() } } }, { $group: { _id: null, totalAmount: { $sum: '$amount' } } }]).catch(err => { console.error('Seller LastMonthSale Query Error:', err.message); return [{ totalAmount: 0 }]; }),
                 productModel.countDocuments({ sellerId: sellerObjectId }).catch(err => { console.error('Seller TotalProduct Query Error:', err.message); return 0; }),
                 authOrder.countDocuments({ sellerId: sellerObjectId }).catch(err => { console.error('Seller TotalOrder Query Error:', err.message); return 0; }),
                 authOrder.countDocuments({ sellerId: sellerObjectId, delivery_status: 'pending' }).catch(err => { console.error('Seller PendingOrder Query Error:', err.message); return 0; }),
                 sellerCustomerMessage.find({ $or: [{ senderId: id }, { receverId: id }] }).sort({ createdAt: -1 }).limit(3).lean().catch(err => { console.error('Seller Messages Query Error:', err.message); return []; }),
                 authOrder.find({ sellerId: sellerObjectId }).sort({ createdAt: -1 }).limit(5).lean().catch(err => { console.error('Seller RecentOrders Query Error:', err.message); return []; })
             ]).catch(err => {
                  console.error('get_seller_dashboard_data: Promise.all error:', err.message);
                  return responseReturn(res, 500, { error: 'Failed to fetch some seller dashboard components' });
             });

            const currentSale = totalSaleResult.length > 0 ? totalSaleResult[0].totalAmount : 0;
            const prevSale = lastMonthSaleResult.length > 0 ? lastMonthSaleResult[0].totalAmount : 0;
            let saleChange = null;
            if (prevSale > 0) { saleChange = ((currentSale - prevSale) / prevSale) * 100; }
            else if (currentSale > 0) { saleChange = 100; }

            const responseData = {
                totalSale: currentSale, totalOrder, totalProduct, totalPendingOrder,
                messages, recentOrders, saleChange,
            };
            console.log('get_seller_dashboard_data: Response data prepared.');
            responseReturn(res, 200, responseData);
        } catch (error) {
            console.error('get_seller_dashboard_data: Uncaught Error:', error.message, error.stack);
            responseReturn(res, 500, { error: 'Internal server error fetching seller dashboard data' });
        }
    };

    // --- get_seller_chart_data (RENAMED from get_seller_analytics_data) ---
    get_seller_chart_data = async (req, res) => { // <--- RENAMED HERE
        const { sellerId, period } = req.query;
        console.log('get_seller_chart_data: Received sellerId:', sellerId, 'period:', period); // <--- Log updated
        try {
            if (!sellerId || typeof sellerId !== 'string') {
                console.warn('get_seller_chart_data: Invalid or missing sellerId'); // <--- Log updated
                return responseReturn(res, 400, { error: 'Seller ID is required and must be a string' });
            }
            if (!['week', 'month', 'year'].includes(period)) {
                console.warn('get_seller_chart_data: Invalid period:', period); // <--- Log updated
                return responseReturn(res, 400, { error: 'Invalid period. Use week, month, or year' });
            }

            let sellerObjectId;
            try { sellerObjectId = new ObjectId(sellerId); } catch (e) {
                console.warn('get_seller_chart_data: Invalid ObjectId format for sellerId:', sellerId); // <--- Log updated
                return responseReturn(res, 400, { error: 'Invalid seller ID format' });
            }

            let startDate, groupBy, dataLength;
            if (period === 'year') {
                startDate = moment().startOf('year').toDate(); groupBy = { $month: '$createdAt' }; dataLength = 12;
            } else if (period === 'month') {
                startDate = moment().startOf('month').toDate(); groupBy = { $dayOfMonth: '$createdAt' }; dataLength = moment().daysInMonth();
            } else { // week
                startDate = moment().subtract(6, 'days').startOf('day').toDate(); groupBy = { $dayOfWeek: '$createdAt' }; dataLength = 7;
            }
             const buckets = Array(dataLength).fill(0);

             const [orders, revenue] = await Promise.all([
                authOrder.aggregate([{ $match: { sellerId: sellerObjectId, createdAt: { $gte: startDate } } }, { $group: { _id: groupBy, count: { $sum: 1 } } }]).catch(err => { console.error('Seller Chart Orders Aggregation Error:', err.message); return []; }),
                sellerWallet.aggregate([{ $match: { sellerId: sellerId, createdAt: { $gte: startDate } } }, { $group: { _id: groupBy, amount: { $sum: '$amount' } } }]).catch(err => { console.error('Seller Chart Revenue Aggregation Error:', err.message); return []; })
             ]).catch(err => {
                 console.error('get_seller_chart_data: Promise.all error:', err.message); // <--- Log updated
                 return responseReturn(res, 500, { error: 'Failed to fetch some seller chart data' });
             });

            const orderData = [...buckets];
            const revenueData = [...buckets];
            const getIndex = (item_id) => (period === 'year' || period === 'month') ? item_id - 1 : item_id - 1;

            orders.forEach((o) => { const index = getIndex(o._id); if (index >= 0 && index < dataLength) orderData[index] = o.count || 0; });
            revenue.forEach((r) => { const index = getIndex(r._id); if (index >= 0 && index < dataLength) revenueData[index] = r.amount || 0; });

            const responseData = {
                orders: orderData,
                revenue: revenueData,
                period: period // Include period
            };
            console.log('get_seller_chart_data: Sending response:', responseData); // <--- Log updated
            responseReturn(res, 200, responseData);
        } catch (error) {
            console.error('get_seller_chart_data: Error:', error.message, error.stack); // <--- Log updated
            responseReturn(res, 500, { error: 'Internal server error fetching seller chart data' });
        }
    };


    // --- Banner methods (Keep as is) ---
    add_banner = async (req, res) => {
        const sellerId = req.id;
        if (!sellerId) return responseReturn(res, 403, { error: 'Seller authentication required.' });
        const form = formidable({ multiples: true });
        form.parse(req, async (err, field, files) => {
            if (err) return responseReturn(res, 500, { error: 'Form parsing error' });
            const { productId } = field; const { mainban } = files;
            if (!productId || !mainban) return responseReturn(res, 400, { error: 'Product ID and banner image are required' });
            if (!ObjectId.isValid(productId)) return responseReturn(res, 400, { error: 'Invalid Product ID format' });
            try {
                const sellerObjectId = new ObjectId(sellerId);
                const product = await productModel.findOne({ _id: new ObjectId(productId), sellerId: sellerObjectId }).lean();
                if (!product) return responseReturn(res, 404, { error: 'Product not found or does not belong to this seller.' });
                const result = await cloudinary.uploader.upload(mainban.filepath, { folder: 'banners' });
                const banner = await bannerModel.create({ productId: product._id, banner: result.secure_url, link: product.slug });
                responseReturn(res, 201, { banner, message: 'Product Banner Added Successfully' });
            } catch (error) { console.error('Error adding product banner:', error); responseReturn(res, 500, { error: 'Internal server error adding product banner' }); }
        });
     };
    get_banner = async (req, res) => {
        const { productId } = req.params;
        try {
            if (!ObjectId.isValid(productId)) return responseReturn(res, 400, { error: 'Invalid Product ID format' });
            const banner = await bannerModel.findOne({ productId: new ObjectId(productId) }).lean();
            if (!banner) return responseReturn(res, 404, { error: 'Banner not found for this product' });
            responseReturn(res, 200, { banner });
        } catch (error) { console.error('Error fetching product banner:', error); responseReturn(res, 500, { error: 'Internal server error fetching product banner' }); }
     };
    update_banner = async (req, res) => {
        const sellerId = req.id;
        if (!sellerId) return responseReturn(res, 403, { error: 'Seller authentication required.' });
        const { bannerId } = req.params;
        const form = formidable({});
        form.parse(req, async (err, _, files) => {
            if (err) return responseReturn(res, 500, { error: 'Form parsing error' });
            const { mainban } = files;
            if (!mainban) return responseReturn(res, 400, { error: 'New banner image is required' });
            if (!ObjectId.isValid(bannerId)) return responseReturn(res, 400, { error: 'Invalid Banner ID format' });
            try {
                const sellerObjectId = new ObjectId(sellerId);
                let banner = await bannerModel.findById(bannerId);
                if (!banner) return responseReturn(res, 404, { error: 'Banner not found' });
                const product = await productModel.findOne({ _id: banner.productId, sellerId: sellerObjectId }).lean();
                if (!product) return responseReturn(res, 403, { error: 'Permission denied. Banner does not belong to this seller.' });
                if (banner.banner) {
                    try { const urlParts = banner.banner.split('/'); const filename = urlParts[urlParts.length - 1].split('.')[0]; const publicId = `banners/${filename}`; await cloudinary.uploader.destroy(publicId); } catch (destroyError) { console.error('Failed to delete old Cloudinary image:', destroyError); }
                }
                const { secure_url } = await cloudinary.uploader.upload(mainban.filepath, { folder: 'banners' });
                await bannerModel.findByIdAndUpdate(bannerId, { banner: secure_url });
                const updatedBanner = await bannerModel.findById(bannerId).lean();
                responseReturn(res, 200, { banner: updatedBanner, message: 'Product Banner Updated Successfully' });
            } catch (error) { console.error('Error updating product banner:', error); responseReturn(res, 500, { error: 'Internal server error updating product banner' }); }
        });
     };
    get_banners = async (req, res) => {
        try { const banners = await bannerModel.aggregate([{ $sample: { size: 5 } }]); responseReturn(res, 200, { banners }); } catch (error) { console.error('Error fetching random banners:', error); responseReturn(res, 500, { error: 'Internal server error fetching banners' }); }
     };
    add_banner = async (req, res) => {
        const sellerId = req.id;
        if (!sellerId) {
            return responseReturn(res, 403, { error: 'Seller authentication required.' });
        }

        const form = formidable({ multiples: true });
        form.parse(req, async (err, field, files) => {
            if (err) {
                return responseReturn(res, 500, { error: 'Form parsing error' });
            }

            const { productId } = field;
            const { mainban } = files;

            if (!productId || !mainban) {
                return responseReturn(res, 400, { error: 'Product ID and banner image are required' });
            }
            if (!ObjectId.isValid(productId)) {
                return responseReturn(res, 400, { error: 'Invalid Product ID format' });
            }

            try {
                const sellerObjectId = new ObjectId(sellerId);
                const product = await productModel.findOne({
                    _id: new ObjectId(productId),
                    sellerId: sellerObjectId,
                }).lean();
                if (!product) {
                    return responseReturn(res, 404, {
                        error: 'Product not found or does not belong to this seller.',
                    });
                }

                const result = await cloudinary.uploader.upload(mainban.filepath, { folder: 'banners' });
                const banner = await bannerModel.create({
                    productId: product._id,
                    banner: result.secure_url,
                    link: product.slug,
                });
                responseReturn(res, 201, { banner, message: 'Product Banner Added Successfully' });
            } catch (error) {
                console.error('Error adding product banner:', error);
                responseReturn(res, 500, { error: 'Internal server error adding product banner' });
            }
        });
    };

    get_banner = async (req, res) => {
        const { productId } = req.params;
        try {
            if (!ObjectId.isValid(productId)) {
                return responseReturn(res, 400, { error: 'Invalid Product ID format' });
            }
            const banner = await bannerModel.findOne({ productId: new ObjectId(productId) }).lean();
            if (!banner) {
                return responseReturn(res, 404, { error: 'Banner not found for this product' });
            }
            responseReturn(res, 200, { banner });
        } catch (error) {
            console.error('Error fetching product banner:', error);
            responseReturn(res, 500, { error: 'Internal server error fetching product banner' });
        }
    };

    update_banner = async (req, res) => {
        const sellerId = req.id;
        if (!sellerId) {
            return responseReturn(res, 403, { error: 'Seller authentication required.' });
        }

        const { bannerId } = req.params;
        const form = formidable({});
        form.parse(req, async (err, _, files) => {
            if (err) {
                return responseReturn(res, 500, { error: 'Form parsing error' });
            }
            const { mainban } = files;
            if (!mainban) {
                return responseReturn(res, 400, { error: 'New banner image is required' });
            }
            if (!ObjectId.isValid(bannerId)) {
                return responseReturn(res, 400, { error: 'Invalid Banner ID format' });
            }

            try {
                const sellerObjectId = new ObjectId(sellerId);
                let banner = await bannerModel.findById(bannerId);
                if (!banner) {
                    return responseReturn(res, 404, { error: 'Banner not found' });
                }

                const product = await productModel.findOne({
                    _id: banner.productId,
                    sellerId: sellerObjectId,
                }).lean();
                if (!product) {
                    return responseReturn(res, 403, {
                        error: 'Permission denied. Banner does not belong to this seller.',
                    });
                }

                if (banner.banner) {
                    try {
                        const urlParts = banner.banner.split('/');
                        const filename = urlParts[urlParts.length - 1].split('.')[0];
                        const publicId = `banners/${filename}`;
                        await cloudinary.uploader.destroy(publicId);
                    } catch (destroyError) {
                        console.error('Failed to delete old Cloudinary image:', destroyError);
                    }
                }

                const { secure_url } = await cloudinary.uploader.upload(mainban.filepath, {
                    folder: 'banners',
                });
                await bannerModel.findByIdAndUpdate(bannerId, { banner: secure_url });

                const updatedBanner = await bannerModel.findById(bannerId).lean();
                responseReturn(res, 200, {
                    banner: updatedBanner,
                    message: 'Product Banner Updated Successfully',
                });
            } catch (error) {
                console.error('Error updating product banner:', error);
                responseReturn(res, 500, { error: 'Internal server error updating product banner' });
            }
        });
    };

    get_banners = async (req, res) => {
        try {
            const banners = await bannerModel.aggregate([{ $sample: { size: 5 } }]);
            responseReturn(res, 200, { banners });
        } catch (error) {
            console.error('Error fetching random banners:', error);
            responseReturn(res, 500, { error: 'Internal server error fetching banners' });
        }
    };

    add_ad_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 403, { error: 'Permission denied. Admin access required.' });
        }

        const form = formidable({ multiples: true });
        form.parse(req, async (err, fields, files) => {
            if (err) {
                return responseReturn(res, 500, { error: 'Form parsing error' });
            }

            const { title, link, status, startDate, endDate } = fields;
            const { bannerImage } = files;

            if (!bannerImage) {
                return responseReturn(res, 400, { error: 'Banner image is required' });
            }
            if (!link) {
                return responseReturn(res, 400, { error: 'Link is required' });
            }

            let uploadResult = null;
            try {
                uploadResult = await cloudinary.uploader.upload(bannerImage.filepath, {
                    folder: 'ad_banners',
                });

                const bannerData = {
                    title: title || '',
                    bannerImage: uploadResult.secure_url,
                    link: link,
                    status: status || 'active',
                    startDate: startDate && !isNaN(new Date(startDate)) ? new Date(startDate) : undefined,
                    endDate: endDate && !isNaN(new Date(endDate)) ? new Date(endDate) : undefined,
                };

                const newAdBanner = await AdBanner.create(bannerData);
                responseReturn(res, 201, { message: 'Ad Banner added successfully', adBanner: newAdBanner });
            } catch (error) {
                console.error('Detailed Error in add_ad_banner:', error);
                if (uploadResult && uploadResult.public_id) {
                    try {
                        await cloudinary.uploader.destroy(uploadResult.public_id);
                    } catch (destroyError) {
                        console.error('Cloudinary cleanup failed:', destroyError);
                    }
                }
                responseReturn(res, 500, { error: 'Internal server error adding ad banner' });
            }
        });
    };

    get_admin_ad_banners = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 403, { error: 'Permission denied. Admin access required.' });
        }
        try {
            const adBanners = await AdBanner.find({}).sort({ createdAt: -1 }).lean();
            responseReturn(res, 200, { adBanners });
        } catch (error) {
            console.error('Error fetching admin ad banners:', error);
            responseReturn(res, 500, { error: 'Internal server error fetching ad banners' });
        }
    };

    get_active_ad_banners = async (req, res) => {
        try {
            const now = new Date();
            const activeAdBanners = await AdBanner.find({
                $and: [
                    { status: 'active' },
                    {
                        $or: [
                            { startDate: { $exists: false } },
                            { startDate: null },
                            { startDate: { $lte: now } },
                        ],
                    },
                    { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
                ],
            })
                .sort({ createdAt: -1 })
                .lean();
            responseReturn(res, 200, { activeAdBanners });
        } catch (error) {
            console.error('Error fetching active ad banners:', error);
            responseReturn(res, 500, { error: 'Internal server error fetching active ad banners' });
        }
    };

    update_ad_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 403, { error: 'Permission denied. Admin access required.' });
        }

        const { adBannerId } = req.params;
        if (!ObjectId.isValid(adBannerId)) {
            return responseReturn(res, 400, { error: 'Invalid Ad Banner ID format' });
        }

        const form = formidable({ multiples: true });
        form.parse(req, async (err, fields, files) => {
            if (err) {
                return responseReturn(res, 500, { error: 'Form parsing error' });
            }

            const { title, link, status, startDate, endDate } = fields;
            const { bannerImage } = files;
            const updateData = {};

            if (title !== undefined) updateData.title = title;
            if (link) updateData.link = link;
            if (status) updateData.status = status;

            if (startDate !== undefined) {
                updateData.startDate =
                    startDate && !isNaN(new Date(startDate)) ? new Date(startDate) : null;
            }
            if (endDate !== undefined) {
                updateData.endDate = endDate && !isNaN(new Date(endDate)) ? new Date(endDate) : null;
            }

            let uploadResult = null;
            let updatedAdBanner = null;

            try {
                const existingBanner = await AdBanner.findById(adBannerId);
                if (!existingBanner) {
                    return responseReturn(res, 404, { error: 'Ad Banner not found' });
                }
                let oldImageUrl = existingBanner.bannerImage;

                if (bannerImage) {
                    if (oldImageUrl) {
                        try {
                            const urlParts = oldImageUrl.split('/');
                            const filename = urlParts[urlParts.length - 1].split('.')[0];
                            const publicId = `ad_banners/${filename}`;
                            await cloudinary.uploader.destroy(publicId);
                        } catch (destroyError) {
                            console.error('Failed to delete old Cloudinary image:', destroyError);
                        }
                    }
                    uploadResult = await cloudinary.uploader.upload(bannerImage.filepath, {
                        folder: 'ad_banners',
                    });
                    updateData.bannerImage = uploadResult.secure_url;
                }

                updatedAdBanner = await AdBanner.findByIdAndUpdate(
                    adBannerId,
                    { $set: updateData },
                    { new: true }
                ).lean();

                if (!updatedAdBanner) {
                    if (uploadResult && uploadResult.public_id) {
                        try {
                            await cloudinary.uploader.destroy(uploadResult.public_id);
                        } catch (e) {}
                    }
                    return responseReturn(res, 404, { error: 'Ad Banner update failed.' });
                }

                responseReturn(res, 200, {
                    message: 'Ad Banner updated successfully',
                    adBanner: updatedAdBanner,
                });
            } catch (error) {
                console.error('Error updating ad banner:', error);
                if (uploadResult && uploadResult.public_id && !updatedAdBanner) {
                    try {
                        await cloudinary.uploader.destroy(uploadResult.public_id);
                    } catch (e) {}
                }
                responseReturn(res, 500, { error: 'Internal server error updating ad banner' });
            }
        });
    };

    delete_ad_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 403, { error: 'Permission denied. Admin access required.' });
        }

        const { adBannerId } = req.params;
        if (!ObjectId.isValid(adBannerId)) {
            return responseReturn(res, 400, { error: 'Invalid Ad Banner ID format' });
        }

        try {
            const adBannerToDelete = await AdBanner.findById(adBannerId);
            if (!adBannerToDelete) {
                return responseReturn(res, 404, { error: 'Ad Banner not found' });
            }

            await AdBanner.findByIdAndDelete(adBannerId);

            if (adBannerToDelete.bannerImage) {
                try {
                    const urlParts = adBannerToDelete.bannerImage.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];
                    const publicId = `ad_banners/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (destroyError) {
                    console.error('Failed to delete Cloudinary image:', destroyError);
                }
            }

            responseReturn(res, 200, { message: 'Ad Banner deleted successfully', adBannerId });
        } catch (error) {
            console.error('Error deleting ad banner:', error);
            responseReturn(res, 500, { error: 'Internal server error deleting ad banner' });
        }
    };
}

module.exports = new dashboardController();