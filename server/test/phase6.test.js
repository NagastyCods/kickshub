const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { toPesewas, fromPesewas, formatGhs } = require('../utils/money');
const { applyCatalogPrice } = require('../services/pricing');
const { normalizeGhanaPhone, guessNetwork, paystackProviderFor } = require('../utils/phone');
const slugify = require('../utils/slugify');
const escapeHtml = require('../utils/escapeHtml');
const { signaturesMatch } = require('../utils/signature');
const { cleanString } = require('../middleware/sanitize');
const { requestAllowedDuringMaintenance } = require('../middleware/maintenance');

describe('money', () => {
  it('converts cedis to pesewas', () => {
    assert.equal(toPesewas(10.5), 1050);
    assert.equal(toPesewas(10.555), 1056);
    assert.equal(fromPesewas(1050), 10.5);
    assert.equal(formatGhs(12), '₵12.00');
  });
});

describe('catalog price', () => {
  it('updates sizes that still use the listing price', () => {
    const product = { basePrice: 890, variants: [{ price: 890 }, { price: 890 }, { price: 1200 }] };
    applyCatalogPrice(product, 750);
    assert.equal(product.basePrice, 750);
    assert.deepEqual(product.variants.map((variant) => variant.price), [750, 750, 1200]);
  });

  it('repairs sizes that still share one old price', () => {
    const product = { basePrice: 399.94, variants: [{ price: 860 }, { price: 860 }] };
    applyCatalogPrice(product, 409.94);
    assert.equal(product.basePrice, 409.94);
    assert.deepEqual(product.variants.map((variant) => variant.price), [409.94, 409.94]);
  });

  it('leaves a custom size price in place', () => {
    const product = { basePrice: 750, variants: [{ price: 890 }, { price: 1200 }] };
    applyCatalogPrice(product, 750);
    assert.deepEqual(product.variants.map((variant) => variant.price), [890, 1200]);
  });
});

describe('ghana phones', () => {
  it('normalizes local and international numbers', () => {
    assert.equal(normalizeGhanaPhone('0551234987'), '0551234987');
    assert.equal(normalizeGhanaPhone('+233 24 400 0111'), '0244000111');
    assert.equal(normalizeGhanaPhone('233244000111'), '0244000111');
    assert.equal(normalizeGhanaPhone('12345'), null);
  });

  it('maps prefixes to Paystack provider codes', () => {
    assert.equal(guessNetwork('0551234987'), 'mtn');
    assert.equal(paystackProviderFor('telecel'), 'vod');
    assert.equal(paystackProviderFor('airteltigo'), 'atl');
  });
});

describe('slugify', () => {
  it('builds a url slug', () => {
    assert.equal(slugify('Nike Air Force 1'), 'nike-air-force-1');
    assert.equal(slugify('Tom & Jerry'), 'tom-and-jerry');
  });
});

describe('html escape', () => {
  it('encodes characters that would break an email', () => {
    assert.equal(escapeHtml(`<b>Hi</b> & "you"`), '&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;');
  });
});

describe('webhook signature', () => {
  it('accepts the hex hmac of the raw body', () => {
    const secret = 'sk_test_example';
    const body = Buffer.from('{"event":"charge.success"}');
    const header = crypto.createHmac('sha512', secret).update(body).digest('hex');
    assert.equal(signaturesMatch(secret, body, header), true);
    assert.equal(signaturesMatch(secret, body, 'abc'), false);
    assert.equal(signaturesMatch(secret, body, ''), false);
    assert.equal(signaturesMatch('', body, header), false);
  });
});

describe('input cleaning', () => {
  it('strips tags and leaves passwords and emails alone', () => {
    assert.equal(cleanString('<script>alert(1)</script>Hello', 'name'), 'Hello');
    assert.equal(cleanString('a&b@test.com', 'email'), 'a&b@test.com');
    assert.equal(cleanString('p@ss<script>word', 'password'), 'p@ss<script>word');
    assert.equal(cleanString('bad\0name', 'name'), 'badname');
  });
});

describe('maintenance allow list', () => {
  it('keeps login, tracking, webhooks, and the dashboard open', () => {
    assert.equal(requestAllowedDuringMaintenance({ path: '/login', method: 'GET' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/admin/orders', method: 'GET' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/api/payments/webhook', method: 'POST' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/api/payments/verify/ref_1', method: 'GET' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/order/KH-1', method: 'GET' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/api/orders/KH-1', method: 'GET' }), true);
    assert.equal(requestAllowedDuringMaintenance({ path: '/css/main.css', method: 'GET' }), true);
  });

  it('closes the shop and checkout', () => {
    assert.equal(requestAllowedDuringMaintenance({ path: '/', method: 'GET' }), false);
    assert.equal(requestAllowedDuringMaintenance({ path: '/shop', method: 'GET' }), false);
    assert.equal(requestAllowedDuringMaintenance({ path: '/api/products', method: 'GET' }), false);
    assert.equal(requestAllowedDuringMaintenance({ path: '/api/orders', method: 'POST' }), false);
    assert.equal(requestAllowedDuringMaintenance({ path: '/checkout', method: 'GET' }), false);
  });
});
