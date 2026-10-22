const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { publicOrder } = require('../utils/serialize');
const { verifyTransaction, submitOtp } = require('../services/paystack');
const { toPesewas } = require('../utils/money');
const { emailOnce } = require('./orderController');
const env = require('../config/env');
const { signaturesMatch } = require('../utils/signature');

async function settle(reference, data) {
  const order = await Order.findOne({ paymentReference: reference });
  if (!order) return { status: 'missing' };
  const channel = data.channel === 'mobile_money' ? 'mobile_money' : (data.channel === 'card' ? 'card' : order.paymentChannel);
  const claim = await Transaction.beginProcessing({
    reference,
    order: order._id,
    user: order.user,
    email: order.customerEmail,
    amount: order.total,
    amountPesewas: toPesewas(order.total),
    channel,
    status: 'pending',
    event: data.status,
    gatewayResponse: data.gateway_response || '',
  });
  if (claim.alreadyProcessed || order.paymentStatus === 'paid') {
    return { status: 'success', order: publicOrder(order), alreadyProcessed: true };
  }
  if (data.status === 'success') {
    const result = await order.markPaid({
      reference,
      channel,
      network: order.mobileNetwork,
      gatewayResponse: data.gateway_response || 'Payment confirmed',
      paidAt: data.paid_at,
    });
    await Transaction.markProcessed(reference, {
      status: 'success',
      event: 'charge.success',
      channel,
      gatewayResponse: data.gateway_response || '',
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
    });
    if (!result.needsRefundReview) await emailOnce(result.order);
    return {
      status: result.needsRefundReview ? 'review' : 'success',
      order: publicOrder(result.order),
      alreadyProcessed: result.alreadyProcessed,
    };
  }
  if (data.status === 'failed' || data.status === 'abandoned') {
    const failed = await order.markPaymentFailed({
      reference,
      reason: data.gateway_response || 'Payment was not completed',
    });
    const doc = failed.order || failed;
    await Transaction.markProcessed(reference, {
      status: 'failed',
      event: `charge.${data.status}`,
      gatewayResponse: data.gateway_response || '',
    });
    return { status: data.status, order: publicOrder(doc) };
  }
  return {
    status: data.status || 'pending',
    displayText: data.display_text || data.gateway_response || order.gatewayResponse || 'Approve the prompt on your phone',
    order: publicOrder(order),
  };
}

const verify = asyncHandler(async (req, res) => {
  const data = await verifyTransaction(req.params.reference);
  const result = await settle(req.params.reference, data);
  if (result.status === 'missing') throw new ApiError(404, 'Payment not found');
  sendSuccess(res, result);
});

const otp = asyncHandler(async (req, res) => {
  const reference = String(req.body.reference || '');
  const code = String(req.body.otp || '').trim();
  if (!reference || !code) throw new ApiError(400, 'Enter the code from your phone');
  await submitOtp({ reference, otp: code });
  const data = await verifyTransaction(reference);
  const result = await settle(reference, data);
  sendSuccess(res, result);
});

async function webhook(req, res) {
  if (!signaturesMatch(env.paystack.secretKey, req.rawBody, req.get('x-paystack-signature'))) {
    return res.status(401).json({ success: false, message: 'Invalid signature', errors: [] });
  }
  const event = req.body || {};
  const data = event.data || {};
  const reference = data.reference;
  try {
    if (reference && (event.event === 'charge.success' || data.status === 'success')) {
      await settle(reference, { ...data, status: 'success' });
    } else if (reference && (event.event === 'charge.failed' || data.status === 'failed')) {
      await settle(reference, { ...data, status: 'failed' });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ success: false, message: 'Webhook failed', errors: [] });
  }
  return res.status(200).json({ success: true });
}

module.exports = { verify, otp, webhook };
