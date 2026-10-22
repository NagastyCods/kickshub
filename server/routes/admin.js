const express = require('express');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const admin = require('../controllers/adminController');
const catalog = require('../controllers/adminCatalogController');
const ApiError = require('../utils/ApiError');

const router = express.Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new ApiError(400, 'Upload a JPG, PNG, or WebP'));
      return;
    }
    cb(null, true);
  },
});

function receiveImage(req, res, next) {
  imageUpload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Image must be 3 MB or smaller'));
    return next(err);
  });
}

router.use(requireAdmin);

router.get('/summary', admin.summary);
router.get('/orders', admin.listOrders);
router.get('/orders/:orderNumber', admin.getOrder);
router.patch('/orders/:orderNumber/status', admin.updateOrderStatus);
router.post('/orders/:orderNumber/note', admin.addOrderNote);
router.post('/orders/:orderNumber/paid', admin.markOrderPaid);
router.post('/orders/:orderNumber/refund', admin.refundOrder);

router.get('/products', catalog.listProducts);
router.post('/products', catalog.createProduct);
router.get('/products/:id', catalog.getProduct);
router.patch('/products/:id', catalog.updateProduct);
router.patch('/products/:id/variants/:variantId', catalog.updateVariant);
router.post('/products/:id/variants', catalog.addVariant);

router.get('/brands', catalog.listBrands);
router.post('/brands', catalog.saveBrand);
router.patch('/brands/:id', catalog.saveBrand);
router.get('/collections', catalog.listCollections);
router.post('/collections', catalog.saveCollection);
router.patch('/collections/:id', catalog.saveCollection);
router.get('/promos', catalog.listPromos);
router.post('/promos', catalog.savePromo);
router.patch('/promos/:id', catalog.savePromo);

router.get('/customers', admin.listCustomers);
router.patch('/customers/:id', admin.setCustomerActive);
router.get('/reviews', admin.listReviews);
router.patch('/reviews/:id', admin.moderateReview);
router.get('/newsletter', admin.listNewsletter);
router.get('/stock-alerts', admin.listStockAlerts);
router.get('/settings', admin.getSettings);
router.patch('/settings', admin.updateSettings);
router.post('/uploads', receiveImage, catalog.upload);

module.exports = router;
