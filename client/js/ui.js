import { api } from './api.js';
import { currentUser, logout } from './auth.js';
import { cartCount } from './cart.js';

function icon(paths, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;
}

const CLOSE_SVG = icon('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 18);
const MENU_SVG = icon('<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const SEARCH_SVG = icon('<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16.5L20 20.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const MOON_SVG = icon('<path d="M15 3.5a7.5 7.5 0 1 0 5.5 12.6A8.5 8.5 0 0 1 15 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
const SUN_SVG = icon('<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M19.2 4.8l-1.8 1.8M6.6 17.4l-1.8 1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const HEART_SVG = icon('<path d="M12 19.5s-6.5-4.1-6.5-8.4a3.7 3.7 0 0 1 6.5-2.4 3.7 3.7 0 0 1 6.5 2.4c0 4.3-6.5 8.4-6.5 8.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
const BAG_SVG = icon('<path d="M6.5 8h11l-.8 11H7.3L6.5 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V7a3 3 0 0 1 6 0v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const USER_SVG = icon('<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19.2c1.4-3 3.6-4.5 7-4.5s5.6 1.5 7 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');

function paintHeader() {
  const menu = document.querySelector('.menu-toggle');
  if (menu && !menu.querySelector('svg')) {
    menu.setAttribute('aria-label', 'Open menu');
    menu.innerHTML = MENU_SVG;
  }
  const search = document.querySelector('[data-open-search]');
  if (search && !search.querySelector('svg')) {
    search.setAttribute('aria-label', 'Search');
    search.innerHTML = SEARCH_SVG;
  }
  const saved = document.querySelector('.header-tools a[href="/wishlist"]');
  if (saved && !saved.querySelector('svg')) {
    saved.setAttribute('aria-label', 'Saved');
    saved.innerHTML = HEART_SVG;
  }
  const bag = document.querySelector('.cart-link');
  if (bag && !bag.querySelector('svg')) {
    const count = bag.querySelector('[data-cart-count]');
    const countHtml = count ? count.outerHTML : '<span data-cart-count>0</span>';
    bag.setAttribute('aria-label', 'Bag');
    bag.innerHTML = `${BAG_SVG}${countHtml}`;
  }
  const account = document.querySelector('[data-account-link]');
  if (account && !account.querySelector('[data-account-name]')) {
    const label = account.textContent.trim() || 'Account';
    account.setAttribute('aria-label', label);
    account.innerHTML = `${USER_SVG}<span class="tool-label" data-account-name>${escapeHtml(label)}</span>`;
  }
  const theme = document.querySelector('[data-theme-toggle]');
  if (theme) {
    theme.setAttribute('aria-label', 'Switch color theme');
    theme.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? SUN_SVG : MOON_SVG;
  }
}

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
  const themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) themeButton.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;
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
    const label = user ? user.firstName : 'Account';
    account.href = user ? '/account' : '/login';
    account.setAttribute('aria-label', label);
    const name = account.querySelector('[data-account-name]');
    if (name) name.textContent = label;
  }
  if (count) {
    const bag = document.querySelector('.cart-link');
    if (bag) bag.setAttribute('aria-label', `Bag, ${count.textContent} items`);
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
    button.innerHTML = open ? CLOSE_SVG : MENU_SVG;
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
  paintHeader();
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
