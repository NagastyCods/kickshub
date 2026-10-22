const mongoose = require('mongoose');
const basePlugin = require('./plugins');

const newsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    source: { type: String, enum: ['footer', 'popup', 'checkout'], default: 'footer' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

newsletterSchema.plugin(basePlugin);

module.exports = mongoose.model('Newsletter', newsletterSchema);
