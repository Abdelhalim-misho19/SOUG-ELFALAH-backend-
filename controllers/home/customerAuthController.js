// controllers/home/customerAuthController.js

// --- Imports ---
const customerModel = require('../../models/customerModel');        // Path to your customer model
const sellerModel = require('../../models/sellerModel');          // Path to your seller model (Needed for Forgot/Reset potentially)
const sellerCustomerModel = require('../../models/chat/sellerCustomerModel'); // Path to your chat model
const { responseReturn } = require('../../utiles/response');      // Path to your response utility
const { createToken } = require('../../utiles/tokenCreate');      // Path to your token utility
const sendEmail = require('../../utiles/sendEmail');            // Path to your email utility
const bcrypt = require('bcrypt');
const otpGenerator = require('otp-generator');
const crypto = require('crypto');

// --- Constants ---
const OTP_VALIDITY_DURATION = 10 * 60 * 1000; // 10 minutes for OTP
const RESET_TOKEN_VALIDITY_DURATION = 10 * 60 * 1000; // 10 minutes for Password Reset

// --- Controller Class ---
class CustomerAuthController {

    // ==================================
    // == OTP Registration Flow        ==
    // ==================================

    // Step 1: Send OTP for registration
    send_registration_otp = async (req, res) => {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return responseReturn(res, 400, { error: 'Please provide name, email, and password' });
        }
        try {
            const lowerCaseEmail = email.trim().toLowerCase();
            const existingCustomer = await customerModel.findOne({ email: lowerCaseEmail });

            if (existingCustomer && existingCustomer.isVerified) {
                return responseReturn(res, 409, { error: 'Email is already registered and verified.' });
            }

            const otp = otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false });
            const hashedPassword = await bcrypt.hash(password, 10);
            const otpExpires = new Date(Date.now() + OTP_VALIDITY_DURATION);

            // Use findOneAndUpdate with upsert for cleaner create/update logic
            await customerModel.findOneAndUpdate(
                { email: lowerCaseEmail },
                {
                    $set: {
                        name: name.trim(), password: hashedPassword, method: 'manually',
                        otp: otp, otpExpires: otpExpires, isVerified: false
                    }
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );

             const emailSent = await sendEmail({
                email: lowerCaseEmail, subject: 'Your Registration OTP for SOUG EL-FALAH',
                html: `<p>Welcome! Your SOUG EL-FALAH One-Time Password (OTP) is: <strong style="font-size: 1.5em; letter-spacing: 2px;">${otp}</strong></p><p>This code is valid for 10 minutes.</p>`,
            });

            if (emailSent) {
                responseReturn(res, 200, { message: `OTP sent successfully to ${lowerCaseEmail}. Please check your inbox.` });
            } else {
                console.error(`[send_registration_otp] Failed to send OTP email to ${lowerCaseEmail}.`);
                responseReturn(res, 500, { error: 'Failed to send OTP email. Please try again later.' });
            }
        } catch (error) {
            console.error("[send_registration_otp] Error:", error);
            if (error.code === 11000) {
                 return responseReturn(res, 409, { error: 'An issue occurred with this email. Please contact support.' });
            }
            responseReturn(res, 500, { error: 'An internal server error occurred during OTP generation.' });
        }
    };

    // Step 2: Verify OTP and finalize registration
    verify_otp_and_register = async (req, res) => {
        const { email, otp } = req.body;
        if (!email || !otp) return responseReturn(res, 400, { error: 'Please provide email and OTP.' });
        try {
            const lowerCaseEmail = email.trim().toLowerCase();
            const customer = await customerModel.findOne({ email: lowerCaseEmail, isVerified: false }).select('+otp +otpExpires +password');

            if (!customer) return responseReturn(res, 404, { error: 'Verification request not found, already verified, or expired.' });
            if (!customer.otpExpires || customer.otpExpires < new Date()) return responseReturn(res, 400, { error: 'OTP has expired.' });
            if (customer.otp !== otp) return responseReturn(res, 400, { error: 'Invalid OTP provided.' });

            // --- Verification Success ---
            customer.isVerified = true; customer.otp = undefined; customer.otpExpires = undefined;
            if (!customer.password) return responseReturn(res, 500, { error: 'Registration data incomplete.' });
            const verifiedCustomer = await customer.save();
            await sellerCustomerModel.findOneAndUpdate({ myId: verifiedCustomer.id }, { myId: verifiedCustomer.id }, { upsert: true });

            // Create token payload - Ensure ROLE is correctly set to 'customer' here
            const tokenPayload = {
                id: verifiedCustomer.id, name: verifiedCustomer.name, email: verifiedCustomer.email,
                method: verifiedCustomer.method, isVerified: verifiedCustomer.isVerified,
                role: 'customer' // CRITICAL: Ensure role is 'customer'
            };
            const token = await createToken(tokenPayload);

            // Set 'accessToken' cookie
            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), httpOnly: true,
                secure: process.env.NODE_ENV === 'production', sameSite: 'lax'
            });
            responseReturn(res, 201, { message: "Account verified and registration successful!", token });
        } catch (error) {
            console.error("[verify_otp_and_register] Error:", error);
            responseReturn(res, 500, { error: 'An internal server error occurred during verification.' });
        }
    };

    // ==================================
    // == Standard Login / Logout      ==
    // ==================================
    customer_login = async (req, res) => {
       const { email, password } = req.body;
       if (!email || !password) return responseReturn(res, 400, { error: 'Please provide email and password.' });
       try {
           const lowerCaseEmail = email.trim().toLowerCase();
           const customer = await customerModel.findOne({ email: lowerCaseEmail }).select('+password +isVerified');

           if (!customer) return responseReturn(res, 401, { error: 'Incorrect email or password.' });
            // Check account status and method
            if (customer.method === 'manually' && !customer.isVerified) return responseReturn(res, 403, { error: 'Account not verified.' });
            if (customer.method !== 'manually') return responseReturn(res, 403, { error: `Login with ${customer.method}.` });
            if (!customer.password) return responseReturn(res, 500, { error: 'Account login error.' });

           const match = await bcrypt.compare(password, customer.password);
           if (match) {
                // Create token payload - Ensure ROLE is correctly set to 'customer' here
                const tokenPayload = {
                    id: customer.id, name: customer.name, email: customer.email,
                    method: customer.method, isVerified: customer.isVerified,
                    role: 'customer' // CRITICAL: Ensure role is 'customer'
                };
               const token = await createToken(tokenPayload);

               // Set 'accessToken' cookie
               res.cookie('accessToken', token, {
                   expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), httpOnly: true,
                   secure: process.env.NODE_ENV === 'production', sameSite: 'lax'
               });
               responseReturn(res, 200, { message: 'Login Successful', token });
           } else {
               responseReturn(res, 401, { error: 'Incorrect email or password.' });
           }
       } catch (error) {
           console.error("[customer_login] Error:", error.message);
           responseReturn(res, 500, { error: 'Internal server error during login.' });
       }
    };

    customer_logout = async (req, res) => {
        res.cookie('accessToken', "", { // Clear 'accessToken' cookie
            expires: new Date(Date.now()), httpOnly: true,
            secure: process.env.NODE_ENV === 'production', sameSite: 'lax'
        });
        responseReturn(res, 200, { message: 'Logout Successful' });
    };

    // ==================================
    // == Password Reset Flow          ==
    // ==================================
    // Note: These might need adaptation if Sellers can also reset passwords via this controller
    forgotPassword = async (req, res) => {
        const { email } = req.body;
        if (!email) return responseReturn(res, 400, { error: 'Please provide email address.' });
        try {
            const lowerCaseEmail = email.trim().toLowerCase();
            // Find CUSTOMER by email (or adapt to check sellerModel too if needed)
            const customer = await customerModel.findOne({ email: lowerCaseEmail, isVerified: true, method: 'manually' });
            const genericSuccessMessage = 'If email exists & verified, reset link sent.'; // Shortened
            if (!customer) {
                 console.warn(`[forgotPassword] Attempt for non-customer/unverified/non-manual email: ${lowerCaseEmail}`);
                 // You might want to check sellerModel here too if sellers use this route
                return responseReturn(res, 200, { message: genericSuccessMessage });
            }
            const resetToken = crypto.randomBytes(32).toString('hex');
            customer.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            customer.passwordResetTokenExpires = Date.now() + RESET_TOKEN_VALIDITY_DURATION;
            await customer.save({ validateBeforeSave: false });
            const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const resetURL = `${frontendBaseUrl}/reset-password/${resetToken}`;
            const message = `<p>Hi ${customer.name},</p><p>Click link to reset password (valid 10 min): <a href="${resetURL}" target="_blank">Reset Password</a></p><p>Ignore if not requested.</p>`;
            const emailSent = await sendEmail({ email: customer.email, subject: 'SOUG EL-FALAH Password Reset', html: message });
            if (!emailSent) {
                customer.passwordResetToken = undefined; customer.passwordResetTokenExpires = undefined;
                await customer.save({ validateBeforeSave: false });
                console.error(`[forgotPassword] Email send failed for ${customer.email}`);
                return responseReturn(res, 200, { message: genericSuccessMessage + ' (Email issue)' });
            }
            responseReturn(res, 200, { message: genericSuccessMessage });
        } catch (error) {
            console.error("[forgotPassword] Error:", error);
            responseReturn(res, 500, { error: 'Internal server error.' });
        }
    };

    resetPassword = async (req, res) => {
        const { password, confirmPassword } = req.body;
        const { token } = req.params;
        if (!token || !password || !confirmPassword || password !== confirmPassword || password.length < 6) {
             return responseReturn(res, 400, { error: 'Invalid input. Check token, passwords match, and length (min 6).' });
        }
        try {
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
            // Find CUSTOMER by token (or adapt for sellers if needed)
            const customer = await customerModel.findOne({ passwordResetToken: hashedToken, passwordResetTokenExpires: { $gt: Date.now() } }).select('+password');
            if (!customer) return responseReturn(res, 400, { error: 'Token invalid or expired.' });
            if (customer.method !== 'manually') return responseReturn(res, 400, { error: 'Reset not available for this account.' });

            customer.password = await bcrypt.hash(password, 10);
            customer.passwordResetToken = undefined; customer.passwordResetTokenExpires = undefined;
            await customer.save();
            res.cookie('accessToken', "", { expires: new Date(Date.now()), httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
            responseReturn(res, 200, { message: 'Password reset successfully. Please log in.' });
        } catch (error) {
             console.error("[resetPassword] Error:", error);
             responseReturn(res, 500, { error: 'Error resetting password.' });
        }
    };

    // ==================================
    // == Change Password (Customer Only) ==
    // ==================================
    changePassword = async (req, res) => {
        console.log('--- Change Password Controller START (Customer Only) ---');
        const userId = req.id;       // From authMiddleware
        const userRole = req.role;     // From authMiddleware
        console.log(`Change Password Attempt: User ID=${userId}, Role=${userRole}`);
        const { oldPassword, newPassword, confirmPassword } = req.body;

        // --- ROLE CHECK ---
        if (userRole !== 'customer') {
            console.warn(`Change Password FAILED: User ${userId} has role "${userRole}", not "customer".`);
            return responseReturn(res, 403, { error: 'Access denied. Action only available for customers.' });
        }
        // --- END ROLE CHECK ---

        // Validations
        if (!userId) return responseReturn(res, 401, { error: 'Authentication required.' });
        if (!oldPassword || !newPassword || !confirmPassword) return responseReturn(res, 400, { error: 'Please provide all required fields.' });
        if (newPassword !== confirmPassword) return responseReturn(res, 400, { error: 'New passwords do not match.' });
        if (newPassword.length < 6) return responseReturn(res, 400, { error: 'New password must be at least 6 characters.' });
        if (oldPassword === newPassword) return responseReturn(res, 400, { error: 'New password cannot be the same.' });

        try {
            // Find customer by ID (safe now due to role check)
            const customer = await customerModel.findById(userId).select('+password');

            if (!customer) return responseReturn(res, 404, { error: 'Customer account not found.' });
            if (customer.method !== 'manually') return responseReturn(res, 400, { error: 'Password change unavailable for social logins.' });
            if (!customer.password) return responseReturn(res, 500, { error: 'Account error. Cannot change password.' });

            // Compare old password
            const isMatch = await bcrypt.compare(oldPassword, customer.password);
            if (!isMatch) return responseReturn(res, 400, { error: 'Incorrect current password.' });

            // Hash and update new password
            customer.password = await bcrypt.hash(newPassword, 10);
            await customer.save();

            console.log(`Password updated for customer ${userId}`);
            console.log('--- Change Password Controller END (Success) ---');
            responseReturn(res, 200, { message: 'Password updated successfully.' });

        } catch (error) {
            console.error(`[changePassword] Error for customer ${userId}:`, error);
            console.log('--- Change Password Controller END (Failure) ---');
            responseReturn(res, 500, { error: 'An internal server error occurred.' });
        }
    };
    // --- End Change Password Method ---

} // End Class

module.exports = new CustomerAuthController();