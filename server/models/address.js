const mongoose = require('mongoose');
const { GHANA_REGIONS } = require('../config/constants');
const { normalizeGhanaPhone } = require('../utils/phone');

const GPS_PATTERN = /^[A-Z]{2}-\d{3,4}-\d{4}$/;

function addressFields({ withLabel = false } = {}) {
  const fields = {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: {
      type: String,
      required: true,
      trim: true,
      set: (value) => normalizeGhanaPhone(value) || value,
      validate: {
        validator: (value) => Boolean(normalizeGhanaPhone(value)),
        message: 'Enter a valid Ghana phone number',
      },
    },
    region: { type: String, required: true, enum: GHANA_REGIONS },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    digitalAddress: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
      default: '',
      set: (value) => (value ? String(value).replace(/\s+/g, '').toUpperCase() : ''),
      validate: {
        validator: (value) => !value || GPS_PATTERN.test(value),
        message: 'Digital address must look like GA-184-1234',
      },
    },
    street: { type: String, required: true, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 160, default: '' },
  };

  if (withLabel) {
    fields.label = { type: String, trim: true, maxlength: 40, default: 'Home' };
    fields.isDefault = { type: Boolean, default: false };
  }

  return fields;
}

function addressSchema(options) {
  return new mongoose.Schema(addressFields(options), { _id: options && options.withLabel });
}

module.exports = { addressFields, addressSchema, GPS_PATTERN };
