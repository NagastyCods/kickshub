import { api } from './api.js';
import { showErrors, toast } from './ui.js';

document.querySelector('[data-contact]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api.post('/api/contact', Object.fromEntries(new FormData(form).entries()));
    toast(result.message);
    form.reset();
  } catch (error) {
    showErrors(form, error);
  }
});
