const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const { uploadDir, isCloudinaryConfigured, getCloudinary, ensureUploadDir } = require('../config/cloudinary');

const TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function uploadToCloudinary(buffer) {
  const cloudinary = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'kickshub', resource_type: 'image' },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function storeImage(file) {
  if (!file || !file.buffer) throw new ApiError(400, 'Choose an image');
  const ext = TYPES[file.mimetype];
  if (!ext) throw new ApiError(400, 'Upload a JPG, PNG, or WebP');

  if (isCloudinaryConfigured()) {
    try {
      const result = await uploadToCloudinary(file.buffer);
      return { url: result.secure_url, publicId: result.public_id || '' };
    } catch (err) {
      throw new ApiError(502, 'Image host rejected the upload');
    }
  }

  ensureUploadDir();
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), file.buffer);
  return { url: `/uploads/${name}`, publicId: '' };
}

module.exports = { storeImage };
