
const bookingModel = require('../models/bookingModel');
const notificationModel = require('../models/notificationModel'); // Added for notifications
const { responseReturn } = require('../utiles/response');
const { mongo: { ObjectId } } = require('mongoose');

class BookingController {
    // --- create_booking ---
    create_booking = async (req, res) => {
        console.log("--- create_booking controller hit ---");
        console.log("Received booking data in req.body:", req.body);

        const {
            userId, userName, userPhone,
            serviceId, serviceName, servicePrice,
            providerId,
            providerName, providerPhone,
            date, time, notes, status
        } = req.body;
        const { io } = req; // Get io from middleware

        // Backend validation
        if (!userId || !userName || !userPhone || !serviceId || !serviceName || servicePrice === undefined ||
            !providerId || !providerName || !date || !time) {
            console.error("Booking validation failed: Missing required fields.");
            return responseReturn(res, 400, { message: 'Missing required booking information (incl. providerId).' });
        }
        if (!ObjectId.isValid(userId) || !ObjectId.isValid(providerId) || !ObjectId.isValid(serviceId)) {
            console.error("Booking validation failed: Invalid ObjectId format.");
            return responseReturn(res, 400, { message: 'Invalid ID format for user, provider, or service.' });
        }

        try {
            console.log("Attempting to save booking to DB...");
            const newBooking = await bookingModel.create({
                userId: new ObjectId(userId),
                userName,
                userPhone,
                serviceId: new ObjectId(serviceId),
                serviceName,
                servicePrice,
                providerId: new ObjectId(providerId),
                providerName,
                providerPhone: providerPhone || null,
                date,
                time,
                notes: notes || '',
                status: status || 'Pending',
            });
            console.log("Booking saved successfully to DB with ID:", newBooking._id);

            // Create a notification for the seller
            const notification = await notificationModel.create({
                recipientId: providerId,
                type: 'booking',
                message: `New booking from ${userName} for ${serviceName} on ${date} at ${time}`,
                link: `/seller/dashboard/bookings/${newBooking._id}`,
                status: 'unread'
            });

            // Emit notification to the specific seller's socket room
            if (io) {
                const newUnreadCount = await notificationModel.countDocuments({ recipientId: providerId, status: 'unread' });
                io.to(providerId).emit('new_notification', {
                    _id: notification._id,
                    recipientId: notification.recipientId,
                    type: notification.type,
                    message: notification.message,
                    link: notification.link,
                    status: notification.status,
                    createdAt: notification.createdAt,
                    unreadCount: newUnreadCount
                });
                io.to(providerId).emit('unread_count_update', { unreadCount: newUnreadCount });
                console.log(`[BookingController] Emitted new_notification and unread_count_update (${newUnreadCount}) to seller room: ${providerId}`);
            } else {
                console.log('[BookingController] Socket.io not available, notifications not emitted');
            }

            responseReturn(res, 201, { message: "Booking request submitted successfully!", booking: newBooking });

        } catch (error) {
            console.error("DB Error creating booking:", error.message);
            console.error("Full DB Error Object:", error);
            responseReturn(res, 500, { message: 'Failed to save booking request.', error: error.message });
        }
    }

    // --- get_my_bookings (for Customer) ---
    get_my_bookings = async (req, res) => {
        const { userId } = req.params;
        if (!userId || !ObjectId.isValid(userId)) {
            return responseReturn(res, 400, { message: 'Valid User ID is required.' });
        }
        try {
            const bookings = await bookingModel.find({ userId: new ObjectId(userId) })
                                                .sort({ createdAt: -1 });
            responseReturn(res, 200, { bookings });
        } catch (error) {
            console.error(`DB Error fetching bookings for user ${userId}:`, error.message);
            responseReturn(res, 500, { message: 'Internal server error fetching bookings.', error: error.message });
        }
    }

    // --- get_booking_details (for anyone with ID) ---
    get_booking_details = async (req, res) => {
        const { bookingId } = req.params;
        if (!bookingId || !ObjectId.isValid(bookingId)) {
            return responseReturn(res, 400, { message: 'Valid Booking ID is required.' });
        }
        try {
            const booking = await bookingModel.findById(bookingId);
            if (!booking) {
                return responseReturn(res, 404, { message: 'Booking not found.' });
            }
            responseReturn(res, 200, { booking });
        } catch (error) {
            console.error(`DB Error fetching booking details for ${bookingId}:`, error.message);
            responseReturn(res, 500, { message: 'Internal server error fetching booking details.', error: error.message });
        }
    }

    // --- get_seller_bookings ---
    get_seller_bookings = async (req, res) => {
        const { sellerId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const parPage = parseInt(req.query.parPage) || 5;
        const searchValue = req.query.searchValue || '';

        console.log(`--- get_seller_bookings controller hit for sellerId: ${sellerId}, page: ${page}, search: ${searchValue} ---`);

        if (!sellerId || !ObjectId.isValid(sellerId)) {
            console.error("Invalid sellerId provided for get_seller_bookings:", sellerId);
            return responseReturn(res, 400, { message: 'Valid Seller ID is required.' });
        }

        try {
            let query = { providerId: new ObjectId(sellerId) };

            if (searchValue) {
                query.$or = [
                    { userName: { $regex: searchValue, $options: 'i' } },
                    { serviceName: { $regex: searchValue, $options: 'i' } },
                    { status: { $regex: searchValue, $options: 'i' } }
                ];
            }

            console.log(`Attempting to find bookings with query:`, query);

            const totalBookings = await bookingModel.countDocuments(query);
            const bookings = await bookingModel.find(query)
                                                .skip((page - 1) * parPage)
                                                .limit(parPage)
                                                .sort({ createdAt: -1 });

            console.log(`Found ${bookings.length} bookings (total ${totalBookings}) for seller ${sellerId}.`);
            responseReturn(res, 200, { bookings, totalBookings });

        } catch (error) {
            console.error(`DB Error fetching bookings for seller ${sellerId}:`, error.message);
            console.error("Full DB Error Object:", error);
            responseReturn(res, 500, { message: 'Internal server error fetching seller bookings.', error: error.message });
        }
    }

    // --- update_booking_status ---
    update_booking_status = async (req, res) => {
        const { bookingId } = req.params;
        const { status } = req.body;

        console.log(`--- update_booking_status controller hit for bookingId: ${bookingId} with status: ${status} ---`);

        if (!bookingId || !ObjectId.isValid(bookingId)) {
            console.error("Invalid bookingId provided for status update:", bookingId);
            return responseReturn(res, 400, { message: 'Valid Booking ID is required.' });
        }

        const allowedStatuses = ['Confirmed', 'Cancelled', 'Completed', 'No Show'];
        if (!status || !allowedStatuses.includes(status)) {
            console.error("Invalid status provided:", status);
            return responseReturn(res, 400, { message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
        }

        try {
            console.log(`Attempting to update booking ${bookingId} to status ${status}`);

            const updatedBooking = await bookingModel.findByIdAndUpdate(
                bookingId,
                { $set: { status: status } },
                { new: true }
            );

            if (!updatedBooking) {
                console.log(`Booking not found with ID: ${bookingId} for status update.`);
                return responseReturn(res, 404, { message: 'Booking not found.' });
            }

            console.log(`Booking ${bookingId} status updated successfully to ${status}.`);
            responseReturn(res, 200, { message: `Booking status updated to ${status}.`, booking: updatedBooking });

        } catch (error) {
            console.error(`DB Error updating status for booking ${bookingId}:`, error.message);
            console.error("Full DB Error Object:", error);
            responseReturn(res, 500, { message: 'Internal server error updating booking status.', error: error.message });
        }
    }
}

module.exports = new BookingController();
