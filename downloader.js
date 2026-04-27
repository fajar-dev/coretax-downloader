const btn = document.getElementById('btn');
const btnText = document.getElementById('btn-text');
const resetBtn = document.getElementById('reset-btn');
const loader = document.getElementById('loader');
const statusVal = document.getElementById('status-val');
const taxpayerIdVal = document.getElementById('taxpayer-id-val');
const docCountContainer = document.getElementById('doc-count-container');
const docCountVal = document.getElementById('doc-count-val');
const logs = document.getElementById('logs');

let appState = 'IDLE'; // IDLE, VERIFIED, DOWNLOADING, FINISH
let sessionData = {
  accessToken: null,
  taxpayerId: null,
  documents: []
};

function addLog(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-entry log-${type}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.prepend(div);
}

function updateUI() {
  switch (appState) {
    case 'IDLE':
      statusVal.textContent = 'Ready';
      taxpayerIdVal.textContent = '-';
      docCountContainer.style.display = 'none';
      btnText.textContent = 'Verify & Start';
      btn.disabled = false;
      resetBtn.style.display = 'none';
      break;
    case 'VERIFIED':
      statusVal.textContent = 'Verified';
      taxpayerIdVal.textContent = sessionData.taxpayerId.substring(0, 15) + '...';
      docCountContainer.style.display = 'flex';
      docCountVal.textContent = sessionData.documents.length;
      btnText.textContent = `Download ${sessionData.documents.length} Documents`;
      btn.disabled = false;
      resetBtn.style.display = 'flex';
      break;
    case 'DOWNLOADING':
      statusVal.textContent = 'Downloading...';
      btn.disabled = true;
      resetBtn.style.display = 'none';
      break;
    case 'FINISH':
      statusVal.textContent = 'Completed';
      btnText.textContent = 'All Documents Downloaded';
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

async function verifyCredentials() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes('pajak.go.id')) {
    addLog('Error: Buka portal Coretax dahulu!', 'error');
    return;
  }

  setBusy(true);
  addLog('Memverifikasi kredensial...', 'info');

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
      const userData = findByKeyPart('cats-portal-angular-clientuserinfo:');
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
        addLog('Parsing krendensial gagal.', 'error');
      }
    } else {
      addLog('Kredensial tidak ditemukan. Pastikan Anda login.', 'error');
    }
    setBusy(false);
    updateUI();
  });
}

async function startDownload() {
  appState = 'DOWNLOADING';
  updateUI();
  setBusy(true);

  for (let i = 0; i < sessionData.documents.length; i++) {
    const doc = sessionData.documents[i];
    try {
      addLog(`[${i+1}/${sessionData.documents.length}] Mendownload ${doc.FileName}`, 'info');
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
          
          // Generate a better filename
          let cleanTitle = (doc.DocumentTitle || 'Document').replace(/[/\\?%*:|"<>]/g, '-');
          let cleanNumber = (doc.LetterNumber || doc.DocumentNumber || '').replace(/[/\\?%*:|"<>]/g, '_');
          let finalFileName = `${cleanTitle} - ${cleanNumber}.pdf`.trim();
          
          chrome.downloads.download({ url: url, filename: finalFileName });
        }
      }
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      addLog(`Error: ${doc.FileName} - ${e.message}`, 'error');
    }
  }

  addLog('Semua dokumen berhasil diproses!', 'success');
  appState = 'FINISH';
  setBusy(false);
  updateUI();
}

btn.addEventListener('click', () => {
  if (appState === 'IDLE') verifyCredentials();
  else if (appState === 'VERIFIED') startDownload();
});

resetBtn.addEventListener('click', () => {
  appState = 'IDLE';
  sessionData = { accessToken: null, taxpayerId: null, documents: [] };
  logs.innerHTML = '<div class="log-entry log-info">Session direset. Silakan Start kembali.</div>';
  updateUI();
});

updateUI();