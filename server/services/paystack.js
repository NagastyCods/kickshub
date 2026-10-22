const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function client() {
  if (!env.paystack.secretKey) throw new ApiError(503, 'Paystack is not configured yet');
  return axios.create({
    baseURL: env.paystack.baseUrl,
    timeout: 20000,
    headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
  });
}

function unwrap(error) {
  const message = error.response && error.response.data && error.response.data.message;
  return new ApiError(error.response && error.response.status === 400 ? 400 : 502, message || 'Paystack could not complete that request');
}

async function initializeTransaction({ email, amountPesewas, reference, metadata }) {
  try {
    const { data } = await client().post('/transaction/initialize', {
      email,
      amount: amountPesewas,
      currency: 'GHS',
      reference,
      channels: ['card', 'mobile_money'],
      metadata,
    });
    if (!data.status || !data.data) throw new ApiError(502, data.message || 'Could not start card payment');
    return data.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unwrap(err);
  }
}

async function chargeMobileMoney({ email, amountPesewas, reference, phone, provider }) {
  try {
    const { data } = await client().post('/charge', {
      email,
      amount: amountPesewas,
      currency: 'GHS',
      reference,
      mobile_money: { phone, provider },
    });
    if (!data.status) throw new ApiError(502, data.message || 'Could not start Mobile Money');
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unwrap(err);
  }
}

async function submitOtp({ reference, otp }) {
  try {
    const { data } = await client().post('/charge/submit_otp', { reference, otp });
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unwrap(err);
  }
}

async function verifyTransaction(reference) {
  try {
    const { data } = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (!data.status || !data.data) throw new ApiError(502, data.message || 'Could not verify payment');
    return data.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unwrap(err);
  }
}

module.exports = { initializeTransaction, chargeMobileMoney, submitOtp, verifyTransaction };
