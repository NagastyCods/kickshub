const crypto = require('crypto');

function generateOrderNumber(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `KH-${y}${m}${d}-${rand}`;
}

/** Reference we send to Paystack so a retried charge stays idempotent. */
function generatePaymentReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `KH-${stamp}-${rand}`;
}

module.exports = { generateOrderNumber, generatePaymentReference };
