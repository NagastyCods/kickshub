import { api } from './api.js';
import { currentUser } from './auth.js';
import { escapeHtml, ghs, showErrors, toast, withButton } from './ui.js';

const user = await currentUser(true);
if (!user) {
  window.location.href = '/login?next=/account';
  throw new Error('Login required');
}

const profile = document.querySelector('[data-profile]');
const addresses = document.querySelector('[data-addresses]');
const orders = document.querySelector('[data-orders]');

profile.innerHTML = `
  <form data-profile-form class="panel"><h2>Profile</h2>
    <label>First name<input name="firstName" value="${escapeHtml(user.firstName)}" required></label>
    <label>Last name<input name="lastName" value="${escapeHtml(user.lastName)}" required></label>
    <label>Phone<input name="phone" value="${escapeHtml(user.phone || '')}"></label>
    <p class="muted">${escapeHtml(user.email)}</p>
    <button class="btn" type="submit">Save</button>
  </form>`;
profile.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api.patch('/api/auth/me', Object.fromEntries(new FormData(form).entries()));
    toast(result.message);
  } catch (error) {
    showErrors(form, error);
  }
});

const passwordForm = document.createElement('form');
passwordForm.className = 'panel';
passwordForm.innerHTML = `<h2>Password</h2>
  <label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label>
  <label>New password<input name="password" type="password" required autocomplete="new-password" minlength="8"></label>
  <label>Confirm password<input name="passwordConfirm" type="password" required autocomplete="new-password" minlength="8"></label>
  <p class="muted">Use at least 8 characters, with a letter and a number.</p>
  <button class="btn" type="submit">Update password</button>`;
profile.append(passwordForm);
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(passwordForm).entries());
  if (data.password !== data.passwordConfirm) {
    showErrors(passwordForm, { message: 'Check the form', errors: [{ field: 'passwordConfirm', message: 'Passwords do not match' }] });
    return;
  }
  const button = passwordForm.querySelector('[type="submit"]');
  await withButton(button, async () => {
    try {
      const result = await api.post('/api/auth/password', data);
      toast(result.message);
      passwordForm.reset();
    } catch (error) {
      showErrors(passwordForm, error);
    }
  });
});

function addressForm(address = {}) {
  return `<form data-address="${address.id || ''}" class="panel">
    <label>Label<input name="label" value="${escapeHtml(address.label || 'Home')}"></label>
    <label>Full name<input name="fullName" required value="${escapeHtml(address.fullName || '')}"></label>
    <label>Phone<input name="phone" required value="${escapeHtml(address.phone || '')}"></label>
    <label>Region<input name="region" required value="${escapeHtml(address.region || '')}"></label>
    <label>City<input name="city" required value="${escapeHtml(address.city || '')}"></label>
    <label>Digital address<input name="digitalAddress" value="${escapeHtml(address.digitalAddress || '')}" placeholder="GA-184-1234"></label>
    <label>Street<input name="street" required value="${escapeHtml(address.street || '')}"></label>
    <label>Landmark<input name="landmark" value="${escapeHtml(address.landmark || '')}"></label>
    <label><input type="checkbox" name="isDefault" ${address.isDefault ? 'checked' : ''}> Default</label>
    <button class="btn" type="submit">${address.id ? 'Update' : 'Add address'}</button>
    ${address.id ? '<button class="btn-ghost" type="button" data-delete>Delete</button>' : ''}
  </form>`;
}

function bindAddress(form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.isDefault = form.querySelector('[name="isDefault"]').checked;
    const id = form.dataset.address;
    try {
      const result = id
        ? await api.patch(`/api/auth/addresses/${id}`, data)
        : await api.post('/api/auth/addresses', data);
      toast(result.message);
      window.location.reload();
    } catch (error) {
      showErrors(form, error);
    }
  });
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    await api.delete(`/api/auth/addresses/${form.dataset.address}`);
    window.location.reload();
  });
}

addresses.innerHTML = user.addresses.map(addressForm).join('') + addressForm();
addresses.querySelectorAll('form').forEach(bindAddress);

const orderPayload = await api.get('/api/orders');
orders.innerHTML = orderPayload.data.map((order) => `
  <a class="panel" href="/order/${order.orderNumber}">
    <strong>${order.orderNumber}</strong>
    <span>${order.orderStatus} · ${ghs(order.total)}</span>
  </a>`).join('') || '<p class="muted">No orders yet.</p>';
