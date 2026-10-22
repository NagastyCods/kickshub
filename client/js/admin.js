import { api } from './api.js';
import { escapeHtml, ghs, showErrors, toast } from './ui.js';

const app = document.querySelector('#app');
const shell = document.querySelector('#shell');
const gate = document.querySelector('#gate');
const SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];

function path() {
  return location.pathname.replace(/\/$/, '') || '/admin';
}

function markNav() {
  const current = path();
  document.querySelectorAll('[data-path]').forEach((link) => {
    const active = current === link.dataset.path || (link.dataset.path !== '/admin' && current.startsWith(link.dataset.path));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function when(value) {
  return value ? new Date(value).toLocaleString('en-GH') : '';
}

async function uploadFile(file) {
  const body = new FormData();
  body.append('image', file);
  const response = await fetch('/api/admin/uploads', { method: 'POST', credentials: 'include', body });
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Upload failed');
  return payload.data;
}

function renderHome(data) {
  app.innerHTML = `
    <h1>Overview</h1>
    <div class="stat-grid">
      <article class="stat"><span>Paid revenue</span><strong>${ghs(data.revenue)}</strong></article>
      <article class="stat"><span>Paid orders</span><strong>${data.paidOrders}</strong></article>
      <article class="stat"><span>Orders today</span><strong>${data.ordersToday}</strong></article>
      <article class="stat"><span>Reviews waiting</span><strong>${data.pendingReviews}</strong></article>
    </div>
    ${data.refunds ? `<p class="banner">${data.refunds} order${data.refunds === 1 ? '' : 's'} need a refund review.</p>` : ''}
    <div class="split section">
      <section>
        <h2>Recent orders</h2>
        ${orderTable(data.recent)}
      </section>
      <section>
        <h2>Low stock</h2>
        ${data.lowStock.length ? `<ul>${data.lowStock.map((row) => `<li><a href="/admin/products/${row.productId}" data-nav>${escapeHtml(row.name)}</a> EU ${escapeHtml(row.size)} · ${escapeHtml(row.color)} · ${row.available} left</li>`).join('')}</ul>` : '<p class="muted">No sizes are at or under the threshold.</p>'}
      </section>
    </div>`;
}

function orderTable(orders) {
  if (!orders.length) return '<p class="muted">No orders yet.</p>';
  return `<table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead><tbody>
    ${orders.map((order) => `<tr>
      <td><a href="/admin/orders/${escapeHtml(order.orderNumber)}" data-nav>${escapeHtml(order.orderNumber)}</a></td>
      <td>${escapeHtml(order.customerName)}<br><span class="muted">${escapeHtml(order.customerEmail)}</span></td>
      <td>${escapeHtml(order.orderStatus)} · ${escapeHtml(order.paymentStatus)}${order.needsRefundReview ? '<br><strong>Refund review</strong>' : ''}</td>
      <td>${ghs(order.total)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

async function renderOrders() {
  const params = new URLSearchParams(location.search);
  app.innerHTML = `<h1>Orders</h1>
    <form class="filters inline" data-filter>
      <label>Search<input name="q" value="${escapeHtml(params.get('q') || '')}"></label>
      <label>Order status<select name="status">
        <option value="">Any</option>
        ${['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => `<option ${params.get('status') === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select></label>
      <label>Payment<select name="payment">
        <option value="">Any</option>
        ${['pending', 'paid', 'failed', 'refunded'].map((status) => `<option ${params.get('payment') === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select></label>
      <label><input type="checkbox" name="refunds" ${params.get('refunds') === 'true' ? 'checked' : ''}> Refund review</label>
      <button class="btn" type="submit">Filter</button>
    </form>
    <div data-list></div>`;
  app.querySelector('[data-filter]').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    if (data.get('q')) next.set('q', data.get('q'));
    if (data.get('status')) next.set('status', data.get('status'));
    if (data.get('payment')) next.set('payment', data.get('payment'));
    if (event.currentTarget.refunds.checked) next.set('refunds', 'true');
    history.pushState({}, '', `/admin/orders?${next.toString()}`);
    renderOrders();
  });
  const payload = await api.get(`/api/admin/orders?${params.toString()}`);
  app.querySelector('[data-list]').innerHTML = orderTable(payload.data);
}

function nextStatuses(order) {
  const map = {
    pending: ['cancelled'],
    paid: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };
  const list = map[order.orderStatus] || [];
  if (order.orderStatus === 'pending' && order.paymentChannel === 'pay_on_delivery') list.unshift('processing');
  return list;
}

async function renderOrder(orderNumber) {
  const payload = await api.get(`/api/admin/orders/${orderNumber}`);
  const order = payload.data.order;
  const moves = nextStatuses(order);
  app.innerHTML = `
    <p><a href="/admin/orders" data-nav>Orders</a></p>
    <h1>${escapeHtml(order.orderNumber)}</h1>
    ${order.needsRefundReview ? '<p class="banner">Money arrived after stock was released. Refund it before shipping.</p>' : ''}
    <div class="split">
      <section class="panel">
        <p>${escapeHtml(order.customerName)} · ${escapeHtml(order.customerEmail)} · ${escapeHtml(order.customerPhone)}</p>
        <p>${escapeHtml(order.shippingAddress.street)}<br>${escapeHtml(order.shippingAddress.city)}, ${escapeHtml(order.shippingAddress.region)}<br>${escapeHtml(order.shippingAddress.digitalAddress || '')}</p>
        <p>${escapeHtml(order.deliveryMethod)} · ${escapeHtml(order.deliveryEstimate || '')}</p>
        ${order.customerNote ? `<p>Note: ${escapeHtml(order.customerNote)}</p>` : ''}
        ${order.items.map((item) => `<p>${item.quantity} × ${escapeHtml(item.name)} · EU ${escapeHtml(item.size)} · ${escapeHtml(item.color)} · ${ghs(item.lineTotal)}</p>`).join('')}
        <p>Subtotal ${ghs(order.subtotal)} · Discount ${ghs(order.discount)} · Delivery ${ghs(order.deliveryFee)}</p>
        <p><strong>Total ${ghs(order.total)}</strong></p>
        <p>Payment ${escapeHtml(order.paymentStatus)} · ${escapeHtml(order.paymentChannel || 'none')} ${order.paymentReference ? `· ${escapeHtml(order.paymentReference)}` : ''}</p>
        ${order.gatewayResponse ? `<p>${escapeHtml(order.gatewayResponse)}</p>` : ''}
      </section>
      <section>
        <form class="panel" data-status>
          <h2>Move order</h2>
          ${moves.length ? `<label>Next status<select name="status">${moves.map((status) => `<option>${status}</option>`).join('')}</select></label>
          <label>Note<input name="note"></label>
          <button class="btn" type="submit">Update status</button>` : '<p class="muted">No further status changes.</p>'}
          ${order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded' && order.orderStatus !== 'cancelled' ? '<button class="btn accent" type="button" data-paid>Mark paid</button>' : ''}
        </form>
        ${order.paymentStatus === 'paid' ? `<form class="panel" data-refund>
          <h2>Refund</h2>
          <label>Note<textarea name="note" required></textarea></label>
          <label><input type="checkbox" name="restock"> Put the pairs back in stock</label>
          <button class="btn" type="submit">Record refund</button>
        </form>` : ''}
        <form class="panel" data-note>
          <h2>Internal note</h2>
          <label>Note<textarea name="note" required></textarea></label>
          <button class="btn" type="submit">Add note</button>
        </form>
        <ol class="timeline">${order.timeline.map((entry) => `<li><strong>${escapeHtml(entry.status)}</strong> · ${when(entry.at)}<br>${escapeHtml(entry.note || '')}</li>`).join('')}</ol>
      </section>
    </div>`;
  app.querySelector('[data-status]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.patch(`/api/admin/orders/${order.orderNumber}/status`, Object.fromEntries(new FormData(form).entries()));
      toast('Order updated');
      renderOrder(order.orderNumber);
    } catch (error) {
      showErrors(form, error);
    }
  });
  app.querySelector('[data-paid]')?.addEventListener('click', async () => {
    const result = await api.post(`/api/admin/orders/${order.orderNumber}/paid`, {});
    toast(result.message);
    renderOrder(order.orderNumber);
  });
  app.querySelector('[data-refund]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.restock = form.restock.checked;
    try {
      await api.post(`/api/admin/orders/${order.orderNumber}/refund`, data);
      toast('Refund recorded');
      renderOrder(order.orderNumber);
    } catch (error) {
      showErrors(form, error);
    }
  });
  app.querySelector('[data-note]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.post(`/api/admin/orders/${order.orderNumber}/note`, Object.fromEntries(new FormData(form).entries()));
      toast('Note added');
      renderOrder(order.orderNumber);
    } catch (error) {
      showErrors(form, error);
    }
  });
}

function productTable(products) {
  if (!products.length) return '<p class="muted">No products.</p>';
  return `<table class="admin-table"><thead><tr><th>Shoe</th><th>Price</th><th>Status</th></tr></thead><tbody>
    ${products.map((product) => `<tr>
      <td><a href="/admin/products/${product.id}" data-nav>${escapeHtml(product.name)}</a><br><span class="muted">${escapeHtml(product.brandName)} · ${escapeHtml(product.sku)}</span></td>
      <td>${ghs(product.basePrice)}</td>
      <td>${product.isActive ? 'On sale' : 'Hidden'}${product.inStock ? '' : ' · sold out'}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

async function renderProducts() {
  const params = new URLSearchParams(location.search);
  const payload = await api.get(`/api/admin/products?${params.toString()}`);
  app.innerHTML = `<h1>Products</h1>
    <p><a class="btn" href="/admin/products/new" data-nav>Add a shoe</a></p>
    <form class="filters inline" data-filter>
      <label>Search<input name="q" value="${escapeHtml(params.get('q') || '')}"></label>
      <button class="btn" type="submit">Search</button>
    </form>
    ${productTable(payload.data)}`;
  app.querySelector('[data-filter]').addEventListener('submit', (event) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    history.pushState({}, '', q ? `/admin/products?q=${encodeURIComponent(q)}` : '/admin/products');
    renderProducts();
  });
}

function brandOptions(brands, selected) {
  return brands.map((brand) => `<option value="${brand._id}" ${String(selected) === String(brand._id) ? 'selected' : ''}>${escapeHtml(brand.name)}</option>`).join('');
}

function collectionOptions(collections, selected) {
  return collections.map((collection) => `<option value="${collection._id}" ${String(selected) === String(collection._id) ? 'selected' : ''}>${escapeHtml(collection.name)}</option>`).join('');
}

async function renderProductForm(id) {
  const [brands, collections] = await Promise.all([
    api.get('/api/admin/brands'),
    api.get('/api/admin/collections'),
  ]);
  const existing = id ? (await api.get(`/api/admin/products/${id}`)).data.product : null;
  app.innerHTML = `
    <p><a href="/admin/products" data-nav>Products</a></p>
    <h1>${existing ? escapeHtml(existing.name) : 'New shoe'}</h1>
    <form class="panel" data-product>
      <label>Name<input name="name" required value="${escapeHtml(existing ? existing.name : '')}"></label>
      <label>SKU<input name="sku" ${existing ? 'readonly' : ''} value="${escapeHtml(existing ? existing.sku : '')}"></label>
      <label>Brand<select name="brandId" required>${brandOptions(brands.data, existing && existing.brandId)}</select></label>
      <label>Collection<select name="collectionId" required>${collectionOptions(collections.data, existing && existing.collectionId)}</select></label>
      <label>Gender<select name="gender">${['men', 'women', 'unisex', 'kids'].map((gender) => `<option ${existing && existing.gender === gender ? 'selected' : ''}>${gender}</option>`).join('')}</select></label>
      <label>Description<textarea name="description" required>${escapeHtml(existing ? existing.description : '')}</textarea></label>
      <label>Price (GHS)<input name="basePrice" type="number" min="1" step="0.01" required value="${existing ? existing.basePrice : ''}"></label>
      <label>Compare-at price<input name="compareAtPrice" type="number" min="0" step="0.01" value="${existing && existing.compareAtPrice ? existing.compareAtPrice : ''}"></label>
      <label>Image URL<input name="image" required value="${escapeHtml(existing && existing.images[0] ? existing.images[0].url : '')}"></label>
      <label>Upload<input name="file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label><input type="checkbox" name="featured" ${existing && existing.featured ? 'checked' : ''}> Featured</label>
      <label><input type="checkbox" name="isNewArrival" ${existing && existing.isNewArrival ? 'checked' : ''}> New arrival</label>
      <label><input type="checkbox" name="isActive" ${!existing || existing.isActive ? 'checked' : ''}> Visible in the shop</label>
      ${existing ? '' : `<label>Color<input name="color" required value="Black"></label>
        <label>Color hex<input name="colorHex" value="#111111"></label>
        <label>Starting stock<input name="stock" type="number" min="0" step="1" value="4" required></label>
        <fieldset><legend>EU sizes</legend>${SIZES.map((size) => `<label><input type="checkbox" name="size" value="${size}" ${['40', '41', '42', '43'].includes(size) ? 'checked' : ''}> ${size}</label>`).join(' ')}</fieldset>`}
      <button class="btn accent" type="submit">${existing ? 'Save shoe' : 'Create shoe'}</button>
    </form>
    ${existing ? `<section class="section"><h2>Sizes in stock</h2>
      <table class="admin-table"><thead><tr><th>SKU</th><th>Size</th><th>Color</th><th>On hand</th><th>Reserved</th><th>For sale</th><th>Price</th><th></th></tr></thead><tbody>
        ${existing.variants.map((variant) => `<tr data-variant="${variant.id}">
          <td>${escapeHtml(variant.sku)}</td>
          <td>EU ${escapeHtml(variant.size)}</td>
          <td>${escapeHtml(variant.color)}</td>
          <td><input name="stock" type="number" min="${variant.reserved}" step="1" value="${variant.stock}"></td>
          <td>${variant.reserved}</td>
          <td>${variant.available}</td>
          <td><input name="price" type="number" min="1" step="0.01" value="${variant.price}"></td>
          <td><button class="btn" type="button" data-save-variant>Save</button></td>
        </tr>`).join('')}
      </tbody></table>
      <form class="panel" data-add-variant>
        <h2>Add a size</h2>
        <label>EU size<select name="size">${SIZES.map((size) => `<option>${size}</option>`).join('')}</select></label>
        <label>Color<input name="color" required></label>
        <label>Hex<input name="colorHex" value="#111111"></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" value="2" required></label>
        <label>Price<input name="price" type="number" min="1" step="0.01" value="${existing.basePrice}" required></label>
        <button class="btn" type="submit">Add size</button>
      </form>
    </section>` : ''}`;

  const form = app.querySelector('[data-product]');
  form.querySelector('[name="file"]').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const image = await uploadFile(file);
      form.image.value = image.url;
      toast('Image stored');
    } catch (error) {
      toast(error.message, 'err');
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = {
      name: data.get('name'),
      sku: data.get('sku'),
      brandId: data.get('brandId'),
      collectionId: data.get('collectionId'),
      gender: data.get('gender'),
      description: data.get('description'),
      basePrice: Number(data.get('basePrice')),
      compareAtPrice: data.get('compareAtPrice') || null,
      featured: form.featured.checked,
      isNewArrival: form.isNewArrival.checked,
      isActive: form.isActive.checked,
      images: [{ url: data.get('image'), alt: data.get('name') }],
    };
    try {
      if (!existing) {
        const sizes = data.getAll('size');
        if (!sizes.length) throw Object.assign(new Error('Choose at least one size'), { errors: [] });
        body.variants = sizes.map((size) => ({
          size,
          color: data.get('color'),
          colorHex: data.get('colorHex'),
          stock: Number(data.get('stock')),
          price: body.basePrice,
        }));
        const result = await api.post('/api/admin/products', body);
        toast('Product created');
        history.pushState({}, '', `/admin/products/${result.data.product.id}`);
        route();
      } else {
        await api.patch(`/api/admin/products/${existing.id}`, body);
        toast('Product saved');
        renderProductForm(existing.id);
      }
    } catch (error) {
      showErrors(form, error);
    }
  });
  app.querySelectorAll('[data-save-variant]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('[data-variant]');
      try {
        await api.patch(`/api/admin/products/${existing.id}/variants/${row.dataset.variant}`, {
          stock: Number(row.querySelector('[name="stock"]').value),
          price: Number(row.querySelector('[name="price"]').value),
        });
        toast('Size saved');
        renderProductForm(existing.id);
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  });
  app.querySelector('[data-add-variant]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const variantForm = event.currentTarget;
    const data = Object.fromEntries(new FormData(variantForm).entries());
    data.stock = Number(data.stock);
    data.price = Number(data.price);
    try {
      await api.post(`/api/admin/products/${existing.id}/variants`, data);
      toast('Size added');
      renderProductForm(existing.id);
    } catch (error) {
      showErrors(variantForm, error);
    }
  });
}

async function renderCatalog() {
  const [brands, collections] = await Promise.all([
    api.get('/api/admin/brands'),
    api.get('/api/admin/collections'),
  ]);
  app.innerHTML = `<h1>Brands and collections</h1>
    <div class="split">
      <section>
        <h2>Brands</h2>
        ${brands.data.map((brand) => `<form class="panel" data-brand="${brand._id}">
          <label>Name<input name="name" value="${escapeHtml(brand.name)}" required></label>
          <label>Accent<input name="accentColor" value="${escapeHtml(brand.accentColor)}"></label>
          <label>Sort<input name="sortOrder" type="number" value="${brand.sortOrder}"></label>
          <label><input type="checkbox" name="isActive" ${brand.isActive ? 'checked' : ''}> Active</label>
          <button class="btn" type="submit">Save</button>
        </form>`).join('')}
        <form class="panel" data-brand="">
          <h2>New brand</h2>
          <label>Name<input name="name" required></label>
          <label>Accent<input name="accentColor" value="#111111"></label>
          <button class="btn" type="submit">Add brand</button>
        </form>
      </section>
      <section>
        <h2>Collections</h2>
        ${collections.data.map((collection) => `<form class="panel" data-collection="${collection._id}">
          <label>Name<input name="name" value="${escapeHtml(collection.name)}" required></label>
          <label>Image<input name="image" value="${escapeHtml(collection.image || '')}"></label>
          <label>Sort<input name="sortOrder" type="number" value="${collection.sortOrder}"></label>
          <label><input type="checkbox" name="isActive" ${collection.isActive ? 'checked' : ''}> Active</label>
          <button class="btn" type="submit">Save</button>
        </form>`).join('')}
        <form class="panel" data-collection="">
          <h2>New collection</h2>
          <label>Name<input name="name" required></label>
          <label>Image<input name="image"></label>
          <button class="btn" type="submit">Add collection</button>
        </form>
      </section>
    </div>`;
  app.querySelectorAll('[data-brand]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      data.isActive = form.isActive ? form.isActive.checked : true;
      data.sortOrder = Number(data.sortOrder || 0);
      try {
        if (form.dataset.brand) await api.patch(`/api/admin/brands/${form.dataset.brand}`, data);
        else await api.post('/api/admin/brands', data);
        toast('Brand saved');
        renderCatalog();
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
  app.querySelectorAll('[data-collection]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      data.isActive = form.isActive ? form.isActive.checked : true;
      data.sortOrder = Number(data.sortOrder || 0);
      try {
        if (form.dataset.collection) await api.patch(`/api/admin/collections/${form.dataset.collection}`, data);
        else await api.post('/api/admin/collections', data);
        toast('Collection saved');
        renderCatalog();
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
}

async function renderPromos() {
  const payload = await api.get('/api/admin/promos');
  app.innerHTML = `<h1>Promo codes</h1>
    ${payload.data.map((promo) => `<form class="panel" data-promo="${promo._id}">
      <p><strong>${escapeHtml(promo.code)}</strong> · used ${promo.usedCount}${promo.usageLimit ? ` / ${promo.usageLimit}` : ''}</p>
      <label>Type<select name="type"><option ${promo.type === 'percentage' ? 'selected' : ''}>percentage</option><option ${promo.type === 'fixed' ? 'selected' : ''}>fixed</option></select></label>
      <label>Value<input name="value" type="number" step="0.01" value="${promo.value}" required></label>
      <label>Minimum spend<input name="minSpend" type="number" step="0.01" value="${promo.minSpend}"></label>
      <label>Max discount<input name="maxDiscount" type="number" step="0.01" value="${promo.maxDiscount ?? ''}"></label>
      <label><input type="checkbox" name="isActive" ${promo.isActive ? 'checked' : ''}> Active</label>
      <button class="btn" type="submit">Save</button>
    </form>`).join('')}
    <form class="panel" data-promo="">
      <h2>New code</h2>
      <label>Code<input name="code" required placeholder="WELCOME10"></label>
      <label>Type<select name="type"><option>percentage</option><option>fixed</option></select></label>
      <label>Value<input name="value" type="number" step="0.01" required></label>
      <label>Minimum spend<input name="minSpend" type="number" step="0.01" value="0"></label>
      <label>Max discount<input name="maxDiscount" type="number" step="0.01"></label>
      <label>Usage limit<input name="usageLimit" type="number" step="1"></label>
      <button class="btn" type="submit">Create code</button>
    </form>`;
  app.querySelectorAll('[data-promo]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      data.isActive = form.isActive ? form.isActive.checked : true;
      data.value = Number(data.value);
      data.minSpend = Number(data.minSpend || 0);
      if (!form.dataset.promo) data.usageLimit = data.usageLimit || null;
      try {
        if (form.dataset.promo) await api.patch(`/api/admin/promos/${form.dataset.promo}`, data);
        else await api.post('/api/admin/promos', data);
        toast('Promo saved');
        renderPromos();
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
}

async function renderReviews() {
  const params = new URLSearchParams(location.search);
  const status = params.get('status') || 'pending';
  const payload = await api.get(`/api/admin/reviews?status=${status}`);
  app.innerHTML = `<h1>Reviews</h1>
    <p class="row-actions">
      ${['pending', 'approved', 'rejected'].map((item) => `<a class="btn${item === status ? ' accent' : ''}" href="/admin/reviews?status=${item}" data-nav>${item}</a>`).join('')}
    </p>
    ${payload.data.map((review) => `<article class="panel">
      <p>${'★'.repeat(review.rating)} · ${escapeHtml(review.productName)} · ${escapeHtml(review.author)}</p>
      <h2>${escapeHtml(review.title || 'Review')}</h2>
      <p>${escapeHtml(review.comment)}</p>
      <div class="row-actions">
        <button class="btn" type="button" data-review="${review.id}" data-status="approved">Approve</button>
        <button class="btn-ghost" type="button" data-review="${review.id}" data-status="rejected">Reject</button>
      </div>
    </article>`).join('') || '<p class="muted">Nothing in this queue.</p>'}`;
  app.querySelectorAll('[data-review]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api.patch(`/api/admin/reviews/${button.dataset.review}`, { status: button.dataset.status });
      toast('Review updated');
      renderReviews();
    });
  });
}

async function renderCustomers() {
  const [customers, newsletter, alerts] = await Promise.all([
    api.get('/api/admin/customers'),
    api.get('/api/admin/newsletter'),
    api.get('/api/admin/stock-alerts'),
  ]);
  app.innerHTML = `<h1>Customers</h1>
    <table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th></th></tr></thead><tbody>
      ${customers.data.map((user) => `<tr>
        <td>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</td>
        <td>${escapeHtml(user.email)}<br><span class="muted">${escapeHtml(user.phone)}</span></td>
        <td><button class="btn-ghost" type="button" data-user="${user.id}" data-active="${user.isActive ? 'false' : 'true'}">${user.isActive ? 'Disable' : 'Enable'}</button></td>
      </tr>`).join('')}
    </tbody></table>
    <section class="section"><h2>Newsletter</h2>
      ${newsletter.data.map((row) => `<p>${escapeHtml(row.email)} <span class="muted">${escapeHtml(row.source)}</span></p>`).join('') || '<p class="muted">No subscribers.</p>'}
    </section>
    <section class="section"><h2>Back in stock</h2>
      ${alerts.data.map((row) => `<p>${escapeHtml(row.email)} · ${escapeHtml(row.productName)} · EU ${escapeHtml(row.size)} ${escapeHtml(row.color)}</p>`).join('') || '<p class="muted">No alerts.</p>'}
    </section>`;
  app.querySelectorAll('[data-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api.patch(`/api/admin/customers/${button.dataset.user}`, { isActive: button.dataset.active === 'true' });
      toast('Customer updated');
      renderCustomers();
    });
  });
}

async function renderSettings() {
  const payload = await api.get('/api/admin/settings');
  const settings = payload.data;
  app.innerHTML = `<h1>Settings</h1>
    <form data-settings>
      <div class="panel">
        <label>Store name<input name="storeName" value="${escapeHtml(settings.storeName)}" required></label>
        <label>Tagline<input name="tagline" value="${escapeHtml(settings.tagline)}"></label>
        <label>Email<input name="email" type="email" value="${escapeHtml(settings.email)}" required></label>
        <label>Phone<input name="phone" value="${escapeHtml(settings.phone)}"></label>
        <label>WhatsApp<input name="whatsapp" value="${escapeHtml(settings.whatsapp)}"></label>
        <label>Address<input name="address" value="${escapeHtml(settings.address)}"></label>
        <label>Low-stock threshold<input name="lowStockThreshold" type="number" min="1" step="1" value="${settings.lowStockThreshold}"></label>
        <label>Pay on delivery fee<input name="payOnDeliveryFee" type="number" min="0" step="0.01" value="${settings.payOnDeliveryFee}"></label>
        <label>Free standard delivery from<input name="freeDeliveryThreshold" type="number" min="0" step="0.01" value="${settings.freeDeliveryThreshold ?? ''}" placeholder="Blank for none"></label>
        <label><input type="checkbox" name="paystackCardEnabled" ${settings.paystackCardEnabled ? 'checked' : ''}> Card payments</label>
        <label><input type="checkbox" name="paystackMobileMoneyEnabled" ${settings.paystackMobileMoneyEnabled ? 'checked' : ''}> Mobile Money</label>
        <label><input type="checkbox" name="payOnDeliveryEnabled" ${settings.payOnDeliveryEnabled ? 'checked' : ''}> Pay on delivery</label>
        <label><input type="checkbox" name="newsletterEnabled" ${settings.newsletterEnabled ? 'checked' : ''}> Newsletter signup</label>
        <label><input type="checkbox" name="maintenanceMode" ${settings.maintenanceMode ? 'checked' : ''}> Maintenance mode. The shop shows a holding page. This dashboard stays open.</label>
      </div>
      <h2>Delivery fees</h2>
      <div class="table-wrap"><table class="admin-table"><thead><tr><th>Region</th><th>Standard</th><th>Days</th><th>Express</th><th>Days</th><th>On</th></tr></thead><tbody>
        ${settings.deliveryFees.map((fee) => `<tr data-fee data-region="${escapeHtml(fee.region)}">
          <td>${escapeHtml(fee.region)}</td>
          <td><input name="standardFee" type="number" min="0" step="0.01" value="${fee.standardFee}"></td>
          <td><input name="standardDays" value="${escapeHtml(fee.standardDays)}"></td>
          <td><input name="expressFee" type="number" min="0" step="0.01" value="${fee.expressFee}"></td>
          <td><input name="expressDays" value="${escapeHtml(fee.expressDays)}"></td>
          <td><input name="isActive" type="checkbox" ${fee.isActive ? 'checked' : ''}></td>
        </tr>`).join('')}
      </tbody></table></div>
      <p><button class="btn accent" type="submit">Save settings</button></p>
    </form>`;
  app.querySelector('[data-settings]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      storeName: form.storeName.value,
      tagline: form.tagline.value,
      email: form.email.value,
      phone: form.phone.value,
      whatsapp: form.whatsapp.value,
      address: form.address.value,
      lowStockThreshold: Number(form.lowStockThreshold.value),
      payOnDeliveryFee: Number(form.payOnDeliveryFee.value),
      freeDeliveryThreshold: form.freeDeliveryThreshold.value,
      paystackCardEnabled: form.paystackCardEnabled.checked,
      paystackMobileMoneyEnabled: form.paystackMobileMoneyEnabled.checked,
      payOnDeliveryEnabled: form.payOnDeliveryEnabled.checked,
      newsletterEnabled: form.newsletterEnabled.checked,
      maintenanceMode: form.maintenanceMode.checked,
      deliveryFees: [...form.querySelectorAll('[data-fee]')].map((row) => ({
        region: row.dataset.region,
        standardFee: Number(row.querySelector('[name="standardFee"]').value),
        standardDays: row.querySelector('[name="standardDays"]').value,
        expressFee: Number(row.querySelector('[name="expressFee"]').value),
        expressDays: row.querySelector('[name="expressDays"]').value,
        isActive: row.querySelector('[name="isActive"]').checked,
      })),
    };
    try {
      await api.patch('/api/admin/settings', body);
      toast('Settings saved');
    } catch (error) {
      showErrors(form, error);
    }
  });
}

async function route() {
  markNav();
  const current = path();
  app.innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (current === '/admin') renderHome((await api.get('/api/admin/summary')).data);
    else if (current === '/admin/orders') await renderOrders();
    else if (current.startsWith('/admin/orders/')) await renderOrder(decodeURIComponent(current.split('/').pop()));
    else if (current === '/admin/products') await renderProducts();
    else if (current === '/admin/products/new') await renderProductForm(null);
    else if (current.startsWith('/admin/products/')) await renderProductForm(current.split('/').pop());
    else if (current === '/admin/catalog') await renderCatalog();
    else if (current === '/admin/promos') await renderPromos();
    else if (current === '/admin/reviews') await renderReviews();
    else if (current === '/admin/customers') await renderCustomers();
    else if (current === '/admin/settings') await renderSettings();
    else app.innerHTML = '<h1>That admin page is not here.</h1>';
  } catch (error) {
    app.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-nav]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  route();
});
window.addEventListener('popstate', route);

const me = await api.get('/api/auth/me').catch(() => ({ data: { user: null } }));
const user = me.data.user;
if (!user || user.role !== 'admin') {
  gate.hidden = false;
  gate.innerHTML = user
    ? `<h1>Admin only</h1><p>This account cannot open the dashboard.</p><p><a href="/">Back to the shop</a></p>`
    : `<h1>Log in</h1><p><a class="btn" href="/login?next=${encodeURIComponent(location.pathname)}">Log in as an admin</a></p>`;
} else {
  shell.hidden = false;
  route();
}
