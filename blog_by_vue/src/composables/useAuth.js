import { ref } from 'vue';
import { checkAuthStatus, verifyTotp } from '@/api/auth';

const TOKEN_KEY = 'markvault_jwt';
const token = ref(localStorage.getItem(TOKEN_KEY));
const isAuthenticated = ref(false);

let authDialogResolver = null;
let authDialogRejecter = null;
const authDialogVisible = ref(false);

function persistToken(value) {
  token.value = value;
  if (value) {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function checkAuth() {
  const cachedToken = localStorage.getItem(TOKEN_KEY);
  if (!cachedToken) {
    persistToken(null);
    isAuthenticated.value = false;
    return false;
  }

  try {
    await checkAuthStatus();
    persistToken(cachedToken);
    isAuthenticated.value = true;
    return true;
  } catch (error) {
    clearAuth();
    return false;
  }
}

async function submitTotp(code) {
  const response = await verifyTotp(code);
  persistToken(response.token);
  isAuthenticated.value = true;
  return response.token;
}

function requireAuth() {
  const cachedToken = localStorage.getItem(TOKEN_KEY);
  if (cachedToken && isAuthenticated.value) {
    return Promise.resolve(cachedToken);
  }

  authDialogVisible.value = true;
  return new Promise((resolve, reject) => {
    authDialogResolver = resolve;
    authDialogRejecter = reject;
  });
}

function resolveAuthDialog(tokenValue) {
  authDialogVisible.value = false;
  authDialogResolver?.(tokenValue);
  authDialogResolver = null;
  authDialogRejecter = null;
}

function rejectAuthDialog(error = new Error('Authentication cancelled')) {
  authDialogVisible.value = false;
  authDialogRejecter?.(error);
  authDialogResolver = null;
  authDialogRejecter = null;
}

function clearAuth() {
  persistToken(null);
  isAuthenticated.value = false;
}

export function useAuth() {
  return {
    token,
    isAuthenticated,
    authDialogVisible,
    checkAuth,
    requireAuth,
    submitTotp,
    resolveAuthDialog,
    rejectAuthDialog,
    clearAuth,
  };
}
