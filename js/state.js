// Small shared in-memory app state
export const state = {
  me: null,
  conversations: [], // [{id, type, name, members, myRole, lastMessage}]
  activeConversationId: null,
  messagesByConv: {}, // conversationId -> [message,...]
  onlineUserIds: new Set(),
  blockedUserIds: new Set(),
  replyTarget: null, // { id, content, hasImage, senderDisplayName } for the message currently being replied to
};

export function upsertConversation(conv) {
  const idx = state.conversations.findIndex((c) => c.id === conv.id);
  if (idx >= 0) state.conversations[idx] = { ...state.conversations[idx], ...conv };
  else state.conversations.unshift(conv);
}

export function getConversation(id) {
  return state.conversations.find((c) => c.id === id);
}

export function addMessage(conversationId, message) {
  const list = (state.messagesByConv[conversationId] ||= []);
  // De-dupe: replace optimistic temp message once the real one arrives
  if (message.tempId) {
    const tempIdx = list.findIndex((m) => m.id === message.tempId);
    if (tempIdx >= 0) {
      list[tempIdx] = message;
      return;
    }
  }
  if (list.some((m) => m.id === message.id)) return;
  list.push(message);
}