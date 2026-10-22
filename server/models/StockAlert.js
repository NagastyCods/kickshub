const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const { normalizeGhanaPhone } = require('../utils/phone');

const stockAlertSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    phone: {
      type: String,
      default: '',
      set: (value) => (value ? normalizeGhanaPhone(value) || value : ''),
    },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    notified: { type: Boolean, default: false },
    notifiedAt: { type: Date },
  },
  { timestamps: true }
);

stockAlertSchema.plugin(basePlugin);
stockAlertSchema.index({ product: 1, email: 1, size: 1, color: 1 }, { unique: true });
stockAlertSchema.index({ product: 1, notified: 1 });

module.exports = mongoose.model('StockAlert', stockAlertSchema);
