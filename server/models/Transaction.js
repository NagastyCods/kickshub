const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const ApiError = require('../utils/ApiError');
const { PAYMENT_CHANNELS, TRANSACTION_STATUSES } = require('../config/constants');

const transactionSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, default: '', lowercase: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    amountPesewas: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'GHS' },
    channel: { type: String, enum: ['', ...PAYMENT_CHANNELS], default: '' },
    status: { type: String, enum: TRANSACTION_STATUSES, default: 'pending' },
    event: { type: String, default: '' },
    gatewayResponse: { type: String, default: '' },
    paidAt: { type: Date },
    processedAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

transactionSchema.plugin(basePlugin);
transactionSchema.index({ order: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

transactionSchema.statics.beginProcessing = async function beginProcessing(data) {
  const reference = String(data.reference || '').trim();
  if (!reference) throw new ApiError(400, 'Payment reference is required');

  const existing = await this.findOne({ reference });
  if (existing) {
    return { transaction: existing, alreadyProcessed: Boolean(existing.processedAt) };
  }

  try {
    const created = await this.create({
      reference,
      order: data.order,
      user: data.user || null,
      email: data.email || '',
      amount: data.amount,
      amountPesewas: data.amountPesewas,
      currency: 'GHS',
      channel: data.channel || '',
      status: data.status || 'pending',
      event: data.event || '',
      gatewayResponse: data.gatewayResponse || '',
      meta: data.meta || null,
    });
    return { transaction: created, alreadyProcessed: false };
  } catch (err) {
    if (err.code !== 11000) throw err;
    const raced = await this.findOne({ reference });
    return { transaction: raced, alreadyProcessed: Boolean(raced && raced.processedAt) };
  }
};

transactionSchema.statics.markProcessed = function markProcessed(reference, extra = {}) {
  const set = {
    processedAt: new Date(),
    status: extra.status || 'success',
    gatewayResponse: extra.gatewayResponse || '',
    paidAt: extra.paidAt || new Date(),
  };
  if (extra.event) set.event = extra.event;
  if (extra.channel) set.channel = extra.channel;
  if (extra.meta) set.meta = extra.meta;
  return this.findOneAndUpdate({ reference, processedAt: null }, { $set: set }, { new: true });
};

module.exports = mongoose.model('Transaction', transactionSchema);
