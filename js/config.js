const DEFAULT_SERVER_URL = 'https://imessanger-backend-production.up.railway.app'; // e.g. 'https://imessenger-backend.up.railway.app'

// --- Maintenance mode (frontend-only soft gate) ---
// Toggle to true before deploying to show a "Server under construction"
// screen to everyone. This is NOT real security - the password lives in
// this file, shipped to every visitor's browser. It's just a polite wall to
// keep casual visitors out while testers/you can tap through.
const MAINTENANCE_MODE = false;
const MAINTENANCE_PASSWORD = 'instantunlock';

export function isMaintenanceMode() {
  return MAINTENANCE_MODE;
}
export function checkMaintenancePassword(pw) {
  return pw === MAINTENANCE_PASSWORD;
}
export function hasMaintenanceBypass() {
  return localStorage.getItem('maintenanceBypass') === 'true';
}
export function setMaintenanceBypass() {
  localStorage.setItem('maintenanceBypass', 'true');
}

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
