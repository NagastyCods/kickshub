import { api } from './api.js';
import { escapeHtml, loadStore, productCard, skeletonCards } from './ui.js';

const grid = document.querySelector('[data-grid]');
const pager = document.querySelector('[data-pager]');
const form = document.querySelector('[data-filters]');
const title = document.querySelector('[data-shop-title]');
const store = await loadStore();

function paramsFromForm() {
  const data = new FormData(form);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  const existing = new URLSearchParams(location.search);
  if (existing.get('new') === 'true') params.set('new', 'true');
  if (existing.get('featured') === 'true') params.set('featured', 'true');
  return params;
}

function fillForm() {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements.namedItem(key);
    if (field && 'value' in field) field.value = value;
  }
  const labelFor = (name) => {
    const field = form.elements.namedItem(name);
    if (!field || !field.value || !field.selectedOptions) return params.get(name);
    return field.selectedOptions[0]?.textContent || params.get(name);
  };
  const bits = [];
  if (params.get('q')) bits.push(params.get('q'));
  if (params.get('brand')) bits.push(labelFor('brand'));
  if (params.get('collection')) bits.push(labelFor('collection'));
  if (params.get('gender')) bits.push(labelFor('gender'));
  title.textContent = bits.length ? bits.join(' · ') : 'Shop';
}

async function load() {
  fillForm();
  grid.innerHTML = skeletonCards(8);
  grid.setAttribute('aria-busy', 'true');
  const params = new URLSearchParams(location.search);
  const payload = await api.get(`/api/products?${params.toString()}`);
  grid.innerHTML = payload.data.map((product) => productCard(product, store.lowStockThreshold)).join('')
    || '<p class="empty">No shoes match those filters.</p>';
  grid.setAttribute('aria-busy', 'false');
  const meta = payload.meta;
  pager.innerHTML = '';
  if (meta.pages > 1) {
    for (let page = 1; page <= meta.pages; page += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn';
      button.textContent = String(page);
      if (page === meta.page) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => {
        const next = new URLSearchParams(location.search);
        next.set('page', String(page));
        history.pushState({}, '', `/shop?${next.toString()}`);
        load();
      });
      pager.appendChild(button);
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const params = paramsFromForm();
  params.delete('page');
  history.pushState({}, '', `/shop?${params.toString()}`);
  load();
});
form.addEventListener('reset', () => {
  setTimeout(() => {
    history.pushState({}, '', '/shop');
    load();
  }, 0);
});
window.addEventListener('popstate', load);

const [brands, collections] = await Promise.all([api.get('/api/brands'), api.get('/api/collections')]);
form.querySelector('[name="brand"]').innerHTML = `<option value="">All brands</option>${brands.data.map((brand) => `<option value="${escapeHtml(brand.slug)}">${escapeHtml(brand.name)}</option>`).join('')}`;
form.querySelector('[name="collection"]').innerHTML = `<option value="">All collections</option>${collections.data.map((collection) => `<option value="${escapeHtml(collection.slug)}">${escapeHtml(collection.name)}</option>`).join('')}`;
const colors = ['Black', 'White', 'Grey', 'Navy', 'Red', 'Blue', 'Green', 'Pink', 'Orange', 'Cream'];
form.querySelector('[name="color"]').innerHTML = `<option value="">Any color</option>${colors.map((color) => `<option>${color}</option>`).join('')}`;
load();
