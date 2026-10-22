const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const slugify = require('../utils/slugify');

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    logo: { type: String, default: '' },
    accentColor: {
      type: String,
      default: '#111111',
      match: [/^#([0-9a-fA-F]{6})$/, 'Accent color must be a hex value like #111111'],
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

brandSchema.plugin(basePlugin);
brandSchema.index({ isActive: 1, sortOrder: 1 });

brandSchema.pre('validate', function setSlug(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (!this.slug) this.invalidate('slug', 'Brand name must contain letters or numbers');
  next();
});

module.exports = mongoose.model('Brand', brandSchema);
