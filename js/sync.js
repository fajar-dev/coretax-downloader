// ── Session state ──

let appState = STATE.IDLE;
let session = {
  accessToken: null,
  taxpayerId:  null,
  documents:   [],
};

function resetSession() {
  appState = STATE.IDLE;
  session  = { accessToken: null, taxpayerId: null, documents: [] };
  DOM.logs.innerHTML = '<div class="log-entry log-info">Session direset. Silakan Start kembali.</div>';
  applyState(appState, session);
}

// ── Auth ──

function loginWithGoogle() {
  DOM.googleLoginBtn.disabled = true;
  setLoginStatus('Mengalihkan ke login Google...', 'loading');

  // Daftarkan listener sebelum mengirim pesan agar tidak ada race condition.
  chrome.runtime.onMessage.addListener(function handleLoginResult(message) {
    if (message.action !== 'LOGIN_COMPLETE' && message.action !== 'LOGIN_ERROR') return;

    chrome.runtime.onMessage.removeListener(handleLoginResult);

    if (message.action === 'LOGIN_COMPLETE') {
      showMainScreen(message.user);
    } else {
      setLoginStatus(message.error || 'Login gagal.');
      DOM.googleLoginBtn.disabled = false;
    }
  });

  // Background menangani OAuth interaktif sehingga popup tidak tertutup
  // saat dialog Google muncul. Jika popup tetap tertutup, init code
  // akan menemukan user di storage dan langsung ke main screen.
  chrome.runtime.sendMessage({ action: 'START_LOGIN' });
}

async function logout() {
  DOM.logoutBtn.disabled = true;
  try {
    const token = await ChromeAuth.getToken(false).catch(() => null);
    if (token) {
      await AuthAPI.logout(token).catch(() => {});
      await ChromeAuth.removeCachedToken(token);
    }
  } finally {
    await ChromeStorage.remove(CONFIG.STORAGE_KEY_USER);
    resetSession();
    DOM.logoutBtn.disabled = false;
    showLoginScreen();
  }
}

// ── Verify credentials ──

async function validateServerSession() {
  const token = await ChromeAuth.getToken(false);
  await AuthAPI.getMe(token);
}

async function extractCoretaxSession(tabId) {
  const result = await ChromeTabs.executeScript(tabId, extractCoretaxCredentials);
  if (!result?.tokenData) {
    throw new Error('Kredensial tidak ditemukan. Pastikan Anda sudah login ke Coretax.');
  }
  const parsedToken = JSON.parse(result.tokenData);
  return {
    accessToken: parsedToken.access_token,
    taxpayerId:  parseTaxpayerId(parsedToken, result.userData),
  };
}

async function verifyCredentials() {
  setBusy(true);
  addLog('Memverifikasi sesi...', 'info');

  try {
    await validateServerSession();
  } catch {
    const staleToken = await ChromeAuth.getToken(false).catch(() => null);
    if (staleToken) await ChromeAuth.removeCachedToken(staleToken);
    await ChromeStorage.remove(CONFIG.STORAGE_KEY_USER);
    addLog('Sesi kedaluwarsa. Silakan login kembali.', 'error');
    setBusy(false);
    showLoginScreen();
    return;
  }

  const tab = await ChromeTabs.getActive();
  if (!tab.url.includes(CONFIG.CORETAX_HOST)) {
    addLog('Error: Buka portal Coretax dahulu!', 'error');
    setBusy(false);
    return;
  }

  addLog('Memverifikasi kredensial Coretax...', 'info');

  try {
    const { accessToken, taxpayerId } = await extractCoretaxSession(tab.id);
    session.accessToken = accessToken;
    session.taxpayerId  = taxpayerId;

    addLog('Token ditemukan. Mengambil daftar dokumen...', 'info');
    session.documents = await CoretaxAPI.listDocuments(accessToken, taxpayerId);

    addLog(`Verifikasi berhasil! Ditemukan ${session.documents.length} dokumen.`, 'success');
    appState = STATE.VERIFIED;
  } catch (err) {
    addLog(err.message || 'Verifikasi gagal.', 'error');
  }

  setBusy(false);
  applyState(appState, session);
}

// ── Sync documents ──

function sanitizeFileName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

async function downloadDocumentBlob(doc, index, total) {
  const label = doc.FileName || doc.DocumentTitle || `Dokumen ${index + 1}`;
  addLog(`[${index + 1}/${total}] Mengunduh ${label}...`, 'info');

  const blob = await CoretaxAPI.downloadDocument(session.accessToken, session.taxpayerId, doc);
  if (!blob) throw new Error(`Gagal membaca konten file: ${label}`);

  const fileName = sanitizeFileName(doc.FileName || `${doc.DocumentNumber || 'Document'}.pdf`);
  return { blob, fileName };
}

async function startSync() {
  const selectedDocs = getSelectedDocuments(session.documents);
  if (selectedDocs.length === 0) return;

  appState = STATE.SYNCING;
  applyState(appState, session);
  setBusy(true);

  let googleToken;
  try {
    googleToken = await ChromeAuth.getToken(false);
  } catch {
    addLog('Gagal mendapatkan token auth. Silakan login kembali.', 'error');
    appState = STATE.VERIFIED;
    setBusy(false);
    applyState(appState, session);
    return;
  }

  // Phase 1: download all selected documents
  const files = [];
  for (let i = 0; i < selectedDocs.length; i++) {
    try {
      const file = await downloadDocumentBlob(selectedDocs[i], i, selectedDocs.length);
      files.push(file);
    } catch (err) {
      addLog(`Error: ${err.message}`, 'error');
    }
  }

  if (files.length === 0) {
    addLog('Tidak ada dokumen berhasil diunduh.', 'error');
    appState = STATE.VERIFIED;
    setBusy(false);
    applyState(appState, session);
    return;
  }

  // Phase 2: upload all at once
  addLog(`Mengirim ${files.length} dokumen ke server...`, 'info');
  try {
    const result = await UploadAPI.upload(googleToken, files);
    if (!result.success) throw new Error(result.message || 'Unknown error');
    addLog(`Selesai! ${files.length} dokumen berhasil disync.`, 'success');
  } catch (err) {
    addLog(`Upload gagal: ${err.message}`, 'error');
  }

  appState = STATE.FINISH;
  setBusy(false);
  applyState(appState, session);
}

// ── Event listeners ──

DOM.googleLoginBtn.addEventListener('click', loginWithGoogle);
DOM.logoutBtn.addEventListener('click', logout);

DOM.btn.addEventListener('click', () => {
  if (appState === STATE.IDLE)     verifyCredentials();
  else if (appState === STATE.VERIFIED) startSync();
});

DOM.resetBtn.addEventListener('click', resetSession);

DOM.selectAllBtn.addEventListener('click', () => {
  DOM.fileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
    cb.closest('.file-item').classList.add('checked');
  });
  updateSyncBtn(session.documents);
});

DOM.deselectAllBtn.addEventListener('click', () => {
  DOM.fileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.file-item').classList.remove('checked');
  });
  updateSyncBtn(session.documents);
});

// ── Init ──

(async () => {
  const result = await ChromeStorage.get(CONFIG.STORAGE_KEY_USER);
  if (result[CONFIG.STORAGE_KEY_USER]) {
    showMainScreen(result[CONFIG.STORAGE_KEY_USER]);
  } else {
    showLoginScreen();
  }
})();

// Tangani kasus popup dibuka kembali setelah background menyelesaikan login
// (popup sempat tertutup saat dialog OAuth muncul).
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'LOGIN_COMPLETE') {
    showMainScreen(message.user);
  }
});
