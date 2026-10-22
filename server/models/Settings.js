const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const {
  DELIVERY_FEES,
  GHANA_REGIONS,
  DELIVERY_METHODS,
  LOW_STOCK_DEFAULT,
} = require('../config/constants');
const { normalizeGhanaPhone } = require('../utils/phone');

const feeSchema = new mongoose.Schema(
  {
    region: { type: String, required: true, enum: GHANA_REGIONS },
    standardFee: { type: Number, required: true, min: 0 },
    expressFee: { type: Number, required: true, min: 0 },
    standardDays: { type: String, required: true },
    expressDays: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

function defaultFees() {
  return DELIVERY_FEES.map((fee) => ({ ...fee, isActive: true }));
}

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'store' },
    storeName: { type: String, default: 'KicksHub', trim: true },
    tagline: { type: String, default: 'Sneakers delivered across Ghana', trim: true },
    email: { type: String, default: 'hello@kickshub.com', trim: true, lowercase: true },
    phone: {
      type: String,
      default: '0302744100',
      set: (value) => (value ? normalizeGhanaPhone(value) || value : ''),
    },
    whatsapp: {
      type: String,
      default: '0240000000',
      set: (value) => (value ? normalizeGhanaPhone(value) || value : ''),
    },
    address: { type: String, default: 'Oxford Street, Osu, Accra', trim: true },
    currency: { type: String, default: 'GHS' },
    currencySymbol: { type: String, default: '₵' },
    paystackCardEnabled: { type: Boolean, default: true },
    paystackMobileMoneyEnabled: { type: Boolean, default: true },
    payOnDeliveryEnabled: { type: Boolean, default: true },
    payOnDeliveryFee: { type: Number, default: 0, min: 0 },
    freeDeliveryThreshold: { type: Number, default: null, min: 0 },
    lowStockThreshold: { type: Number, default: LOW_STOCK_DEFAULT, min: 1 },
    newsletterEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    deliveryFees: { type: [feeSchema], default: defaultFees },
    social: {
      instagram: { type: String, default: 'https://instagram.com/kickshub' },
      tiktok: { type: String, default: 'https://www.tiktok.com/@kickshub' },
      facebook: { type: String, default: '' },
      x: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

settingsSchema.plugin(basePlugin);

settingsSchema.pre('validate', function uniqueRegions(next) {
  const regions = this.deliveryFees.map((fee) => fee.region);
  if (new Set(regions).size !== regions.length) {
    this.invalidate('deliveryFees', 'Each region can only have one delivery fee');
  }
  next();
});

settingsSchema.methods.quoteDelivery = function quoteDelivery(region, method = 'standard') {
  if (!DELIVERY_METHODS.includes(method)) return null;
  const row = this.deliveryFees.find((fee) => fee.region === region && fee.isActive);
  if (!row) return null;
  if (method === 'express') {
    return { region, method, fee: row.expressFee, estimate: row.expressDays };
  }
  return { region, method: 'standard', fee: row.standardFee, estimate: row.standardDays };
};

settingsSchema.statics.getStore = async function getStore() {
  let settings = await this.findOne({ key: 'store' });
  if (!settings) settings = await this.create({ key: 'store' });
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
