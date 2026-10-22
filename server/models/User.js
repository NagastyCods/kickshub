const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const basePlugin = require('./plugins');
const { addressSchema } = require('./address');
const { ROLES } = require('../config/constants');
const { normalizeGhanaPhone } = require('../utils/phone');

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    password: {
      type: String,
      select: false,
      minlength: 8,
      required() {
        return this.isNew || this.isModified('password');
      },
      validate: {
        validator(value) {
          if (!this.isNew && !this.isModified('password')) return true;
          return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value || '');
        },
        message: 'Password must be at least 8 characters and include a letter and a number',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      set: (value) => (value ? normalizeGhanaPhone(value) || value : ''),
      validate: {
        validator: (value) => !value || Boolean(normalizeGhanaPhone(value)),
        message: 'Enter a valid Ghana phone number',
      },
    },
    role: { type: String, enum: ROLES, default: 'customer' },
    avatar: { type: String, default: '' },
    addresses: [addressSchema({ withLabel: true })],
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.plugin(basePlugin);

userSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.pre('validate', function oneDefaultAddress(next) {
  const defaults = (this.addresses || []).filter((address) => address.isDefault);
  if (defaults.length > 1) this.invalidate('addresses', 'Only one address can be the default');
  next();
});

userSchema.pre('save', function stampPasswordChange(next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.changedPasswordAfter = function changedPasswordAfter(jwtIssuedAt) {
  if (!this.passwordChangedAt || jwtIssuedAt == null) return false;
  return this.passwordChangedAt.getTime() / 1000 > Number(jwtIssuedAt);
};

userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(raw).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  return raw;
};

module.exports = mongoose.model('User', userSchema);
