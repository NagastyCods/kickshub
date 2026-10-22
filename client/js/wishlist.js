import { api } from './api.js';
import { currentUser } from './auth.js';
import { loadStore, productCard } from './ui.js';

const user = await currentUser();
const root = document.querySelector('[data-wishlist]');
if (!user) {
  root.innerHTML = '<p class="empty"><a href="/login?next=/wishlist">Log in</a> to see saved shoes.</p>';
} else {
  const store = await loadStore();
  const payload = await api.get('/api/wishlist');
  root.innerHTML = payload.data.map((product) => productCard(product, store.lowStockThreshold)).join('')
    || '<p class="empty">Nothing saved yet.</p>';
}
