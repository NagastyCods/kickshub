const { lookupSize } = require('../../config/sizes');
const { BRANDS, COLLECTIONS, PRODUCTS } = require('./catalog');

const SIZE_RUNS = {
  men: ['40', '41', '42', '43', '44', '45', '46'],
  women: ['36', '37', '38', '39', '40', '41', '42'],
  unisex: ['38', '39', '40', '41', '42', '43', '44', '45'],
};

function stockFor(profile, sizeIndex, colorIndex, total) {
  if (profile === 'limited') {
    if (sizeIndex === 1) return 0;
    if (sizeIndex === 3) return 2;
    return sizeIndex % 2 === 0 ? 3 : 1;
  }
  if (profile === 'low') {
    if (colorIndex === 0 && sizeIndex === 2) return 3;
    if (sizeIndex === total - 2) return 0;
    return 4;
  }
  if (colorIndex === 0 && sizeIndex === 2) return 3;
  if (colorIndex > 0 && sizeIndex === 1) return 0;
  if (sizeIndex === 0 || sizeIndex === total - 1) return 4;
  return 8 + (sizeIndex % 4);
}

function shots(photoId, alt) {
  const base = `https://images.unsplash.com/${photoId}`;
  return [
    {
      url: `${base}?auto=format&fit=crop&w=1400&q=80`,
      publicId: '',
      alt,
    },
    {
      url: `${base}?auto=format&fit=crop&w=900&h=1100&q=80&crop=entropy`,
      publicId: '',
      alt: `${alt}, detail`,
    },
  ];
}

function buildProducts({ brandIds, collectionIds }) {
  return PRODUCTS.map((item) => {
    const brandId = brandIds[item.brand];
    const collectionId = collectionIds[item.collection];
    if (!brandId) throw new Error(`Unknown brand slug on ${item.name}: ${item.brand}`);
    if (!collectionId) throw new Error(`Unknown collection slug on ${item.name}: ${item.collection}`);

    const sizes = SIZE_RUNS[item.gender];
    if (!sizes) throw new Error(`No size run for ${item.gender} (${item.name})`);

    const alt = `${item.name} sneaker`;
    const images = shots(item.photo, alt);
    const primary = images[0].url;
    const variants = [];

    item.colors.forEach((color, colorIndex) => {
      sizes.forEach((size, sizeIndex) => {
        const chart = lookupSize(size);
        const stock = stockFor(item.stockProfile, sizeIndex, colorIndex, sizes.length);
        variants.push({
          sku: `KH-${item.sku}-${color.code}-${size}`,
          size,
          sizeUK: chart.uk,
          sizeUSMen: chart.usMen,
          sizeUSWomen: chart.usWomen,
          color: color.name,
          colorHex: color.hex,
          stock,
          reserved: 0,
          available: stock,
          price: item.price,
          image: primary,
        });
      });
    });

    const brand = BRANDS.find((entry) => entry.slug === item.brand);

    return {
      name: item.name,
      sku: `KH-${item.sku}`,
      description: item.description,
      brand: brandId,
      brandName: brand.name,
      collectionId,
      gender: item.gender,
      tags: [...new Set([...item.tags, item.gender])],
      images,
      basePrice: item.price,
      compareAtPrice: item.compareAtPrice || null,
      variants,
      featured: item.featured,
      isNewArrival: item.isNewArrival,
      isActive: true,
      soldCount: item.soldCount,
      createdAt: new Date(Date.now() - item.daysOld * 24 * 60 * 60 * 1000),
    };
  });
}

module.exports = { BRANDS, COLLECTIONS, buildProducts };
