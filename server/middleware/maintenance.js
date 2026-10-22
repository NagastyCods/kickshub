const path = require('path');
const { loadUser } = require('./auth');
const { readStoreFlags } = require('../services/storeFlags');

const maintenancePage = path.join(__dirname, '..', '..', 'client', 'maintenance.html');

function requestAllowedDuringMaintenance(req) {
  const urlPath = req.path || '/';
  const method = req.method;
  if (urlPath === '/login' || urlPath === '/forgot-password' || urlPath === '/reset-password') return true;
  if (urlPath === '/admin' || urlPath.startsWith('/admin/')) return true;
  if (urlPath.startsWith('/order/')) return true;
  if (urlPath.startsWith('/css/') || urlPath.startsWith('/js/') || urlPath.startsWith('/uploads/')) return true;
  if (urlPath === '/favicon.ico' || urlPath === '/favicon.svg') return true;
  if (urlPath === '/api/health') return true;
  if (urlPath === '/api/admin' || urlPath.startsWith('/api/admin/')) return true;
  if (urlPath === '/api/auth/login' || urlPath === '/api/auth/logout' || urlPath === '/api/auth/me') return true;
  if (urlPath === '/api/auth/forgot' || urlPath === '/api/auth/reset') return true;
  if (urlPath === '/api/payments/webhook' || urlPath === '/api/payments/otp') return true;
  if (urlPath.startsWith('/api/payments/verify/')) return true;
  if (method === 'GET' && /^\/api\/orders\/[^/]+$/.test(urlPath)) return true;
  if (method === 'GET' && /^\/api\/orders\/[^/]+\/invoice$/.test(urlPath)) return true;
  return false;
}

async function maintenanceGate(req, res, next) {
  try {
    const flags = await readStoreFlags();
    if (!flags.maintenanceMode) return next();
    if (requestAllowedDuringMaintenance(req)) return next();
    const user = await loadUser(req);
    if (user && user.role === 'admin') return next();
    res.set('Cache-Control', 'no-store');
    res.set('Retry-After', '120');
    if (req.path.startsWith('/api')) {
      return res.status(503).json({
        success: false,
        message: 'KicksHub is down for maintenance. Try again shortly.',
        errors: [],
      });
    }
    return res.status(503).sendFile(maintenancePage);
  } catch (err) {
    return next(err);
  }
}

module.exports = maintenanceGate;
module.exports.requestAllowedDuringMaintenance = requestAllowedDuringMaintenance;
