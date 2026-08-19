import { getServerUrl, getToken } from './config.js';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const base = getServerUrl();
  if (!base) throw new ApiError('No server URL configured. Open Settings to set one.', 0);

  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError('Could not reach server. Check the server URL in Settings.', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  register: (username, password, displayName) =>
    request('/api/auth/register', { method: 'POST', body: { username, password, displayName }, auth: false }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => request('/api/users/me'),
  updateMe: (patch) => request('/api/users/me', { method: 'PATCH', body: patch }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/users/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
  searchUsers: (q) => request('/api/users/search?q=' + encodeURIComponent(q)),
  getOnlineUsers: () => request('/api/users/online'),
  listBlocked: () => request('/api/users/blocked'),
  blockUser: (userId) => request(`/api/users/${userId}/block`, { method: 'POST' }),
  unblockUser: (userId) => request(`/api/users/${userId}/unblock`, { method: 'POST' }),

  listConversations: () => request('/api/conversations'),
  createDm: (userId) => request('/api/conversations', { method: 'POST', body: { type: 'dm', memberIds: [userId] } }),
  createGroup: (name, memberIds) =>
    request('/api/conversations', { method: 'POST', body: { type: 'group', name, memberIds } }),
  addMembers: (conversationId, memberIds) =>
    request(`/api/conversations/${conversationId}/members`, { method: 'POST', body: { memberIds } }),
  renameGroup: (conversationId, name) =>
    request(`/api/conversations/${conversationId}`, { method: 'PATCH', body: { name } }),
  kickMember: (conversationId, userId) =>
    request(`/api/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' }),
  leaveGroup: (conversationId) => request(`/api/conversations/${conversationId}/leave`, { method: 'POST' }),

  getMessages: (conversationId, before) =>
    request(`/api/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  sendMessage: (conversationId, content, imageData, replyToMessageId) =>
    request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content, imageData, replyToMessageId },
    }),

  vapidPublicKey: () => request('/api/push/vapid-public-key', { auth: false }),
  subscribePush: (subscription) => request('/api/push/subscribe', { method: 'POST', body: { subscription } }),
  unsubscribePush: (endpoint) => request('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }),

  adminListUsers: (q) => request('/api/admin/users' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  adminBanUser: (userId, reason, banIp) =>
    request(`/api/admin/users/${userId}/ban`, { method: 'POST', body: { reason, banIp } }),
  adminUnbanUser: (userId) => request(`/api/admin/users/${userId}/unban`, { method: 'POST' }),
  adminSetRole: (userId, role) => request(`/api/admin/users/${userId}/role`, { method: 'POST', body: { role } }),
};

export { ApiError };