const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { dbConnect } = require('./utiles/db');
const socket = require('socket.io');
const http = require('http');
require('dotenv').config();

// --- HTTP Server & Socket.IO Setup ---
const server = http.createServer(app);
const allowedOrigins = process.env.mode === 'pro' 
    ? [process.env.client_customer_production_url, process.env.client_admin_production_url] 
    : ['http://localhost:3000', 'http://localhost:3001'];

const io = socket(server, {
    cors: {
        origin: function (origin, callback) {
            console.log(`[Socket.IO CORS] Origin: ${origin}`);
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.log(`[Socket.IO CORS] Blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    }
});

// --- Middleware ---
app.use(cors({
    origin: function (origin, callback) {
        console.log(`[Express CORS] Origin: ${origin}`);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`[Express CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'], // Ensure cookie headers are accessible
    optionsSuccessStatus: 204 // Handle preflight OPTIONS correctly
}));
app.options('*', cors()); // Explicitly handle preflight for all routes
app.use(bodyParser.json());
app.use(cookieParser());

// --- Socket.IO User Tracking ---
var allCustomer = [];
var allSeller = [];
let admin = {};

const addUser = (customerId, socketId, userInfo) => {
    const checkUser = allCustomer.some(u => u.customerId === customerId);
    if (!checkUser) {
        allCustomer.push({ customerId, socketId, userInfo });
        console.log(`Customer added: ${customerId} | Socket: ${socketId} | Total Customers: ${allCustomer.length}`);
    } else {
        const userIndex = allCustomer.findIndex(u => u.customerId === customerId);
        allCustomer[userIndex].socketId = socketId;
        console.log(`Customer socket updated: ${customerId} | Socket: ${socketId}`);
    }
};

const addSeller = (sellerId, socketId, userInfo) => {
    const checkSeller = allSeller.some(u => u.sellerId === sellerId);
    if (!checkSeller) {
        allSeller.push({ sellerId, socketId, userInfo });
        console.log(`Seller added: ${sellerId} | Socket: ${socketId} | Total Sellers: ${allSeller.length}`);
    } else {
        const sellerIndex = allSeller.findIndex(u => u.sellerId === sellerId);
        allSeller[sellerIndex].socketId = socketId;
        console.log(`Seller socket updated: ${sellerId} | Socket: ${socketId}`);
    }
};

const addAdmin = (adminInfo, socket) => {
    const minimalAdminInfo = { ...adminInfo };
    delete minimalAdminInfo.email;
    delete minimalAdminInfo.password;
    admin = { ...minimalAdminInfo, socketId: socket.id };
    console.log(`Admin connected/updated: ${admin.id} | Socket: ${admin.socketId}`);
    socket.join('admin');
    console.log(`Admin joined room: admin | Socket: ${socket.id}`);
};

const findCustomer = (customerId) => {
    return allCustomer.find(c => c.customerId === customerId);
};

const findSeller = (sellerId) => {
    return allSeller.find(s => s.sellerId === sellerId);
};

const removeUser = (socketId) => {
    const initialCustomerCount = allCustomer.length;
    const initialSellerCount = allSeller.length;

    allCustomer = allCustomer.filter(c => c.socketId !== socketId);
    allSeller = allSeller.filter(s => s.socketId !== socketId);

    if (admin.socketId === socketId) {
        console.log(`Admin disconnected: ${admin.id} | Socket: ${socketId}`);
        admin = {};
    }

    if (allCustomer.length < initialCustomerCount) console.log(`Customer removed | Socket: ${socketId} | Remaining: ${allCustomer.length}`);
    if (allSeller.length < initialSellerCount) console.log(`Seller removed | Socket: ${socketId} | Remaining: ${allSeller.length}`);
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`🔌 Socket Connected: ${socket.id}`);

    socket.on('add_user', (customerId, userInfo) => {
        addUser(customerId, socket.id, userInfo);
    });

    socket.on('add_seller', (sellerId, userInfo) => {
        addSeller(sellerId, socket.id, userInfo);
        socket.join(sellerId); // Join seller to their _id room
        console.log(`Seller joined room: ${sellerId} | Socket: ${socket.id}`);
        io.emit('activeSeller', allSeller);
    });

    socket.on('add_admin', (adminInfo) => {
        addAdmin(adminInfo, socket);
        io.emit('activeSeller', allSeller);
    });

    socket.on('send_seller_message', (msg) => {
        const customer = findCustomer(msg.receverId);
        if (customer) {
            console.log(`Relaying seller message to customer ${customer.customerId} via socket ${customer.socketId}`);
            socket.to(customer.socketId).emit('seller_message', msg);
        } else {
            console.log(`Customer ${msg.receverId} not found for seller message.`);
        }
    });

    socket.on('send_customer_message', (msg) => {
        const seller = findSeller(msg.receverId);
        if (seller) {
            console.log(`Relaying customer message to seller ${seller.sellerId} via socket ${seller.socketId}`);
            socket.to(seller.socketId).emit('customer_message', msg);
        } else {
            console.log(`Seller ${msg.receverId} not found for customer message.`);
        }
    });

    socket.on('send_message_admin_to_seller', (msg) => {
        const seller = findSeller(msg.receverId);
        if (seller) {
            console.log(`Relaying admin message to seller ${seller.sellerId} via socket ${seller.socketId}`);
            socket.to(seller.socketId).emit('receved_admin_message', msg);
        } else {
            console.log(`Seller ${msg.receverId} not found for admin message.`);
        }
    });

    socket.on('send_message_seller_to_admin', (msg) => {
        if (admin.socketId) {
            console.log(`Relaying seller message to admin ${admin.id} via socket ${admin.socketId}`);
            socket.to(admin.socketId).emit('receved_seller_message', msg);
        } else {
            console.log(`Admin not connected, cannot relay seller message.`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User Disconnected: ${socket.id}`);
        removeUser(socket.id);
        io.emit('activeSeller', allSeller);
    });
});

// --- Middleware to pass io instance and admin object to controllers ---
app.use((req, res, next) => {
    req.io = io;
    req.adminUser = admin;
    next();
});

// --- API Routes ---
app.use('/api/home', require('./routes/home/homeRoutes'));
app.use('/api', require('./routes/authRoutes'));
app.use('/api', require('./routes/order/orderRoutes'));
app.use('/api', require('./routes/home/cardRoutes'));
app.use('/api', require('./routes/dashboard/categoryRoutes'));
app.use('/api', require('./routes/dashboard/serviceCategoryRoutes'));
app.use('/api', require('./routes/dashboard/productRoutes'));
app.use('/api', require('./routes/dashboard/sellerRoutes'));
app.use('/api', require('./routes/home/customerAuthRoutes'));
app.use('/api', require('./routes/chatRoutes'));
app.use('/api', require('./routes/paymentRoutes'));
app.use('/api', require('./routes/dashboard/dashboardRoutes'));
app.use('/api', require('./routes/dashboard/serviceRoutes'));
app.use('/api', require('./routes/locationRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api', require('./routes/notificationRoutes'));

// --- Root Route & Server Start ---
app.get('/', (req, res) => res.send('Server is Live!'));

const port = process.env.PORT || 5000;
dbConnect();

server.listen(port, () => console.log(`Server listening on http://localhost:${port}`));