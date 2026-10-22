const { FilterXSS } = require('xss');

const cleaner = new FilterXSS({
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  css: false,
  escapeHtml(html) {
    return html;
  },
});

const SKIP_HTML = new Set(['password', 'passwordConfirm', 'currentPassword', 'newPassword', 'token', 'otp']);
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function cleanString(value, key) {
  const text = String(value).replace(/\0/g, '');
  if (SKIP_HTML.has(key)) return text;
  return cleaner.process(text);
}

function sanitizeValue(value, key) {
  if (typeof value === 'string') return cleanString(value, key);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  Object.keys(value).forEach((child) => {
    if (BLOCKED_KEYS.has(child)) {
      delete value[child];
      return;
    }
    value[child] = sanitizeValue(value[child], child);
  });
  return value;
}

function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') sanitizeValue(req.body, '');
  if (req.query && typeof req.query === 'object') sanitizeValue(req.query, '');
  if (req.params && typeof req.params === 'object') sanitizeValue(req.params, '');
  next();
}

module.exports = sanitizeInput;
module.exports.cleanString = cleanString;
