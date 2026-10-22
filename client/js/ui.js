import { api } from './api.js';
import { currentUser, logout } from './auth.js';
import { cartCount } from './cart.js';

const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function dialogCloseButton(label = 'Close') {
  return `<button class="dialog-close" type="submit" value="cancel" aria-label="${escapeHtml(label)}">${CLOSE_SVG}</button>`;
}

export function showDialog(dialog) {
  if (!dialog.dataset.dismissBound) {
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
    dialog.dataset.dismissBound = '1';
  }
  if (!dialog.open) dialog.showModal();
}

let storePromise;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function ghs(amount) {
  const value = Number(amount || 0);
  return `₵${value.toFixed(2)}`;
}

export function loadStore() {
  if (!storePromise) {
    storePromise = api.get('/api/store').then((payload) => payload.data);
  }
  return storePromise;
}

export function toast(message, type = 'ok') {
  const region = document.querySelector('.toasts');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.innerHTML = CLOSE_SVG;
  close.addEventListener('click', () => item.remove());
  item.append(text, close);
  region.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

export function showErrors(form, error) {
  form.querySelectorAll('.field-error').forEach((node) => node.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
  const list = error.errors && error.errors.length ? error.errors : [{ field: '', message: error.message }];
  let placed = false;
  list.forEach((item) => {
    const input = item.field ? form.querySelector(`[name="${item.field}"]`) : null;
    const note = document.createElement('p');
    note.className = 'field-error';
    note.textContent = item.message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.insertAdjacentElement('afterend', note);
      placed = true;
    }
  });
  if (!placed && error.message) toast(error.message, 'err');
}

export async function withButton(button, work) {
  if (!button) return work();
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

export function stockBadge(available, threshold = 3) {
  if (available <= 0) return { text: 'Sold out', className: 'badge bad' };
  if (available <= threshold) return { text: `Only ${available} left`, className: 'badge warn' };
  return null;
}

export function productCard(product, threshold = 3) {
  const badge = !product.inStock
    ? { text: 'Sold out', className: 'badge bad' }
    : (product.minAvailable > 0 && product.minAvailable <= threshold
      ? { text: `Only ${product.minAvailable} left`, className: 'badge warn' }
      : null);
  const sale = product.discountPercent ? `<span class="badge sale">-${product.discountPercent}%</span>` : '';
  const price = product.compareAtPrice
    ? `<span class="price">${ghs(product.basePrice)}</span> <s>${ghs(product.compareAtPrice)}</s>`
    : `<span class="price">${ghs(product.basePrice)}</span>`;
  return `<article class="card">
    <a class="card-media" href="/product/${product.slug}">
      ${badge ? `<span class="${badge.className}">${badge.text}</span>` : ''}
      ${sale}
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.imageAlt || product.name)}" loading="lazy" width="640" height="640">
    </a>
    <div class="card-body">
      <p class="brand">${escapeHtml(product.brandName)}</p>
      <h3><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h3>
      <p class="price-row">${price}</p>
    </div>
  </article>`;
}

export function skeletonCards(count = 8) {
  return Array.from({ length: count }, () => '<article class="card skeleton-card" aria-hidden="true"><div class="skeleton media"></div><div class="skeleton line"></div><div class="skeleton line short"></div></article>').join('');
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('kickshub_theme', theme);
}

async function refreshChrome() {
  const count = document.querySelector('[data-cart-count]');
  if (count) {
    try {
      count.textContent = String(await cartCount());
    } catch (_err) {
      count.textContent = '0';
    }
  }
  const account = document.querySelector('[data-account-link]');
  const user = await currentUser();
  if (account) {
    account.textContent = user ? user.firstName : 'Account';
    account.href = user ? '/account' : '/login';
  }
}

function bindTheme() {
  const saved = localStorage.getItem('kickshub_theme');
  if (saved) applyTheme(saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function bindMenu() {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-nav');
  if (!button || !nav) return;
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    button.innerHTML = open ? CLOSE_SVG : 'Menu';
  };
  button.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  document.addEventListener('click', (event) => {
    if (!nav.classList.contains('open')) return;
    if (button.contains(event.target) || nav.contains(event.target)) return;
    setOpen(false);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
}

function bindSearch() {
  const dialog = document.querySelector('[data-search-dialog]');
  const input = document.querySelector('[data-search-input]');
  const results = document.querySelector('[data-search-results]');
  if (!dialog || !input || !results) return;
  const closeButton = dialog.querySelector('form[method="dialog"] button');
  if (closeButton) {
    closeButton.className = 'dialog-close';
    closeButton.type = 'submit';
    closeButton.setAttribute('aria-label', closeButton.getAttribute('aria-label') || 'Close');
    if (!closeButton.querySelector('svg')) closeButton.innerHTML = CLOSE_SVG;
  }
  document.querySelector('[data-open-search]')?.addEventListener('click', () => {
    showDialog(dialog);
    input.focus();
  });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.innerHTML = '';
        return;
      }
      const payload = await api.get(`/api/products/suggest?q=${encodeURIComponent(q)}`);
      results.innerHTML = payload.data.map((item) => `
        <li><a href="/product/${encodeURIComponent(item.slug)}">
          <img src="${escapeHtml(item.image)}" alt="" width="48" height="48">
          <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.brandName)} · ${ghs(item.price)}</small></span>
        </a></li>`).join('') || '<li class="muted">No matches</li>';
    }, 180);
  });
}

function bindNewsletter() {
  const form = document.querySelector('[data-newsletter]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = new FormData(form).get('email');
    try {
      const payload = await api.post('/api/newsletter', { email, source: 'footer' });
      toast(payload.message);
      form.reset();
    } catch (error) {
      showErrors(form, error);
    }
  });
}

export async function openSizeGuide() {
  const store = await loadStore();
  const dialog = document.querySelector('[data-size-dialog]') || document.createElement('dialog');
  dialog.className = 'size-dialog';
  dialog.setAttribute('data-size-dialog', '');
  const rows = store.sizeGuide.rows.map((row) => `<tr><td>${escapeHtml(row.eu)}</td><td>${escapeHtml(row.uk)}</td><td>${escapeHtml(row.usMen)}</td><td>${escapeHtml(row.usWomen)}</td></tr>`).join('');
  dialog.innerHTML = `<form method="dialog">${dialogCloseButton('Close size guide')}
    <h2>Size guide</h2>
    <p>${escapeHtml(store.sizeGuide.note)}</p>
    <div class="table-wrap"><table><thead><tr><th>EU</th><th>UK</th><th>US men</th><th>US women</th></tr></thead><tbody>${rows}</tbody></table></div></form>`;
  if (!dialog.isConnected) document.body.appendChild(dialog);
  showDialog(dialog);
}

document.addEventListener('cart:change', () => { refreshChrome(); });

document.addEventListener('DOMContentLoaded', () => {
  bindTheme();
  bindMenu();
  bindSearch();
  bindNewsletter();
  refreshChrome();
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await logout();
    window.location.href = '/';
  });
});
