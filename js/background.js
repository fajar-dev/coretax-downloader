// Background service worker menangani interactive OAuth agar popup tidak tertutup
// saat dialog Google muncul dan memutus async flow.

const BASE_API        = 'http://localhost:4000/api';
const STORAGE_KEY_USER = 'userInfo';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_LOGIN') {
    // Langsung ACK agar message channel tidak timeout,
    // lalu jalankan login async di background.
    sendResponse({ received: true });
    performLogin();
    return false;
  }
});

async function performLogin() {
  try {
    const googleToken = await getInteractiveToken();
    const data        = await callLoginAPI(googleToken);

    if (!data.success) throw new Error(data.message || 'Login gagal.');

    const user = data.data?.user ?? data.data ?? data.user;
    if (!user || typeof user !== 'object') throw new Error('Respons server tidak valid.');

    await saveUser(user);

    // Kirim ke popup jika masih terbuka; jika sudah tertutup, init code
    // akan menemukan user di storage saat popup dibuka kembali.
    chrome.runtime.sendMessage({ action: 'LOGIN_COMPLETE', user }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({ action: 'LOGIN_ERROR', error: err.message }).catch(() => {});
  }
}

function getInteractiveToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'Login dibatalkan.'));
      } else {
        resolve(token);
      }
    });
  });
}

async function callLoginAPI(googleToken) {
  const res = await fetch(`${BASE_API}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: googleToken }),
  });
  return res.json();
}

function saveUser(user) {
  return new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEY_USER]: user }, resolve));
}
