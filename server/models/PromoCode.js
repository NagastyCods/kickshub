const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const { roundMoney } = require('../utils/money');
const { PROMO_TYPES } = require('../config/constants');

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{3,20}$/, 'Use 3–20 letters or numbers'],
    },
    type: { type: String, required: true, enum: PROMO_TYPES },
    value: { type: Number, required: true, min: 0 },
    minSpend: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    brands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
  },
  { timestamps: true }
);

promoCodeSchema.plugin(basePlugin);

promoCodeSchema.pre('validate', function checkValue(next) {
  if (this.type === 'percentage' && (this.value <= 0 || this.value > 100)) {
    this.invalidate('value', 'Percentage discounts must be between 0 and 100');
  }
  if (this.type === 'fixed' && this.value <= 0) {
    this.invalidate('value', 'Fixed discounts must be greater than 0');
  }
  if (this.usageLimit != null && this.usageLimit < 1) {
    this.invalidate('usageLimit', 'Usage limit must be at least 1');
  }
  if (this.startsAt && this.expiresAt && this.startsAt >= this.expiresAt) {
    this.invalidate('expiresAt', 'Expiry must be after the start date');
  }
  next();
});

promoCodeSchema.methods.isCurrentlyValid = function isCurrentlyValid(now = new Date()) {
  if (!this.isActive) return { ok: false, reason: 'That promo code is not active' };
  if (this.startsAt && this.startsAt > now) return { ok: false, reason: 'That promo code is not active yet' };
  if (this.expiresAt && this.expiresAt < now) return { ok: false, reason: 'That promo code has expired' };
  if (this.usageLimit != null && this.usedCount >= this.usageLimit) {
    return { ok: false, reason: 'That promo code has reached its usage limit' };
  }
  return { ok: true };
};

promoCodeSchema.methods.calculateDiscount = function calculateDiscount(subtotal) {
  const spend = roundMoney(subtotal);
  if (spend < this.minSpend) {
    return { ok: false, reason: `This code needs a minimum spend of GHS ${roundMoney(this.minSpend).toFixed(2)}` };
  }
  let discount = this.type === 'percentage' ? (spend * this.value) / 100 : this.value;
  if (this.maxDiscount != null) discount = Math.min(discount, this.maxDiscount);
  discount = roundMoney(Math.min(discount, spend));
  if (discount <= 0) return { ok: false, reason: 'That promo code does not change the total' };
  return { ok: true, discount };
};

promoCodeSchema.statics.quote = async function quote(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, reason: 'Enter a promo code' };
  const promo = await this.findOne({ code });
  if (!promo) return { ok: false, reason: 'That promo code is not valid' };
  const validity = promo.isCurrentlyValid();
  if (!validity.ok) return validity;
  const pricing = promo.calculateDiscount(subtotal);
  if (!pricing.ok) return pricing;
  return { ok: true, discount: pricing.discount, promo };
};

promoCodeSchema.statics.commitUsage = function commitUsage(promoId) {
  return this.findOneAndUpdate(
    {
      _id: promoId,
      isActive: true,
      $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
};

promoCodeSchema.statics.releaseUsage = function releaseUsage(promoId) {
  return this.findOneAndUpdate(
    { _id: promoId, usedCount: { $gte: 1 } },
    { $inc: { usedCount: -1 } },
    { new: true }
  );
};

module.exports = mongoose.model('PromoCode', promoCodeSchema);
