const crypto = require('crypto');

function signaturesMatch(secret, rawBody, header) {
  if (!secret || !rawBody || header == null || header === '') return false;
  const digest = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const given = Buffer.from(String(header).trim());
  const expected = Buffer.from(digest);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

module.exports = { signaturesMatch };
