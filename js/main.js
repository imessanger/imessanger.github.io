import { getToken, getMe, setMe } from './config.js';
import { api } from './api.js';
import { initAuthUI, logout } from './auth.js';
import { initConversationsUI, refreshConversations, renderConversationList } from './conversations.js';
import {
  initChatUI,
  openConversation,
  handleIncomingMessage,
  handleTypingEvent,
  handleWsError,
  handleRemovedFromConversation,
  updatePresenceUI,
} from './chat.js';
import { initSettingsUI } from './settings.js';
import { registerServiceWorker, requestPushPermissionAndSubscribe } from './push.js';
import { connectWs, onWsMessage, disconnectWs } from './ws.js';
import { state, getConversation } from './state.js';
import { initInstallUI, isStandalonePwa } from './install.js';
import { initMaintenanceGate } from './maintenance.js';
import { initAdminUI } from './admin.js';

async function boot() {
  registerServiceWorker();
  initSettingsUI();
  initInstallUI();

  initAuthUI({ onAuthenticated: (user) => showApp(user) });

  const token = getToken();
  const cachedMe = getMe();
  if (token && cachedMe) {
    // Try to use cached user immediately, then refresh in the background
    showApp(cachedMe);
    api
      .me()
      .then((fresh) => {
        setMe(fresh);
        state.me = fresh;
        document.getElementById('me-name').textContent = fresh.displayName || fresh.username;
      })
      .catch(() => {
        // token likely invalid/expired
      });
  }
}

async function showApp(user) {
  state.me = user;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('me-name').textContent = user.displayName || user.username;

  document.getElementById('reload-btn').addEventListener('click', () => location.reload());

  initChatUI();
  initConversationsUI({ onSelect: (id) => openConversation(id) });
  initAdminUI();

  connectWs();
  onWsMessage((msg) => {
    if (msg.type === 'message') handleIncomingMessage(msg.message);
    else if (msg.type === 'typing') handleTypingEvent(msg);
    else if (msg.type === 'error') handleWsError(msg);
    else if (msg.type === 'presence') updatePresenceUI(msg.userId, msg.online);
    else if (msg.type === 'removedFromConversation') handleRemovedFromConversation(msg.conversationId);
    else if (msg.type === 'banned') {
      alert(msg.reason || 'You have been banned.');
      disconnectWs();
      logout();
    } else if (msg.type === 'conversationUpdate') {
      refreshConversations().then(() => {
        if (msg.conversationId === state.activeConversationId) {
          const conv = getConversation(msg.conversationId);
          if (conv) document.getElementById('chat-title').textContent = conv.name || 'Conversation';
        }
      });
    }
  });

  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'open-conversation' && event.data.conversationId) {
      openConversation(event.data.conversationId);
    }
  });

  try {
    await refreshConversations();
  } catch (e) {
    console.warn('Could not load conversations', e);
  }

  // Hydrate presence + blocked list so status dots and the block button are
  // correct immediately, not just after the next WS event.
  api
    .getOnlineUsers()
    .then(({ onlineUserIds }) => {
      state.onlineUserIds = new Set(onlineUserIds);
      renderConversationList();
    })
    .catch(() => {});
  api
    .listBlocked()
    .then((blocked) => {
      state.blockedUserIds = new Set(blocked.map((u) => u.id));
    })
    .catch(() => {});

  const params = new URLSearchParams(location.search);
  const conversationId = params.get('conversation');
  if (conversationId) openConversation(conversationId);

  // Running as an installed PWA (not just a browser tab) - go ahead and ask
  // for notification permission right away instead of making the person dig
  // through Settings to find it.
  if (isStandalonePwa()) {
    requestPushPermissionAndSubscribe().catch((e) => {
      console.warn('Auto push subscribe skipped:', e.message);
    });
  }
}

const isGated = initMaintenanceGate(() => boot());
if (!isGated) boot();