import { api } from './api.js';
import { state, addMessage, getConversation } from './state.js';
import { sendChatMessage, sendTyping } from './ws.js';
import {
  escapeHtml,
  bumpConversationPreview,
  renderConversationList,
  refreshConversations,
  openManageGroupModal,
  getOtherDmUser,
  isUserOnline,
} from './conversations.js';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const REACTION_CHOICES = ['👍', '❤️', '😂', '😭', '🔥', '👀'];

let pendingImageDataUrl = null;
let typingTimeout = null;
let typingUsers = new Map(); // userId -> timeout handle, for the active conversation

// A reaction is just a normal message whose content is exactly {"reaction":"😭"}
// and which replies to the target message. The client detects this shape and
// renders it as a chip instead of a chat bubble - no backend schema needed.
function parseReactionEmoji(content) {
  if (!content) return null;
  let obj;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  if (obj && typeof obj === 'object' && typeof obj.reaction === 'string' && Object.keys(obj).length === 1) {
    return obj.reaction;
  }
  return null;
}

export function initChatUI() {
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const imageInput = document.getElementById('image-input');
  const imagePreview = document.getElementById('image-preview');
  const clearImageBtn = document.getElementById('clear-image-btn');
  const backBtn = document.getElementById('back-btn');

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image is too large (max ~3MB).');
      imageInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImageDataUrl = reader.result;
      imagePreview.src = pendingImageDataUrl;
      imagePreview.classList.remove('hidden');
      clearImageBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  clearImageBtn.addEventListener('click', () => {
    pendingImageDataUrl = null;
    imageInput.value = '';
    imagePreview.classList.add('hidden');
    clearImageBtn.classList.add('hidden');
  });

  document.getElementById('reply-cancel-btn').addEventListener('click', () => {
    state.replyTarget = null;
    updateReplyPreviewUI();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 2000);
    const image = pendingImageDataUrl;
    if (!text && !image) return;
    const conversationId = state.activeConversationId;
    if (!conversationId) return;

    const replyToMessageId = state.replyTarget?.id || null;

    input.value = '';
    clearImageBtn.click();
    state.replyTarget = null;
    updateReplyPreviewUI();

    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const optimistic = {
      id: tempId,
      conversationId,
      senderId: state.me.id,
      senderDisplayName: state.me.displayName,
      content: text || null,
      imageData: image || null,
      createdAt: new Date().toISOString(),
      pending: true,
      replyTo: replyToMessageId
        ? { id: replyToMessageId, content: state.messagesByConv[conversationId]?.find((m) => m.id === replyToMessageId)?.content }
        : null,
    };
    addMessage(conversationId, optimistic);
    renderMessages(conversationId);

    const sentOverWs = sendChatMessage(conversationId, text, image, tempId, replyToMessageId);
    if (!sentOverWs) {
      try {
        const saved = await api.sendMessage(conversationId, text, image, replyToMessageId);
        saved.tempId = tempId;
        addMessage(conversationId, saved);
        renderMessages(conversationId);
        bumpConversationPreview(conversationId, saved);
      } catch (err) {
        removeMessage(conversationId, tempId);
        alert('Failed to send message: ' + err.message);
      }
    }
  });

  input.addEventListener('input', () => {
    if (!state.activeConversationId) return;
    clearTimeout(typingTimeout);
    sendTyping(state.activeConversationId);
    typingTimeout = setTimeout(() => {}, 1500);
  });

  backBtn.addEventListener('click', () => {
    document.getElementById('app-screen').classList.remove('show-chat');
  });

  document.getElementById('group-info-btn').addEventListener('click', () => {
    if (state.activeConversationId) openManageGroupModal(state.activeConversationId);
  });

  document.getElementById('block-btn').addEventListener('click', async () => {
    const conv = getConversation(state.activeConversationId);
    const other = getOtherDmUser(conv);
    if (!other) return;
    const alreadyBlocked = state.blockedUserIds.has(other.id);
    if (alreadyBlocked) {
      if (!confirm(`Unblock ${other.displayName || other.username}?`)) return;
      try {
        await api.unblockUser(other.id);
        state.blockedUserIds.delete(other.id);
        updateBlockButton(other.id);
      } catch (err) {
        alert(err.message || 'Could not unblock user.');
      }
    } else {
      if (!confirm(`Block ${other.displayName || other.username}? They won't be able to message you.`)) return;
      try {
        await api.blockUser(other.id);
        state.blockedUserIds.add(other.id);
        updateBlockButton(other.id);
      } catch (err) {
        alert(err.message || 'Could not block user.');
      }
    }
  });
}

function updateBlockButton(otherUserId) {
  const btn = document.getElementById('block-btn');
  const blocked = state.blockedUserIds.has(otherUserId);
  btn.textContent = blocked ? '✅' : '🚫';
  btn.title = blocked ? 'Unblock user' : 'Block user';
}

function removeMessage(conversationId, id) {
  const list = state.messagesByConv[conversationId];
  if (!list) return;
  const idx = list.findIndex((m) => m.id === id);
  if (idx >= 0) list.splice(idx, 1);
  renderMessages(conversationId);
}

function updateReplyPreviewUI() {
  const bar = document.getElementById('reply-preview');
  const textEl = document.getElementById('reply-preview-text');
  if (state.replyTarget) {
    const snippet = state.replyTarget.content || (state.replyTarget.hasImage ? '📷 Image' : '');
    textEl.textContent = `Replying to ${state.replyTarget.senderDisplayName || 'message'}: ${(snippet || '').slice(0, 60)}`;
    bar.classList.remove('hidden');
    document.getElementById('message-input').focus();
  } else {
    bar.classList.add('hidden');
  }
}

function startReply(message) {
  state.replyTarget = {
    id: message.id,
    content: message.content,
    hasImage: !!message.imageData,
    senderDisplayName: message.senderDisplayName || message.senderUsername || 'them',
  };
  updateReplyPreviewUI();
}

function sendReaction(targetMessageId, emoji) {
  const conversationId = state.activeConversationId;
  if (!conversationId) return;
  const content = JSON.stringify({ reaction: emoji });
  const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const optimistic = {
    id: tempId,
    conversationId,
    senderId: state.me.id,
    senderDisplayName: state.me.displayName,
    content,
    imageData: null,
    createdAt: new Date().toISOString(),
    pending: true,
    replyTo: { id: targetMessageId },
  };
  addMessage(conversationId, optimistic);
  renderMessages(conversationId);

  const sentOverWs = sendChatMessage(conversationId, content, null, tempId, targetMessageId);
  if (!sentOverWs) {
    api
      .sendMessage(conversationId, content, null, targetMessageId)
      .then((saved) => {
        saved.tempId = tempId;
        addMessage(conversationId, saved);
        renderMessages(conversationId);
      })
      .catch(() => removeMessage(conversationId, tempId));
  }
}

export async function openConversation(conversationId) {
  state.activeConversationId = conversationId;
  state.replyTarget = null;
  updateReplyPreviewUI();
  document.getElementById('app-screen').classList.add('show-chat');
  document.getElementById('chat-empty').classList.add('hidden');
  document.getElementById('chat-active').classList.remove('hidden');

  const conv = getConversation(conversationId);
  document.getElementById('chat-title').textContent = conv?.name || 'Conversation';
  document.getElementById('group-info-btn').classList.toggle('hidden', conv?.type !== 'group');

  const blockBtn = document.getElementById('block-btn');
  const statusDot = document.getElementById('chat-status-dot');
  if (conv?.type === 'dm') {
    const other = getOtherDmUser(conv);
    blockBtn.classList.remove('hidden');
    if (other) updateBlockButton(other.id);
    statusDot.classList.remove('hidden');
    statusDot.className = 'status-dot' + (other && isUserOnline(other.id) ? ' online' : '');
  } else {
    blockBtn.classList.add('hidden');
    statusDot.classList.add('hidden');
  }

  renderConversationList();

  if (!state.messagesByConv[conversationId]) {
    try {
      const messages = await api.getMessages(conversationId);
      state.messagesByConv[conversationId] = messages;
    } catch (err) {
      state.messagesByConv[conversationId] = [];
    }
  }
  renderMessages(conversationId);
  hideTyping();
}

export function renderMessages(conversationId) {
  if (conversationId !== state.activeConversationId) return;
  const container = document.getElementById('messages');
  const list = state.messagesByConv[conversationId] || [];
  container.innerHTML = '';
  const conv = getConversation(conversationId);
  const isGroup = conv?.type === 'group' || conv?.type === 'global';

  // Separate reaction "messages" from real messages, and group reactions by target
  const reactionsByTarget = {};
  const normalMessages = [];
  for (const m of list) {
    const emoji = parseReactionEmoji(m.content);
    if (emoji && m.replyTo?.id) {
      (reactionsByTarget[m.replyTo.id] ||= []).push({
        emoji,
        senderId: m.senderId,
        senderDisplayName: m.senderDisplayName || m.senderUsername || 'Someone',
      });
    } else {
      normalMessages.push(m);
    }
  }

  for (const m of normalMessages) {
    const row = document.createElement('div');
    const mine = m.senderId === state.me.id;
    row.className = 'msg-row ' + (mine ? 'me' : 'other');

    if (isGroup && !mine) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      sender.textContent = m.senderDisplayName || m.senderUsername || 'Unknown';
      row.appendChild(sender);
    }

    if (m.replyTo) {
      const quote = document.createElement('div');
      quote.className = 'msg-reply-quote';
      const snippet = m.replyTo.content || (m.replyTo.hasImage ? '📷 Image' : '');
      quote.textContent = `↩ ${m.replyTo.senderDisplayName || ''} ${snippet ? '· ' + snippet.slice(0, 50) : ''}`.trim();
      row.appendChild(quote);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (m.imageData) {
      const img = document.createElement('img');
      img.src = m.imageData;
      bubble.appendChild(img);
      if (m.content) {
        const p = document.createElement('div');
        p.style.marginTop = '6px';
        p.textContent = m.content;
        bubble.appendChild(p);
      }
    } else {
      bubble.textContent = m.content || '';
    }
    row.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(m.createdAt) + (m.pending ? ' · sending…' : '');
    row.appendChild(time);

    // Reaction chips under this bubble, grouped by emoji
    const reactions = reactionsByTarget[m.id];
    if (reactions && reactions.length > 0) {
      const chipRow = document.createElement('div');
      chipRow.className = 'msg-reactions';
      const grouped = {};
      for (const r of reactions) (grouped[r.emoji] ||= []).push(r.senderDisplayName);
      for (const [emoji, names] of Object.entries(grouped)) {
        const chip = document.createElement('span');
        chip.className = 'reaction-chip';
        chip.textContent = `${emoji} ${names.length}`;
        chip.title = names.join(', ');
        chipRow.appendChild(chip);
      }
      row.appendChild(chipRow);
    }

    // Reply / react toolbar - only for real (already-saved) messages
    if (!m.pending) {
      const toolbar = document.createElement('div');
      toolbar.className = 'msg-toolbar';

      const replyBtn = document.createElement('button');
      replyBtn.textContent = '↩ Reply';
      replyBtn.addEventListener('click', () => startReply(m));
      toolbar.appendChild(replyBtn);

      const reactBtn = document.createElement('button');
      reactBtn.textContent = '🙂+';
      reactBtn.addEventListener('click', () => {
        const existing = row.querySelector('.emoji-picker');
        if (existing) {
          existing.remove();
          return;
        }
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        for (const emoji of REACTION_CHOICES) {
          const btn = document.createElement('button');
          btn.textContent = emoji;
          btn.addEventListener('click', () => {
            sendReaction(m.id, emoji);
            picker.remove();
          });
          picker.appendChild(btn);
        }
        toolbar.after(picker);
      });
      toolbar.appendChild(reactBtn);

      row.appendChild(toolbar);
    }

    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

export async function handleIncomingMessage(message) {
  const known = getConversation(message.conversationId);
  if (!known) {
    // First message of a conversation we don't have locally yet (e.g. someone
    // just DMed us for the first time) - pull the conversation list so it
    // shows up in the sidebar.
    try {
      await refreshConversations();
    } catch {
      /* ignore, we'll still try to render what we can below */
    }
  }
  addMessage(message.conversationId, message);
  bumpConversationPreview(message.conversationId, message);
  renderMessages(message.conversationId);
  renderConversationList();
  hideTypingFor(message.senderId);
}

export function handleWsError({ message, tempId }) {
  if (tempId) {
    for (const convId of Object.keys(state.messagesByConv)) {
      const list = state.messagesByConv[convId];
      if (list.some((m) => m.id === tempId)) {
        removeMessage(convId, tempId);
        break;
      }
    }
  }
  alert(message || 'Something went wrong sending that message.');
}

export function handleRemovedFromConversation(conversationId) {
  state.conversations = state.conversations.filter((c) => c.id !== conversationId);
  if (state.activeConversationId === conversationId) {
    state.activeConversationId = null;
    document.getElementById('chat-active').classList.add('hidden');
    document.getElementById('chat-empty').classList.remove('hidden');
    document.getElementById('app-screen').classList.remove('show-chat');
    alert("You've been removed from this group.");
  }
  renderConversationList();
}

export function handleTypingEvent({ conversationId, userId }) {
  if (conversationId !== state.activeConversationId) return;
  clearTimeout(typingUsers.get(userId));
  typingUsers.set(
    userId,
    setTimeout(() => hideTypingFor(userId), 3000)
  );
  showTyping();
}

export function updatePresenceUI(userId, online) {
  if (online) state.onlineUserIds.add(userId);
  else state.onlineUserIds.delete(userId);

  renderConversationList();

  const conv = getConversation(state.activeConversationId);
  if (conv?.type === 'dm') {
    const other = getOtherDmUser(conv);
    if (other && other.id === userId) {
      const dot = document.getElementById('chat-status-dot');
      dot.className = 'status-dot' + (online ? ' online' : '');
    }
  }
}

function showTyping() {
  const el = document.getElementById('typing-indicator');
  el.textContent = 'Typing…';
  el.classList.remove('hidden');
}
function hideTypingFor(userId) {
  typingUsers.delete(userId);
  if (typingUsers.size === 0) hideTyping();
}
function hideTyping() {
  typingUsers.clear();
  document.getElementById('typing-indicator').classList.add('hidden');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}