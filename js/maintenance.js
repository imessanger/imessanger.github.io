import {
  isMaintenanceMode,
  checkMaintenancePassword,
  hasMaintenanceBypass,
  setMaintenanceBypass,
} from './config.js';

// Frontend-only gate. If maintenance mode is on and this browser hasn't
// unlocked before, shows a full-screen "under construction" cover with a
// discreet unlock icon for testers. Returns true if the app should stay
// gated (caller should not continue booting), false if it's fine to proceed.
export function initMaintenanceGate(onUnlocked) {
  if (!isMaintenanceMode() || hasMaintenanceBypass()) return false;

  const screen = document.getElementById('maintenance-screen');
  const unlockBtn = document.getElementById('maintenance-unlock-btn');
  const form = document.getElementById('maintenance-unlock-form');
  const input = document.getElementById('maintenance-password-input');
  const errorEl = document.getElementById('maintenance-error');

  screen.classList.remove('hidden');

  unlockBtn.addEventListener('click', () => {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) input.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    if (checkMaintenancePassword(input.value)) {
      setMaintenanceBypass();
      screen.classList.add('hidden');
      onUnlocked();
    } else {
      errorEl.textContent = 'Incorrect password.';
      input.value = '';
    }
  });

  return true;
}