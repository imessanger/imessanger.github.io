import { api } from './api.js';
import { state } from './state.js';

export function initAdminUI() {
  const btn = document.getElementById('admin-btn');
  const modal = document.getElementById('admin-modal');
  const searchInput = document.getElementById('admin-search-input');

  // Only moderators/admins ever see this button
  const canSeeAdmin = state.me?.role === 'moderator' || state.me?.role === 'admin';
  btn.classList.toggle('hidden', !canSeeAdmin);
  if (!canSeeAdmin) return;

  btn.addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('admin-error').textContent = '';
    modal.classList.remove('hidden');
    renderAdminUserList('');
  });

  searchInput.addEventListener('input', debounce(() => renderAdminUserList(searchInput.value), 250));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function renderAdminUserList(query) {
  const container = document.getElementById('admin-user-list');
  const errorEl = document.getElementById('admin-error');
  errorEl.textContent = '';
  container.innerHTML = 'Loading…';
  let users;
  try {
    users = await api.adminListUsers(query);
  } catch (err) {
    container.innerHTML = '';
    errorEl.textContent = err.message || 'Could not load users.';
    return;
  }

  container.innerHTML = '';
  const iAmAdmin = state.me?.role === 'admin';

  for (const user of users) {
    if (user.id === state.me.id) continue; // can't moderate yourself

    const row = document.createElement('div');
    row.className = 'admin-user-row';

    const top = document.createElement('div');
    top.className = 'admin-user-top';
    const label = document.createElement('span');
    label.textContent = `${user.displayName || user.username} (@${user.username}) \u2014 ${user.role}`;
    top.appendChild(label);
    if (user.banned) {
      const tag = document.createElement('span');
      tag.className = 'banned-tag';
      tag.textContent = `Banned${user.bannedReason ? ': ' + user.bannedReason : ''}`;
      top.appendChild(tag);
    }
    row.appendChild(top);

    const actions = document.createElement('div');
    actions.className = 'admin-user-actions';

    // Banning rules mirror the backend: no one can ban an admin, only an
    // admin can ban a moderator.
    const canBanThisUser = user.role !== 'admin' && (user.role !== 'moderator' || iAmAdmin);

    if (canBanThisUser) {
      if (user.banned) {
        const unbanBtn = document.createElement('button');
        unbanBtn.textContent = 'Unban';
        unbanBtn.addEventListener('click', async () => {
          try {
            await api.adminUnbanUser(user.id);
            renderAdminUserList(query);
          } catch (err) {
            errorEl.textContent = err.message || 'Could not unban user.';
          }
        });
        actions.appendChild(unbanBtn);
      } else {
        const banBtn = document.createElement('button');
        banBtn.className = 'danger';
        banBtn.textContent = 'Ban';
        banBtn.addEventListener('click', async () => {
          const reason = prompt('Ban reason (optional):') || '';
          const banIp = confirm('Also ban their last known IP address?\n(Prevents signing up again from that network.)');
          try {
            await api.adminBanUser(user.id, reason, banIp);
            renderAdminUserList(query);
          } catch (err) {
            errorEl.textContent = err.message || 'Could not ban user.';
          }
        });
        actions.appendChild(banBtn);
      }
    }

    // Only admins can promote/demote moderators (never other admins - that's
    // deliberately not exposed via the API at all)
    if (iAmAdmin && user.role !== 'admin') {
      const roleBtn = document.createElement('button');
      roleBtn.textContent = user.role === 'moderator' ? 'Demote to user' : 'Promote to moderator';
      roleBtn.addEventListener('click', async () => {
        try {
          await api.adminSetRole(user.id, user.role === 'moderator' ? 'user' : 'moderator');
          renderAdminUserList(query);
        } catch (err) {
          errorEl.textContent = err.message || 'Could not change role.';
        }
      });
      actions.appendChild(roleBtn);
    }

    row.appendChild(actions);
    container.appendChild(row);
  }

  if (container.children.length === 0) {
    container.innerHTML = '<p class="hint">No users found.</p>';
  }
}