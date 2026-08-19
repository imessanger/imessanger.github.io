import { wsUrl } from './config.js';

let socket = null;
let listeners = new Set();
let reconnectTimer = null;
let reconnectDelay = 1000;

export function onWsMessage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function connectWs() {
  const url = wsUrl();
  if (!url) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    reconnectDelay = 1000;
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const fn of listeners) fn(msg);
  });

  socket.addEventListener('close', () => {
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    socket.close();
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
    connectWs();
  }, reconnectDelay);
}

export function disconnectWs() {
  clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

export function sendWs(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

export function sendTyping(conversationId) {
  sendWs({ type: 'typing', conversationId });
}

export function sendChatMessage(conversationId, content, imageData, tempId, replyToMessageId) {
  return sendWs({ type: 'message', conversationId, content, imageData, tempId, replyToMessageId });
}