const { roundMoney } = require('./money');

function idOf(value) {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function discountPercent(basePrice, compareAtPrice) {
  if (!compareAtPrice || compareAtPrice <= basePrice) return 0;
  return Math.round((1 - basePrice / compareAtPrice) * 100);
}

function publicVariant(variant) {
  return {
    id: String(variant._id),
    sku: variant.sku,
    size: variant.size,
    sizeUK: variant.sizeUK,
    sizeUSMen: variant.sizeUSMen,
    sizeUSWomen: variant.sizeUSWomen,
    color: variant.color,
    colorHex: variant.colorHex,
    available: variant.available,
    price: variant.price,
    image: variant.image || '',
  };
}

function publicProduct(product, { detail = false } = {}) {
  const brand = product.brand && typeof product.brand === 'object' ? product.brand : null;
  const collection = product.collectionId && typeof product.collectionId === 'object' ? product.collectionId : null;
  const images = product.images || [];
  const positiveStock = (product.variants || []).map((variant) => variant.available || 0).filter((count) => count > 0);
  const body = {
    id: idOf(product),
    name: product.name,
    slug: product.slug,
    brandName: product.brandName || (brand && brand.name) || '',
    brandSlug: brand && brand.slug ? brand.slug : '',
    collectionName: collection && collection.name ? collection.name : '',
    collectionSlug: collection && collection.slug ? collection.slug : '',
    gender: product.gender,
    image: images[0] ? images[0].url : '',
    imageAlt: images[0] ? images[0].alt : product.name,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    discountPercent: discountPercent(product.basePrice, product.compareAtPrice),
    featured: product.featured,
    isNewArrival: product.isNewArrival,
    inStock: product.inStock,
    ratingsAverage: product.ratingsAverage || 0,
    ratingsCount: product.ratingsCount || 0,
    soldCount: product.soldCount || 0,
    colors: product.colors || [],
    sizes: product.sizes || [],
    minAvailable: positiveStock.length ? Math.min(...positiveStock) : 0,
  };
  if (!detail) return body;
  return {
    ...body,
    description: product.description,
    tags: product.tags || [],
    images: images.map((image) => ({ url: image.url, alt: image.alt || product.name })),
    variants: (product.variants || []).map(publicVariant),
    seoTitle: product.seoTitle || product.name,
    seoDescription: product.seoDescription || '',
  };
}

function publicUser(user) {
  return {
    id: idOf(user),
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName || `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    addresses: (user.addresses || []).map((address) => ({
      id: String(address._id),
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      region: address.region,
      city: address.city,
      digitalAddress: address.digitalAddress || '',
      street: address.street,
      landmark: address.landmark || '',
      isDefault: address.isDefault,
    })),
  };
}

function publicOrder(order) {
  return {
    id: idOf(order),
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: (order.items || []).map((item) => ({
      productId: idOf(item.product),
      variantId: idOf(item.variantId),
      sku: item.sku,
      name: item.name,
      brandName: item.brandName,
      image: item.image,
      size: item.size,
      color: item.color,
      colorHex: item.colorHex,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    shippingAddress: order.shippingAddress,
    deliveryMethod: order.deliveryMethod,
    deliveryEstimate: order.deliveryEstimate,
    customerNote: order.customerNote || '',
    subtotal: order.subtotal,
    discount: order.discount,
    promoCode: order.promoCode || '',
    deliveryFee: order.deliveryFee,
    payOnDeliveryFee: order.payOnDeliveryFee,
    total: order.total,
    currency: order.currency || 'GHS',
    paymentStatus: order.paymentStatus,
    paymentChannel: order.paymentChannel,
    mobileNetwork: order.mobileNetwork || '',
    orderStatus: order.orderStatus,
    timeline: order.timeline || [],
    gatewayResponse: order.gatewayResponse || '',
    paidAt: order.paidAt || null,
    createdAt: order.createdAt,
  };
}

function lineTotal(price, quantity) {
  return roundMoney(price * quantity);
}

module.exports = { publicProduct, publicVariant, publicUser, publicOrder, discountPercent, lineTotal };
