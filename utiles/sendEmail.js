// utiles/sendEmail.js
const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // 1. Create a transporter
    // IMPORTANT: Replace with a robust provider for production
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Example: Gmail
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail if 2FA is enabled
        },
        // Consider adding TLS options for specific providers if needed
        // tls: {
        //     rejectUnauthorized: false // Use only for local testing if necessary
        // }
    });

    // 2. Define email options
    const mailOptions = {
        from: `${process.env.EMAIL_FROM_NAME || 'MyApp'} <${process.env.EMAIL_USERNAME}>`,
        to: options.email,
        subject: options.subject,
        html: options.html,
    };

    // 3. Send the email
    try {
        await transporter.sendMail(mailOptions);
        console.log(`[sendEmail] OTP Email sent successfully to ${options.email}`);
        return true;
    } catch (error) {
        console.error(`[sendEmail] Error sending email to ${options.email}:`, error);
        // Depending on your strategy, you might want to throw the error
        // or just return false. Returning false allows the registration
        // flow to potentially continue but logs the issue.
        return false;
    }
};

module.exports = sendEmail;