const nodemailer = require('nodemailer');
const env = require('../config/env');
const { formatGhs } = require('../utils/money');
const escapeHtml = require('../utils/escapeHtml');

function canSend() {
  return Boolean(env.email.host && env.email.user && env.email.pass);
}

function transport() {
  return nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.port === 465,
    auth: { user: env.email.user, pass: env.email.pass },
  });
}

async function sendMail({ to, subject, html, text }) {
  if (!canSend()) {
    console.log(`[email skipped] ${subject} → ${to}`);
    return { skipped: true };
  }
  await transport().sendMail({
    from: env.email.from,
    to,
    subject,
    text,
    html,
  });
  return { skipped: false };
}

function orderHtml(order) {
  const rows = order.items.map((item) => (
    `<tr><td>${escapeHtml(item.name)}<br><small>EU ${escapeHtml(item.size)} · ${escapeHtml(item.color)}</small></td><td>${escapeHtml(item.quantity)}</td><td>${formatGhs(item.lineTotal)}</td></tr>`
  )).join('');
  const address = order.shippingAddress || {};
  return `<div style="font-family:Arial,sans-serif;color:#111">
    <h1 style="font-size:22px">KicksHub order ${escapeHtml(order.orderNumber)}</h1>
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Payment status: <strong>${escapeHtml(order.paymentStatus)}</strong>. Order status: <strong>${escapeHtml(order.orderStatus)}</strong>.</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">${rows}</table>
    <p>Delivery (${escapeHtml(order.deliveryMethod)}): ${formatGhs(order.deliveryFee)}<br>Total: <strong>${formatGhs(order.total)}</strong></p>
    <p>${escapeHtml(address.street)}, ${escapeHtml(address.city)}, ${escapeHtml(address.region)}</p>
    <p>Track it at ${escapeHtml(env.clientUrl.replace(/\/$/, ''))}/order/${escapeHtml(order.orderNumber)}</p>
  </div>`;
}

async function sendOrderUpdate(order) {
  return sendMail({
    to: order.customerEmail,
    subject: `KicksHub ${order.orderNumber} is ${order.orderStatus}`,
    text: `Order ${order.orderNumber} is now ${order.orderStatus}. Total ${formatGhs(order.total)}.`,
    html: orderHtml(order),
  });
}

async function sendOrderConfirmation(order) {
  return sendMail({
    to: order.customerEmail,
    subject: `KicksHub order ${order.orderNumber}`,
    text: `Order ${order.orderNumber} total ${formatGhs(order.total)}. Status: ${order.orderStatus}.`,
    html: orderHtml(order),
  });
}

async function sendPasswordReset(user, resetUrl) {
  return sendMail({
    to: user.email,
    subject: 'Reset your KicksHub password',
    text: `Reset your password: ${resetUrl} This link expires in 30 minutes.`,
    html: `<p>Hi ${escapeHtml(user.firstName)},</p><p><a href="${escapeHtml(resetUrl)}">Reset your KicksHub password</a>. The link expires in 30 minutes.</p>`,
  });
}

async function sendContact({ name, email, message, to }) {
  return sendMail({
    to,
    subject: `KicksHub contact from ${name}`,
    text: `${name} <${email}>\n\n${message}`,
    html: `<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)})</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  });
}

module.exports = { sendMail, sendOrderConfirmation, sendOrderUpdate, sendPasswordReset, sendContact, canSend };
