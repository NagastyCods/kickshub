const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { roundMoney } = require('../utils/money');
const { MAX_LINE_QUANTITY } = require('../config/constants');

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

async function describeLines(lines) {
  const items = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    const product = await Product.findOne({ _id: line.productId || line.product, isActive: true });
    if (!product) continue;
    const variant = product.variants.id(line.variantId);
    if (!variant) continue;
    const capped = Math.min(quantity, MAX_LINE_QUANTITY);
    items.push({
      productId: String(product._id),
      variantId: String(variant._id),
      slug: product.slug,
      name: product.name,
      brandName: product.brandName,
      image: variant.image || (product.images[0] && product.images[0].url) || '',
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      unitPrice: variant.price,
      quantity: capped,
      available: variant.available,
      lineTotal: roundMoney(variant.price * capped),
      warning: variant.available < capped ? `Only ${variant.available} left` : '',
    });
  }
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  return { items, subtotal, currency: 'GHS', count: items.reduce((sum, item) => sum + item.quantity, 0) };
}

async function presentCart(cart) {
  return describeLines(cart.items.map((item) => ({
    productId: item.product,
    variantId: item.variantId,
    quantity: item.quantity,
  })));
}

async function upsertLine(cart, { productId, variantId, quantity }) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError(404, 'That shoe is no longer available');
  const variant = product.variants.id(variantId);
  if (!variant) throw new ApiError(404, 'That size is no longer available');
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QUANTITY) {
    throw new ApiError(400, `Quantity must be between 1 and ${MAX_LINE_QUANTITY}`);
  }
  if (variant.available < qty) {
    throw new ApiError(409, variant.available === 0
      ? `${product.name} in EU ${variant.size} is sold out`
      : `Only ${variant.available} left of ${product.name} in EU ${variant.size}`);
  }
  const existing = cart.items.find((item) => String(item.variantId) === String(variant._id));
  const snapshot = {
    product: product._id,
    variantId: variant._id,
    sku: variant.sku,
    name: product.name,
    image: variant.image || (product.images[0] && product.images[0].url) || '',
    size: variant.size,
    color: variant.color,
    unitPrice: variant.price,
    quantity: qty,
  };
  if (existing) {
    existing.set(snapshot);
  } else {
    cart.items.push(snapshot);
  }
  await cart.save();
}

const getCart = asyncHandler(async (req, res) => {
  if (!req.user) return sendSuccess(res, { items: [], subtotal: 0, currency: 'GHS', count: 0 });
  const cart = await getOrCreateCart(req.user._id);
  sendSuccess(res, await presentCart(cart));
});

const priceCart = asyncHandler(async (req, res) => {
  const lines = Array.isArray(req.body.items) ? req.body.items : [];
  sendSuccess(res, await describeLines(lines));
});

const addItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((item) => String(item.variantId) === String(req.body.variantId));
  const quantity = (existing ? existing.quantity : 0) + (Number(req.body.quantity) || 1);
  await upsertLine(cart, { productId: req.body.productId, variantId: req.body.variantId, quantity });
  sendSuccess(res, await presentCart(cart), 'Added to cart');
});

const updateItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((item) => String(item.variantId) === req.params.variantId);
  if (!existing) throw new ApiError(404, 'That pair is not in your cart');
  await upsertLine(cart, {
    productId: existing.product,
    variantId: existing.variantId,
    quantity: Number(req.body.quantity),
  });
  sendSuccess(res, await presentCart(cart), 'Cart updated');
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((item) => String(item.variantId) !== req.params.variantId);
  await cart.save();
  sendSuccess(res, await presentCart(cart), 'Removed from cart');
});

const mergeCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const lines = Array.isArray(req.body.items) ? req.body.items : [];
  for (const line of lines) {
    const existing = cart.items.find((item) => String(item.variantId) === String(line.variantId));
    const quantity = Math.min(MAX_LINE_QUANTITY, (existing ? existing.quantity : 0) + (Number(line.quantity) || 1));
    try {
      await upsertLine(cart, { productId: line.productId, variantId: line.variantId, quantity });
    } catch (_err) {
      // Skip lines that sold out between browse and login.
    }
  }
  sendSuccess(res, await presentCart(await Cart.findOne({ user: req.user._id })), 'Cart merged');
});

module.exports = { getCart, priceCart, addItem, updateItem, removeItem, mergeCart, describeLines };
