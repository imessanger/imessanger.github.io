import { getServerUrl, setServerUrl } from './config.js';
import { logout } from './auth.js';
import { requestPushPermissionAndSubscribe } from './push.js';
import { api } from './api.js';
import { state } from './state.js';

export function initSettingsUI() {
  const modal = document.getElementById('settings-modal');
  const input = document.getElementById('server-url-input');
  const errorEl = document.getElementById('settings-error');

  function open() {
    input.value = getServerUrl();
    errorEl.textContent = '';
    modal.classList.remove('hidden');
    if (state.me) renderBlockedList();
  }

  document.getElementById('settings-btn')?.addEventListener('click', open);
  document.getElementById('open-settings-from-auth')?.addEventListener('click', open);

  document.getElementById('save-server-url-btn').addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) {
      errorEl.textContent = 'Enter a server URL.';
      return;
    }
    if (!/^https?:\/\//.test(val)) {
      errorEl.textContent = 'URL must start with http:// or https://';
      return;
    }
    setServerUrl(val);
    location.reload();
  });

  document.getElementById('enable-push-btn').addEventListener('click', async () => {
    errorEl.textContent = '';
    try {
      await requestPushPermissionAndSubscribe();
      errorEl.style.color = 'var(--muted)';
      errorEl.textContent = 'Notifications enabled.';
    } catch (err) {
      errorEl.style.color = 'var(--danger)';
      errorEl.textContent = err.message || 'Could not enable notifications.';
    }
  });

  const passwordErrorEl = document.getElementById('password-change-error');
  document.getElementById('change-password-btn').addEventListener('click', async () => {
    passwordErrorEl.style.color = 'var(--danger)';
    passwordErrorEl.textContent = '';
    const currentPassword = document.getElementById('current-password-input').value;
    const newPassword = document.getElementById('new-password-input').value;
    if (!currentPassword || !newPassword) {
      passwordErrorEl.textContent = 'Fill in both fields.';
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      document.getElementById('current-password-input').value = '';
      document.getElementById('new-password-input').value = '';
      passwordErrorEl.style.color = 'var(--muted)';
      passwordErrorEl.textContent = 'Password updated.';
    } catch (err) {
      passwordErrorEl.textContent = err.message || 'Could not update password.';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Log out?')) logout();
  });
}

async function renderBlockedList() {
  const container = document.getElementById('blocked-users-list');
  container.innerHTML = 'Loading…';
  try {
    const blocked = await api.listBlocked();
    state.blockedUserIds = new Set(blocked.map((u) => u.id));
    container.innerHTML = '';
    if (blocked.length === 0) {
      container.innerHTML = '<p class="hint">You haven\u2019t blocked anyone.</p>';
      return;
    }
    for (const user of blocked) {
      const row = document.createElement('div');
      row.className = 'blocked-user-row';
      const label = document.createElement('span');
      label.textContent = user.displayName || user.username;
      row.appendChild(label);
      const unblockBtn = document.createElement('button');
      unblockBtn.textContent = 'Unblock';
      unblockBtn.addEventListener('click', async () => {
        try {
          await api.unblockUser(user.id);
          state.blockedUserIds.delete(user.id);
          renderBlockedList();
        } catch (err) {
          alert(err.message || 'Could not unblock user.');
        }
      });
      row.appendChild(unblockBtn);
      container.appendChild(row);
    }
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message || 'Could not load blocked users.'}</p>`;
  }
}