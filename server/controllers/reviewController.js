const Review = require('../models/Review');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const listReviews = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).select('_id');
  if (!product) throw new ApiError(404, 'That shoe is not in the shop');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 8;
  const filter = { product: product._id, status: 'approved' };
  const [rows, total] = await Promise.all([
    Review.find(filter).populate('user', 'firstName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
  ]);
  sendSuccess(res, rows.map((review) => ({
    id: String(review._id),
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    author: review.user ? review.user.firstName : 'Buyer',
    createdAt: review.createdAt,
    verifiedPurchase: review.verifiedPurchase,
  })), 'OK', 200, { page, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

const createReview = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).select('_id');
  if (!product) throw new ApiError(404, 'That shoe is not in the shop');
  const review = await Review.submit({
    userId: req.user._id,
    productId: product._id,
    rating: Number(req.body.rating),
    title: req.body.title || '',
    comment: req.body.comment,
  });
  sendSuccess(res, {
    id: String(review._id),
    status: review.status,
  }, 'Review submitted for moderation', 201);
});

module.exports = { listReviews, createReview };
