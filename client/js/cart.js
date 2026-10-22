import { api } from './api.js';
import { currentUser } from './auth.js';

const KEY = 'kickshub_cart';

export function readLocalCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

export function writeLocalCart(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  document.dispatchEvent(new CustomEvent('cart:change'));
}

export async function cartCount() {
  const user = await currentUser();
  if (!user) return readLocalCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const payload = await api.get('/api/cart');
  return payload.data.count || 0;
}

export async function fetchCart() {
  const user = await currentUser();
  if (!user) {
    const payload = await api.post('/api/cart/price', { items: readLocalCart() });
    return payload.data;
  }
  const payload = await api.get('/api/cart');
  return payload.data;
}

export async function addToCart({ productId, variantId, quantity = 1 }) {
  const user = await currentUser();
  if (user) {
    const payload = await api.post('/api/cart/items', { productId, variantId, quantity });
    document.dispatchEvent(new CustomEvent('cart:change'));
    return payload.data;
  }
  const items = readLocalCart();
  const existing = items.find((item) => item.variantId === variantId);
  if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
  else items.push({ productId, variantId, quantity });
  writeLocalCart(items);
  return fetchCart();
}

export async function updateQuantity(variantId, quantity) {
  const user = await currentUser();
  if (user) {
    const payload = await api.patch(`/api/cart/items/${variantId}`, { quantity });
    document.dispatchEvent(new CustomEvent('cart:change'));
    return payload.data;
  }
  const items = readLocalCart().map((item) => (
    item.variantId === variantId ? { ...item, quantity } : item
  ));
  writeLocalCart(items.filter((item) => item.quantity > 0));
  return fetchCart();
}

export async function removeFromCart(variantId) {
  const user = await currentUser();
  if (user) {
    const payload = await api.delete(`/api/cart/items/${variantId}`);
    document.dispatchEvent(new CustomEvent('cart:change'));
    return payload.data;
  }
  writeLocalCart(readLocalCart().filter((item) => item.variantId !== variantId));
  return fetchCart();
}

export async function mergeLocalCart() {
  const items = readLocalCart();
  if (!items.length) return;
  await api.post('/api/cart/merge', { items });
  writeLocalCart([]);
}

export function clearLocalCart() {
  writeLocalCart([]);
}
