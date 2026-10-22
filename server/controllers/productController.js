const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Collection = require('../models/Collection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { publicProduct } = require('../utils/serialize');

const SORTS = {
  newest: { createdAt: -1 },
  'price-asc': { basePrice: 1, createdAt: -1 },
  'price-desc': { basePrice: -1, createdAt: -1 },
  popular: { soldCount: -1, createdAt: -1 },
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildFilter(query) {
  const filter = { isActive: true };
  if (query.gender === 'men' || query.gender === 'women') {
    filter.gender = { $in: [query.gender, 'unisex'] };
  } else if (query.gender === 'unisex' || query.gender === 'kids') {
    filter.gender = query.gender;
  }
  if (query.featured === 'true') filter.featured = true;
  if (query.new === 'true') filter.isNewArrival = true;
  if (query.size) filter.sizes = String(query.size);
  if (query.color) filter.colors = new RegExp(`^${escapeRegex(query.color)}$`, 'i');
  const min = Number(query.minPrice);
  const max = Number(query.maxPrice);
  if (Number.isFinite(min) && min > 0) filter.basePrice = { ...(filter.basePrice || {}), $gte: min };
  if (Number.isFinite(max) && max > 0) filter.basePrice = { ...(filter.basePrice || {}), $lte: max };
  if (query.brand) {
    const brand = await Brand.findOne({ slug: String(query.brand).toLowerCase(), isActive: true }).select('_id');
    if (!brand) return null;
    filter.brand = brand._id;
  }
  if (query.collection) {
    const collection = await Collection.findOne({ slug: String(query.collection).toLowerCase(), isActive: true }).select('_id');
    if (!collection) return null;
    filter.collectionId = collection._id;
  }
  if (query.q && String(query.q).trim()) {
    const term = String(query.q).trim();
    if (term.length >= 2) filter.$text = { $search: term };
  }
  return filter;
}

const listProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const filter = await buildFilter(req.query);
  if (!filter) {
    return sendSuccess(res, [], 'OK', 200, { page, limit, total: 0, pages: 1, hasNext: false, hasPrev: false });
  }
  const sortKey = SORTS[req.query.sort] ? req.query.sort : (filter.$text ? 'relevance' : 'newest');
  let query = Product.find(filter).populate('brand', 'name slug').populate('collectionId', 'name slug');
  if (sortKey === 'relevance') {
    query = query.select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });
  } else {
    query = query.sort(SORTS[sortKey]);
  }
  const [rows, total] = await Promise.all([
    query.skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / limit));
  return sendSuccess(res, rows.map((row) => publicProduct(row)), 'OK', 200, {
    page, limit, total, pages, hasNext: page < pages, hasPrev: page > 1, sort: sortKey,
  });
});

const suggestProducts = asyncHandler(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return sendSuccess(res, []);
  const rows = await Product.find({
    isActive: true,
    name: new RegExp(escapeRegex(term), 'i'),
  })
    .select('name slug brandName basePrice images')
    .sort({ soldCount: -1 })
    .limit(6)
    .lean();
  sendSuccess(res, rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    brandName: row.brandName,
    price: row.basePrice,
    image: row.images && row.images[0] ? row.images[0].url : '',
  })));
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('brand', 'name slug')
    .populate('collectionId', 'name slug');
  if (!product) throw new ApiError(404, 'That shoe is not in the shop');
  const related = await Product.find({
    isActive: true,
    _id: { $ne: product._id },
    $or: [{ collectionId: product.collectionId }, { brand: product.brand }],
  })
    .populate('brand', 'name slug')
    .populate('collectionId', 'name slug')
    .sort({ soldCount: -1 })
    .limit(4)
    .lean();
  sendSuccess(res, {
    product: publicProduct(product, { detail: true }),
    related: related.map((row) => publicProduct(row)),
  });
});

module.exports = { listProducts, suggestProducts, getProduct };
