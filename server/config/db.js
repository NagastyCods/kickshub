const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log(`MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
}

module.exports = connectDB;
