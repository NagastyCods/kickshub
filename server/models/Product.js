const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const ApiError = require('../utils/ApiError');
const slugify = require('../utils/slugify');
const { roundMoney } = require('../utils/money');
const { GENDERS } = require('../config/constants');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    alt: { type: String, default: '' },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true, uppercase: true },
  size: { type: String, required: true, trim: true },
  sizeUK: { type: String, default: '' },
  sizeUSMen: { type: String, default: '' },
  sizeUSWomen: { type: String, default: '' },
  color: { type: String, required: true, trim: true },
  colorHex: { type: String, default: '#111111', trim: true },
  stock: { type: Number, required: true, min: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 },
  available: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 1 },
  image: { type: String, default: '' },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, unique: true, trim: true, lowercase: true },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    brandName: { type: String, required: true, trim: true },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', required: true },
    gender: { type: String, required: true, enum: GENDERS },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    images: {
      type: [imageSchema],
      validate: [(images) => images.length > 0, 'Add at least one image'],
    },
    basePrice: { type: Number, required: true, min: 1 },
    compareAtPrice: { type: Number, default: null },
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    colors: [{ type: String }],
    sizes: [{ type: String }],
    variants: {
      type: [variantSchema],
      validate: [(variants) => variants.length > 0, 'Add at least one size and color'],
    },
    featured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    inStock: { type: Boolean, default: false },
    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    seoTitle: { type: String, trim: true, maxlength: 70, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { timestamps: true }
);

productSchema.plugin(basePlugin);

productSchema.index(
  { name: 'text', description: 'text', tags: 'text', brandName: 'text' },
  { weights: { name: 10, brandName: 8, tags: 5, description: 1 }, name: 'ProductTextIndex' }
);
productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, basePrice: 1 });
productSchema.index({ isActive: 1, soldCount: -1 });
productSchema.index({ isActive: 1, brand: 1 });
productSchema.index({ isActive: 1, collectionId: 1 });
productSchema.index({ isActive: 1, gender: 1 });
productSchema.index({ isActive: 1, featured: 1 });
productSchema.index({ isActive: 1, isNewArrival: 1 });
productSchema.index({ isActive: 1, inStock: 1 });
productSchema.index({ colors: 1 });
productSchema.index({ sizes: 1 });

productSchema.virtual('discountPercent').get(function discountPercent() {
  if (!this.compareAtPrice || this.compareAtPrice <= this.basePrice) return 0;
  return Math.round((1 - this.basePrice / this.compareAtPrice) * 100);
});

productSchema.pre('validate', function deriveCatalogFields(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (!this.slug) this.invalidate('name', 'Product name must contain letters or numbers');
  if (this.sku) this.sku = String(this.sku).toUpperCase();
  this.basePrice = roundMoney(this.basePrice);

  if (this.compareAtPrice != null) {
    this.compareAtPrice = roundMoney(this.compareAtPrice);
    if (this.compareAtPrice <= this.basePrice) {
      this.invalidate('compareAtPrice', 'Compare-at price must be higher than the selling price');
    }
  }

  const seen = new Set();
  this.variants.forEach((variant) => {
    if (variant.reserved == null) variant.reserved = 0;
    if (variant.price == null) variant.price = this.basePrice;
    variant.price = roundMoney(variant.price);
    variant.sku = String(variant.sku || '').toUpperCase();
    if (variant.isModified('stock') || variant.isModified('reserved') || variant.available == null || this.isNew) {
      variant.available = Math.max(0, Number(variant.stock) - Number(variant.reserved));
    }
    if (seen.has(variant.sku)) this.invalidate('variants', `Duplicate variant SKU ${variant.sku}`);
    seen.add(variant.sku);
  });

  if (this.variants.length) {
    const prices = this.variants.map((variant) => variant.price);
    this.minPrice = Math.min(...prices);
    this.maxPrice = Math.max(...prices);
    this.colors = [...new Set(this.variants.map((variant) => variant.color))];
    this.sizes = [...new Set(this.variants.map((variant) => variant.size))];
    this.inStock = this.variants.some((variant) => variant.available > 0);
  }

  if (!this.seoTitle) this.seoTitle = `${this.name} | KicksHub`.slice(0, 70);
  if (!this.seoDescription && this.description) this.seoDescription = this.description.slice(0, 160);
  next();
});

function variantObjectId(variantId) {
  if (!mongoose.Types.ObjectId.isValid(variantId)) throw new ApiError(400, 'Invalid variant');
  return new mongoose.Types.ObjectId(String(variantId));
}

function assertQuantity(quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(400, 'Quantity must be a positive whole number');
  return qty;
}

function withSession(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function syncInStock(productId, session) {
  let query = this.findById(productId).select('variants');
  if (session) query = query.session(session);
  const product = await query;
  if (!product) return;
  const inStock = product.variants.some((variant) => variant.available > 0);
  await this.updateOne({ _id: productId }, { $set: { inStock } }, withSession(session));
}

/**
 * available + reserved === stock, until a sale commits.
 * reserve: available -= qty, reserved += qty
 * release: available += qty, reserved -= qty
 * commit: stock -= qty, reserved -= qty (available stays down)
 * restock: stock += qty, available += qty
 * arrayFilters make the check and the write one atomic update.
 */
async function adjust(productId, variantId, quantity, mode, session) {
  const qty = assertQuantity(quantity);
  const id = variantObjectId(variantId);
  let update;
  let filter;

  if (mode === 'reserve') {
    update = { $inc: { 'variants.$[v].available': -qty, 'variants.$[v].reserved': qty } };
    filter = { 'v._id': id, 'v.available': { $gte: qty } };
  } else if (mode === 'release') {
    update = { $inc: { 'variants.$[v].available': qty, 'variants.$[v].reserved': -qty } };
    filter = { 'v._id': id, 'v.reserved': { $gte: qty } };
  } else if (mode === 'commit') {
    update = {
      $inc: {
        'variants.$[v].stock': -qty,
        'variants.$[v].reserved': -qty,
        soldCount: qty,
      },
    };
    filter = { 'v._id': id, 'v.reserved': { $gte: qty }, 'v.stock': { $gte: qty } };
  } else if (mode === 'restock') {
    update = {
      $inc: {
        'variants.$[v].stock': qty,
        'variants.$[v].available': qty,
        soldCount: -qty,
      },
    };
    filter = { 'v._id': id };
  } else {
    throw new ApiError(500, 'Unknown stock operation');
  }

  const result = await this.updateOne(
    { _id: productId },
    update,
    withSession(session, { arrayFilters: [filter] })
  );

  if (result.modifiedCount !== 1) return false;

  if (mode === 'restock') {
    await this.updateOne(
      { _id: productId, soldCount: { $lt: 0 } },
      { $set: { soldCount: 0 } },
      withSession(session)
    );
  }
  await syncInStock.call(this, productId, session);
  return true;
}

productSchema.statics.reserveStock = function reserveStock(productId, variantId, quantity, options = {}) {
  return adjust.call(this, productId, variantId, quantity, 'reserve', options.session);
};

productSchema.statics.releaseStock = function releaseStock(productId, variantId, quantity, options = {}) {
  return adjust.call(this, productId, variantId, quantity, 'release', options.session);
};

productSchema.statics.commitStock = function commitStock(productId, variantId, quantity, options = {}) {
  return adjust.call(this, productId, variantId, quantity, 'commit', options.session);
};

productSchema.statics.restock = function restock(productId, variantId, quantity, options = {}) {
  return adjust.call(this, productId, variantId, quantity, 'restock', options.session);
};

productSchema.statics.setVariantStock = async function setVariantStock(productId, variantId, nextStock) {
  if (!Number.isInteger(nextStock) || nextStock < 0) {
    throw new ApiError(400, 'Stock must be a non-negative whole number');
  }
  const id = variantObjectId(variantId);
  const product = await this.findOne({ _id: productId, 'variants._id': id }).select('variants');
  if (!product) throw new ApiError(404, 'Variant not found');
  const variant = product.variants.id(id);
  if (nextStock < variant.reserved) {
    throw new ApiError(409, 'Stock cannot be lower than units already reserved at checkout');
  }
  const result = await this.updateOne(
    { _id: productId },
    { $set: { 'variants.$[v].stock': nextStock, 'variants.$[v].available': nextStock - variant.reserved } },
    { arrayFilters: [{ 'v._id': id, 'v.reserved': variant.reserved }] }
  );
  if (result.matchedCount !== 1) throw new ApiError(409, 'Stock changed while saving. Try again.');
  await syncInStock.call(this, productId);
  return this.findById(productId);
};

module.exports = mongoose.model('Product', productSchema);
