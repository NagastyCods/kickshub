const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const slugify = require('../utils/slugify');

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    seoTitle: { type: String, trim: true, maxlength: 70, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { timestamps: true }
);

collectionSchema.plugin(basePlugin);
collectionSchema.index({ isActive: 1, sortOrder: 1 });

collectionSchema.pre('validate', function setSlug(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (!this.slug) this.invalidate('slug', 'Collection name must contain letters or numbers');
  next();
});

module.exports = mongoose.model('Collection', collectionSchema);
