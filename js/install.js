// Detects whether the app is running installed (standalone) vs. in a normal
// browser tab, and shows platform-appropriate "install this app" guidance
// when it isn't. iOS has no programmatic install API, so it always gets
// manual instructions; Chromium-based browsers (Android + desktop) get a
// real one-tap install button via the beforeinstallprompt event.

const DISMISS_KEY = 'installBannerDismissedAt';
const DISMISS_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // don't nag again for 3 days after dismissal

export function isStandalonePwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari's legacy flag
  );
}

function detectPlatform() {
  const ua = navigator.userAgent || navigator.vendor || '';
  const isIPad = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports as Mac
  if (/iphone|ipad|ipod/i.test(ua) || isIPad) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os x/i.test(ua)) return 'mac';
  return 'other';
}

let deferredInstallPrompt = null;

export function initInstallUI() {
  const banner = document.getElementById('install-banner');
  const textEl = document.getElementById('install-banner-text');
  const actionBtn = document.getElementById('install-action-btn');
  const dismissBtn = document.getElementById('install-dismiss-btn');

  if (isStandalonePwa()) return; // already installed, nothing to prompt

  const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
  if (Date.now() - dismissedAt < DISMISS_SNOOZE_MS) return;

  const platform = detectPlatform();
  const messages = {
    ios: 'Install this app: tap the Share button, then "Add to Home Screen".',
    android: 'Install this app for the full experience, including notifications.',
    windows: 'Install this app: click the install icon in your browser\u2019s address bar, or open the browser menu and choose "Install app".',
    mac: 'Install this app: click the install icon in your browser\u2019s address bar, or open the browser menu and choose "Install app".',
    other: 'Install this app from your browser menu for the best experience.',
  };
  textEl.textContent = messages[platform] || messages.other;
  banner.classList.remove('hidden');

  // Chromium browsers (Android Chrome, desktop Chrome/Edge) fire this when
  // the app is installable - lets us show a real "Install" button instead of
  // just instructions.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    actionBtn.classList.remove('hidden');
  });

  actionBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') banner.classList.add('hidden');
  });

  dismissBtn.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    banner.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.add('hidden');
  });
}