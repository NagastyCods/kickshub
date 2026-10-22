const mongoose = require('mongoose');
const basePlugin = require('./plugins');

const wishlistItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [wishlistItemSchema],
  },
  { timestamps: true }
);

wishlistSchema.plugin(basePlugin);

wishlistSchema.pre('validate', function uniqueProducts(next) {
  const ids = this.items.map((item) => String(item.product));
  if (new Set(ids).size !== ids.length) {
    this.invalidate('items', 'This shoe is already on the wishlist');
  }
  next();
});

module.exports = mongoose.model('Wishlist', wishlistSchema);
