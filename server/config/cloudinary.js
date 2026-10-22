const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const env = require('./env');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

function isCloudinaryConfigured() {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  return Boolean(cloudName && apiKey && apiSecret);
}

function getCloudinary() {
  if (!isCloudinaryConfigured()) return null;
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  return cloudinary;
}

function ensureUploadDir() {
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

module.exports = {
  uploadDir,
  isCloudinaryConfigured,
  getCloudinary,
  ensureUploadDir,
};
