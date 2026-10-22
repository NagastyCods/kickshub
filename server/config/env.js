const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

function read(name, fallback = '') {
  const value = process.env[name];
  if (value == null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

const mongoUri = read('MONGO_URI');
if (!mongoUri) {
  console.error('MONGO_URI is missing. Copy .env.example to .env and set a MongoDB connection string.');
  process.exit(1);
}

if (mongoUri.includes('<') || mongoUri.includes('>') || mongoUri.includes('db_username')) {
  console.error('MONGO_URI still has the Atlas placeholder <db_username>.');
  console.error('Open Atlas → Database Access and copy the database user name. That is not the email you use to log in to Atlas.');
  console.error('Replace <db_username> in .env, then run npm run seed again.');
  process.exit(1);
}

const mongoDbName = mongoUri
  .replace(/^mongodb(?:\+srv)?:\/\//i, '')
  .replace(/^[^@]*@/, '')
  .split('?')[0]
  .split('/')
  .slice(1)
  .join('/');

if (!mongoDbName) {
  console.error('MONGO_URI has no database name. Insert /kickshub before the ?.');
  console.error('Example: ...mongodb.net:27017/kickshub?ssl=true&replicaSet=...');
  process.exit(1);
}

const jwtSecret = read('JWT_SECRET');

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(read('PORT', '5000')) || 5000,
  clientUrl: read('CLIENT_URL', 'http://localhost:5000'),
  mongoUri,
  jwt: {
    secret: jwtSecret,
    expiresIn: read('JWT_EXPIRES_IN', '7d'),
    cookieDays: Number(read('JWT_COOKIE_EXPIRES_DAYS', '7')) || 7,
  },
  paystack: {
    secretKey: read('PAYSTACK_SECRET_KEY'),
    publicKey: read('PAYSTACK_PUBLIC_KEY'),
    baseUrl: 'https://api.paystack.co',
  },
  email: {
    host: read('EMAIL_HOST'),
    port: Number(read('EMAIL_PORT', '587')) || 587,
    user: read('EMAIL_USER'),
    pass: read('EMAIL_PASS'),
    from: read('EMAIL_FROM', 'KicksHub <noreply@kickshub.com>'),
  },
  cloudinary: {
    cloudName: read('CLOUDINARY_CLOUD_NAME'),
    apiKey: read('CLOUDINARY_API_KEY'),
    apiSecret: read('CLOUDINARY_API_SECRET'),
  },
  sms: {
    arkeselApiKey: read('ARKESEL_API_KEY'),
    arkeselSenderId: read('ARKESEL_SENDER_ID', 'KicksHub'),
    hubtelClientId: read('HUBTEL_CLIENT_ID'),
    hubtelClientSecret: read('HUBTEL_CLIENT_SECRET'),
    hubtelSenderId: read('HUBTEL_SENDER_ID', 'KicksHub'),
  },
  reservationMinutes: {
    card: Number(read('RESERVATION_MINUTES_CARD', '30')) || 30,
    mobile_money: Number(read('RESERVATION_MINUTES_MOMO', '5')) || 5,
  },
  seed: {
    allow: read('ALLOW_SEED') === 'true',
    adminEmail: read('SEED_ADMIN_EMAIL', 'admin@kickshub.com').toLowerCase(),
    adminPassword: read('SEED_ADMIN_PASSWORD', 'Admin@123456'),
    customerEmail: read('SEED_CUSTOMER_EMAIL', 'customer@kickshub.com').toLowerCase(),
    customerPassword: read('SEED_CUSTOMER_PASSWORD', 'Customer@123456'),
  },
};

function assertServerEnv() {
  if (!env.jwt.secret) {
    console.error('JWT_SECRET is missing. Set a long random string in .env before starting the API.');
    process.exit(1);
  }
  if (env.isProduction && env.jwt.secret.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
  if (env.isProduction && /replace-with/i.test(env.jwt.secret)) {
    console.error('Replace the sample JWT_SECRET before running in production.');
    process.exit(1);
  }
}

module.exports = env;
module.exports.assertServerEnv = assertServerEnv;
