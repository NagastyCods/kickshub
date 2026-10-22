const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const ApiError = require('../utils/ApiError');
const { REVIEW_STATUSES } = require('../config/constants');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number from 1 to 5' },
    },
    title: { type: String, trim: true, maxlength: 80, default: '' },
    comment: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.plugin(basePlugin);
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

reviewSchema.statics.recalculate = async function recalculate(productId) {
  if (!productId) return;
  const stats = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), status: 'approved' } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const ratingsAverage = stats[0] ? Math.round(stats[0].average * 10) / 10 : 0;
  const ratingsCount = stats[0] ? stats[0].count : 0;
  await mongoose.model('Product').updateOne({ _id: productId }, { $set: { ratingsAverage, ratingsCount } });
};

reviewSchema.statics.hasPurchased = async function hasPurchased(userId, productId) {
  const Order = mongoose.model('Order');
  const count = await Order.countDocuments({
    user: userId,
    orderStatus: { $ne: 'cancelled' },
    'items.product': productId,
    $or: [{ paymentStatus: 'paid' }, { orderStatus: 'delivered' }],
  });
  return count > 0;
};

reviewSchema.statics.submit = async function submit({ userId, productId, orderId = null, rating, title = '', comment }) {
  const purchased = await this.hasPurchased(userId, productId);
  if (!purchased) throw new ApiError(403, 'Only verified buyers can review this shoe');
  const existing = await this.findOne({ user: userId, product: productId });
  if (existing) throw new ApiError(409, 'You have already reviewed this shoe');
  return this.create({
    user: userId,
    product: productId,
    order: orderId,
    rating,
    title,
    comment,
    verifiedPurchase: true,
    status: 'pending',
  });
};

reviewSchema.post('save', function refreshRatings() {
  return this.constructor.recalculate(this.product);
});

reviewSchema.post('findOneAndUpdate', async function refreshRatingsAfterUpdate() {
  const doc = await this.model.findOne(this.getQuery()).select('product');
  if (doc) await this.model.recalculate(doc.product);
});

module.exports = mongoose.model('Review', reviewSchema);
