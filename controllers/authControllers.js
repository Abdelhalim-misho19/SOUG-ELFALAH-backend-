// controllers/authControllers.js

// --- Model Imports ---
const adminModel = require('../models/adminModel');
const sellerModel = require('../models/sellerModel');
const sellerCustomerModel = require('../models/chat/sellerCustomerModel');
const notificationModel = require('../models/notificationModel');

// --- Utility Imports ---
const { responseReturn } = require('../utiles/response');
const { createToken } = require('../utiles/tokenCreate');
const sendEmail = require('../utiles/sendEmail');

// --- Library Imports ---
const bcrpty = require('bcrypt');
const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
const otpGenerator = require('otp-generator');
const crypto = require('crypto');

// --- Configure Cloudinary (Ensure this runs, e.g., in server startup or here) ---
cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
    secure: true
});

class authControllers {

    // === ADMIN LOGIN ===
    admin_login = async(req, res) => {
        const {email, password} = req.body;
        if (!email || !password) return responseReturn(res, 400, { error: "Email and Password are required." });

        try {
            const admin = await adminModel.findOne({ email }).select('+password');
            if (!admin) return responseReturn(res, 404, { error: "Email not Found" });

            const match = await bcrpty.compare(password, admin.password);
            if (!match) return responseReturn(res, 401, { error: "Incorrect Password" });

            const tokenPayload = { id: admin.id, role: admin.role };
            const token = await createToken(tokenPayload);

            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            responseReturn(res, 200, {token, message: "Admin Login Successful"});

        } catch (error) {
            console.error("[admin_login] Server Error: ", error);
            responseReturn(res, 500, {error: "Internal Server Error"});
        }
    }

    // === SELLER LOGIN ===
    seller_login = async(req, res) => {
        const {email, password} = req.body;
        if (!email || !password) return responseReturn(res, 400, { error: "Email and Password are required." });

        try {
            const seller = await sellerModel.findOne({ email }).select('+password');
            if (!seller) return responseReturn(res, 404, { error: "Email not Found" });

            // Check Seller Status before allowing login
            if (seller.status === 'unverified') {
                return responseReturn(res, 401, { error: "Account not verified. Please check email for OTP." });
            }
           /* if (seller.status === 'pending') {
                return responseReturn(res, 401, { error: "Account registration pending admin approval." });
            }
            if (seller.status === 'deactive') {
                 return responseReturn(res, 401, { error: "Account deactivated. Please contact support." });
            }*/
            // Only proceed if status is 'active' (or adjust logic as needed)

            const match = await bcrpty.compare(password, seller.password);
            if (!match) return responseReturn(res, 401, { error: "Incorrect Password" });

            const tokenPayload = { id: seller.id, role: seller.role };
            const token = await createToken(tokenPayload);

            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            responseReturn(res, 200, { token, message: "Seller Login Successful" });

        } catch (error) {
             console.error("[seller_login] Server Error: ", error);
            responseReturn(res, 500, {error: "Internal Server Error"});
        }
    }

    // === REQUEST SELLER OTP (Registration Step 1) ===
    request_seller_otp = async (req, res) => {
        const { email, name, password } = req.body;
        console.log('[request_seller_otp] Received:', { email, name });

        if (!email || !name || !password) return responseReturn(res, 400, { error: 'Name, email, and password are required.' });
        if (password.length < 8) return responseReturn(res, 400, { error: 'Password must be at least 8 characters.' });
        // Add email format validation if not done by Mongoose schema

        try {
            const existingSeller = await sellerModel.findOne({ email });

            if (existingSeller && existingSeller.status !== 'unverified') {
                return responseReturn(res, 409, { error: 'This email is already registered and processed.' });
            }

            const otp = otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false });
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity
            const hashedPassword = await bcrpty.hash(password, 10);

            let seller;
            if (existingSeller) { // Found an 'unverified' account
                console.log(`[request_seller_otp] Updating existing unverified seller: ${email}`);
                existingSeller.name = name;
                existingSeller.password = hashedPassword;
                existingSeller.otp = otp;
                existingSeller.otpExpires = otpExpires;
                existingSeller.method = 'manual';
                existingSeller.status = 'unverified'; // Ensure status remains unverified
                seller = await existingSeller.save();
            } else { // Create new account
                console.log(`[request_seller_otp] Creating new unverified seller: ${email}`);
                seller = await sellerModel.create({
                    name, email, password: hashedPassword, method: 'manual',
                    shopInfo: {}, status: 'unverified', otp, otpExpires
                });
            }

            // Send OTP Email
            const emailSubject = `Your ${process.env.EMAIL_FROM_NAME || 'App'} Verification Code`;
            const emailHtml = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px; max-width: 550px; margin: 20px auto; background-color: #f9f9f9;">
                    <h2 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Verify Your Email Address</h2>
                    <p style="color: #555;">Hi ${name},</p>
                    <p style="color: #555;">Thank you for registering. Use the following One-Time Password (OTP) to verify your email:</p>
                    <p style="font-size: 28px; font-weight: bold; text-align: center; background-color: #fff; border: 1px dashed #ccc; padding: 15px; margin: 20px 0; border-radius: 4px; letter-spacing: 4px; color: #1b5e20;">
                        ${otp}
                    </p>
                    <p style="color: #555;">This OTP is valid for the next 10 minutes.</p>
                    <p style="color: #555;">If you didn't request this, you can safely ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
                    <p style="font-size: 0.9em; color: #888; text-align: center;">© ${new Date().getFullYear()} ${process.env.EMAIL_FROM_NAME || 'Your Application'}</p>
                </div>`;

            const emailSent = await sendEmail({ email: seller.email, subject: emailSubject, html: emailHtml });

            if (!emailSent) {
                console.error(`[request_seller_otp] CRITICAL: Failed to send OTP email to ${seller.email}.`);
                // Optionally delete the seller record if email fails
                // await sellerModel.findByIdAndDelete(seller._id);
                return responseReturn(res, 500, { error: 'Could not send verification email. Please check your email address or try again later.' });
            }

            console.log(`[request_seller_otp] OTP Email instruction sent to ${email}.`);
            responseReturn(res, 200, {
                message: 'Verification OTP sent successfully. Please check your email.',
                email: seller.email
            });

        } catch (error) {
            console.error('[request_seller_otp] Server Error:', error);
            if (error.code === 11000) return responseReturn(res, 409, { error: 'This email address is already registered.' });
            responseReturn(res, 500, { error: 'Internal Server Error during registration.' });
        }
    }

    // === VERIFY SELLER OTP (Registration Step 2) ===
    verify_seller_otp = async (req, res) => {
        const { email, otp } = req.body;
        const { io } = req; // Assuming io is attached to req by a middleware
        console.log('[verify_seller_otp] Received:', { email, otp });

        if (!email || !otp) return responseReturn(res, 400, { error: 'Email and OTP are required.' });
        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) return responseReturn(res, 400, { error: 'Invalid OTP format.' });

        try {
            const seller = await sellerModel.findOne({ email: email, status: 'unverified' }).select('+otp +otpExpires');

            if (!seller) return responseReturn(res, 400, { error: 'Invalid request or verification already completed.' });
            if (!seller.otpExpires || seller.otpExpires < Date.now()) {
                seller.otp = undefined; seller.otpExpires = undefined; await seller.save(); // Clear expired OTP
                return responseReturn(res, 400, { error: 'OTP has expired. Please register again.' });
            }
            if (!seller.otp || seller.otp !== otp) return responseReturn(res, 400, { error: 'The OTP you entered is incorrect.' });

            // --- OTP Verified ---
            console.log(`[verify_seller_otp] OTP verified for: ${email}`);
            seller.status = 'pending'; // Ready for admin review
            seller.otp = undefined;
            seller.otpExpires = undefined;
            await seller.save();

            // Create Chat entry & Notify Admin
            try {
                await sellerCustomerModel.create({ myId: seller.id });
                const admin = await adminModel.findOne({});
                if (admin) {
                    const notification = await notificationModel.create({
                        recipientId: 'admin', type: 'seller_request',
                        message: `Seller ${seller.name} (${seller.email}) verified email, pending review.`,
                        link: '/admin/dashboard/sellers-request', status: 'unread',
                    });
                    if (io) {
                        const unreadCount = await notificationModel.countDocuments({ recipientId: 'admin', status: 'unread' });
                        io.to('admin').emit('unread_count_update', { unreadCount });
                        io.to('admin').emit('new_notification', { notification, unreadCount });
                        console.log(`[verify_seller_otp] Emitted admin notifications via socket for: ${email}`);
                    } else {
                         console.warn('[verify_seller_otp] Socket.io (io) not available on req object. Cannot emit real-time notification.');
                    }
                } else console.warn('[verify_seller_otp] Admin user not found for notification.');
            } catch (relatedDataError) {
                 console.error(`[verify_seller_otp] Non-critical error creating related data for ${email}: `, relatedDataError);
            }

            // Generate JWT and set cookie
            const tokenPayload = { id: seller.id, role: seller.role };
            const token = await createToken(tokenPayload);
            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict'
            });
            responseReturn(res, 200, { token, message: 'Email verified successfully! Account pending admin approval.' });

        } catch (error) {
            console.error('[verify_seller_otp] Server Error:', error);
            responseReturn(res, 500, { error: 'Internal Server Error during OTP verification.' });
        }
    }

    // === REQUEST PASSWORD RESET ===
    requestPasswordReset = async (req, res) => {
        const { email } = req.body;
        console.log('[requestPasswordReset] Request for email:', email);
        if (!email) return responseReturn(res, 400, { error: 'Email address is required.' });

        try {
            const seller = await sellerModel.findOne({
                email: email,
                status: { $in: ['active', 'pending', 'deactive'] } // Allow reset for these statuses
            });

            // Always send a generic success message to prevent email enumeration
            const genericSuccessMessage = 'If an account with that email exists, a password reset link has been sent.';

            if (!seller) {
                console.log(`[requestPasswordReset] Seller not found/eligible: ${email}`);
                return responseReturn(res, 200, { message: genericSuccessMessage });
            }

            // Generate Reset Token and Expiry
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            const resetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

            seller.passwordResetToken = hashedToken;
            seller.passwordResetExpires = resetExpires;
            await seller.save();
            console.log(`[requestPasswordReset] Reset token generated for: ${email}`);

            // Send Reset Email
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password/${resetToken}`; // Ensure FRONTEND_URL is set in .env
            const emailSubject = `Password Reset for ${process.env.EMAIL_FROM_NAME || 'Your App'}`;
            const emailHtml = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px; max-width: 550px; margin: 20px auto; background-color: #f9f9f9;">
                     <h2 style="color: #333;">Password Reset Request</h2>
                     <p>Hi ${seller.name || 'there'},</p>
                     <p>Click the link below to reset your password:</p>
                     <p style="text-align: center; margin: 25px 0;">
                         <a href="${resetUrl}" style="background-color: #facc15; color: #1f2937; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                     </p>
                     <p>This link is valid for 10 minutes. If you didn't request this, please ignore this email.</p>
                </div>`;

            const emailSent = await sendEmail({ email: seller.email, subject: emailSubject, html: emailHtml });

            if (!emailSent) {
                console.error(`[requestPasswordReset] CRITICAL: Failed to send password reset email to ${seller.email}.`);
                seller.passwordResetToken = undefined; seller.passwordResetExpires = undefined; await seller.save(); // Clear token on failure
                return responseReturn(res, 500, { error: 'Could not send password reset email. Try again later.' });
            }

            // Return generic success message
            return responseReturn(res, 200, { message: genericSuccessMessage });

        } catch (error) {
            console.error('[requestPasswordReset] Server Error:', error);
            // Attempt cleanup on error
            try {
                const sellerOnError = await sellerModel.findOne({ email: email });
                if (sellerOnError?.passwordResetToken) {
                    sellerOnError.passwordResetToken = undefined; sellerOnError.passwordResetExpires = undefined; await sellerOnError.save();
                }
            } catch (cleanupError) {console.error('[requestPasswordReset] Error during error cleanup:', cleanupError);}
            return responseReturn(res, 500, { error: 'Internal Server Error requesting password reset.' });
        }
    }

    // === RESET PASSWORD (using token) ===
    resetPassword = async (req, res) => {
        const { token } = req.params;
        const { password, confirmPassword } = req.body;
        console.log('[resetPassword] Request with token (start):', token?.substring(0, 5));

        if (!password || !confirmPassword) return responseReturn(res, 400, { error: 'New password and confirmation are required.' });
        if (password !== confirmPassword) return responseReturn(res, 400, { error: 'Passwords do not match.' });
        if (password.length < 8) return responseReturn(res, 400, { error: 'Password must be at least 8 characters.' });

        try {
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            const seller = await sellerModel.findOne({
                passwordResetToken: hashedToken,
                passwordResetExpires: { $gt: Date.now() } // Token must exist and not be expired
            }).select('+password'); // Select password field to update it

            if (!seller) return responseReturn(res, 400, { error: 'Password reset token is invalid or has expired.' });

            // --- Token Valid ---
            const newHashedPassword = await bcrpty.hash(password, 10);

            // Check if new password is same as old (optional but good practice)
            // const isSamePassword = await bcrpty.compare(password, seller.password);
            // if (isSamePassword) return responseReturn(res, 400, { error: 'New password cannot be the same as the old password.' });


            seller.password = newHashedPassword;
            seller.passwordResetToken = undefined; // Invalidate token
            seller.passwordResetExpires = undefined;
            // Optionally add passwordChangedAt = Date.now(); if needed elsewhere
            await seller.save();
            console.log(`[resetPassword] Password reset successful for user ID: ${seller._id}`);

            // Optional: Send confirmation email
            try {
                 await sendEmail({
                     email: seller.email, subject: `Password Changed Successfully`,
                     html: `<p>Hi ${seller.name || 'there'},</p><p>Your password for ${process.env.EMAIL_FROM_NAME || 'Your App'} was successfully changed. If you did not make this change, contact support immediately.</p>`
                 });
            } catch (emailError) { console.error(`[resetPassword] Failed to send confirmation email to ${seller.email}:`, emailError); }

            responseReturn(res, 200, { message: 'Password reset successfully. You can now login.' });

        } catch (error) {
            console.error('[resetPassword] Server Error:', error);
            responseReturn(res, 500, { error: 'Internal Server Error resetting password.' });
        }
    }

    // === GET USER INFO (Authenticated Route) ===
    getUser = async(req, res) => {
        const { id, role } = req; // From authMiddleware
        if (!id || !role) return responseReturn(res, 401, { error: 'Authentication details missing.' });

        try {
            let userInfo = null;
            if (role === 'admin') userInfo = await adminModel.findById(id);
            else if (role === 'seller') userInfo = await sellerModel.findById(id);
            else return responseReturn(res, 403, { error: 'Invalid user role.' });

            if (!userInfo) return responseReturn(res, 404, { error: 'User not found.' });

            responseReturn(res, 200, { userInfo });

        } catch (error) {
             console.error("[getUser] Server Error: ", error);
            responseReturn(res, 500, { error: 'Internal Server Error' });
        }
    }

    // === PROFILE IMAGE UPLOAD (Seller Only) ===
    profile_image_upload = async(req, res) => {
        const { id, role } = req;
        if (role !== 'seller') return responseReturn(res, 403, { error: 'Forbidden.' });

        const form = formidable({ multiples: false }); // multiples: false is correct for single file upload

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error("[profile_image_upload] Formidable parsing error:", err);
                return responseReturn(res, 400, { error: 'Error parsing form data.' });
            }

            // --- CORRECTED FILE ACCESS ---
            // The field name 'image' comes from formData.append('image', file) in your frontend.
            const imageFile = files.image;
            // --- END CORRECTION ---

            if (!imageFile) {
                // Add a log to see what 'files' contains if 'imageFile' is not found
                // This can help in debugging if the field name is different than expected.
                console.log("[profile_image_upload] 'imageFile' not found. Parsed 'files' object:", files);
                return responseReturn(res, 400, { error: 'No image file uploaded. Ensure the field name is "image".' });
            }

            // Ensure imageFile has a filepath property (it should if it's a valid File object from formidable)
            // For formidable v2, this might be `imageFile.path` instead of `imageFile.filepath`
            // For formidable v3+, `imageFile.filepath` is standard.
            const filePath = imageFile.filepath || imageFile.path;

            if (!filePath) {
                console.error("[profile_image_upload] 'imageFile' received, but it lacks a 'filepath' or 'path'. imageFile:", imageFile);
                return responseReturn(res, 500, { error: 'Uploaded file data is incomplete or malformed.' });
            }

            try {
                const result = await cloudinary.uploader.upload(filePath, { folder: 'profile_images' });
                
                if (!result || !result.secure_url) {
                    console.error("[profile_image_upload] Cloudinary upload failed or did not return a secure_url. Result:", result);
                    throw new Error('Cloudinary upload failed to return a secure URL.');
                }

                await sellerModel.findByIdAndUpdate(id, { image: result.secure_url });
                const updatedUserInfo = await sellerModel.findById(id);
                responseReturn(res, 200, { message: 'Profile image updated.', userInfo: updatedUserInfo });

            } catch (error) {
                console.error("[profile_image_upload] Error during Cloudinary upload or DB update:", error);
                responseReturn(res, 500, { error: error.message || 'Image upload processing failed.' });
            }
        });
    }

    // === PROFILE INFO ADD/UPDATE (Seller Only) ===
    profile_info_add = async(req, res) => {
        const { shopName, division, district, sub_district, eccp } = req.body;
        const { id, role } = req;
        if (role !== 'seller') return responseReturn(res, 403, { error: 'Forbidden.' });
        if (!shopName || !division || !district || !sub_district) return responseReturn(res, 400, { error: 'Required fields missing.' });

        try {
            const updateData = {
                'shopInfo.shopName': shopName, 'shopInfo.division': division,
                'shopInfo.district': district, 'shopInfo.sub_district': sub_district,
                'shopInfo.eccp': eccp || ''
            };
            await sellerModel.findByIdAndUpdate(id, { $set: updateData });
            const updatedUserInfo = await sellerModel.findById(id);
            responseReturn(res, 200, { message: 'Profile information updated.', userInfo: updatedUserInfo });

        } catch (error) {
            console.error("[profile_info_add] Error:", error);
            responseReturn(res, 500, { error: error.message || 'Profile update failed.' });
        }
    }

    // === LOGOUT ===
    logout = async (req, res) => {
        try {
            res.cookie('accessToken', '', {
                expires: new Date(0), httpOnly: true,
                secure: process.env.NODE_ENV === 'production', sameSite: 'strict'
            });
            responseReturn(res, 200, { message: 'Logout successful.' });
        } catch (error) {
            console.error("[logout] Server Error:", error);
            responseReturn(res, 500, { error: 'Logout failed on server.' });
        }
    }

    // === CHANGE PASSWORD (Authenticated Route) ===
    change_password = async(req, res) => {
        const { old_password, new_password, confirm_password } = req.body;
        const { id, role } = req; // Assumes authMiddleware provides id and role

        if (!old_password || !new_password || !confirm_password) return responseReturn(res, 400, { error: 'All password fields are required.' });
        if (new_password.length < 8) return responseReturn(res, 400, { error: 'New password must be at least 8 characters.' });
        if (new_password !== confirm_password) return responseReturn(res, 400, { error: 'New passwords do not match.' });
        if (old_password === new_password) return responseReturn(res, 400, { error: 'New password cannot be the same as the old password.' });

        try {
            let user = null;
            const model = role === 'admin' ? adminModel : (role === 'seller' ? sellerModel : null);
            if (!model) return responseReturn(res, 403, { error: 'Invalid user role.' });

            user = await model.findById(id).select('+password');
            if (!user) return responseReturn(res, 404, { error: 'User not found.' });

            const isMatch = await bcrpty.compare(old_password, user.password);
            if (!isMatch) return responseReturn(res, 400, { error: 'Incorrect old password.' });

            user.password = await bcrpty.hash(new_password, 10);
            // Optionally add: user.passwordChangedAt = Date.now();
            await user.save();

            responseReturn(res, 200, { message: 'Password changed successfully.' });

        } catch (error) {
            console.error("[change_password] Server Error:", error);
            responseReturn(res, 500, { error: 'Internal Server Error during password change.' });
        }
    }
} // End of class authControllers

module.exports = new authControllers();