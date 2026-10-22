const { CURRENCY } = require('../config/constants');

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Paystack charges GHS in pesewas (the minor unit). */
function toPesewas(ghs) {
  return Math.round(roundMoney(ghs) * CURRENCY.minorUnit);
}

function fromPesewas(pesewas) {
  return roundMoney(Number(pesewas) / CURRENCY.minorUnit);
}

function formatGhs(ghs) {
  return `${CURRENCY.symbol}${roundMoney(ghs).toFixed(2)}`;
}

module.exports = { roundMoney, toPesewas, fromPesewas, formatGhs };
