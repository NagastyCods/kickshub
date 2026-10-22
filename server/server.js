const mongoose = require('mongoose');
const env = require('./config/env');

env.assertServerEnv();

const connectDB = require('./config/db');
const app = require('./app');

connectDB()
  .then(() => {
    const { Order } = require('./models');
    setInterval(() => {
      Order.releaseExpiredReservations().catch((err) => {
        console.error('Reservation sweep:', err.message);
      });
    }, 60 * 1000);
    const server = app.listen(env.port, () => {
      console.log(`KicksHub API listening on port ${env.port} (${env.nodeEnv})`);
      if (!env.paystack.secretKey || !env.paystack.publicKey) {
        console.warn('Paystack keys are empty. Card and Mobile Money stay off until you add test keys.');
      } else if (env.isProduction && env.paystack.secretKey.startsWith('sk_test_')) {
        console.warn('Paystack is using a test secret key while NODE_ENV is production.');
      }
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Closing server.`);
      server.close(() => {
        mongoose.connection.close(false).then(() => process.exit(0));
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('Failed to start KicksHub API:', err.message);
    process.exit(1);
  });
