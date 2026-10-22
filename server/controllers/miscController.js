const Newsletter = require('../models/Newsletter');
const StockAlert = require('../models/StockAlert');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { sendContact } = require('../services/email');
const { normalizeGhanaPhone } = require('../utils/phone');

const subscribe = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email', [{ field: 'email', message: 'Enter a valid email' }]);
  }
  const source = ['footer', 'popup', 'checkout'].includes(req.body.source) ? req.body.source : 'footer';
  await Newsletter.findOneAndUpdate(
    { email },
    { email, source, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  sendSuccess(res, null, 'You are on the list');
});

const stockAlert = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email', [{ field: 'email', message: 'Enter a valid email' }]);
  }
  const product = await Product.findOne({ _id: req.body.productId, isActive: true });
  if (!product) throw new ApiError(404, 'That shoe is not in the shop');
  const variant = req.body.variantId ? product.variants.id(req.body.variantId) : null;
  await StockAlert.findOneAndUpdate(
    {
      product: product._id,
      email,
      size: variant ? variant.size : '',
      color: variant ? variant.color : '',
    },
    {
      product: product._id,
      variantId: variant ? variant._id : null,
      email,
      phone: req.body.phone ? normalizeGhanaPhone(req.body.phone) || '' : '',
      size: variant ? variant.size : '',
      color: variant ? variant.color : '',
      notified: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  sendSuccess(res, null, 'We will email you when it is back');
});

const contact = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const message = String(req.body.message || '').trim();
  const errors = [];
  if (name.length < 2) errors.push({ field: 'name', message: 'Enter your name' });
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.push({ field: 'email', message: 'Enter a valid email' });
  if (message.length < 10) errors.push({ field: 'message', message: 'Write at least a short message' });
  if (message.length > 2000) errors.push({ field: 'message', message: 'Keep the message under 2000 characters' });
  if (errors.length) throw new ApiError(400, 'Check the form', errors);
  const settings = await Settings.getStore();
  const result = await sendContact({ name, email, message, to: settings.email });
  sendSuccess(res, { delivered: !result.skipped }, result.skipped
    ? `Email is not set up yet. Write to ${settings.email}.`
    : 'Message sent. We will reply by email.');
});

module.exports = { subscribe, stockAlert, contact };
