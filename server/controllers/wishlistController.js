const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { publicProduct } = require('../utils/serialize');

async function loadWishlist(userId) {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) wishlist = await Wishlist.create({ user: userId, items: [] });
  return wishlist;
}

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await loadWishlist(req.user._id);
  const ids = wishlist.items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .populate('brand', 'name slug')
    .populate('collectionId', 'name slug')
    .lean();
  const order = new Map(ids.map((id, index) => [String(id), index]));
  products.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  sendSuccess(res, products.map((product) => publicProduct(product)));
});

const addWishlist = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.body.productId, isActive: true }).select('_id');
  if (!product) throw new ApiError(404, 'That shoe is not in the shop');
  const wishlist = await loadWishlist(req.user._id);
  const exists = wishlist.items.some((item) => String(item.product) === String(product._id));
  if (!exists) {
    wishlist.items.unshift({ product: product._id, addedAt: new Date() });
    await wishlist.save();
  }
  sendSuccess(res, { saved: true }, 'Saved to wishlist');
});

const removeWishlist = asyncHandler(async (req, res) => {
  const wishlist = await loadWishlist(req.user._id);
  wishlist.items = wishlist.items.filter((item) => String(item.product) !== req.params.productId);
  await wishlist.save();
  sendSuccess(res, { saved: false }, 'Removed from wishlist');
});

module.exports = { getWishlist, addWishlist, removeWishlist };
