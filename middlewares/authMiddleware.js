const jwt = require('jsonwebtoken');

module.exports.authMiddleware = async (req, res, next) => {
    const { accessToken } = req.cookies;
    console.log('[authMiddleware] Cookie accessToken:', accessToken ? 'Present' : 'Missing');

    if (!accessToken) {
        console.log('[authMiddleware] No token, returning 401');
        return res.status(401).json({ error: 'Please Login First' });
    } else {
        try {
            const deCodeToken = await jwt.verify(accessToken, process.env.SECRET);
            console.log('[authMiddleware] Token verified, user:', { id: deCodeToken.id, role: deCodeToken.role });
            req.role = deCodeToken.role;
            req.id = deCodeToken.id;
            next();
        } catch (error) {
            console.log('[authMiddleware] Token verification failed:', error.message);
            return res.status(401).json({ error: 'Please Login' });
        }
    }
};