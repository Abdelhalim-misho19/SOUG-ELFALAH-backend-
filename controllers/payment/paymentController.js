const sellerModel = require('../../models/sellerModel');
const stripeModel = require('../../models/stripeModel');
const sellerWallet = require('../../models/sellerWallet');
const withdrowRequest = require('../../models/withdrowRequest');
const notificationModel = require('../../models/notificationModel');
const { v4: uuidv4 } = require('uuid');
const { responseReturn } = require('../../utiles/response');
const { mongo: { ObjectId } } = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class paymentController {
    create_stripe_connect_account = async(req, res) => {
        const { id } = req;
        const uid = uuidv4();

        try {
            const stripeInfo = await stripeModel.findOne({ sellerId: id });

            if (stripeInfo) {
                await stripeModel.deleteOne({ sellerId: id });
                const account = await stripe.accounts.create({ type: 'express' });

                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: 'http://localhost:3001/refresh',
                    return_url: `http://localhost:3001/success?activeCode=${uid}`,
                    type: 'account_onboarding'
                });
                await stripeModel.create({
                    sellerId: id,
                    stripeId: account.id,
                    code: uid
                });
                responseReturn(res, 201, { url: accountLink.url });
            } else {
                const account = await stripe.accounts.create({ type: 'express' });

                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: 'http://localhost:3001/refresh',
                    return_url: `http://localhost:3001/success?activeCode=${uid}`,
                    type: 'account_onboarding'
                });
                await stripeModel.create({
                    sellerId: id,
                    stripeId: account.id,
                    code: uid
                });
                responseReturn(res, 201, { url: accountLink.url });
            }
        } catch (error) {
            console.log('stripe connect account error' + error.message);
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }

    active_stripe_connect_account = async(req, res) => {
        const { activeCode } = req.params;
        const { id } = req;

        try {
            const userStripeInfo = await stripeModel.findOne({ code: activeCode });

            if (userStripeInfo) {
                await sellerModel.findByIdAndUpdate(id, {
                    payment: 'active'
                });
                responseReturn(res, 200, { message: 'payment Active' });
            } else {
                responseReturn(res, 404, { message: 'payment Active Fails' });
            }
        } catch (error) {
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }

    sumAmount = (data) => {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum = sum + data[i].amount;
        }
        return sum;
    }

    get_seller_payment_details = async(req, res) => {
        const { sellerId } = req.params;

        try {
            const payments = await sellerWallet.find({ sellerId });

            const pendingWithdrows = await withdrowRequest.find({
                $and: [
                    {
                        sellerId: {
                            $eq: sellerId
                        }
                    },
                    {
                        status: {
                            $eq: 'pending'
                        }
                    }
                ]
            });

            const successWithdrows = await withdrowRequest.find({
                $and: [
                    {
                        sellerId: {
                            $eq: sellerId
                        }
                    },
                    {
                        status: {
                            $eq: 'success'
                        }
                    }
                ]
            });

            const pendingAmount = this.sumAmount(pendingWithdrows);
            const withdrowAmount = this.sumAmount(successWithdrows);
            const totalAmount = this.sumAmount(payments);

            let availableAmount = 0;

            if (totalAmount > 0) {
                availableAmount = totalAmount - (pendingAmount + withdrowAmount);
            }

            responseReturn(res, 200, {
                totalAmount,
                pendingAmount,
                withdrowAmount,
                availableAmount,
                pendingWithdrows,
                successWithdrows
            });
        } catch (error) {
            console.log(error.message);
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }

    withdrowal_request = async(req, res) => {
        const { amount, sellerId } = req.body;
        const { io } = req;

        try {
            // Ensure sellerId is treated as an ObjectId
            const sellerObjectId = new ObjectId(sellerId);
            const withdrowal = await withdrowRequest.create({
                sellerId: sellerObjectId, // Store as ObjectId
                amount: parseInt(amount)
            });

            const seller = await sellerModel.findById(sellerObjectId);
            const notification = await notificationModel.create({
                recipientId: 'admin',
                type: 'withdrawal',
                message: `New withdrawal request of ${amount} DA from seller ${seller?.shopInfo?.shopName || seller?.name || 'Unknown'} (ID: ${sellerId}).`,
                link: '/admin/dashboard/payment-request',
                status: 'unread'
            });

            if (io) {
                const newUnreadCount = await notificationModel.countDocuments({ recipientId: 'admin', status: 'unread' });
                io.to('admin').emit('unread_count_update', { unreadCount: newUnreadCount });
                io.to('admin').emit('new_notification', {
                    _id: notification._id,
                    recipientId: notification.recipientId,
                    type: notification.type,
                    message: notification.message,
                    link: notification.link,
                    status: notification.status,
                    createdAt: notification.createdAt,
                    unreadCount: newUnreadCount
                });
                console.log(`[PaymentController] Emitted unread_count_update (${newUnreadCount}) and new_notification to admin room`);
            } else {
                console.log('[PaymentController] Socket.io not available, notifications not emitted');
            }

            responseReturn(res, 200, { withdrowal, message: 'Withdrawal Request Sent' });
        } catch (error) {
            console.log(error);
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }

    get_payment_request = async(req, res) => {
        try {
            const withdrowalRequest = await withdrowRequest.find({ status: 'pending' }).populate({
                path: 'sellerId',
                select: 'shopInfo name' // Include shopInfo and name
            });
            responseReturn(res, 200, { withdrowalRequest });
        } catch (error) {
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }

    payment_request_confirm = async(req, res) => {
        const { paymentId } = req.body;
        const { io } = req;

        try {
            const payment = await withdrowRequest.findById(paymentId).populate('sellerId');
            if (!payment) {
                return responseReturn(res, 404, { message: 'Withdrawal request not found.' });
            }
            const { stripeId } = await stripeModel.findOne({
                sellerId: payment.sellerId._id // Use populated sellerId
            });
            if (!stripeId) {
                return responseReturn(res, 400, { message: 'Seller Stripe account not found.' });
            }

            await stripe.transfers.create({
                amount: payment.amount * 100,
                currency: 'usd',
                destination: stripeId
            });

            const updatedPayment = await withdrowRequest.findByIdAndUpdate(paymentId, { status: 'success' }, { new: true }).populate('sellerId');

            const sellerNotificationData = {
                recipientId: payment.sellerId._id.toString(),
                type: 'withdrawal',
                message: `Your withdrawal request of ${payment.amount.toFixed(2)} DA has been confirmed.`,
                link: '/seller/dashboard/payments',
                status: 'unread',
                createdAt: new Date()
            };
            const sellerNotification = await notificationModel.create(sellerNotificationData);

            if (io) {
                const sellerUnreadCount = await notificationModel.countDocuments({ recipientId: payment.sellerId._id, status: 'unread' });
                io.to(payment.sellerId._id.toString()).emit('unread_count_update', { unreadCount: sellerUnreadCount });
                io.to(payment.sellerId._id.toString()).emit('new_notification', {
                    _id: sellerNotification._id,
                    recipientId: sellerNotification.recipientId,
                    type: sellerNotification.type,
                    message: sellerNotification.message,
                    link: sellerNotification.link,
                    status: sellerNotification.status,
                    createdAt: sellerNotification.createdAt,
                    unreadCount: sellerUnreadCount
                });
                console.log(`[PaymentController] Emitted unread_count_update (${sellerUnreadCount}) and new_notification to seller room ${payment.sellerId._id} for withdrawal ${paymentId}`);
            } else {
                console.log('[PaymentController] Socket.io not available, seller notification not emitted for withdrawal');
            }

            responseReturn(res, 200, { payment: updatedPayment, message: 'Request Confirm Success' });
        } catch (error) {
            console.error(`[PaymentController] Error confirming withdrawal request ${paymentId}:`, error);
            responseReturn(res, 500, { message: 'Internal Server Error' });
        }
    }
}

module.exports = new paymentController();