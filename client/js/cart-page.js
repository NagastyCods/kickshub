import { fetchCart, removeFromCart, updateQuantity } from './cart.js';
import { ghs, toast } from './ui.js';

const root = document.querySelector('[data-cart]');

async function render() {
  const cart = await fetchCart();
  if (!cart.items.length) {
    root.innerHTML = '<p class="empty">Your bag is empty. <a href="/shop">Shop sneakers</a>.</p>';
    return;
  }
  root.innerHTML = `${cart.items.map((item) => `
    <article class="cart-line">
      <a href="/product/${item.slug}"><img src="${item.image}" alt="${item.name}" width="88" height="88"></a>
      <div>
        <h2>${item.name}</h2>
        <p class="muted">EU ${item.size} · ${item.color}</p>
        <p class="price">${ghs(item.lineTotal)}</p>
        ${item.warning ? `<p class="field-error">${item.warning}</p>` : ''}
        <div class="line-actions">
          <div class="qty">
            <button type="button" data-dec="${item.variantId}" aria-label="Decrease quantity"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            <span>${item.quantity}</span>
            <button type="button" data-inc="${item.variantId}" aria-label="Increase quantity"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
          <button type="button" class="btn-ghost" data-remove="${item.variantId}">Remove</button>
        </div>
      </div>
    </article>`).join('')}
    <div class="summary"><p>Subtotal <strong>${ghs(cart.subtotal)}</strong></p><p class="muted">Delivery is calculated at checkout.</p>
    <a class="btn accent" href="/checkout">Checkout</a></div>`;
  root.querySelectorAll('[data-inc], [data-dec]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.inc || button.dataset.dec;
      const item = cart.items.find((entry) => entry.variantId === id);
      const next = item.quantity + (button.dataset.inc ? 1 : -1);
      if (next < 1) await removeFromCart(id);
      else await updateQuantity(id, next);
      render();
    });
  });
  root.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      await removeFromCart(button.dataset.remove);
      toast('Removed');
      render();
    });
  });
}

render().catch((error) => { root.innerHTML = `<p class="field-error">${error.message}</p>`; });
