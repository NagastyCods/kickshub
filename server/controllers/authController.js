const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { publicUser } = require('../utils/serialize');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { sendPasswordReset } = require('../services/email');
const env = require('../config/env');

const register = asyncHandler(async (req, res) => {
  const existing = await User.findOne({ email: req.body.email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with that email already exists', [{ field: 'email', message: 'That email is already registered' }]);
  const user = await User.create({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    password: req.body.password,
    phone: req.body.phone || '',
  });
  setAuthCookie(req, res, user._id);
  sendSuccess(res, { user: publicUser(user) }, 'Account created', 201);
});

const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    throw new ApiError(401, 'Email or password is wrong', [
      { field: 'email', message: 'Email or password is wrong' },
    ]);
  }
  if (!user.isActive) throw new ApiError(403, 'This account is disabled');
  user.lastLogin = new Date();
  await user.save();
  setAuthCookie(req, res, user._id);
  sendSuccess(res, { user: publicUser(user) }, 'Logged in');
});

const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(req, res);
  sendSuccess(res, null, 'Logged out');
});

const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: req.user ? publicUser(req.user) : null });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = req.user;
  ['firstName', 'lastName', 'phone'].forEach((field) => {
    if (req.body[field] != null) user[field] = req.body[field];
  });
  await user.save();
  sendSuccess(res, { user: publicUser(user) }, 'Profile updated');
});

function resetOrigin(req) {
  if (!env.isProduction && req.get('host')) return `${req.protocol}://${req.get('host')}`;
  return env.clientUrl.replace(/\/$/, '');
}

function clearResetToken(user) {
  user.set('passwordResetToken', undefined);
  user.set('passwordResetExpires', undefined);
}

const forgotPassword = asyncHandler(async (req, res) => {
  const generic = 'If that email has an account, a reset link is on the way.';
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!user || !user.isActive) return sendSuccess(res, null, generic);
  const raw = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  const resetUrl = `${resetOrigin(req)}/reset-password?token=${raw}`;
  try {
    const sent = await sendPasswordReset(user, resetUrl);
    if (sent && sent.skipped && !env.isProduction) {
      console.log(`[password reset] ${user.email} ${resetUrl}`);
      return sendSuccess(res, { resetUrl }, generic);
    }
  } catch (err) {
    console.error('[password reset] email failed:', err.message);
    clearResetToken(user);
    await user.save({ validateBeforeSave: false });
    throw new ApiError(502, 'Could not send the reset email');
  }
  return sendSuccess(res, null, generic);
});

const resetPassword = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(String(req.body.token || '')).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');
  if (!user || !user.isActive) {
    throw new ApiError(400, 'That reset link is invalid or expired', [{ field: 'token', message: 'That reset link is invalid or expired' }]);
  }
  user.password = req.body.password;
  clearResetToken(user);
  await user.save();
  setAuthCookie(req, res, user._id);
  sendSuccess(res, { user: publicUser(user) }, 'Password updated');
});

const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(req.body.currentPassword))) {
    throw new ApiError(400, 'Current password is wrong', [{ field: 'currentPassword', message: 'Current password is wrong' }]);
  }
  user.password = req.body.password;
  await user.save();
  setAuthCookie(req, res, user._id);
  sendSuccess(res, { user: publicUser(user) }, 'Password updated');
});

function oneDefault(addresses, preferredId) {
  let seen = false;
  addresses.forEach((address) => {
    const isPreferred = preferredId && String(address._id) === String(preferredId);
    if (isPreferred && !seen) {
      address.isDefault = true;
      seen = true;
    } else if (!preferredId && address.isDefault && !seen) {
      seen = true;
    } else {
      address.isDefault = false;
    }
  });
  if (!seen && addresses.length) addresses[0].isDefault = true;
}

const addAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  user.addresses.push(req.body);
  const added = user.addresses[user.addresses.length - 1];
  if (added.isDefault || user.addresses.length === 1) oneDefault(user.addresses, added._id);
  await user.save();
  sendSuccess(res, { user: publicUser(user) }, 'Address saved', 201);
});

const updateAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const address = user.addresses.id(req.params.id);
  if (!address) throw new ApiError(404, 'Address not found');
  ['label', 'fullName', 'phone', 'region', 'city', 'digitalAddress', 'street', 'landmark', 'isDefault'].forEach((field) => {
    if (req.body[field] != null) address[field] = req.body[field];
  });
  if (address.isDefault) oneDefault(user.addresses, address._id);
  await user.save();
  sendSuccess(res, { user: publicUser(user) }, 'Address updated');
});

const deleteAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const address = user.addresses.id(req.params.id);
  if (!address) throw new ApiError(404, 'Address not found');
  address.deleteOne();
  oneDefault(user.addresses);
  await user.save();
  sendSuccess(res, { user: publicUser(user) }, 'Address removed');
});

module.exports = {
  register, login, logout, me, updateMe, forgotPassword, resetPassword, changePassword, addAddress, updateAddress, deleteAddress,
};
