import { api, ApiError } from './api.js';
import { setToken, setMe } from './config.js';

export function initAuthUI({ onAuthenticated }) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-form`).classList.add('active');
    });
  });

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const { token, user } = await api.login(username, password);
      setToken(token);
      setMe(user);
      onAuthenticated(user);
    } catch (err) {
      loginError.textContent = err instanceof ApiError ? err.message : 'Login failed';
    }
  });

  const registerForm = document.getElementById('register-form');
  const registerError = document.getElementById('register-error');
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const username = document.getElementById('register-username').value.trim();
    const displayName = document.getElementById('register-displayname').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      const { token, user } = await api.register(username, password, displayName);
      setToken(token);
      setMe(user);
      onAuthenticated(user);
    } catch (err) {
      registerError.textContent = err instanceof ApiError ? err.message : 'Registration failed';
    }
  });
}

export function logout() {
  setToken(null);
  setMe(null);
  location.reload();
}
