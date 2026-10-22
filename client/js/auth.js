import { api } from './api.js';

let current = undefined;

export function clearCachedUser() {
  current = undefined;
}

export async function currentUser(force = false) {
  if (current !== undefined && !force) return current;
  try {
    const payload = await api.get('/api/auth/me');
    current = payload.data.user;
  } catch (_err) {
    current = null;
  }
  return current;
}

export async function login(body) {
  const payload = await api.post('/api/auth/login', body);
  current = payload.data.user;
  return current;
}

export async function register(body) {
  const payload = await api.post('/api/auth/register', body);
  current = payload.data.user;
  return current;
}

export async function logout() {
  await api.post('/api/auth/logout', {});
  current = null;
}
