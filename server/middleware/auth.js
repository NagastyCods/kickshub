const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function signToken(userId) {
  return jwt.sign({ id: String(userId) }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    maxAge: env.jwt.cookieDays * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function setAuthCookie(req, res, userId) {
  res.cookie('token', signToken(userId), cookieOptions(req));
}

function clearAuthCookie(req, res) {
  const options = cookieOptions(req);
  res.clearCookie('token', {
    path: options.path,
    httpOnly: true,
    sameSite: options.sameSite,
    secure: options.secure,
  });
}

async function loadUser(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return null;
    if (user.changedPasswordAfter(decoded.iat)) return null;
    return user;
  } catch (_err) {
    return null;
  }
}

async function attachUser(req, _res, next) {
  req.user = await loadUser(req);
  return next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Log in to continue'));
  return next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Log in to continue'));
  if (req.user.role !== 'admin') return next(new ApiError(403, 'Admin access only'));
  return next();
}

function signInvoice(order) {
  return jwt.sign(
    { orderNumber: order.orderNumber, email: order.customerEmail, purpose: 'invoice' },
    env.jwt.secret,
    { expiresIn: '30d' }
  );
}

function readInvoice(token) {
  const decoded = jwt.verify(token, env.jwt.secret);
  if (decoded.purpose !== 'invoice') throw new ApiError(401, 'Invalid invoice link');
  return decoded;
}

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  loadUser,
  attachUser,
  requireAuth,
  requireAdmin,
  signInvoice,
  readInvoice,
};
