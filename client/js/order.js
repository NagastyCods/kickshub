import { api } from './api.js';
import { escapeHtml, ghs, showErrors, toast, withButton } from './ui.js';

const root = document.querySelector('[data-order]');
const orderNumber = location.pathname.split('/').filter(Boolean).pop();
const labels = {
  pending: 'Pending',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
  note: 'Update',
  refund: 'Refund',
};

async function load(email) {
  const query = email ? `?email=${encodeURIComponent(email)}` : '';
  const payload = await api.get(`/api/orders/${orderNumber}${query}`);
  const order = payload.data.order;
  const steps = ['pending', 'paid', 'processing', 'shipped', 'delivered'];
  const active = steps.indexOf(order.orderStatus);
  root.innerHTML = `
    <p class="brand">Order ${order.orderNumber}</p>
    <h1>${labels[order.orderStatus] || order.orderStatus}</h1>
    <p>Payment: ${order.paymentStatus}${order.paymentChannel ? ` · ${order.paymentChannel.replaceAll('_', ' ')}` : ''}</p>
    ${order.gatewayResponse ? `<p>${escapeHtml(order.gatewayResponse)}</p>` : ''}
    <ol class="timeline">${steps.map((step, index) => `<li ${index <= active ? '' : 'style="opacity:.45"'}>${labels[step]}</li>`).join('')}</ol>
    <ul class="timeline">${order.timeline.map((entry) => `<li><strong>${labels[entry.status] || entry.status}</strong> · ${new Date(entry.at).toLocaleString('en-GH')}<br>${entry.note || ''}</li>`).join('')}</ul>
    ${order.items.map((item) => `<article class="cart-line"><img src="${item.image}" alt="" width="88" height="88"><div><h2>${item.name}</h2><p class="muted">EU ${item.size} · ${item.color} · ×${item.quantity}</p><p>${ghs(item.lineTotal)}</p></div></article>`).join('')}
    <div class="summary">
      <p>${order.shippingAddress.fullName}<br>${order.shippingAddress.street}<br>${order.shippingAddress.city}, ${order.shippingAddress.region}<br>${order.shippingAddress.digitalAddress || ''}</p>
      <p>Delivery ${ghs(order.deliveryFee)} · ${order.deliveryEstimate || ''}</p>
      <p>Total <strong>${ghs(order.total)}</strong></p>
      <a class="btn" href="/api/orders/${order.orderNumber}/invoice?token=${encodeURIComponent(payload.data.invoiceToken)}">Download invoice</a>
    </div>
    ${order.paymentStatus !== 'paid' && order.orderStatus !== 'cancelled' && order.paymentChannel !== 'pay_on_delivery' ? `
      <form data-retry class="panel"><h2>Try payment again</h2>
        <label>Method<select name="paymentChannel"><option value="card">Card</option><option value="mobile_money">Mobile Money</option></select></label>
        <label>Network<select name="mobileNetwork"><option value="mtn">MTN MoMo</option><option value="telecel">Telecel Cash</option><option value="airteltigo">AirtelTigo Money</option></select></label>
        <label>MoMo number<input name="mobileNumber" value="${order.customerPhone}"></label>
        <button class="btn accent" type="submit">Pay now</button>
      </form>` : ''}`;
  root.querySelector('[data-retry]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await withButton(form.querySelector('button'), async () => {
      try {
        const result = await api.post(`/api/orders/${order.orderNumber}/pay?email=${encodeURIComponent(order.customerEmail)}`, data);
        const payment = result.data.payment;
        toast(payment.displayText || result.message || 'Payment updated');
        if (payment.channel === 'card' && window.PaystackPop && payment.publicKey) {
          const handler = window.PaystackPop.setup({
            key: payment.publicKey,
            email: order.customerEmail,
            amount: payment.amountPesewas,
            currency: 'GHS',
            ref: payment.reference,
            channels: ['card', 'mobile_money'],
            callback() { load(order.customerEmail); },
            onClose() { load(order.customerEmail); },
          });
          handler.openIframe();
          return;
        }
        if (payment.authorizationUrl && payment.channel === 'card') {
          window.location.href = payment.authorizationUrl;
          return;
        }
        if (payment.reference) {
          await api.get(`/api/payments/verify/${payment.reference}`);
        }
        load(order.customerEmail);
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
}

const stored = sessionStorage.getItem(`order-email:${orderNumber}`) || '';
try {
  await load(stored);
} catch (_err) {
  root.innerHTML = `<form data-lookup class="panel"><h1>Find your order</h1>
    <label>Email used at checkout<input name="email" type="email" required value="${stored}"></label>
    <button class="btn" type="submit">View order</button></form>`;
  root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    try { await load(email); } catch (error) { showErrors(event.currentTarget, error); }
  });
}
