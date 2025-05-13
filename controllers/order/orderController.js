
const authOrderModel = require('../../models/authOrder');
const customerOrder = require('../../models/customerOrder');
const myShopWallet = require('../../models/myShopWallet');
const sellerWallet = require('../../models/sellerWallet');
const cardModel = require('../../models/cardModel');
const productModel = require('../../models/productModel');
const Notification = require('../../models/notificationModel');
const moment = require('moment');
const { responseReturn } = require('../../utiles/response');
const { mongo: { ObjectId } } = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class orderController {
    paymentCheck = async (id) => {
        try {
            const order = await customerOrder.findById(id);
            if (order && order.payment_status === 'unpaid') {
                console.log(`Order ${id} unpaid after timeout. Cancelling...`);
                await customerOrder.findByIdAndUpdate(id, { delivery_status: 'cancelled' });
                await authOrderModel.updateMany({ orderId: new ObjectId(id) }, { delivery_status: 'cancelled' });
                console.log(`Order ${id} and associated suborders cancelled due to payment timeout.`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Error during paymentCheck for order ${id}:`, error);
        }
    };

    place_order = async (req, res) => {
        const { price, products, shipping_fee, shippingInfo, userId } = req.body;
        let authorOrderData = [];
        let cardIdsToDelete = [];
        const tempDate = moment(Date.now()).format('LLL');
        let customerOrderProducts = [];

        if (!price || !products || !products.length || !shipping_fee || !shippingInfo || !userId) {
            return responseReturn(res, 400, { message: 'Missing required order information.' });
        }

        try {
            for (const sellerProductGroup of products) {
                const sellerId = sellerProductGroup.sellerId;
                if (!sellerId) throw new Error('Missing sellerId in product group');
                let groupSubTotal = 0;
                let storePor = [];
                for (const cartItem of sellerProductGroup.products) {
                    if (!cartItem.productInfo || !cartItem.quantity) {
                        throw new Error(`Invalid product structure in cart item for seller ${sellerId}`);
                    }
                    const tempProduct = { ...cartItem.productInfo, quantity: cartItem.quantity };
                    customerOrderProducts.push(tempProduct);
                    storePor.push(tempProduct);
                    if (cartItem._id) cardIdsToDelete.push(cartItem._id);
                    groupSubTotal += (cartItem.productInfo.price * cartItem.quantity);
                }
                authorOrderData.push({
                    sellerId, products: storePor, price: groupSubTotal,
                    payment_status: 'unpaid', shippingInfo: shippingInfo.address || 'Customer Address Provided',
                    delivery_status: 'pending', date: tempDate,
                });
            }
        } catch (error) {
            console.error("Error processing order products:", error);
            return responseReturn(res, 400, { message: `Invalid product data: ${error.message}` });
        }

        try {
            const mainOrder = await customerOrder.create({
                customerId: userId, shippingInfo, products: customerOrderProducts,
                price: price + shipping_fee, payment_status: 'unpaid',
                delivery_status: 'pending', date: tempDate,
            });
            const finalAuthOrders = authorOrderData.map(ao => ({ ...ao, orderId: mainOrder._id }));
            await authOrderModel.insertMany(finalAuthOrders);

            if (cardIdsToDelete.length > 0) {
                for (const cardId of cardIdsToDelete) { await cardModel.findByIdAndDelete(cardId); }
                console.log(`Removed ${cardIdsToDelete.length} items from cart.`);
            }

            const paymentTimeout = parseInt(process.env.PAYMENT_TIMEOUT_MS || '900000');
            setTimeout(() => { this.paymentCheck(mainOrder._id); }, paymentTimeout);

            responseReturn(res, 201, { message: 'Order Placed Successfully. Please complete payment.', orderId: mainOrder._id });
        } catch (error) {
            console.error('Error during place_order DB operations:', error);
            responseReturn(res, 500, { message: 'Internal server error placing order.' });
        }
    };

    get_customer_dashboard_data = async (req, res) => {
        const { userId } = req.params;
        if (!userId || !ObjectId.isValid(userId)) return responseReturn(res, 400, { message: 'Invalid User ID.' });
        try {
            const [recentOrders, pendingOrder, totalOrder, cancelledOrder] = await Promise.all([
                customerOrder.find({ customerId: new ObjectId(userId) }).sort({ createdAt: -1 }).limit(5).lean(),
                customerOrder.countDocuments({ customerId: new ObjectId(userId), delivery_status: 'pending' }),
                customerOrder.countDocuments({ customerId: new ObjectId(userId) }),
                customerOrder.countDocuments({ customerId: new ObjectId(userId), delivery_status: 'cancelled' })
            ]);
            responseReturn(res, 200, { recentOrders, pendingOrder, totalOrder, cancelledOrder });
        } catch (error) {
            console.error('get_customer_dashboard_data error:', error);
            responseReturn(res, 500, { message: 'Internal server error' });
        }
    };

    get_orders = async (req, res) => {
        const { customerId, status } = req.params;
        if (!customerId || !ObjectId.isValid(customerId)) return responseReturn(res, 400, { message: 'Invalid Customer ID.' });
        try {
            let query = { customerId: new ObjectId(customerId) };
            if (status && status !== 'all') { query.delivery_status = status; }
            const orders = await customerOrder.find(query).sort({ createdAt: -1 }).lean();
            responseReturn(res, 200, { orders });
        } catch (error) {
            console.error('get_orders error:', error);
            responseReturn(res, 500, { message: 'Internal server error' });
        }
    };

    get_order_details = async (req, res) => {
        const { orderId } = req.params;
        if (!orderId || !ObjectId.isValid(orderId)) return responseReturn(res, 400, { message: 'Invalid Order ID.' });
        try {
            const order = await customerOrder.findById(orderId).lean();
            if (!order) return responseReturn(res, 404, { message: 'Order not found.' });
            responseReturn(res, 200, { order });
        } catch (error) {
            console.error('get_order_details error:', error);
            responseReturn(res, 500, { message: 'Internal server error' });
        }
    };

    get_admin_orders = async (req, res) => {
        let { page, searchValue, parPage, status } = req.query;
        page = parseInt(page) || 1; parPage = parseInt(parPage) || 10; const skipPage = parPage * (page - 1);
        try {
            let matchStage = {};
            if (status && status !== 'all') { matchStage.delivery_status = status; }
            if (searchValue) {
                const isObjectId = ObjectId.isValid(searchValue);
                matchStage.$or = [
                    { 'shippingInfo.name': { $regex: searchValue, $options: 'i' } },
                    { payment_status: { $regex: searchValue, $options: 'i' } },
                    { delivery_status: { $regex: searchValue, $options: 'i' } }
                ];
                if (isObjectId) {
                    matchStage.$or.push({ _id: new ObjectId(searchValue) });
                    matchStage.$or.push({ customerId: new ObjectId(searchValue) });
                }
            }
            const pipeline = [
                { $match: matchStage },
                { $sort: { createdAt: -1 } },
                { $lookup: { from: 'authororders', localField: '_id', foreignField: 'orderId', as: 'suborder' } },
                { $skip: skipPage },
                { $limit: parPage }
            ];
            const [orders, totalOrder] = await Promise.all([
                customerOrder.aggregate(pipeline),
                customerOrder.countDocuments(matchStage)
            ]);
            responseReturn(res, 200, { orders, totalOrder });
        } catch (error) {
            console.error('get_admin_orders error:', error);
            responseReturn(res, 500, { message: 'Internal server error fetching admin orders' });
        }
    };

    get_admin_order = async (req, res) => {
        const { orderId } = req.params;
        if (!orderId || !ObjectId.isValid(orderId)) return responseReturn(res, 400, { message: 'Invalid Order ID.' });
        try {
            const order = await customerOrder.aggregate([
                { $match: { _id: new ObjectId(orderId) } },
                { $lookup: { from: 'authororders', localField: '_id', foreignField: 'orderId', as: 'suborder' } },
                { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customerDetails' } },
                { $unwind: { path: '$customerDetails', preserveNullAndEmptyArrays: true } }
            ]);
            if (!order || order.length === 0) return responseReturn(res, 404, { message: 'Order not found.' });
            responseReturn(res, 200, { order: order[0] });
        } catch (error) {
            console.error(`get_admin_order error for ID ${orderId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error fetching order details.' });
        }
    };

    admin_order_status_update = async (req, res) => {
        const { orderId } = req.params;
        const { status } = req.body;
        if (!orderId || !ObjectId.isValid(orderId)) return responseReturn(res, 400, { message: 'Invalid Order ID.' });
        if (!status) return responseReturn(res, 400, { message: 'New status is required.' });
        const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!allowedStatuses.includes(status)) return responseReturn(res, 400, { message: `Invalid status value: ${status}` });
        try {
            const updatedOrder = await customerOrder.findByIdAndUpdate(orderId, { delivery_status: status }, { new: true });
            if (!updatedOrder) return responseReturn(res, 404, { message: 'Order not found for status update.' });
            await authOrderModel.updateMany({ orderId: new ObjectId(orderId) }, { delivery_status: status });
            responseReturn(res, 200, { message: 'Order Status updated successfully', order: updatedOrder });
        } catch (error) {
            console.error(`admin_order_status_update error for ID ${orderId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error updating order status.' });
        }
    };

    get_seller_orders = async (req, res) => {
        const { sellerId } = req.params;
        let { page, searchValue, parPage, status } = req.query;
        page = parseInt(page) || 1; parPage = parseInt(parPage) || 10; const skipPage = parPage * (page - 1);
        if (!sellerId || !ObjectId.isValid(sellerId)) return responseReturn(res, 400, { message: 'Invalid Seller ID.' });
        try {
            let matchQuery = { sellerId: new ObjectId(sellerId) };
            if (status && status !== 'all') matchQuery.delivery_status = status;
            if (searchValue) {
                if (ObjectId.isValid(searchValue)) matchQuery._id = new ObjectId(searchValue);
                else matchQuery.$or = [
                    { payment_status: { $regex: searchValue, $options: 'i' } },
                    { delivery_status: { $regex: searchValue, $options: 'i' } }
                ];
            }
            const [orders, totalOrder] = await Promise.all([
                authOrderModel.find(matchQuery).sort({ createdAt: -1 }).skip(skipPage).limit(parPage).lean(),
                authOrderModel.countDocuments(matchQuery)
            ]);
            console.log(`Fetched ${orders.length} of ${totalOrder} orders for sellerId: ${sellerId} (Page ${page}, Status: ${status || 'all'})`);
            responseReturn(res, 200, { orders, totalOrder });
        } catch (error) {
            console.error(`get_seller_orders error for sellerId ${sellerId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error fetching seller orders.' });
        }
    };

    get_seller_order = async (req, res) => {
        const { orderId } = req.params;
        const { id: sellerId } = req;
        if (!orderId || !ObjectId.isValid(orderId)) return responseReturn(res, 400, { message: 'Invalid Order ID.' });
        try {
            const order = await authOrderModel.findOne({ _id: new ObjectId(orderId), sellerId: new ObjectId(sellerId) }).lean();
            if (!order) return responseReturn(res, 404, { message: 'Order not found or access denied.' });
            responseReturn(res, 200, { order });
        } catch (error) {
            console.error(`get_seller_order error for ID ${orderId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error fetching seller order details.' });
        }
    };

    seller_order_status_update = async (req, res) => {
        const { orderId } = req.params;
        const { status } = req.body;
        const { id: sellerId } = req;
        if (!orderId || !ObjectId.isValid(orderId)) return responseReturn(res, 400, { message: 'Invalid Order ID.' });
        if (!status) return responseReturn(res, 400, { message: 'New status is required.' });
        const allowedSellerStatuses = ['processing', 'shipped', 'delivered'];
        if (!allowedSellerStatuses.includes(status)) return responseReturn(res, 403, { message: `Seller cannot set status to: ${status}` });
        try {
            const updatedOrder = await authOrderModel.findOneAndUpdate(
                { _id: new ObjectId(orderId), sellerId: new ObjectId(sellerId) },
                { delivery_status: status },
                { new: true }
            ).lean();
            if (!updatedOrder) return responseReturn(res, 404, { message: 'Order not found or you do not have permission to update it.' });
            responseReturn(res, 200, { message: 'Order status updated successfully', order: updatedOrder });
        } catch (error) {
            console.error(`seller_order_status_update error for ID ${orderId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error updating order status.' });
        }
    };

    create_payment = async (req, res) => {
        const { price } = req.body;
        if (!price || isNaN(price) || price <= 0) return responseReturn(res, 400, { message: 'Invalid price amount provided.' });
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(price * 100),
                currency: 'usd',
                automatic_payment_methods: { enabled: true }
            });
            responseReturn(res, 200, { clientSecret: paymentIntent.client_secret });
        } catch (error) {
            console.error('Stripe Payment Intent Creation Error:', error);
            responseReturn(res, 500, { message: 'Failed to create payment intent.' });
        }
    };

    order_confirm = async (req, res) => {
        const { orderId } = req.params;
        const { io } = req; // Get io from middleware
        const adminId = 'admin'; // Consistent with notificationController.js

        if (!orderId || !ObjectId.isValid(orderId)) {
            return responseReturn(res, 400, { message: 'Invalid Order ID provided.' });
        }

        try {
            // Check if already paid
            const cuOrderBeforeUpdate = await customerOrder.findById(orderId).lean();
            if (!cuOrderBeforeUpdate) {
                console.warn(`Order ${orderId} not found for confirmation.`);
                return responseReturn(res, 404, { message: 'Order not found for confirmation.' });
            }
            if (cuOrderBeforeUpdate.payment_status === 'paid') {
                console.log(`Order ${orderId} is already marked as paid. Skipping duplicate confirmation.`);
                return responseReturn(res, 200, { message: 'Order already confirmed.' });
            }

            // Update Statuses
            const [updatedCuOrderResult, updateAuResult] = await Promise.all([
                customerOrder.findByIdAndUpdate(orderId, { payment_status: 'paid', delivery_status: 'pending' }, { new: true }),
                authOrderModel.updateMany({ orderId: new ObjectId(orderId) }, { payment_status: 'paid', delivery_status: 'pending' })
            ]);

            if (!updatedCuOrderResult) {
                console.error(`Failed to update customerOrder ${orderId} to paid, though it existed.`);
                return responseReturn(res, 500, { message: 'Failed to update main order status during confirmation.' });
            }
            const updatedCuOrder = updatedCuOrderResult.toObject();

            // Wallet Updates
            const time = moment(Date.now()).format('l');
            const splitTime = time.split('/');
            const month = splitTime[0]; const year = splitTime[2];
            await myShopWallet.create({ amount: updatedCuOrder.price, month, year });
            const auOrders = await authOrderModel.find({ orderId: new ObjectId(orderId) }).lean();
            for (let i = 0; i < auOrders.length; i++) {
                if (auOrders[i].sellerId && auOrders[i].price > 0) {
                    await sellerWallet.create({ sellerId: auOrders[i].sellerId.toString(), amount: auOrders[i].price, month, year });
                }
            }
            console.log(`Wallets updated for order ${orderId}.`);

            // Save and Emit Notifications
            if (updatedCuOrder) {
                // Admin Notification
                const adminNotificationData = {
                    recipientId: adminId,
                    type: 'order',
                    message: `Order #${updatedCuOrder._id.toString().slice(-6)} confirmed (Paid). Total: ${updatedCuOrder.price.toFixed(2)} DA`,
                    link: `/admin/dashboard/order/details/${updatedCuOrder._id}`,
                    status: 'unread',
                    createdAt: new Date()
                };
                try {
                    const adminNotification = await Notification.create(adminNotificationData);
                    if (io) {
                        const adminUnreadCount = await Notification.countDocuments({ recipientId: adminId, status: 'unread' });
                        io.to('admin').emit('unread_count_update', { unreadCount: adminUnreadCount });
                        io.to('admin').emit('new_notification', {
                            _id: adminNotification._id,
                            recipientId: adminNotification.recipientId,
                            type: adminNotification.type,
                            message: adminNotification.message,
                            link: adminNotification.link,
                            status: adminNotification.status,
                            createdAt: adminNotification.createdAt,
                            unreadCount: adminUnreadCount
                        });
                        console.log(`[OrderController] Emitted unread_count_update (${adminUnreadCount}) and new_notification to admin room for order ${orderId}`);
                    }
                } catch (dbError) {
                    console.error(`Error saving/emitting admin notification for order ${orderId}:`, dbError);
                }

                // Seller Notifications
                for (const auOrder of auOrders) {
                    if (auOrder.sellerId) {
                        const sellerNotificationData = {
                            recipientId: auOrder.sellerId.toString(),
                            type: 'order',
                            message: `New order #${auOrder._id.toString().slice(-6)} confirmed. Total: ${auOrder.price.toFixed(2)} DA`,
                            link: `/seller/dashboard/order/details/${auOrder._id}`,
                            status: 'unread',
                            createdAt: new Date()
                        };
                        try {
                            const sellerNotification = await Notification.create(sellerNotificationData);
                            if (io) {
                                const sellerUnreadCount = await Notification.countDocuments({ recipientId: auOrder.sellerId, status: 'unread' });
                                io.to(auOrder.sellerId.toString()).emit('unread_count_update', { unreadCount: sellerUnreadCount });
                                io.to(auOrder.sellerId.toString()).emit('new_notification', {
                                    _id: sellerNotification._id,
                                    recipientId: sellerNotification.recipientId,
                                    type: sellerNotification.type,
                                    message: sellerNotification.message,
                                    link: sellerNotification.link,
                                    status: sellerNotification.status,
                                    createdAt: sellerNotification.createdAt,
                                    unreadCount: sellerUnreadCount
                                });
                                console.log(`[OrderController] Emitted unread_count_update (${sellerUnreadCount}) and new_notification to seller room ${auOrder.sellerId} for order ${auOrder._id}`);
                            }
                        } catch (dbError) {
                            console.error(`Error saving/emitting seller notification for order ${auOrder._id}, seller ${auOrder.sellerId}:`, dbError);
                        }
                    }
                }
            }

            responseReturn(res, 200, { message: 'Order confirmed successfully.' });
        } catch (error) {
            console.error(`Error confirming order ${orderId}:`, error);
            responseReturn(res, 500, { message: 'Internal server error during order confirmation.' });
        }
    };
}

module.exports = new orderController();