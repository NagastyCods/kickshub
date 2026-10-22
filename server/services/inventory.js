const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

async function reserveLines(lines) {
  const reserved = [];
  try {
    for (const line of lines) {
      const ok = await Product.reserveStock(line.product, line.variantId, line.quantity);
      if (!ok) {
        const label = line.name ? `${line.name} in EU ${line.size}` : 'That size';
        throw new ApiError(409, `${label} does not have enough stock`);
      }
      reserved.push(line);
    }
    return reserved;
  } catch (err) {
    for (const line of [...reserved].reverse()) {
      await Product.releaseStock(line.product, line.variantId, line.quantity);
    }
    throw err;
  }
}

async function releaseLines(lines) {
  for (const line of lines) {
    await Product.releaseStock(line.product, line.variantId, line.quantity);
  }
}

module.exports = { reserveLines, releaseLines };
