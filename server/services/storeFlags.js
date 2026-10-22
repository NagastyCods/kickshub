const Settings = require('../models/Settings');

let cached = null;
let cachedAt = 0;
const TTL_MS = 10 * 1000;

async function readStoreFlags() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  const settings = await Settings.getStore();
  cached = { maintenanceMode: Boolean(settings.maintenanceMode) };
  cachedAt = Date.now();
  return cached;
}

function clearStoreCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = { readStoreFlags, clearStoreCache };
