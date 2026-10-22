const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { attachUser, requireAuth } = require('../middleware/auth');
const auth = require('../controllers/authController');
const products = require('../controllers/productController');
const catalog = require('../controllers/catalogController');
const cart = require('../controllers/cartController');
const wishlist = require('../controllers/wishlistController');
const orders = require('../controllers/orderController');
const payments = require('../controllers/paymentController');
const reviews = require('../controllers/reviewController');
const mongoose = require('mongoose');
const misc = require('../controllers/miscController');
const adminRoutes = require('./admin');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in a few minutes.', errors: [] },
});
const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment checks. Wait a moment and try again.', errors: [] },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/payments/webhook',
  message: { success: false, message: 'Too many requests. Try again in a few minutes.', errors: [] },
});
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions. Try again in a few minutes.', errors: [] },
});

router.use(apiLimiter);
router.use(attachUser);
router.use('/admin', adminRoutes);

router.get('/health', (_req, res) => {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    success: true,
    message: 'OK',
    data: {
      service: 'kickshub',
      time: new Date().toISOString(),
      database: states[mongoose.connection.readyState] || 'unknown',
    },
  });
});

router.post('/auth/register', authLimiter, [
  body('firstName').trim().isLength({ min: 2, max: 60 }).withMessage('Enter your first name'),
  body('lastName').trim().isLength({ min: 2, max: 60 }).withMessage('Enter your last name'),
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).withMessage('Use 8+ characters with a letter and a number'),
], validate, auth.register);
router.post('/auth/login', authLimiter, [
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').notEmpty().withMessage('Enter your password'),
], validate, auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);
router.patch('/auth/me', requireAuth, auth.updateMe);
router.post('/auth/forgot', authLimiter, [body('email').isEmail().withMessage('Enter a valid email')], validate, auth.forgotPassword);
router.post('/auth/reset', authLimiter, [
  body('token').notEmpty().withMessage('Reset link is missing'),
  body('password').matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).withMessage('Use 8+ characters with a letter and a number'),
  body('passwordConfirm').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
], validate, auth.resetPassword);
router.post('/auth/password', requireAuth, authLimiter, [
  body('currentPassword').notEmpty().withMessage('Enter your current password'),
  body('password').matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).withMessage('Use 8+ characters with a letter and a number'),
  body('passwordConfirm').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
], validate, auth.changePassword);
router.post('/auth/addresses', requireAuth, auth.addAddress);
router.patch('/auth/addresses/:id', requireAuth, auth.updateAddress);
router.delete('/auth/addresses/:id', requireAuth, auth.deleteAddress);

router.get('/store', catalog.getStore);
router.get('/brands', catalog.listBrands);
router.get('/collections', catalog.listCollections);
router.get('/products', products.listProducts);
router.get('/products/suggest', products.suggestProducts);
router.get('/products/:slug', products.getProduct);
router.get('/products/:slug/reviews', reviews.listReviews);
router.post('/products/:slug/reviews', requireAuth, reviews.createReview);

router.get('/cart', cart.getCart);
router.post('/cart/price', cart.priceCart);
router.post('/cart/items', requireAuth, cart.addItem);
router.patch('/cart/items/:variantId', requireAuth, cart.updateItem);
router.delete('/cart/items/:variantId', requireAuth, cart.removeItem);
router.post('/cart/merge', requireAuth, cart.mergeCart);

router.get('/wishlist', requireAuth, wishlist.getWishlist);
router.post('/wishlist', requireAuth, wishlist.addWishlist);
router.delete('/wishlist/:productId', requireAuth, wishlist.removeWishlist);

router.post('/checkout/quote', orders.quote);
router.post('/orders', orders.createOrder);
router.get('/orders', requireAuth, orders.listOrders);
router.get('/orders/:orderNumber/invoice', orders.invoice);
router.get('/orders/:orderNumber', orders.getOrder);
router.post('/orders/:orderNumber/pay', orders.retryPayment);

router.get('/payments/verify/:reference', payLimiter, payments.verify);
router.post('/payments/otp', payLimiter, payments.otp);
router.post('/payments/webhook', payments.webhook);

router.post('/newsletter', formLimiter, misc.subscribe);
router.post('/stock-alerts', formLimiter, misc.stockAlert);
router.post('/contact', formLimiter, misc.contact);

module.exports = router;
