// ── DOM refs ──
const loginScreen     = document.getElementById('login-screen');
const loginStatus     = document.getElementById('login-status');
const googleLoginBtn  = document.getElementById('google-login-btn');
const mainScreen      = document.getElementById('main-screen');
const loggedInAs      = document.getElementById('logged-in-as');
const logoutBtn       = document.getElementById('logout-btn');

const btn               = document.getElementById('btn');
const btnText           = document.getElementById('btn-text');
const resetBtn          = document.getElementById('reset-btn');
const loader            = document.getElementById('loader');
const statusVal         = document.getElementById('status-val');
const taxpayerIdVal     = document.getElementById('taxpayer-id-val');
const docCountContainer = document.getElementById('doc-count-container');
const docCountVal       = document.getElementById('doc-count-val');
const logs              = document.getElementById('logs');
const fileListContainer = document.getElementById('file-list-container');
const fileList          = document.getElementById('file-list');
const selectAllBtn      = document.getElementById('select-all-btn');
const deselectAllBtn    = document.getElementById('deselect-all-btn');

// ── App state ──
let appState = 'IDLE'; // IDLE | VERIFIED | SYNCING | FINISH
let sessionData = { accessToken: null, taxpayerId: null, documents: [] };

// ══════════════════════════════════════════
// Auth
// ══════════════════════════════════════════

async function loginWithGoogle() {
  googleLoginBtn.disabled = true;
  loginStatus.className = 'loading';
  loginStatus.textContent = 'Mengalihkan ke login Google...';
  try {
    // Chrome menangani seluruh OAuth flow secara internal — tidak perlu redirect URI manual
    const accessToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError?.message || 'Login dibatalkan.');
        } else {
          resolve(token);
        }
      });
    });

    loginStatus.textContent = 'Memverifikasi dengan server...';

    const res  = await fetch('http://localhost:4000/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: accessToken })
    });
    const data = await res.json();

    if (data.success) {
      const user = data.data.user;
      chrome.storage.local.set({ userInfo: user }, () => showMainScreen(user));
    } else {
      throw new Error(data.message || 'Login gagal.');
    }
  } catch (err) {
    loginStatus.className = '';
    loginStatus.textContent = typeof err === 'string' ? err : err.message;
    googleLoginBtn.disabled = false;
  }
}

function showLoginScreen() {
  loginScreen.style.display   = 'flex';
  mainScreen.style.display    = 'none';
  loginStatus.textContent     = '';
  loginStatus.className       = '';
  googleLoginBtn.disabled     = false;
}

function showMainScreen(user) {
  loginScreen.style.display = 'none';
  mainScreen.style.display  = 'block';
  loggedInAs.textContent    = `${user.name} · ${user.email}`;
  updateUI();
}

googleLoginBtn.addEventListener('click', loginWithGoogle);

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  chrome.identity.getAuthToken({ interactive: false }, async (token) => {
    try {
      if (token) {
        await fetch('http://localhost:4000/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        chrome.identity.removeCachedAuthToken({ token });
      }
    } catch (_) {
      // lanjut logout meski server tidak bisa dicapai
    }
    chrome.storage.local.remove('userInfo', () => {
      logoutBtn.disabled = false;
      appState = 'IDLE';
      sessionData = { accessToken: null, taxpayerId: null, documents: [] };
      logs.innerHTML = '<div class="log-entry log-info">Buka portal Coretax lalu klik "Verify & Start".</div>';
      showLoginScreen();
    });
  });
});

// ── Init: cek auth tersimpan ──
chrome.storage.local.get('userInfo', (result) => {
  if (result.userInfo) {
    showMainScreen(result.userInfo);
  } else {
    showLoginScreen();
  }
});

// ══════════════════════════════════════════
// Logging
// ══════════════════════════════════════════

function addLog(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-entry log-${type}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.prepend(div);
}

// ══════════════════════════════════════════
// File list & selection
// ══════════════════════════════════════════

function getSelectedDocuments() {
  const checkboxes = fileList.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => sessionData.documents[parseInt(cb.dataset.index)]);
}

function updateSyncBtn() {
  const selected = getSelectedDocuments();
  btnText.textContent = `Sync ${selected.length} dari ${sessionData.documents.length} Dokumen`;
  btn.disabled = selected.length === 0;
}

function renderFileList() {
  fileList.innerHTML = '';
  sessionData.documents.forEach((doc, i) => {
    const label = document.createElement('label');
    label.className = 'file-item checked';
    label.htmlFor = `doc-cb-${i}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `doc-cb-${i}`;
    cb.dataset.index = i;
    cb.checked = true;
    cb.addEventListener('change', () => {
      label.classList.toggle('checked', cb.checked);
      updateSyncBtn();
    });

    const info = document.createElement('div');
    info.className = 'file-item-info';

    const title = document.createElement('span');
    title.className = 'file-item-title';
    title.textContent = doc.DocumentTitle || doc.FileName || `Dokumen ${i + 1}`;

    const sub = document.createElement('span');
    sub.className = 'file-item-sub';
    sub.textContent = doc.LetterNumber || doc.DocumentNumber || '';

    info.appendChild(title);
    info.appendChild(sub);
    label.appendChild(cb);
    label.appendChild(info);
    fileList.appendChild(label);
  });
}

selectAllBtn.addEventListener('click', () => {
  fileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
    cb.closest('.file-item').classList.add('checked');
  });
  updateSyncBtn();
});

deselectAllBtn.addEventListener('click', () => {
  fileList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.file-item').classList.remove('checked');
  });
  updateSyncBtn();
});

// ══════════════════════════════════════════
// UI state machine
// ══════════════════════════════════════════

function updateUI() {
  switch (appState) {
    case 'IDLE':
      statusVal.textContent = 'Ready';
      taxpayerIdVal.textContent = '-';
      docCountContainer.style.display = 'none';
      btnText.textContent = 'Verify & Start';
      btn.disabled = false;
      resetBtn.style.display = 'none';
      fileListContainer.style.display = 'none';
      break;
    case 'VERIFIED':
      statusVal.textContent = 'Verified';
      taxpayerIdVal.textContent = sessionData.taxpayerId.substring(0, 15) + '...';
      docCountContainer.style.display = 'flex';
      docCountVal.textContent = sessionData.documents.length;
      fileListContainer.style.display = 'block';
      renderFileList();
      updateSyncBtn();
      resetBtn.style.display = 'flex';
      break;
    case 'SYNCING':
      statusVal.textContent = 'Syncing...';
      btn.disabled = true;
      resetBtn.style.display = 'none';
      break;
    case 'FINISH':
      statusVal.textContent = 'Completed';
      btnText.textContent = 'Semua Dokumen Disync';
      btn.disabled = true;
      resetBtn.style.display = 'flex';
      resetBtn.children[0].textContent = 'Reset / New Session';
      break;
  }
}

function setBusy(isBusy) {
  btn.disabled = isBusy;
  loader.style.display = isBusy ? 'inline-block' : 'none';
}

// ══════════════════════════════════════════
// Coretax API
// ══════════════════════════════════════════

async function verifyCredentials() {
  setBusy(true);
  addLog('Memverifikasi sesi...', 'info');

  // Cek token masih valid sebelum lanjut
  try {
    const googleToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (t) => {
        if (chrome.runtime.lastError || !t) reject(chrome.runtime.lastError?.message || 'No token');
        else resolve(t);
      });
    });

    const meRes = await fetch('http://localhost:4000/auth/me', {
      headers: { 'Authorization': `Bearer ${googleToken}` }
    });

    if (!meRes.ok) throw new Error('Sesi tidak valid');
  } catch {
    chrome.identity.getAuthToken({ interactive: false }, (t) => {
      if (t) chrome.identity.removeCachedAuthToken({ token: t });
    });
    chrome.storage.local.remove('userInfo');
    addLog('Sesi kedaluwarsa. Silakan login kembali.', 'error');
    setBusy(false);
    showLoginScreen();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes('pajak.go.id')) {
    addLog('Error: Buka portal Coretax dahulu!', 'error');
    setBusy(false);
    return;
  }

  addLog('Memverifikasi kredensial Coretax...', 'info');

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const findByKeyPart = (part) => {
        for (let storage of [localStorage, sessionStorage]) {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key.includes(part)) return storage.getItem(key);
          }
        }
        return null;
      };
      const tokenData = findByKeyPart('cats-portal-angular-clientuser:');
      const userData  = findByKeyPart('cats-portal-angular-clientuserinfo:');
      return { tokenData, userData };
    }
  }, async (results) => {
    const res = results?.[0]?.result;
    if (res && res.tokenData) {
      try {
        const parsedToken = JSON.parse(res.tokenData);
        sessionData.accessToken = parsedToken.access_token;

        let tpId = 'Not Found';
        if (res.userData) {
          const u = JSON.parse(res.userData);
          tpId = u.taxpayer_id || u.profile?.taxpayer_id || u.sub || u.id || u.user_id || 'Not Found';
        }
        if (tpId === 'Not Found' || !tpId.includes('-')) {
          if (parsedToken.profile) tpId = parsedToken.profile.taxpayer_id || parsedToken.profile.sub || tpId;
        }
        sessionData.taxpayerId = tpId;

        addLog('Token ditemukan. Mengambil daftar dokumen...', 'info');
        const response = await fetch('https://coretaxdjp.pajak.go.id/documentmanagementportal/api/list/listTaxpayerDocuments', {
          method: 'POST',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'languageid': 'id-ID',
            'authorization': `Bearer ${sessionData.accessToken}`
          },
          body: JSON.stringify({ "TaxpayerAggregateIdentifier": sessionData.taxpayerId })
        });

        if (response.ok) {
          const result = await response.json();
          sessionData.documents = result.Payload?.Data || [];
          addLog(`Verifikasi berhasil! Ditemukan ${sessionData.documents.length} dokumen.`, 'success');
          appState = 'VERIFIED';
        } else {
          addLog('Gagal mengambil daftar dokumen.', 'error');
        }
      } catch (e) {
        addLog('Parsing kredensial gagal.', 'error');
      }
    } else {
      addLog('Kredensial tidak ditemukan. Pastikan Anda login.', 'error');
    }
    setBusy(false);
    updateUI();
  });
}

async function startSync() {
  const selectedDocs = getSelectedDocuments();
  if (selectedDocs.length === 0) return;

  appState = 'SYNCING';
  updateUI();
  setBusy(true);

  for (let i = 0; i < selectedDocs.length; i++) {
    const doc = selectedDocs[i];
    try {
      addLog(`[${i+1}/${selectedDocs.length}] Mensync ${doc.FileName || doc.DocumentTitle}`, 'info');
      const dlResponse = await fetch('https://coretaxdjp.pajak.go.id/documentmanagementportal/api/download', {
        method: 'POST',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'languageid': 'id-ID',
          'authorization': `Bearer ${sessionData.accessToken}`
        },
        body: JSON.stringify({
          "DocumentId": doc.DocumentNumber,
          "TaxpayerAggregateIdentifier": sessionData.taxpayerId,
          "IsNeedWatermark": true,
          "FormCallerName": "TaxpayerDocuments",
          "DocumentAggregateIdentifier": doc.AggregateIdentifier
        })
      });

      if (dlResponse.ok) {
        const contentType = dlResponse.headers.get('content-type');
        let blob;
        if (contentType && contentType.includes('application/json')) {
          const dlData = await dlResponse.json();
          const fileContent = dlData.Content || dlData.Payload?.Content;
          if (fileContent) blob = await (await fetch(`data:application/pdf;base64,${fileContent}`)).blob();
        } else {
          blob = await dlResponse.blob();
        }

        if (blob) {
          const url = URL.createObjectURL(blob);
          let cleanTitle  = (doc.DocumentTitle || 'Document').replace(/[/\\?%*:|"<>]/g, '-');
          let cleanNumber = (doc.LetterNumber || doc.DocumentNumber || '').replace(/[/\\?%*:|"<>]/g, '_');
          let finalFileName = `${cleanTitle} - ${cleanNumber}.pdf`.trim();
          chrome.downloads.download({ url: url, filename: finalFileName });
          addLog(`Berhasil: ${finalFileName}`, 'success');
        }
      } else {
        addLog(`Gagal sync: ${doc.DocumentTitle || doc.DocumentNumber}`, 'error');
      }
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      addLog(`Error: ${doc.FileName || doc.DocumentTitle} - ${e.message}`, 'error');
    }
  }

  addLog(`Selesai! ${selectedDocs.length} dokumen disync.`, 'success');
  appState = 'FINISH';
  setBusy(false);
  updateUI();
}

// ── Button events ──
btn.addEventListener('click', () => {
  if (appState === 'IDLE') verifyCredentials();
  else if (appState === 'VERIFIED') startSync();
});

resetBtn.addEventListener('click', () => {
  appState = 'IDLE';
  sessionData = { accessToken: null, taxpayerId: null, documents: [] };
  logs.innerHTML = '<div class="log-entry log-info">Session direset. Silakan Start kembali.</div>';
  updateUI();
});
