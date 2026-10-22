const Order = require('../models/Order');
const Cart = require('../models/Cart');
const PromoCode = require('../models/PromoCode');
const Settings = require('../models/Settings');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { publicOrder } = require('../utils/serialize');
const { quoteOrder } = require('../services/pricing');
const { reserveLines, releaseLines } = require('../services/inventory');
const { generatePaymentReference } = require('../utils/orderNumber');
const { toPesewas } = require('../utils/money');
const { normalizeGhanaPhone, paystackProviderFor } = require('../utils/phone');
const { PAYMENT_CHANNELS, DELIVERY_METHODS, GHANA_REGIONS } = require('../config/constants');
const { initializeTransaction, chargeMobileMoney } = require('../services/paystack');
const { sendOrderConfirmation } = require('../services/email');
const { notifyOrder } = require('../services/notify');
const { signInvoice, readInvoice } = require('../middleware/auth');
const { buildInvoice } = require('../services/invoice');
const env = require('../config/env');

function normalizeAddress(input) {
  const address = input || {};
  const phone = normalizeGhanaPhone(address.phone);
  if (!address.fullName || String(address.fullName).trim().length < 2) {
    throw new ApiError(400, 'Enter the recipient name', [{ field: 'fullName', message: 'Enter the recipient name' }]);
  }
  if (!phone) throw new ApiError(400, 'Enter a valid Ghana phone number', [{ field: 'phone', message: 'Enter a valid Ghana phone number' }]);
  if (!GHANA_REGIONS.includes(address.region)) {
    throw new ApiError(400, 'Choose a region', [{ field: 'region', message: 'Choose a region' }]);
  }
  if (!address.city || !String(address.city).trim()) {
    throw new ApiError(400, 'Enter a city', [{ field: 'city', message: 'Enter a city' }]);
  }
  if (!address.street || String(address.street).trim().length < 3) {
    throw new ApiError(400, 'Enter the street address', [{ field: 'street', message: 'Enter the street address' }]);
  }
  const digitalAddress = address.digitalAddress ? String(address.digitalAddress).replace(/\s+/g, '').toUpperCase() : '';
  if (digitalAddress && !/^[A-Z]{2}-\d{3,4}-\d{4}$/.test(digitalAddress)) {
    throw new ApiError(400, 'Digital address must look like GA-184-1234', [{ field: 'digitalAddress', message: 'Use the GhanaPost GPS format, like GA-184-1234' }]);
  }
  return {
    fullName: String(address.fullName).trim(),
    phone,
    region: address.region,
    city: String(address.city).trim(),
    digitalAddress,
    street: String(address.street).trim(),
    landmark: address.landmark ? String(address.landmark).trim() : '',
  };
}

function normalizeLines(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'Your cart is empty');
  return items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: Number(item.quantity),
  }));
}

async function emailOnce(order) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, emailSent: false },
    { $set: { emailSent: true } }
  );
  if (!claimed) return;
  try {
    await sendOrderConfirmation(claimed);
    await notifyOrder(claimed, claimed.paymentStatus === 'paid' ? 'paid' : 'placed');
  } catch (err) {
    console.error(`Order email failed for ${claimed.orderNumber}: ${err.message}`);
  }
}

async function startPayment(order, { channel, email, network, phone }) {
  if (channel === 'pay_on_delivery') {
    return { channel, status: 'pay_on_delivery' };
  }
  const reference = generatePaymentReference();
  order.paymentReference = reference;
  order.paymentLock = null;
  order.paymentChannel = channel;
  if (network) order.mobileNetwork = network;
  await order.save();
  const amountPesewas = toPesewas(order.total);
  const metadata = { orderNumber: order.orderNumber, paymentChannel: channel, mobileNetwork: network || '' };

  if (channel === 'card') {
    const data = await initializeTransaction({ email, amountPesewas, reference, metadata });
    return {
      channel,
      reference,
      accessCode: data.access_code,
      authorizationUrl: data.authorization_url,
      publicKey: env.paystack.publicKey,
      amountPesewas,
      email,
    };
  }

  const provider = paystackProviderFor(network);
  if (!provider) throw new ApiError(400, 'Choose MTN, Telecel, or AirtelTigo', [{ field: 'mobileNetwork', message: 'Choose a network' }]);
  const local = normalizeGhanaPhone(phone);
  if (!local) throw new ApiError(400, 'Enter the Mobile Money number', [{ field: 'mobileNumber', message: 'Enter the Mobile Money number' }]);
  const result = await chargeMobileMoney({ email, amountPesewas, reference, phone: local, provider });
  const status = result.data && result.data.status;
  const displayText = (result.data && (result.data.display_text || result.data.message)) || result.message || 'Approve the prompt on your phone';
  order.gatewayResponse = String(displayText).slice(0, 500);
  await order.save();
  if (status === 'success') {
    await order.markPaid({ reference, channel: 'mobile_money', network, gatewayResponse: displayText });
  }
  return { channel, reference, status: status || 'pay_offline', displayText, amountPesewas };
}

const quote = asyncHandler(async (req, res) => {
  const address = req.body.shippingAddress || {};
  const region = req.body.region || address.region;
  const result = await quoteOrder({
    lines: normalizeLines(req.body.items),
    region,
    deliveryMethod: req.body.deliveryMethod || 'standard',
    promoCode: req.body.promoCode || '',
    paymentChannel: req.body.paymentChannel || '',
  });
  sendSuccess(res, {
    subtotal: result.subtotal,
    discount: result.discount,
    deliveryFee: result.deliveryFee,
    payOnDeliveryFee: result.payOnDeliveryFee,
    total: result.total,
    currency: result.currency,
    promo: result.promo,
    delivery: result.delivery,
    items: result.items.map((item) => ({
      productId: String(item.product),
      variantId: String(item.variantId),
      name: item.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      image: item.image,
    })),
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const channel = req.body.paymentChannel;
  if (!PAYMENT_CHANNELS.includes(channel)) throw new ApiError(400, 'Choose a payment method');
  if (!DELIVERY_METHODS.includes(req.body.deliveryMethod)) throw new ApiError(400, 'Choose standard or express delivery');
  const settings = await Settings.getStore();
  if (channel === 'card' && !settings.paystackCardEnabled) throw new ApiError(400, 'Card payment is turned off');
  if (channel === 'mobile_money' && !settings.paystackMobileMoneyEnabled) throw new ApiError(400, 'Mobile Money is turned off');
  if (channel === 'pay_on_delivery' && !settings.payOnDeliveryEnabled) throw new ApiError(400, 'Payment on delivery is turned off');
  if (channel !== 'pay_on_delivery' && !env.paystack.secretKey) throw new ApiError(503, 'Paystack is not configured yet');

  const shippingAddress = normalizeAddress(req.body.shippingAddress);
  const email = (req.user ? req.user.email : String(req.body.email || '')).toLowerCase().trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, 'Enter a valid email', [{ field: 'email', message: 'Enter a valid email' }]);

  const priced = await quoteOrder({
    lines: normalizeLines(req.body.items),
    region: shippingAddress.region,
    deliveryMethod: req.body.deliveryMethod,
    promoCode: req.body.promoCode || '',
    paymentChannel: channel,
  });

  let reserved = false;
  let order = null;
  try {
    await reserveLines(priced.items);
    reserved = true;
    const minutes = channel === 'mobile_money' ? env.reservationMinutes.mobile_money : env.reservationMinutes.card;
    order = await Order.create({
      user: req.user ? req.user._id : null,
      customerEmail: email,
      customerPhone: shippingAddress.phone,
      customerName: shippingAddress.fullName,
      items: priced.items.map((item) => ({ ...item, stockState: 'reserved' })),
      shippingAddress,
      deliveryMethod: req.body.deliveryMethod,
      deliveryEstimate: priced.delivery.estimate,
      customerNote: req.body.customerNote ? String(req.body.customerNote).slice(0, 300) : '',
      discount: priced.discount,
      promoCode: priced.promo ? priced.promo.code : '',
      promo: priced.promo ? priced.promo.id : null,
      deliveryFee: priced.deliveryFee,
      payOnDeliveryFee: priced.payOnDeliveryFee,
      paymentChannel: channel,
      mobileNetwork: channel === 'mobile_money' ? req.body.mobileNetwork : '',
      stockReserved: true,
      reservationExpiresAt: channel === 'pay_on_delivery' ? null : new Date(Date.now() + minutes * 60 * 1000),
      timeline: [{ status: 'pending', note: 'Order placed', at: new Date() }],
    });
    if (priced.promo) {
      const consumed = await PromoCode.commitUsage(priced.promo.id);
      if (!consumed) {
        await order.releaseReservation({ reason: 'Promo code reached its usage limit', cancel: true, force: true });
        throw new ApiError(400, 'That promo code just reached its usage limit');
      }
    }
  } catch (err) {
    if (reserved && !order) await releaseLines(priced.items);
    throw err;
  }

  if (req.user) await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });

  let payment = { channel };
  try {
    payment = await startPayment(order, {
      channel,
      email,
      network: req.body.mobileNetwork,
      phone: req.body.mobileNumber || shippingAddress.phone,
    });
  } catch (err) {
    payment = { channel, error: err.message || 'Payment could not start' };
  }

  const fresh = await Order.findById(order._id);
  if (channel === 'pay_on_delivery') await emailOnce(fresh);
  if (payment.status === 'success') await emailOnce(await Order.findById(order._id));

  sendSuccess(res, {
    order: publicOrder(await Order.findById(order._id)),
    payment,
    invoiceToken: signInvoice(fresh),
  }, 'Order created', 201);
});

async function findReadableOrder(req) {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  const email = String(req.query.email || req.body.email || '').toLowerCase();
  const owns = req.user && order.user && String(order.user) === String(req.user._id);
  const admin = req.user && req.user.role === 'admin';
  const guest = email && email === order.customerEmail;
  if (!owns && !admin && !guest) throw new ApiError(404, 'Order not found');
  return order;
}

const listOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  sendSuccess(res, orders.map(publicOrder));
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await findReadableOrder(req);
  sendSuccess(res, { order: publicOrder(order), invoiceToken: signInvoice(order) });
});

const retryPayment = asyncHandler(async (req, res) => {
  const order = await findReadableOrder(req);
  if (order.paymentStatus === 'paid') return sendSuccess(res, { order: publicOrder(order), payment: { status: 'success' } }, 'Already paid');
  if (order.orderStatus === 'cancelled') throw new ApiError(409, 'This order was cancelled');
  const channel = req.body.paymentChannel || order.paymentChannel;
  if (!PAYMENT_CHANNELS.includes(channel) || channel === 'pay_on_delivery') {
    throw new ApiError(400, 'Choose card or Mobile Money');
  }
  const minutes = channel === 'mobile_money' ? env.reservationMinutes.mobile_money : env.reservationMinutes.card;
  if (!order.stockReserved) await order.rearmForPayment(minutes);
  order.reservationExpiresAt = new Date(Date.now() + minutes * 60 * 1000);
  order.paymentLock = null;
  order.paymentChannel = channel;
  await order.save();
  const payment = await startPayment(order, {
    channel,
    email: order.customerEmail,
    network: req.body.mobileNetwork || order.mobileNetwork,
    phone: req.body.mobileNumber || order.customerPhone,
  });
  const fresh = await Order.findById(order._id);
  if (payment.status === 'success') await emailOnce(fresh);
  sendSuccess(res, { order: publicOrder(fresh), payment, invoiceToken: signInvoice(fresh) });
});

const invoice = asyncHandler(async (req, res) => {
  let email = '';
  if (req.query.token) {
    try {
      email = readInvoice(req.query.token).email;
    } catch (_err) {
      throw new ApiError(401, 'Invalid invoice link');
    }
  }
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw new ApiError(404, 'Order not found');
  const owns = req.user && order.user && String(order.user) === String(req.user._id);
  const admin = req.user && req.user.role === 'admin';
  if (!owns && !admin && email !== order.customerEmail) throw new ApiError(404, 'Order not found');
  const settings = await Settings.getStore();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.orderNumber}.pdf"`);
  buildInvoice(order, settings).pipe(res);
});

module.exports = { quote, createOrder, listOrders, getOrder, retryPayment, invoice, emailOnce, findReadableOrder };
