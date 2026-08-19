import { api } from './api.js';
import { state, upsertConversation, getConversation } from './state.js';

let onSelectConversation = () => {};

export function isUserOnline(userId) {
  return state.onlineUserIds.has(userId);
}

export function getOtherDmUser(conv) {
  if (!conv || conv.type !== 'dm') return null;
  return conv.members.find((m) => m.id !== state.me.id) || null;
}

export function initConversationsUI({ onSelect }) {
  onSelectConversation = onSelect;

  document.getElementById('new-dm-btn').addEventListener('click', () => openDmModal());
  document.getElementById('new-group-btn').addEventListener('click', () => openGroupModal());
  document.querySelectorAll('.close-modal').forEach((btn) =>
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.add('hidden'))
  );

  const dmSearchInput = document.getElementById('dm-search-input');
  dmSearchInput.addEventListener('input', debounce(async () => {
    const results = await safeSearch(dmSearchInput.value);
    renderUserResults('dm-search-results', results, async (user) => {
      try {
        const { id } = await api.createDm(user.id);
        document.getElementById('new-dm-modal').classList.add('hidden');
        await refreshConversations();
        onSelectConversation(id);
      } catch (err) {
        alert(err.message || 'Could not start conversation.');
      }
    });
  }, 250));

  const groupSearchInput = document.getElementById('group-search-input');
  const selectedMembers = new Map();
  groupSearchInput.addEventListener('input', debounce(async () => {
    const results = await safeSearch(groupSearchInput.value);
    renderUserResults('group-search-results', results.filter((u) => !selectedMembers.has(u.id)), (user) => {
      selectedMembers.set(user.id, user);
      renderPills('group-selected-members', selectedMembers, renderGroupSelected);
      groupSearchInput.value = '';
      document.getElementById('group-search-results').innerHTML = '';
    });
  }, 250));
  function renderGroupSelected() {
    renderPills('group-selected-members', selectedMembers, renderGroupSelected);
  }

  document.getElementById('create-group-btn').addEventListener('click', async () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name || selectedMembers.size === 0) return;
    const { id } = await api.createGroup(name, Array.from(selectedMembers.keys()));
    selectedMembers.clear();
    renderGroupSelected();
    document.getElementById('group-name-input').value = '';
    document.getElementById('new-group-modal').classList.add('hidden');
    await refreshConversations();
    onSelectConversation(id);
  });

  initManageGroupModal();
}

// --- Group info / management modal (rename, add, kick = owner only; leave = everyone) ---
let manageGroupConversationId = null;

function initManageGroupModal() {
  const searchInput = document.getElementById('manage-group-search-input');
  const addSelected = new Map();

  searchInput.addEventListener('input', debounce(async () => {
    const results = await safeSearch(searchInput.value);
    const conv = getConversation(manageGroupConversationId);
    const existingIds = new Set((conv?.members || []).map((m) => m.id));
    renderUserResults(
      'manage-group-search-results',
      results.filter((u) => !addSelected.has(u.id) && !existingIds.has(u.id)),
      (user) => {
        addSelected.set(user.id, user);
        renderAddSelected();
        searchInput.value = '';
        document.getElementById('manage-group-search-results').innerHTML = '';
      }
    );
  }, 250));
  function renderAddSelected() {
    renderPills('manage-group-selected', addSelected, renderAddSelected);
  }

  document.getElementById('manage-group-add-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('manage-group-error');
    errorEl.textContent = '';
    if (!manageGroupConversationId || addSelected.size === 0) return;
    try {
      await api.addMembers(manageGroupConversationId, Array.from(addSelected.keys()));
      addSelected.clear();
      renderAddSelected();
      await refreshConversations();
      renderManageGroupModal();
    } catch (err) {
      errorEl.textContent = err.message || 'Could not add members.';
    }
  });

  document.getElementById('group-rename-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('manage-group-error');
    errorEl.textContent = '';
    const name = document.getElementById('group-rename-input').value.trim();
    if (!manageGroupConversationId || !name) return;
    try {
      await api.renameGroup(manageGroupConversationId, name);
      await refreshConversations();
      renderManageGroupModal();
      const chatTitle = document.getElementById('chat-title');
      if (state.activeConversationId === manageGroupConversationId && chatTitle) chatTitle.textContent = name;
    } catch (err) {
      errorEl.textContent = err.message || 'Could not rename group.';
    }
  });

  document.getElementById('leave-group-btn').addEventListener('click', async () => {
    if (!manageGroupConversationId) return;
    if (!confirm('Leave this group?')) return;
    try {
      await api.leaveGroup(manageGroupConversationId);
      document.getElementById('manage-group-modal').classList.add('hidden');
      const wasActive = state.activeConversationId === manageGroupConversationId;
      state.conversations = state.conversations.filter((c) => c.id !== manageGroupConversationId);
      if (wasActive) {
        state.activeConversationId = null;
        document.getElementById('chat-active').classList.add('hidden');
        document.getElementById('chat-empty').classList.remove('hidden');
        document.getElementById('app-screen').classList.remove('show-chat');
      }
      renderConversationList();
    } catch (err) {
      document.getElementById('manage-group-error').textContent = err.message || 'Could not leave group.';
    }
  });

  addSelected.clear();
  document.getElementById('manage-group-modal')._resetAddSelected = () => {
    addSelected.clear();
    renderAddSelected();
  };
}

export function openManageGroupModal(conversationId) {
  manageGroupConversationId = conversationId;
  document.getElementById('manage-group-search-input').value = '';
  document.getElementById('manage-group-search-results').innerHTML = '';
  document.getElementById('manage-group-error').textContent = '';
  document.getElementById('manage-group-modal')._resetAddSelected?.();
  renderManageGroupModal();
  document.getElementById('manage-group-modal').classList.remove('hidden');
}

function renderManageGroupModal() {
  const conv = getConversation(manageGroupConversationId);
  if (!conv) return;
  const isOwner = conv.myRole === 'owner';

  document.getElementById('manage-group-owner-only').classList.toggle('hidden', !isOwner);
  document.getElementById('group-rename-input').value = conv.name || '';

  const list = document.getElementById('manage-group-members');
  list.innerHTML = '';
  for (const member of conv.members) {
    const row = document.createElement('div');
    row.className = 'member-row';
    const left = document.createElement('div');
    left.className = 'member-left';
    const dot = document.createElement('span');
    dot.className = 'status-dot' + (isUserOnline(member.id) ? ' online' : '');
    left.appendChild(dot);
    const label = document.createElement('span');
    label.textContent = member.displayName || member.username;
    left.appendChild(label);
    if (member.role === 'owner') {
      const badge = document.createElement('span');
      badge.className = 'role-badge';
      badge.textContent = 'owner';
      left.appendChild(badge);
    }
    row.appendChild(left);

    if (isOwner && member.id !== state.me.id) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'kick-btn';
      kickBtn.textContent = 'Remove';
      kickBtn.addEventListener('click', async () => {
        if (!confirm(`Remove ${member.displayName || member.username} from the group?`)) return;
        try {
          await api.kickMember(manageGroupConversationId, member.id);
          await refreshConversations();
          renderManageGroupModal();
        } catch (err) {
          document.getElementById('manage-group-error').textContent = err.message || 'Could not remove member.';
        }
      });
      row.appendChild(kickBtn);
    }
    list.appendChild(row);
  }
}

function renderPills(containerId, selectedMap, onChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const user of selectedMap.values()) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = user.displayName || user.username;
    const remove = document.createElement('button');
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      selectedMap.delete(user.id);
      onChange();
    });
    pill.appendChild(remove);
    container.appendChild(pill);
  }
}

async function safeSearch(q) {
  if (!q || q.trim().length < 1) return [];
  try {
    return await api.searchUsers(q.trim());
  } catch {
    return [];
  }
}

function renderUserResults(containerId, users, onPick) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const user of users) {
    const row = document.createElement('div');
    row.className = 'user-result';
    row.innerHTML = `<span>${escapeHtml(user.displayName || user.username)} <span style="color:var(--muted)">@${escapeHtml(user.username)}</span></span>`;
    row.addEventListener('click', () => onPick(user));
    container.appendChild(row);
  }
}

function openDmModal() {
  document.getElementById('dm-search-input').value = '';
  document.getElementById('dm-search-results').innerHTML = '';
  document.getElementById('new-dm-modal').classList.remove('hidden');
  document.getElementById('dm-search-input').focus();
}
function openGroupModal() {
  document.getElementById('group-name-input').value = '';
  document.getElementById('group-search-input').value = '';
  document.getElementById('group-search-results').innerHTML = '';
  document.getElementById('group-selected-members').innerHTML = '';
  document.getElementById('new-group-modal').classList.remove('hidden');
}

export async function refreshConversations() {
  const list = await api.listConversations();
  state.conversations = list;
  renderConversationList();
}

export function renderConversationList() {
  const container = document.getElementById('conversation-list');
  container.innerHTML = '';
  const sorted = [...state.conversations].sort((a, b) => {
    if (a.type === 'global') return -1;
    if (b.type === 'global') return 1;
    const at = a.lastMessage?.createdAt || a.createdAt;
    const bt = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bt) - new Date(at);
  });
  for (const conv of sorted) {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === state.activeConversationId ? ' active' : '');
    const preview = conv.lastMessage
      ? conv.lastMessage.content || (conv.lastMessage.hasImage ? '📷 Image' : '')
      : 'No messages yet';

    const nameRow = document.createElement('span');
    nameRow.className = 'conv-name';
    if (conv.type === 'dm') {
      const other = getOtherDmUser(conv);
      if (other) {
        const dot = document.createElement('span');
        dot.className = 'status-dot' + (isUserOnline(other.id) ? ' online' : '');
        dot.style.marginRight = '6px';
        nameRow.appendChild(dot);
      }
    }
    nameRow.appendChild(document.createTextNode(conv.name || 'Unnamed'));

    const previewRow = document.createElement('span');
    previewRow.className = 'conv-preview';
    previewRow.textContent = preview;

    item.appendChild(nameRow);
    item.appendChild(previewRow);
    item.addEventListener('click', () => onSelectConversation(conv.id));
    container.appendChild(item);
  }
}

export function bumpConversationPreview(conversationId, message) {
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (conv) {
    conv.lastMessage = {
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      hasImage: !!message.imageData,
      createdAt: message.createdAt,
    };
    renderConversationList();
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}