import { login, register } from './auth.js';
import { mergeLocalCart } from './cart.js';
import { api } from './api.js';
import { showErrors, toast, withButton } from './ui.js';

const form = document.querySelector('[data-auth]');
const page = document.body.dataset.page;
const requestedNext = new URLSearchParams(location.search).get('next') || '/account';
const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/account';

function clearFieldErrors() {
  form.querySelectorAll('.field-error').forEach((node) => node.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
}

function showResetLink(result) {
  const status = form.querySelector('[data-auth-status]');
  if (!status) {
    toast(result.message);
    return;
  }
  status.hidden = false;
  status.replaceChildren(document.createTextNode(result.message));
  const resetUrl = result.data && result.data.resetUrl;
  if (!resetUrl) return;
  const note = document.createElement('span');
  note.textContent = ' Mail is not configured on this server. ';
  const link = document.createElement('a');
  link.href = resetUrl;
  link.textContent = 'Open the reset link';
  status.append(document.createElement('br'), note, link);
}

if (page === 'reset' && !new URLSearchParams(location.search).get('token')) {
  form.innerHTML = `<h1>This reset link is incomplete</h1>
    <p>Request a new link and open it from your email.</p>
    <p><a class="btn" href="/forgot-password">Request a reset link</a></p>`;
} else {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('[type="submit"]');
    await withButton(button, async () => {
      try {
        clearFieldErrors();
        const status = form.querySelector('[data-auth-status]');
        if (status) {
          status.hidden = true;
          status.replaceChildren();
        }
        if (page === 'login') {
          await login(data);
          await mergeLocalCart();
          window.location.href = next;
        } else if (page === 'register') {
          await register(data);
          await mergeLocalCart();
          window.location.href = '/account';
        } else if (page === 'forgot') {
          const result = await api.post('/api/auth/forgot', { email: data.email });
          showResetLink(result);
        } else if (page === 'reset') {
          if (data.password !== data.passwordConfirm) {
            showErrors(form, { message: 'Check the form', errors: [{ field: 'passwordConfirm', message: 'Passwords do not match' }] });
            return;
          }
          data.token = new URLSearchParams(location.search).get('token');
          await api.post('/api/auth/reset', data);
          toast('Password updated');
          window.location.href = '/account';
        }
      } catch (error) {
        showErrors(form, error);
      }
    });
  });
}
