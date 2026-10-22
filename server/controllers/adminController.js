const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Review = require('../models/Review');
const Settings = require('../models/Settings');
const Newsletter = require('../models/Newsletter');
const StockAlert = require('../models/StockAlert');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { clearStoreCache } = require('../services/storeFlags');
const { publicOrder } = require('../utils/serialize');
const { generatePaymentReference } = require('../utils/orderNumber');
const { sendOrderUpdate } = require('../services/email');
const { ORDER_STATUSES, PAYMENT_STATUSES } = require('../config/constants');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function adminOrder(order) {
  return {
    ...publicOrder(order),
    needsRefundReview: Boolean(order.needsRefundReview),
    refundNote: order.refundNote || '',
    stockReserved: Boolean(order.stockReserved),
    reservationExpiresAt: order.reservationExpiresAt || null,
    paymentReference: order.paymentReference || '',
    createdAt: order.createdAt,
  };
}

async function emailStatus(order) {
  try {
    await sendOrderUpdate(order);
  } catch (err) {
    console.error(`Status email failed for ${order.orderNumber}: ${err.message}`);
  }
}

const summary = asyncHandler(async (_req, res) => {
  const settings = await Settings.getStore();
  const threshold = settings.lowStockThreshold;
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [revenue, statusRows, recent, pendingReviews, refunds, lowProducts, ordersToday] = await Promise.all([
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]),
    Order.find().sort({ createdAt: -1 }).limit(8),
    Review.countDocuments({ status: 'pending' }),
    Order.countDocuments({ needsRefundReview: true, paymentStatus: { $ne: 'refunded' } }),
    Product.find({ isActive: true, 'variants.available': { $lte: threshold } }).select('name slug variants').limit(30),
    Order.countDocuments({ createdAt: { $gte: since } }),
  ]);

  const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  statusRows.forEach((row) => { byStatus[row._id] = row.count; });

  const lowStock = [];
  lowProducts.forEach((product) => {
    product.variants.forEach((variant) => {
      if (variant.available <= threshold && lowStock.length < 12) {
        lowStock.push({
          productId: String(product._id),
          name: product.name,
          slug: product.slug,
          variantId: String(variant._id),
          size: variant.size,
          color: variant.color,
          available: variant.available,
          reserved: variant.reserved,
        });
      }
    });
  });

  sendSuccess(res, {
    revenue: revenue[0] ? revenue[0].total : 0,
    paidOrders: revenue[0] ? revenue[0].count : 0,
    ordersToday,
    pendingReviews,
    refunds,
    byStatus,
    lowStock,
    recent: recent.map(adminOrder),
    lowStockThreshold: threshold,
  });
});

const listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const filter = {};
  if (ORDER_STATUSES.includes(req.query.status)) filter.orderStatus = req.query.status;
  if (PAYMENT_STATUSES.includes(req.query.payment)) filter.paymentStatus = req.query.payment;
  if (req.query.refunds === 'true') filter.needsRefundReview = true;
  const q = String(req.query.q || '').trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ orderNumber: pattern }, { customerEmail: pattern }, { customerName: pattern }];
  }
  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  sendSuccess(res, rows.map(adminOrder), 'OK', 200, {
    page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
  });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  sendSuccess(res, { order: adminOrder(order) });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  const note = req.body.note ? String(req.body.note).slice(0, 500) : '';
  await order.transitionTo(req.body.status, { note, actor: req.user._id });
  const fresh = await Order.findById(order._id);
  await emailStatus(fresh);
  sendSuccess(res, { order: adminOrder(fresh) }, 'Order updated');
});

const addOrderNote = asyncHandler(async (req, res) => {
  const note = String(req.body.note || '').trim();
  if (note.length < 2) throw new ApiError(400, 'Write a note', [{ field: 'note', message: 'Write a note' }]);
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  order.timeline.push({ status: 'note', note: note.slice(0, 500), at: new Date(), actor: req.user._id });
  await order.save();
  sendSuccess(res, { order: adminOrder(order) }, 'Note added');
});

const markOrderPaid = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.paymentStatus === 'paid') return sendSuccess(res, { order: adminOrder(order) }, 'Already paid');
  if (order.paymentStatus === 'refunded' || order.orderStatus === 'cancelled') {
    throw new ApiError(409, 'This order cannot be marked paid');
  }
  const reference = order.paymentReference || generatePaymentReference();
  const result = await order.markPaid({
    reference,
    channel: order.paymentChannel || 'pay_on_delivery',
    network: order.mobileNetwork || '',
    gatewayResponse: 'Marked paid in the admin dashboard',
  });
  if (!result.needsRefundReview) await emailStatus(result.order);
  const message = result.needsRefundReview
    ? 'Payment recorded, but stock was already released. Review a refund before shipping.'
    : 'Marked paid';
  sendSuccess(res, { order: adminOrder(result.order) }, message);
});

const refundOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  const updated = await order.markRefunded({
    note: req.body.note,
    restock: Boolean(req.body.restock),
    actor: req.user._id,
  });
  await emailStatus(updated);
  sendSuccess(res, { order: adminOrder(updated) }, 'Refund recorded');
});

const listCustomers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { role: 'customer' };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ email: pattern }, { firstName: pattern }, { lastName: pattern }, { phone: pattern }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(50).select('firstName lastName email phone isActive createdAt');
  sendSuccess(res, users.map((user) => ({
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone || '',
    isActive: user.isActive,
    createdAt: user.createdAt,
  })));
});

const setCustomerActive = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' });
  if (!user) throw new ApiError(404, 'Customer not found');
  user.isActive = Boolean(req.body.isActive);
  await user.save();
  sendSuccess(res, { id: String(user._id), isActive: user.isActive }, user.isActive ? 'Customer enabled' : 'Customer disabled');
});

const listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  const rows = await Review.find(filter)
    .populate('user', 'firstName email')
    .populate('product', 'name slug')
    .sort({ createdAt: -1 })
    .limit(50);
  sendSuccess(res, rows.map((review) => ({
    id: String(review._id),
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    status: review.status,
    author: review.user ? review.user.firstName : 'Buyer',
    email: review.user ? review.user.email : '',
    productName: review.product ? review.product.name : 'Removed product',
    productSlug: review.product ? review.product.slug : '',
    createdAt: review.createdAt,
  })));
});

const moderateReview = asyncHandler(async (req, res) => {
  if (!['approved', 'rejected', 'pending'].includes(req.body.status)) {
    throw new ApiError(400, 'Choose approved, rejected, or pending');
  }
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  review.status = req.body.status;
  await review.save();
  sendSuccess(res, { id: String(review._id), status: review.status }, 'Review updated');
});

const listNewsletter = asyncHandler(async (_req, res) => {
  const rows = await Newsletter.find().sort({ createdAt: -1 }).limit(100);
  sendSuccess(res, rows.map((row) => ({
    email: row.email,
    source: row.source,
    isActive: row.isActive,
    createdAt: row.createdAt,
  })));
});

const listStockAlerts = asyncHandler(async (_req, res) => {
  const rows = await StockAlert.find().populate('product', 'name slug').sort({ createdAt: -1 }).limit(100);
  sendSuccess(res, rows.map((row) => ({
    id: String(row._id),
    email: row.email,
    size: row.size,
    color: row.color,
    notified: row.notified,
    productName: row.product ? row.product.name : 'Removed product',
    createdAt: row.createdAt,
  })));
});

const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.getStore();
  sendSuccess(res, {
    storeName: settings.storeName,
    tagline: settings.tagline,
    email: settings.email,
    phone: settings.phone,
    whatsapp: settings.whatsapp,
    address: settings.address,
    paystackCardEnabled: settings.paystackCardEnabled,
    paystackMobileMoneyEnabled: settings.paystackMobileMoneyEnabled,
    payOnDeliveryEnabled: settings.payOnDeliveryEnabled,
    payOnDeliveryFee: settings.payOnDeliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    lowStockThreshold: settings.lowStockThreshold,
    newsletterEnabled: settings.newsletterEnabled,
    maintenanceMode: settings.maintenanceMode,
    deliveryFees: settings.deliveryFees,
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getStore();
  const fields = [
    'storeName', 'tagline', 'email', 'phone', 'whatsapp', 'address',
    'paystackCardEnabled', 'paystackMobileMoneyEnabled', 'payOnDeliveryEnabled',
    'payOnDeliveryFee', 'lowStockThreshold', 'newsletterEnabled', 'maintenanceMode',
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) settings[field] = req.body[field];
  });
  if (req.body.freeDeliveryThreshold === '' || req.body.freeDeliveryThreshold === null) {
    settings.freeDeliveryThreshold = null;
  } else if (req.body.freeDeliveryThreshold !== undefined) {
    settings.freeDeliveryThreshold = Number(req.body.freeDeliveryThreshold);
  }
  if (Array.isArray(req.body.deliveryFees)) settings.deliveryFees = req.body.deliveryFees;
  await settings.save();
  clearStoreCache();
  sendSuccess(res, {
    storeName: settings.storeName,
    tagline: settings.tagline,
    email: settings.email,
    phone: settings.phone,
    whatsapp: settings.whatsapp,
    address: settings.address,
    paystackCardEnabled: settings.paystackCardEnabled,
    paystackMobileMoneyEnabled: settings.paystackMobileMoneyEnabled,
    payOnDeliveryEnabled: settings.payOnDeliveryEnabled,
    payOnDeliveryFee: settings.payOnDeliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    lowStockThreshold: settings.lowStockThreshold,
    newsletterEnabled: settings.newsletterEnabled,
    maintenanceMode: settings.maintenanceMode,
    deliveryFees: settings.deliveryFees,
  }, 'Settings saved');
});

module.exports = {
  summary,
  listOrders,
  getOrder,
  updateOrderStatus,
  addOrderNote,
  markOrderPaid,
  refundOrder,
  listCustomers,
  setCustomerActive,
  listReviews,
  moderateReview,
  listNewsletter,
  listStockAlerts,
  getSettings,
  updateSettings,
};
