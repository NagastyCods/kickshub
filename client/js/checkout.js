import { api } from './api.js';
import { currentUser } from './auth.js';
import { clearLocalCart, fetchCart } from './cart.js';
import { escapeHtml, ghs, loadStore, showErrors, toast, withButton } from './ui.js';

const form = document.querySelector('[data-checkout]');
const summary = document.querySelector('[data-summary]');
const store = await loadStore();
const user = await currentUser();
const cart = await fetchCart();
if (!cart.items.length) {
  form.hidden = true;
  summary.innerHTML = '<p class="empty">Your bag is empty. <a href="/shop">Shop sneakers</a>.</p>';
} else {
  const region = form.querySelector('[name="region"]');
  region.innerHTML = store.deliveryFees.map((fee) => `<option value="${fee.region}">${fee.region}</option>`).join('');
  const city = form.querySelector('[name="city"]');
  const cityList = document.querySelector('#cities');
  function fillCities() {
    const cities = store.cities[region.value] || [];
    cityList.innerHTML = cities.map((name) => `<option value="${name}"></option>`).join('');
  }
  region.addEventListener('change', fillCities);
  fillCities();
  const payments = form.querySelector('[data-payments]');
  const options = [];
  if (store.payments.card) options.push(['card', 'Card (Paystack)']);
  if (store.payments.mobileMoney) options.push(['mobile_money', 'Mobile Money']);
  if (store.payments.payOnDelivery) options.push(['pay_on_delivery', 'Pay on delivery']);
  payments.innerHTML = options.map(([value, label], index) => `
    <label><input type="radio" name="paymentChannel" value="${value}" ${index === 0 ? 'checked' : ''}> ${label}</label>`).join('')
    || '<p class="field-error">No payment method is turned on.</p>';
  form.querySelector('[data-networks]').innerHTML = store.momoNetworks.map((network) => (
    `<option value="${network.id}">${network.label}</option>`
  )).join('');
  if (user) {
    form.querySelector('[data-guest]').hidden = true;
    form.querySelector('[name="email"]').required = false;
    const address = user.addresses.find((item) => item.isDefault) || user.addresses[0];
    if (address) {
      ['fullName', 'phone', 'region', 'city', 'digitalAddress', 'street', 'landmark'].forEach((field) => {
        if (form.elements[field]) form.elements[field].value = address[field] || '';
      });
      fillCities();
    }
  }

  function lines() {
    return cart.items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity }));
  }
  function body() {
    const data = new FormData(form);
    return {
      items: lines(),
      email: user ? user.email : data.get('email'),
      promoCode: data.get('promoCode'),
      deliveryMethod: data.get('deliveryMethod'),
      paymentChannel: data.get('paymentChannel'),
      mobileNetwork: data.get('mobileNetwork'),
      mobileNumber: data.get('mobileNumber'),
      customerNote: data.get('customerNote'),
      shippingAddress: {
        fullName: data.get('fullName'),
        phone: data.get('phone'),
        region: data.get('region'),
        city: data.get('city'),
        digitalAddress: data.get('digitalAddress'),
        street: data.get('street'),
        landmark: data.get('landmark'),
      },
    };
  }
  function toggleMomo() {
    const momo = form.querySelector('[data-momo]');
    momo.hidden = form.querySelector('[name="paymentChannel"]:checked')?.value !== 'mobile_money';
  }
  form.addEventListener('change', async (event) => {
    toggleMomo();
    if (event.target.name === 'promoCode') return;
    await refreshQuote();
  });
  toggleMomo();

  async function refreshQuote() {
    try {
      const payload = await api.post('/api/checkout/quote', body());
      const quote = payload.data;
      summary.innerHTML = `<h2>Order summary</h2>
        <ul class="summary-lines">
          ${quote.items.map((item) => `<li><span>${item.quantity} × ${escapeHtml(item.name)} <small>EU ${escapeHtml(item.size)}</small></span><strong>${ghs(item.lineTotal)}</strong></li>`).join('')}
        </ul>
        <dl class="totals">
          <div><dt>Subtotal</dt><dd>${ghs(quote.subtotal)}</dd></div>
          <div><dt>Discount</dt><dd>− ${ghs(quote.discount)}</dd></div>
          <div><dt>Delivery <small>(${escapeHtml(quote.delivery.estimate)})</small></dt><dd>${ghs(quote.deliveryFee)}</dd></div>
          <div class="grand"><dt>Total</dt><dd>${ghs(quote.total)}</dd></div>
        </dl>`;
    } catch (error) {
      summary.innerHTML = `<p class="field-error">${error.message}</p>`;
    }
  }
  form.querySelector('[data-apply-promo]').addEventListener('click', refreshQuote);
  await refreshQuote();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    await withButton(button, async () => {
      try {
        const payload = await api.post('/api/orders', body());
        clearLocalCart();
        sessionStorage.setItem(`order-email:${payload.data.order.orderNumber}`, payload.data.order.customerEmail);
        sessionStorage.setItem(`invoice:${payload.data.order.orderNumber}`, payload.data.invoiceToken);
        await continuePayment(payload.data);
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
}

async function continuePayment(data) {
  const { order, payment } = data;
  const done = () => { window.location.href = `/order/${order.orderNumber}`; };
  if (payment.error) {
    toast(payment.error, 'err');
    done();
    return;
  }
  if (payment.channel === 'pay_on_delivery' || payment.status === 'success') {
    done();
    return;
  }
  if (payment.channel === 'card' && window.PaystackPop && payment.publicKey) {
    const handler = window.PaystackPop.setup({
      key: payment.publicKey,
      email: payment.email,
      amount: payment.amountPesewas,
      currency: 'GHS',
      ref: payment.reference,
      channels: ['card', 'mobile_money'],
      callback() { done(); },
      onClose() { done(); },
    });
    handler.openIframe();
    return;
  }
  if (payment.channel === 'card' && payment.authorizationUrl) {
    window.location.href = payment.authorizationUrl;
    return;
  }
  const panel = document.querySelector('[data-momo-status]');
  panel.hidden = false;
  panel.querySelector('[data-momo-text]').textContent = payment.displayText || 'Approve the prompt on your phone.';
  const otpForm = panel.querySelector('[data-otp]');
  if (payment.status === 'send_otp') otpForm.hidden = false;
  otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otp = new FormData(otpForm).get('otp');
    const result = await api.post('/api/payments/otp', { reference: payment.reference, otp });
    if (result.data.status === 'success') done();
    else toast(result.data.displayText || 'Still waiting for approval');
  });
  const started = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - started > 190000) {
      clearInterval(timer);
      toast('The prompt expired. You can try again from the order page.', 'err');
      done();
      return;
    }
    try {
      const result = await api.get(`/api/payments/verify/${payment.reference}`);
      if (result.data.status === 'success' || result.data.status === 'failed' || result.data.status === 'abandoned') {
        clearInterval(timer);
        done();
      } else if (result.data.status === 'send_otp') {
        otpForm.hidden = false;
      } else if (result.data.displayText) {
        panel.querySelector('[data-momo-text]').textContent = result.data.displayText;
      }
    } catch (_err) {
      // Keep polling; the next tick will retry.
    }
  }, 4000);
}
