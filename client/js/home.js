import { api } from './api.js';
import { escapeHtml, loadStore, productCard, skeletonCards } from './ui.js';

const featured = document.querySelector('[data-featured]');
const arrivals = document.querySelector('[data-arrivals]');
const brands = document.querySelector('[data-brands]');
const collections = document.querySelector('[data-collections]');
const heroImg = document.querySelector('[data-hero-image]');
const heroLink = document.querySelector('[data-hero-link]');

featured.innerHTML = skeletonCards(4);
arrivals.innerHTML = skeletonCards(4);

const store = await loadStore();
const [featuredRes, arrivalRes, brandRes, collectionRes] = await Promise.all([
  api.get('/api/products?featured=true&limit=8'),
  api.get('/api/products?new=true&limit=8&sort=newest'),
  api.get('/api/brands'),
  api.get('/api/collections'),
]);

const first = featuredRes.data[0];
if (first && heroImg) {
  heroImg.src = first.image;
  heroImg.alt = first.name;
  heroLink.href = `/product/${first.slug}`;
}

featured.innerHTML = featuredRes.data.map((product) => productCard(product, store.lowStockThreshold)).join('')
  || '<p class="empty">No featured pairs yet.</p>';
arrivals.innerHTML = arrivalRes.data.map((product) => productCard(product, store.lowStockThreshold)).join('')
  || '<p class="empty">New arrivals will show up here.</p>';
brands.innerHTML = brandRes.data.map((brand) => {
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(brand.accentColor) ? brand.accentColor : 'transparent';
  return `<a class="brand-chip" href="/shop?brand=${encodeURIComponent(brand.slug)}" style="border-color:${accent}">${escapeHtml(brand.name)}</a>`;
}).join('');
collections.innerHTML = collectionRes.data.map((collection) => (
  `<a class="collection-card" href="/shop?collection=${encodeURIComponent(collection.slug)}" style="background-image:linear-gradient(transparent,rgba(0,0,0,.45)),url('${escapeHtml(collection.image)}')"><span>${escapeHtml(collection.name)}</span></a>`
)).join('');
