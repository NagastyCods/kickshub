const Brand = require('../models/Brand');
const Collection = require('../models/Collection');
const Product = require('../models/Product');
const PromoCode = require('../models/PromoCode');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { roundMoney } = require('../utils/money');
const { applyCatalogPrice } = require('../services/pricing');
const slugify = require('../utils/slugify');
const { lookupSize } = require('../config/sizes');
const { storeImage } = require('../services/uploads');
const { GENDERS } = require('../config/constants');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function adminVariant(variant) {
  return {
    id: String(variant._id),
    sku: variant.sku,
    size: variant.size,
    sizeUK: variant.sizeUK,
    sizeUSMen: variant.sizeUSMen,
    sizeUSWomen: variant.sizeUSWomen,
    color: variant.color,
    colorHex: variant.colorHex,
    stock: variant.stock,
    reserved: variant.reserved,
    available: variant.available,
    price: variant.price,
    image: variant.image || '',
  };
}

function adminProduct(product, { detail = false } = {}) {
  const body = {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brandId: product.brand ? String(product.brand._id || product.brand) : '',
    brandName: product.brandName,
    collectionId: product.collectionId ? String(product.collectionId._id || product.collectionId) : '',
    collectionName: product.collectionId && product.collectionId.name ? product.collectionId.name : '',
    gender: product.gender,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    featured: product.featured,
    isNewArrival: product.isNewArrival,
    isActive: product.isActive,
    inStock: product.inStock,
    soldCount: product.soldCount || 0,
    image: product.images && product.images[0] ? product.images[0].url : '',
  };
  if (!detail) return body;
  return {
    ...body,
    description: product.description,
    tags: product.tags || [],
    images: (product.images || []).map((image) => ({ url: image.url, alt: image.alt || '', publicId: image.publicId || '' })),
    seoTitle: product.seoTitle || '',
    seoDescription: product.seoDescription || '',
    variants: (product.variants || []).map(adminVariant),
  };
}

function sizedVariant(input, productSku, index) {
  const size = lookupSize(input.size);
  const color = String(input.color || '').trim();
  if (color.length < 2) throw new ApiError(400, 'Each variant needs a color');
  const stock = Number(input.stock);
  if (!Number.isInteger(stock) || stock < 0) throw new ApiError(400, 'Stock must be a whole number');
  const price = roundMoney(input.price);
  if (!price || price < 1) throw new ApiError(400, 'Each variant needs a price');
  const colorBit = slugify(color).replace(/-/g, '').slice(0, 10).toUpperCase() || 'COLOR';
  const sku = String(input.sku || `${productSku}-${colorBit}-${String(size.eu).replace('.', '')}-${index + 1}`).toUpperCase();
  return {
    sku,
    size: size.eu,
    sizeUK: size.uk,
    sizeUSMen: size.usMen,
    sizeUSWomen: size.usWomen,
    color,
    colorHex: /^#([0-9a-fA-F]{6})$/.test(input.colorHex || '') ? input.colorHex : '#111111',
    stock,
    reserved: 0,
    available: stock,
    price,
    image: input.image ? String(input.image) : '',
  };
}

function cleanImages(images) {
  if (!Array.isArray(images) || images.length === 0) throw new ApiError(400, 'Add at least one image');
  return images.map((image) => {
    const url = String(image.url || '').trim();
    if (!/^https?:\/\//.test(url) && !url.startsWith('/uploads/')) {
      throw new ApiError(400, 'Image URLs must be http(s) or an uploaded file');
    }
    return { url, alt: String(image.alt || '').slice(0, 160), publicId: String(image.publicId || '') };
  });
}

const listProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const filter = {};
  const q = String(req.query.q || '').trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { sku: pattern }, { brandName: pattern }];
  }
  if (req.query.active === 'false') filter.isActive = false;
  if (req.query.active === 'true') filter.isActive = true;
  const [rows, total] = await Promise.all([
    Product.find(filter).populate('brand', 'name').populate('collectionId', 'name').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);
  sendSuccess(res, rows.map((row) => adminProduct(row)), 'OK', 200, {
    page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('brand', 'name').populate('collectionId', 'name');
  if (!product) throw new ApiError(404, 'Product not found');
  sendSuccess(res, { product: adminProduct(product, { detail: true }) });
});

const createProduct = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.body.brandId);
  const collection = await Collection.findById(req.body.collectionId);
  if (!brand) throw new ApiError(400, 'Choose a brand', [{ field: 'brandId', message: 'Choose a brand' }]);
  if (!collection) throw new ApiError(400, 'Choose a collection', [{ field: 'collectionId', message: 'Choose a collection' }]);
  if (!GENDERS.includes(req.body.gender)) throw new ApiError(400, 'Choose a gender');
  const name = String(req.body.name || '').trim();
  const sku = String(req.body.sku || slugify(name).replace(/-/g, '').slice(0, 16)).toUpperCase();
  if (!sku) throw new ApiError(400, 'Add a product SKU');
  const variants = (req.body.variants || []).map((variant, index) => sizedVariant(variant, sku, index));
  const product = await Product.create({
    name,
    sku,
    description: req.body.description,
    brand: brand._id,
    brandName: brand.name,
    collectionId: collection._id,
    gender: req.body.gender,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    images: cleanImages(req.body.images),
    basePrice: req.body.basePrice,
    compareAtPrice: req.body.compareAtPrice || null,
    featured: Boolean(req.body.featured),
    isNewArrival: Boolean(req.body.isNewArrival),
    isActive: req.body.isActive !== false,
    variants,
  });
  sendSuccess(res, { product: adminProduct(product, { detail: true }) }, 'Product created', 201);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  if (req.body.brandId) {
    const brand = await Brand.findById(req.body.brandId);
    if (!brand) throw new ApiError(400, 'Choose a brand');
    product.brand = brand._id;
    product.brandName = brand.name;
  }
  if (req.body.collectionId) {
    const collection = await Collection.findById(req.body.collectionId);
    if (!collection) throw new ApiError(400, 'Choose a collection');
    product.collectionId = collection._id;
  }
  ['name', 'description', 'gender', 'featured', 'isNewArrival', 'isActive', 'seoTitle', 'seoDescription'].forEach((field) => {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  });
  if (req.body.basePrice !== undefined) applyCatalogPrice(product, req.body.basePrice);
  if (Array.isArray(req.body.variants)) {
    req.body.variants.forEach((row) => {
      const variant = product.variants.id(row.id);
      if (!variant) throw new ApiError(404, 'Variant not found');
      if (row.price !== undefined) {
        const price = roundMoney(row.price);
        if (price < 1) throw new ApiError(400, 'Price must be at least 1');
        variant.price = price;
      }
    });
  }
  if (req.body.compareAtPrice === '' || req.body.compareAtPrice === null) product.compareAtPrice = null;
  else if (req.body.compareAtPrice !== undefined) product.compareAtPrice = req.body.compareAtPrice;
  if (Array.isArray(req.body.tags)) product.tags = req.body.tags;
  if (Array.isArray(req.body.images)) product.images = cleanImages(req.body.images);
  await product.save();
  if (Array.isArray(req.body.variants)) {
    for (const row of req.body.variants) {
      if (row.stock !== undefined) await Product.setVariantStock(product._id, row.id, Number(row.stock));
    }
  }
  const fresh = await Product.findById(product._id).populate('brand', 'name').populate('collectionId', 'name');
  sendSuccess(res, { product: adminProduct(fresh, { detail: true }) }, 'Product saved');
});

const updateVariant = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  const variant = product.variants.id(req.params.variantId);
  if (!variant) throw new ApiError(404, 'Variant not found');
  if (req.body.price !== undefined) {
    const price = roundMoney(req.body.price);
    if (price < 1) throw new ApiError(400, 'Price must be at least 1');
    variant.price = price;
  }
  if (req.body.color) variant.color = String(req.body.color).trim();
  if (req.body.colorHex && /^#([0-9a-fA-F]{6})$/.test(req.body.colorHex)) variant.colorHex = req.body.colorHex;
  await product.save();
  if (req.body.stock !== undefined) {
    await Product.setVariantStock(product._id, variant._id, Number(req.body.stock));
  }
  const fresh = await Product.findById(product._id);
  sendSuccess(res, { product: adminProduct(fresh, { detail: true }) }, 'Variant saved');
});

const addVariant = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  product.variants.push(sizedVariant(req.body, product.sku, product.variants.length));
  await product.save();
  sendSuccess(res, { product: adminProduct(product, { detail: true }) }, 'Size added', 201);
});

const listBrands = asyncHandler(async (_req, res) => {
  const brands = await Brand.find().sort({ sortOrder: 1, name: 1 });
  sendSuccess(res, brands);
});

const saveBrand = asyncHandler(async (req, res) => {
  const brand = req.params.id ? await Brand.findById(req.params.id) : new Brand();
  if (!brand) throw new ApiError(404, 'Brand not found');
  ['name', 'description', 'logo', 'accentColor', 'isActive', 'sortOrder'].forEach((field) => {
    if (req.body[field] !== undefined) brand[field] = req.body[field];
  });
  if (req.body.name && !req.params.id) brand.slug = undefined;
  await brand.save();
  sendSuccess(res, brand, req.params.id ? 'Brand saved' : 'Brand created', req.params.id ? 200 : 201);
});

const listCollections = asyncHandler(async (_req, res) => {
  const collections = await Collection.find().sort({ sortOrder: 1, name: 1 });
  sendSuccess(res, collections);
});

const saveCollection = asyncHandler(async (req, res) => {
  const collection = req.params.id ? await Collection.findById(req.params.id) : new Collection();
  if (!collection) throw new ApiError(404, 'Collection not found');
  ['name', 'description', 'image', 'isActive', 'sortOrder'].forEach((field) => {
    if (req.body[field] !== undefined) collection[field] = req.body[field];
  });
  if (req.body.name && !req.params.id) collection.slug = undefined;
  await collection.save();
  sendSuccess(res, collection, req.params.id ? 'Collection saved' : 'Collection created', req.params.id ? 200 : 201);
});

const listPromos = asyncHandler(async (_req, res) => {
  const promos = await PromoCode.find().sort({ createdAt: -1 });
  sendSuccess(res, promos);
});

const savePromo = asyncHandler(async (req, res) => {
  const promo = req.params.id ? await PromoCode.findById(req.params.id) : new PromoCode();
  if (!promo) throw new ApiError(404, 'Promo code not found');
  ['code', 'type', 'value', 'minSpend', 'isActive'].forEach((field) => {
    if (req.body[field] !== undefined) promo[field] = req.body[field];
  });
  if (req.body.maxDiscount === '' || req.body.maxDiscount === null) promo.maxDiscount = null;
  else if (req.body.maxDiscount !== undefined) promo.maxDiscount = req.body.maxDiscount;
  if (req.body.usageLimit === '' || req.body.usageLimit === null) promo.usageLimit = null;
  else if (req.body.usageLimit !== undefined) promo.usageLimit = req.body.usageLimit;
  if (req.body.startsAt === '' || req.body.startsAt === null) promo.startsAt = null;
  else if (req.body.startsAt) promo.startsAt = new Date(req.body.startsAt);
  if (req.body.expiresAt === '' || req.body.expiresAt === null) promo.expiresAt = null;
  else if (req.body.expiresAt) promo.expiresAt = new Date(req.body.expiresAt);
  await promo.save();
  sendSuccess(res, promo, req.params.id ? 'Promo saved' : 'Promo created', req.params.id ? 200 : 201);
});

const upload = asyncHandler(async (req, res) => {
  const image = await storeImage(req.file);
  sendSuccess(res, image, 'Image stored', 201);
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateVariant,
  addVariant,
  listBrands,
  saveBrand,
  listCollections,
  saveCollection,
  listPromos,
  savePromo,
  upload,
};
