const path = require('path');
const fs = require('fs');
const express = require('express');
const Product = require('../models/Product');

const clientDir = path.join(__dirname, '..', '..', 'client');
const router = express.Router();

function sendPage(file) {
  return (_req, res) => {
    res.sendFile(path.join(clientDir, file));
  };
}

function fill(template, values) {
  const escape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return Object.entries(values).reduce(
    (html, [key, value]) => html.split(`{{${key}}}`).join(escape(value)),
    template
  );
}

router.get('/admin', sendPage('admin.html'));
router.get('/admin/*', sendPage('admin.html'));
router.get('/', sendPage('index.html'));
router.get('/shop', sendPage('shop.html'));
router.get('/cart', sendPage('cart.html'));
router.get('/checkout', sendPage('checkout.html'));
router.get('/login', sendPage('login.html'));
router.get('/register', sendPage('register.html'));
router.get('/forgot-password', sendPage('forgot.html'));
router.get('/reset-password', sendPage('reset.html'));
router.get('/account', sendPage('account.html'));
router.get('/wishlist', sendPage('wishlist.html'));
router.get('/contact', sendPage('contact.html'));
router.get('/faq', sendPage('faq.html'));
router.get('/shipping', sendPage('shipping.html'));
router.get('/order/:orderNumber', sendPage('order.html'));

router.get('/product/:slug', async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true }).select('name seoTitle seoDescription description images slug').lean();
    if (!product) return res.status(404).sendFile(path.join(clientDir, '404.html'));
    const template = fs.readFileSync(path.join(clientDir, 'product.html'), 'utf8');
    const title = product.seoTitle || `${product.name} | KicksHub`;
    const description = (product.seoDescription || product.description || '').slice(0, 160);
    const image = product.images && product.images[0] ? product.images[0].url : '';
    const url = `${req.protocol}://${req.get('host')}/product/${product.slug}`;
    res.type('html').send(fill(template, {
      title,
      description,
      image,
      url,
    }));
  } catch (err) {
    next(err);
  }
});

function notFoundPage(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      errors: [],
    });
  }
  return res.status(404).sendFile(path.join(clientDir, '404.html'));
}

module.exports = { pages: router, notFoundPage, clientDir };
