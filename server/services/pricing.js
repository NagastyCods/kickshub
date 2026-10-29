const mongoose = require('mongoose');
const Product = require('../models/Product');
const PromoCode = require('../models/PromoCode');
const Settings = require('../models/Settings');
const ApiError = require('../utils/ApiError');
const { roundMoney } = require('../utils/money');
const {
  GHANA_REGIONS,
  DELIVERY_METHODS,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
} = require('../config/constants');

function imageFor(product, variant) {
  if (variant.image) return variant.image;
  return product.images[0] ? product.images[0].url : '';
}

/**
 * Checkout charges variant.price. The admin listing price is basePrice.
 * When every size still shares one price, that price follows the listing price.
 * When sizes differ, only sizes still on the previous listing price move.
 * A size with its own price stays as it is.
 */
function applyCatalogPrice(product, nextPrice) {
  const next = roundMoney(nextPrice);
  if (!Number.isFinite(next) || next < 1) throw new ApiError(400, 'Price must be at least 1');
  const previous = roundMoney(product.basePrice);
  const variants = product.variants || [];
  const current = [...variants].map((variant) => roundMoney(variant.price));
  const sharedPrice = new Set(current).size === 1;
  const listingChanged = next !== previous;
  variants.forEach((variant) => {
    const price = roundMoney(variant.price);
    if (sharedPrice) variant.price = next;
    else if (listingChanged && price === previous) variant.price = next;
  });
  product.basePrice = next;
  return product;
}

/**
 * Prices always come from the product document. Callers must not pass a price.
 */
async function priceLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, 'Your cart is empty');
  if (lines.length > MAX_ORDER_LINES) {
    throw new ApiError(400, `You can check out up to ${MAX_ORDER_LINES} pairs at a time`);
  }

  const snapshots = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new ApiError(400, `Quantity for each shoe must be between 1 and ${MAX_LINE_QUANTITY}`);
    }
    if (!mongoose.Types.ObjectId.isValid(line.productId) || !mongoose.Types.ObjectId.isValid(line.variantId)) {
      throw new ApiError(400, 'Invalid product');
    }

    const product = await Product.findOne({ _id: line.productId, isActive: true });
    if (!product) throw new ApiError(404, 'A product in your cart is no longer available');
    const variant = product.variants.id(line.variantId);
    if (!variant) throw new ApiError(404, `${product.name} is no longer available in that option`);

    if (variant.available < quantity) {
      throw new ApiError(
        409,
        variant.available === 0
          ? `${product.name} in EU ${variant.size} is sold out`
          : `Only ${variant.available} left of ${product.name} in EU ${variant.size}`
      );
    }

    const unitPrice = roundMoney(variant.price);
    snapshots.push({
      product: product._id,
      variantId: variant._id,
      sku: variant.sku,
      name: product.name,
      brandName: product.brandName,
      image: imageFor(product, variant),
      size: variant.size,
      sizeUK: variant.sizeUK,
      sizeUSMen: variant.sizeUSMen,
      sizeUSWomen: variant.sizeUSWomen,
      color: variant.color,
      colorHex: variant.colorHex,
      unitPrice,
      quantity,
      lineTotal: roundMoney(unitPrice * quantity),
      stockState: 'pending',
    });
  }

  const subtotal = roundMoney(snapshots.reduce((sum, item) => sum + item.lineTotal, 0));
  return { items: snapshots, subtotal };
}

async function quoteOrder({ lines, region, deliveryMethod = 'standard', promoCode = '', paymentChannel = '' }) {
  if (!GHANA_REGIONS.includes(region)) throw new ApiError(400, 'Choose a delivery region in Ghana');
  if (!DELIVERY_METHODS.includes(deliveryMethod)) throw new ApiError(400, 'Choose standard or express delivery');

  const priced = await priceLines(lines);
  const settings = await Settings.getStore();
  const delivery = settings.quoteDelivery(region, deliveryMethod);
  if (!delivery) throw new ApiError(400, 'We do not deliver to that region yet');

  let discount = 0;
  let promo = null;
  if (promoCode) {
    const result = await PromoCode.quote(promoCode, priced.subtotal);
    if (!result.ok) throw new ApiError(400, result.reason);
    discount = result.discount;
    promo = result.promo;
  }

  let payOnDeliveryFee = 0;
  if (paymentChannel === 'pay_on_delivery') {
    if (!settings.payOnDeliveryEnabled) throw new ApiError(400, 'Payment on delivery is turned off');
    payOnDeliveryFee = roundMoney(settings.payOnDeliveryFee || 0);
  }

  let deliveryFee = delivery.fee;
  if (
    deliveryMethod === 'standard' &&
    settings.freeDeliveryThreshold != null &&
    priced.subtotal >= settings.freeDeliveryThreshold
  ) {
    deliveryFee = 0;
  }

  const total = roundMoney(Math.max(0, priced.subtotal - discount + deliveryFee + payOnDeliveryFee));

  return {
    items: priced.items,
    subtotal: priced.subtotal,
    discount,
    deliveryFee,
    payOnDeliveryFee,
    total,
    currency: 'GHS',
    promo: promo
      ? { id: promo._id, code: promo.code, type: promo.type, value: promo.value }
      : null,
    delivery: { ...delivery, fee: deliveryFee },
  };
}

module.exports = { priceLines, quoteOrder, applyCatalogPrice };
