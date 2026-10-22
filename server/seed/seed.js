const mongoose = require('mongoose');
const env = require('../config/env');
const connectDB = require('../config/db');
const { DELIVERY_FEES } = require('../config/constants');
const {
  User,
  Brand,
  Collection,
  Product,
  Cart,
  Order,
  Review,
  Wishlist,
  PromoCode,
  Settings,
  Transaction,
  Newsletter,
  StockAlert,
} = require('../models');
const { BRANDS, COLLECTIONS, buildProducts } = require('./data/buildCatalog');

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function seed() {
  if (env.isProduction && !env.seed.allow) {
    console.error('Refusing to seed a production database. Set ALLOW_SEED=true if you really mean to wipe and reseed.');
    process.exit(1);
  }

  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Brand.deleteMany({}),
    Collection.deleteMany({}),
    Product.deleteMany({}),
    Cart.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Wishlist.deleteMany({}),
    PromoCode.deleteMany({}),
    Settings.deleteMany({}),
    Transaction.deleteMany({}),
    Newsletter.deleteMany({}),
    StockAlert.deleteMany({}),
  ]);

  const brands = await Brand.create(
    BRANDS.map((brand) => ({
      ...brand,
      isActive: true,
      isFeatured: true,
    }))
  );
  const collections = await Collection.create(
    COLLECTIONS.map((collection) => ({ ...collection, isActive: true }))
  );

  const brandIds = Object.fromEntries(brands.map((brand) => [brand.slug, brand._id]));
  const collectionIds = Object.fromEntries(collections.map((collection) => [collection.slug, collection._id]));
  const products = buildProducts({ brandIds, collectionIds });
  if (products.length < 20) {
    throw new Error(`Seed catalog has ${products.length} products. It must contain at least 20.`);
  }
  await Product.create(products);

  await Settings.create({
    key: 'store',
    storeName: 'KicksHub',
    tagline: 'Sneakers delivered across Ghana',
    email: 'hello@kickshub.com',
    phone: '0302744100',
    whatsapp: '0240000000',
    address: 'Oxford Street, Osu, Accra',
    currency: 'GHS',
    currencySymbol: '₵',
    paystackCardEnabled: true,
    paystackMobileMoneyEnabled: true,
    payOnDeliveryEnabled: true,
    payOnDeliveryFee: 0,
    freeDeliveryThreshold: null,
    lowStockThreshold: 3,
    newsletterEnabled: true,
    maintenanceMode: false,
    deliveryFees: DELIVERY_FEES.map((fee) => ({ ...fee, isActive: true })),
  });

  await PromoCode.create([
    {
      code: 'WELCOME10',
      type: 'percentage',
      value: 10,
      minSpend: 200,
      maxDiscount: 150,
      usageLimit: 500,
      expiresAt: daysFromNow(90),
      isActive: true,
    },
    {
      code: 'KICKS50',
      type: 'fixed',
      value: 50,
      minSpend: 400,
      usageLimit: 200,
      expiresAt: daysFromNow(60),
      isActive: true,
    },
    {
      code: 'LEGEND15',
      type: 'percentage',
      value: 15,
      minSpend: 800,
      maxDiscount: 300,
      usageLimit: 100,
      expiresAt: daysFromNow(45),
      isActive: true,
    },
    {
      code: 'LASTSEASON',
      type: 'fixed',
      value: 25,
      minSpend: 300,
      usageLimit: 50,
      expiresAt: daysFromNow(-1),
      isActive: true,
    },
    {
      code: 'OLD20',
      type: 'percentage',
      value: 20,
      minSpend: 200,
      isActive: false,
    },
  ]);

  await User.create([
    {
      firstName: 'KicksHub',
      lastName: 'Admin',
      email: env.seed.adminEmail,
      password: env.seed.adminPassword,
      phone: '0240000001',
      role: 'admin',
      isActive: true,
      emailVerified: true,
    },
    {
      firstName: 'Ama',
      lastName: 'Boateng',
      email: env.seed.customerEmail,
      password: env.seed.customerPassword,
      phone: '0244000111',
      role: 'customer',
      isActive: true,
      emailVerified: true,
      addresses: [
        {
          label: 'Home',
          fullName: 'Ama Boateng',
          phone: '0244000111',
          region: 'Greater Accra',
          city: 'Accra',
          digitalAddress: 'GA-184-1234',
          street: '14 Oxford Street, Osu',
          landmark: 'Opposite the old post office',
          isDefault: true,
        },
        {
          label: 'Kumasi',
          fullName: 'Ama Boateng',
          phone: '0204000222',
          region: 'Ashanti',
          city: 'Kumasi',
          digitalAddress: 'AK-042-1180',
          street: '2 Harper Road, Adum',
          landmark: 'Near Kejetia',
          isDefault: false,
        },
      ],
    },
  ]);

  const [productCount, variantCount, lowStock, soldOut] = await Promise.all([
    Product.countDocuments(),
    Product.aggregate([{ $project: { count: { $size: '$variants' } } }, { $group: { _id: null, total: { $sum: '$count' } } }]),
    Product.aggregate([
      { $unwind: '$variants' },
      { $match: { 'variants.available': { $gt: 0, $lte: 3 } } },
      { $count: 'total' },
    ]),
    Product.aggregate([
      { $unwind: '$variants' },
      { $match: { 'variants.available': 0 } },
      { $count: 'total' },
    ]),
  ]);

  console.log('');
  console.log('KicksHub seed complete');
  console.log(`  Brands:        ${brands.length}`);
  console.log(`  Collections:   ${collections.length}`);
  console.log(`  Products:      ${productCount}`);
  console.log(`  Variants:      ${variantCount[0] ? variantCount[0].total : 0}`);
  console.log(`  Low stock:     ${lowStock[0] ? lowStock[0].total : 0} variants (1–3 left)`);
  console.log(`  Sold out:      ${soldOut[0] ? soldOut[0].total : 0} variants`);
  console.log('');
  console.log('Development logins (change these before any public deploy):');
  console.log(`  Admin:    ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
  console.log(`  Customer: ${env.seed.customerEmail} / ${env.seed.customerPassword}`);
  console.log('  Promo:    WELCOME10, KICKS50, LEGEND15');
  console.log('');

  await mongoose.connection.close();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  if (/ECONNREFUSED|ENOTFOUND|server selection/i.test(err.message || '')) {
    console.error('Start MongoDB, or set MONGO_URI in .env to an Atlas connection string, then run npm run seed again.');
  }
  if (/bad auth|authentication failed/i.test(err.message || '')) {
    console.error('Atlas rejected the username or password in MONGO_URI.');
    console.error('Use the user from Atlas → Database Access, not the email you use to sign in to Atlas.');
    console.error('If the password contains @ # : / or ?, encode it in the URI (@ becomes %40).');
  }
  if (err.errors) {
    Object.values(err.errors).forEach((item) => console.error(`  - ${item.path}: ${item.message}`));
  }
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
