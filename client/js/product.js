import { api } from './api.js';
import { addToCart } from './cart.js';
import { currentUser } from './auth.js';
import { dialogCloseButton, escapeHtml, ghs, loadStore, openSizeGuide, productCard, showDialog, showErrors, stockBadge, toast, withButton } from './ui.js';

const slug = location.pathname.split('/').filter(Boolean).pop();
const root = document.querySelector('[data-product]');
const store = await loadStore();
const payload = await api.get(`/api/products/${slug}`);
const product = payload.data.product;
const related = payload.data.related;
let color = product.variants[0]?.color;
let size = product.variants.find((variant) => variant.color === color && variant.available > 0)?.size
  || product.variants.find((variant) => variant.color === color)?.size;

const recentKey = 'kickshub_recent';
const recent = JSON.parse(localStorage.getItem(recentKey) || '[]').filter((item) => item.slug !== product.slug);
recent.unshift({ slug: product.slug, name: product.name, image: product.image, price: product.basePrice });
localStorage.setItem(recentKey, JSON.stringify(recent.slice(0, 8)));

function selectedVariant() {
  return product.variants.find((variant) => variant.color === color && variant.size === size) || product.variants[0];
}

function render() {
  const variant = selectedVariant();
  const colors = [...new Map(product.variants.map((item) => [item.color, item])).values()];
  const sizes = product.variants.filter((item) => item.color === color);
  const badge = stockBadge(variant.available, store.lowStockThreshold);
  const images = product.images.length ? product.images : [{ url: variant.image, alt: product.name }];
  root.innerHTML = `
    <div class="gallery">
      <button class="gallery-main" type="button" data-zoom aria-label="Zoom photo">
        <img src="${escapeHtml(images[0].url)}" alt="${escapeHtml(images[0].alt)}" data-main-image>
      </button>
      <div class="thumbs">${images.map((image, index) => `
        <button type="button" aria-label="Photo ${index + 1}" aria-pressed="${index === 0}">
          <img src="${escapeHtml(image.url)}" alt="">
        </button>`).join('')}</div>
    </div>
    <div>
      <p class="brand">${escapeHtml(product.brandName)} · ${escapeHtml(product.collectionName)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="price-row"><span class="price">${ghs(variant.price)}</span>
        ${product.compareAtPrice ? `<s>${ghs(product.compareAtPrice)}</s>` : ''}</p>
      <p>${badge ? `<span class="${badge.className}" style="position:static">${badge.text}</span>` : 'In stock'}</p>
      <p>${escapeHtml(product.description)}</p>
      <p class="brand">Color</p>
      <div class="swatches">${colors.map((item) => {
        const hex = /^#[0-9a-fA-F]{3,8}$/.test(item.colorHex) ? item.colorHex : '#ccc';
        return `<button type="button" class="swatch" style="background:${hex}" aria-label="${escapeHtml(item.color)}" aria-pressed="${item.color === color}" data-color="${escapeHtml(item.color)}"></button>`;
      }).join('')}</div>
      <p class="brand">EU size <button type="button" class="btn-ghost" data-size-guide>Size guide</button></p>
      <div class="sizes" role="radiogroup" aria-label="Size">${sizes.map((item) => `
        <button type="button" class="size" role="radio" data-size="${escapeHtml(item.size)}" aria-pressed="${item.size === size}" ${item.available <= 0 ? 'disabled' : ''}>
          ${escapeHtml(item.size)}${item.available > 0 && item.available <= store.lowStockThreshold ? ` · ${item.available}` : ''}
        </button>`).join('')}</div>
      <p class="muted">UK ${escapeHtml(variant.sizeUK)} · US men ${escapeHtml(variant.sizeUSMen)} · US women ${escapeHtml(variant.sizeUSWomen)}</p>
      <div class="buy-row">
        <div class="qty"><button type="button" data-qty="-1" aria-label="Decrease quantity"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><span data-qty-value>1</span><button type="button" data-qty="1" aria-label="Increase quantity"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <button class="btn accent" type="button" data-add ${variant.available <= 0 ? 'disabled' : ''}>Add to bag</button>
        <button class="btn-ghost" type="button" data-save>Save</button>
      </div>
      <form data-alert ${variant.available > 0 ? 'hidden' : ''}>
        <label>Email me when EU ${escapeHtml(variant.size)} is back
          <input name="email" type="email" required autocomplete="email">
        </label>
        <button class="btn" type="submit">Notify me</button>
      </form>
      <p class="stars" aria-label="Rating ${product.ratingsAverage} out of 5">${'★'.repeat(Math.round(product.ratingsAverage))}${'☆'.repeat(5 - Math.round(product.ratingsAverage))} <span class="muted">${product.ratingsCount} reviews</span></p>
    </div>`;

  root.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      color = button.dataset.color;
      const next = product.variants.find((item) => item.color === color && item.available > 0) || product.variants.find((item) => item.color === color);
      size = next.size;
      render();
    });
  });
  root.querySelectorAll('[data-size]').forEach((button) => {
    button.addEventListener('click', () => { size = button.dataset.size; render(); });
  });
  root.querySelectorAll('.thumbs button').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelector('[data-main-image]').src = button.querySelector('img').src;
      root.querySelectorAll('.thumbs button').forEach((item) => item.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', 'true');
    });
  });
  root.querySelector('[data-zoom]').addEventListener('click', () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'zoom-dialog';
    const image = root.querySelector('[data-main-image]');
    dialog.innerHTML = `<form method="dialog">${dialogCloseButton('Close photo')}<img src="${escapeHtml(image.src)}" alt="${escapeHtml(product.name)}"></form>`;
    document.body.appendChild(dialog);
    showDialog(dialog);
    dialog.addEventListener('close', () => dialog.remove());
  });
  root.querySelector('[data-size-guide]').addEventListener('click', openSizeGuide);
  let qty = 1;
  root.querySelectorAll('[data-qty]').forEach((button) => {
    button.addEventListener('click', () => {
      qty = Math.min(Math.max(1, qty + Number(button.dataset.qty)), Math.max(1, variant.available), 10);
      root.querySelector('[data-qty-value]').textContent = String(qty);
    });
  });
  root.querySelector('[data-add]').addEventListener('click', async (event) => {
    await withButton(event.currentTarget, async () => {
      await addToCart({ productId: product.id, variantId: variant.id, quantity: qty });
      toast('Added to bag');
    });
  });
  root.querySelector('[data-save]').addEventListener('click', async () => {
    const user = await currentUser();
    if (!user) { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
    await api.post('/api/wishlist', { productId: product.id });
    toast('Saved to wishlist');
  });
  root.querySelector('[data-alert]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api.post('/api/stock-alerts', {
        email: new FormData(form).get('email'),
        productId: product.id,
        variantId: variant.id,
      });
      toast(result.message);
      form.reset();
    } catch (error) {
      showErrors(form, error);
    }
  });
}

render();
const reviewRoot = document.querySelector('[data-reviews]');
const reviewPayload = await api.get(`/api/products/${slug}/reviews`);
reviewRoot.innerHTML = reviewPayload.data.map((review) => `
  <article class="panel"><p class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</p>
  <h3>${escapeHtml(review.title || 'Verified buyer')}</h3><p>${escapeHtml(review.comment)}</p><p class="muted">${escapeHtml(review.author)}</p></article>
`).join('') || '<p class="muted">No reviews yet.</p>';

document.querySelector('[data-review-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const user = await currentUser();
  if (!user) { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
  const data = new FormData(form);
  try {
    const result = await api.post(`/api/products/${slug}/reviews`, {
      rating: Number(data.get('rating')),
      title: data.get('title'),
      comment: data.get('comment'),
    });
    toast(result.message);
    form.reset();
  } catch (error) {
    showErrors(form, error);
  }
});

document.querySelector('[data-related]').innerHTML = related.map((item) => productCard(item, store.lowStockThreshold)).join('');
const viewed = JSON.parse(localStorage.getItem(recentKey) || '[]').filter((item) => item.slug !== product.slug).slice(0, 4);
document.querySelector('[data-recent]').innerHTML = viewed.map((item) => `
  <a class="card" href="/product/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy"><div class="card-body"><h3>${escapeHtml(item.name)}</h3><p>${ghs(item.price)}</p></div></a>
`).join('');
