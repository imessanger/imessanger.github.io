const DEFAULT_SERVER_URL = ''; // e.g. 'https://imessenger-backend.up.railway.app'

export function getServerUrl() {
  return (localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL).replace(/\/+$/, '');
}
export function setServerUrl(url) {
  localStorage.setItem('serverUrl', url.replace(/\/+$/, ''));
}

export function getToken() {
  return localStorage.getItem('authToken');
}
export function setToken(token) {
  if (token) localStorage.setItem('authToken', token);
  else localStorage.removeItem('authToken');
}

export function getMe() {
  const raw = localStorage.getItem('me');
  return raw ? JSON.parse(raw) : null;
}
export function setMe(user) {
  if (user) localStorage.setItem('me', JSON.stringify(user));
  else localStorage.removeItem('me');
}

export function wsUrl() {
  const base = getServerUrl();
  if (!base) return null;
  return base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(getToken() || '');
}
