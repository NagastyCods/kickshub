const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const { addressSchema } = require('./address');
const Product = require('./Product');
const ApiError = require('../utils/ApiError');
const { roundMoney } = require('../utils/money');
const { generateOrderNumber } = require('../utils/orderNumber');
const { withOptionalTransaction } = require('../utils/transaction');
const { reserveLines } = require('../services/inventory');
const {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  TIMELINE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_CHANNELS,
  DELIVERY_METHODS,
  STOCK_STATES,
  MOMO_NETWORKS,
} = require('../config/constants');

const NETWORK_IDS = MOMO_NETWORKS.map((network) => network.id);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    brandName: { type: String, default: '' },
    image: { type: String, default: '' },
    size: { type: String, required: true },
    sizeUK: { type: String, default: '' },
    sizeUSMen: { type: String, default: '' },
    sizeUSWomen: { type: String, default: '' },
    color: { type: String, required: true },
    colorHex: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    stockState: { type: String, enum: STOCK_STATES, default: 'pending' },
  },
  { _id: false }
);

const timelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: TIMELINE_STATUSES, required: true },
    note: { type: String, default: '', maxlength: 500 },
    at: { type: Date, default: Date.now },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    customerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    customerPhone: { type: String, default: '' },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    items: {
      type: [orderItemSchema],
      validate: [(items) => items.length > 0, 'An order needs at least one item'],
    },
    shippingAddress: { type: addressSchema(), required: true },
    deliveryMethod: { type: String, enum: DELIVERY_METHODS, required: true },
    deliveryEstimate: { type: String, default: '' },
    customerNote: { type: String, trim: true, maxlength: 300, default: '' },
    subtotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    promoCode: { type: String, uppercase: true, trim: true, default: '' },
    promo: { type: mongoose.Schema.Types.ObjectId, ref: 'PromoCode', default: null },
    deliveryFee: { type: Number, default: 0, min: 0 },
    payOnDeliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'GHS' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentChannel: { type: String, enum: ['', ...PAYMENT_CHANNELS], default: '' },
    mobileNetwork: { type: String, enum: ['', ...NETWORK_IDS], default: '' },
    paymentReference: { type: String, sparse: true, unique: true },
    paymentLock: { type: String, default: null },
    gatewayResponse: { type: String, default: '', maxlength: 500 },
    paidAt: { type: Date },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    timeline: [timelineSchema],
    stockReserved: { type: Boolean, default: false },
    reservationExpiresAt: { type: Date, default: null },
    refundNote: { type: String, default: '', maxlength: 1000 },
    needsRefundReview: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.plugin(basePlugin);
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ stockReserved: 1, reservationExpiresAt: 1 });

orderSchema.pre('validate', function computeTotals(next) {
  if (!this.orderNumber) this.orderNumber = generateOrderNumber();
  const subtotal = roundMoney(
    (this.items || []).reduce((sum, item) => sum + roundMoney(item.unitPrice) * item.quantity, 0)
  );
  this.items.forEach((item) => {
    item.lineTotal = roundMoney(item.unitPrice * item.quantity);
  });
  this.subtotal = subtotal;
  this.discount = roundMoney(this.discount || 0);
  this.deliveryFee = roundMoney(this.deliveryFee || 0);
  this.payOnDeliveryFee = roundMoney(this.payOnDeliveryFee || 0);
  if (this.discount > subtotal) this.invalidate('discount', 'Discount cannot exceed the subtotal');
  this.total = roundMoney(
    Math.max(0, subtotal - this.discount + this.deliveryFee + this.payOnDeliveryFee)
  );
  next();
});

function sessionOpts(session) {
  return session ? { session } : {};
}

async function settlePayment(orderId, payment, session) {
  const reference = String(payment.reference || '').trim();
  if (!reference) throw new ApiError(400, 'Payment reference is required');
  if (payment.channel && !PAYMENT_CHANNELS.includes(payment.channel)) {
    throw new ApiError(400, 'Unknown payment channel');
  }

  const opts = sessionOpts(session);
  const locked = await mongoose.model('Order').findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: { $nin: ['paid', 'refunded'] },
      orderStatus: { $nin: ['cancelled'] },
      $or: [{ paymentLock: null }, { paymentLock: reference }],
    },
    { $set: { paymentLock: reference } },
    { new: true, ...opts }
  );

  if (!locked) {
    let existingQuery = mongoose.model('Order').findById(orderId);
    if (session) existingQuery = existingQuery.session(session);
    const existing = await existingQuery;
    if (!existing) throw new ApiError(404, 'Order not found');
    if (
      (existing.paymentStatus === 'paid' || existing.paymentStatus === 'refunded') &&
      existing.paymentReference === reference
    ) {
      return { order: existing, alreadyProcessed: true };
    }
    if (existing.orderStatus === 'cancelled' || existing.needsRefundReview) {
      existing.needsRefundReview = true;
      existing.gatewayResponse = 'Payment arrived after the order was cancelled';
      existing.timeline.push({
        status: 'note',
        note: `Paystack reported success for ${reference} after this order was cancelled. Review a refund.`,
        at: new Date(),
      });
      await existing.save(opts);
      return { order: existing, alreadyProcessed: false, needsRefundReview: true };
    }
    throw new ApiError(409, 'This order is already paid or locked by another payment');
  }

  if (locked.items.some((item) => item.stockState === 'released')) {
    locked.needsRefundReview = true;
    locked.paymentLock = null;
    locked.gatewayResponse = 'Payment arrived after reserved stock was released';
    locked.timeline.push({
      status: 'note',
      note: `Payment ${reference} succeeded after stock was released. Review a refund before shipping.`,
      at: new Date(),
    });
    await locked.save(opts);
    return { order: locked, alreadyProcessed: false, needsRefundReview: true };
  }

  if (locked.stockReserved || locked.items.some((item) => item.stockState === 'committing')) {
    for (const item of locked.items) {
      if (item.stockState === 'committed') continue;
      const wasAlreadyCommitting = item.stockState === 'committing';
      if (!wasAlreadyCommitting) {
        item.stockState = 'committing';
        if (!session) await locked.save();
      }
      const ok = await Product.commitStock(item.product, item.variantId, item.quantity, { session });
      if (!ok && !wasAlreadyCommitting) {
        item.stockState = 'reserved';
        if (!session) await locked.save();
        throw new ApiError(409, `Could not confirm stock for ${item.name} (EU ${item.size})`);
      }
      item.stockState = 'committed';
      if (!session) await locked.save();
    }
    locked.stockReserved = false;
  } else if (locked.items.some((item) => item.stockState !== 'committed')) {
    throw new ApiError(409, 'This order has no stock reservation to confirm');
  }

  locked.paymentStatus = 'paid';
  locked.paymentReference = reference;
  if (payment.channel) locked.paymentChannel = payment.channel;
  if (payment.network) locked.mobileNetwork = payment.network;
  if (payment.gatewayResponse) locked.gatewayResponse = String(payment.gatewayResponse).slice(0, 500);
  locked.paidAt = payment.paidAt ? new Date(payment.paidAt) : new Date();
  locked.paymentLock = null;
  if (locked.orderStatus === 'pending') {
    locked.orderStatus = 'paid';
    locked.timeline.push({ status: 'paid', note: 'Payment confirmed', at: new Date() });
  }
  await locked.save(opts);
  return { order: locked, alreadyProcessed: false };
}

async function releaseHold(orderId, { reason, cancel, reference, force }, session) {
  const Order = mongoose.model('Order');
  const lock = `release:${orderId}`;
  const opts = sessionOpts(session);
  const filter = {
    _id: orderId,
    paymentStatus: { $nin: ['paid', 'refunded'] },
    'items.stockState': { $nin: ['committing', 'committed'] },
  };
  if (!force) {
    filter.$or = [{ paymentLock: null }, { paymentLock: lock }];
  }

  const locked = await Order.findOneAndUpdate(filter, { $set: { paymentLock: lock } }, { new: true, ...opts });
  if (!locked) {
    const existing = await Order.findById(orderId);
    if (existing && (existing.paymentStatus === 'paid' || existing.paymentStatus === 'refunded')) {
      throw new ApiError(409, 'Cannot release stock for a paid order');
    }
    throw new ApiError(409, 'Stock cannot be released while a payment is being confirmed');
  }

  if (locked.stockReserved) {
    for (const item of locked.items) {
      if (item.stockState === 'released' || item.stockState === 'committed') continue;
      await Product.releaseStock(item.product, item.variantId, item.quantity, { session });
      item.stockState = 'released';
    }
    locked.stockReserved = false;
  }

  locked.paymentStatus = 'failed';
  locked.paymentLock = null;
  if (reference && !locked.paymentReference) locked.paymentReference = reference;
  locked.gatewayResponse = (reason || 'Payment was not completed').slice(0, 500);
  if (cancel && locked.orderStatus !== 'cancelled') {
    locked.orderStatus = 'cancelled';
    locked.timeline.push({ status: 'cancelled', note: locked.gatewayResponse, at: new Date() });
  } else {
    locked.timeline.push({ status: 'payment_failed', note: locked.gatewayResponse, at: new Date() });
  }
  await locked.save(opts);
  return locked;
}

orderSchema.methods.markPaid = function markPaid(payment) {
  return withOptionalTransaction((session) => settlePayment(this._id, payment, session));
};

orderSchema.methods.releaseReservation = function releaseReservation(options = {}) {
  return withOptionalTransaction((session) => releaseHold(this._id, options, session));
};

orderSchema.methods.markPaymentFailed = function markPaymentFailed({ reference = '', reason = 'Payment failed' } = {}) {
  if (this.paymentStatus === 'paid' || this.paymentStatus === 'refunded') {
    return Promise.resolve({ order: this, alreadyProcessed: true });
  }
  return this.releaseReservation({ reason, reference, cancel: false, force: true });
};

orderSchema.methods.transitionTo = async function transitionTo(nextStatus, { note = '', actor = null } = {}) {
  if (!ORDER_STATUSES.includes(nextStatus)) throw new ApiError(400, 'Unknown order status');
  const allowed = new Set(ORDER_TRANSITIONS[this.orderStatus] || []);
  if (this.orderStatus === 'pending' && nextStatus === 'processing' && this.paymentChannel === 'pay_on_delivery') {
    allowed.add('processing');
  }
  if (!allowed.has(nextStatus)) {
    throw new ApiError(400, `Cannot change an order from ${this.orderStatus} to ${nextStatus}`);
  }
  if (nextStatus === 'cancelled') {
    if (this.stockReserved) {
      return this.releaseReservation({
        reason: note || 'Order cancelled',
        cancel: true,
        force: true,
      });
    }
    this.orderStatus = 'cancelled';
    this.timeline.push({
      status: 'cancelled',
      note: note || 'Order cancelled',
      at: new Date(),
      actor: actor || undefined,
    });
    return this.save();
  }
  this.orderStatus = nextStatus;
  this.timeline.push({ status: nextStatus, note, at: new Date(), actor: actor || undefined });
  return this.save();
};

orderSchema.methods.markRefunded = function markRefunded({ note, restock = false, actor = null } = {}) {
  return withOptionalTransaction(async (session) => {
    const opts = sessionOpts(session);
    let query = mongoose.model('Order').findById(this._id);
    if (session) query = query.session(session);
    const order = await query;
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.paymentStatus !== 'paid') throw new ApiError(400, 'Only a paid order can be refunded');
    if (!note || !String(note).trim()) throw new ApiError(400, 'Add a refund note');

    if (restock) {
      for (const item of order.items) {
        if (item.stockState !== 'committed') continue;
        const ok = await Product.restock(item.product, item.variantId, item.quantity, { session });
        if (!ok) throw new ApiError(409, `Could not restock ${item.sku}`);
        item.stockState = 'released';
      }
    }

    order.paymentStatus = 'refunded';
    order.refundNote = String(note).trim().slice(0, 1000);
    order.needsRefundReview = false;
    order.timeline.push({
      status: 'refund',
      note: order.refundNote,
      at: new Date(),
      actor: actor || undefined,
    });
    await order.save(opts);
    return order;
  });
};

orderSchema.methods.rearmForPayment = async function rearmForPayment(holdMinutes) {
  if (this.paymentStatus === 'paid') throw new ApiError(409, 'This order is already paid');
  if (this.orderStatus === 'cancelled') throw new ApiError(409, 'This order is cancelled');
  if (this.stockReserved) return this;
  if (this.items.some((item) => item.stockState === 'committed' || item.stockState === 'committing')) {
    throw new ApiError(409, 'Stock for this order is already confirmed');
  }
  const minutes = Number(holdMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new ApiError(400, 'Hold time must be greater than 0');

  await reserveLines(
    this.items.map((item) => ({
      product: item.product,
      variantId: item.variantId,
      quantity: item.quantity,
      name: item.name,
      size: item.size,
    }))
  );

  this.items.forEach((item) => {
    item.stockState = 'reserved';
  });
  this.stockReserved = true;
  this.paymentStatus = 'pending';
  this.paymentLock = null;
  this.reservationExpiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await this.save();
  return this;
};

orderSchema.statics.releaseExpiredReservations = async function releaseExpiredReservations(now = new Date()) {
  const expired = await this.find({
    stockReserved: true,
    paymentLock: null,
    paymentStatus: { $in: ['pending', 'failed'] },
    orderStatus: 'pending',
    reservationExpiresAt: { $ne: null, $lte: now },
  }).select('_id');

  let released = 0;
  for (const row of expired) {
    const order = await this.findById(row._id);
    if (!order || !order.stockReserved || order.paymentLock) continue;
    try {
      await order.releaseReservation({
        reason: 'Payment window expired. Reserved stock was released.',
        cancel: true,
        force: false,
      });
      released += 1;
    } catch (err) {
      if (err.statusCode !== 409) throw err;
    }
  }
  return released;
};

module.exports = mongoose.model('Order', orderSchema);
