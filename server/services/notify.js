const axios = require('axios');
const env = require('../config/env');
const { normalizeGhanaPhone } = require('../utils/phone');

function international(phone) {
  const local = normalizeGhanaPhone(phone);
  if (!local) return '';
  return `233${local.slice(1)}`;
}

async function sendSms(to, message) {
  const recipient = international(to);
  if (!recipient) return { skipped: true };
  if (!env.sms.arkeselApiKey) {
    console.log(`[sms stub] ${recipient}: ${message}`);
    return { skipped: true, channel: 'sms' };
  }
  await axios.post('https://sms.arkesel.com/api/v2/sms/send', {
    sender: env.sms.arkeselSenderId,
    message,
    recipients: [recipient],
  }, {
    headers: { 'api-key': env.sms.arkeselApiKey },
    timeout: 15000,
  });
  return { skipped: false, channel: 'sms' };
}

async function sendWhatsApp(to, message) {
  const recipient = international(to);
  if (!recipient) return { skipped: true };
  if (!env.sms.hubtelClientId || !env.sms.hubtelClientSecret) {
    console.log(`[whatsapp stub] ${recipient}: ${message}`);
    return { skipped: true, channel: 'whatsapp' };
  }
  const params = new URLSearchParams({
    clientid: env.sms.hubtelClientId,
    clientsecret: env.sms.hubtelClientSecret,
    from: env.sms.hubtelSenderId,
    to: recipient,
    content: message,
  });
  await axios.get(`https://smsc.hubtel.com/v1/messages/send?${params.toString()}`, { timeout: 15000 });
  return { skipped: false, channel: 'whatsapp' };
}

async function notifyOrder(order, kind) {
  const message = `KicksHub ${order.orderNumber} is ${kind}. Total GHS ${Number(order.total).toFixed(2)}.`;
  try {
    await sendSms(order.customerPhone, message);
    await sendWhatsApp(order.customerPhone, message);
  } catch (err) {
    console.error(`[notify] ${order.orderNumber}: ${err.message}`);
  }
}

module.exports = { sendSms, sendWhatsApp, notifyOrder };
