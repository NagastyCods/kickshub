const { MOMO_NETWORKS } = require('../config/constants');

/**
 * Accepts 0244000111, 233244000111, or +233 24 400 0111.
 * Returns the local 10-digit form (0244000111) or null.
 */
function normalizeGhanaPhone(input) {
  if (input == null) return null;
  let digits = String(input).trim().replace(/[^\d+]/g, '');
  if (digits.startsWith('+233')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('233') && digits.length === 12) digits = `0${digits.slice(3)}`;
  if (!/^0[2-5]\d{8}$/.test(digits)) return null;
  return digits;
}

function guessNetwork(input) {
  const phone = normalizeGhanaPhone(input);
  if (!phone) return null;
  const prefix = phone.slice(0, 3);
  const match = MOMO_NETWORKS.find((network) => network.prefixes.includes(prefix));
  return match ? match.id : null;
}

function paystackProviderFor(networkId) {
  const match = MOMO_NETWORKS.find((network) => network.id === networkId);
  return match ? match.paystackProvider : null;
}

module.exports = { normalizeGhanaPhone, guessNetwork, paystackProviderFor };
