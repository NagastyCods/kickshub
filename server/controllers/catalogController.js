const Brand = require('../models/Brand');
const Collection = require('../models/Collection');
const Settings = require('../models/Settings');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { getSizeChart } = require('../config/sizes');
const { MAJOR_CITIES, MOMO_NETWORKS } = require('../config/constants');
const env = require('../config/env');

const listBrands = asyncHandler(async (_req, res) => {
  const brands = await Brand.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  sendSuccess(res, brands.map((brand) => ({
    id: String(brand._id),
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    logo: brand.logo,
    accentColor: brand.accentColor,
  })));
});

const listCollections = asyncHandler(async (_req, res) => {
  const collections = await Collection.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  sendSuccess(res, collections.map((collection) => ({
    id: String(collection._id),
    name: collection.name,
    slug: collection.slug,
    description: collection.description,
    image: collection.image,
  })));
});

const getStore = asyncHandler(async (_req, res) => {
  const settings = await Settings.getStore();
  const paystackReady = Boolean(env.paystack.publicKey && env.paystack.secretKey);
  sendSuccess(res, {
    storeName: settings.storeName,
    tagline: settings.tagline,
    email: settings.email,
    phone: settings.phone,
    whatsapp: settings.whatsapp,
    address: settings.address,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    social: settings.social,
    lowStockThreshold: settings.lowStockThreshold,
    payments: {
      card: settings.paystackCardEnabled && paystackReady,
      mobileMoney: settings.paystackMobileMoneyEnabled && paystackReady,
      payOnDelivery: settings.payOnDeliveryEnabled,
    },
    paystackPublicKey: paystackReady ? env.paystack.publicKey : '',
    deliveryFees: settings.deliveryFees.filter((fee) => fee.isActive),
    cities: MAJOR_CITIES,
    momoNetworks: MOMO_NETWORKS.map(({ id, label, prefixes }) => ({ id, label, prefixes })),
    sizeGuide: getSizeChart(),
  });
});

module.exports = { listBrands, listCollections, getStore };
