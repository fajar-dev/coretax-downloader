// ── Chrome API wrappers (promisified) ──

const ChromeAuth = {
  getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || 'Gagal mendapatkan token.'));
        } else {
          resolve(token);
        }
      });
    });
  },

  removeCachedToken(token) {
    return new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
  },
};

const ChromeStorage = {
  get: (key)        => new Promise(resolve => chrome.storage.local.get(key, resolve)),
  set: (key, value) => new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve)),
  remove: (key)     => new Promise(resolve => chrome.storage.local.remove(key, resolve)),
};

const ChromeTabs = {
  async getActive() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },

  async executeScript(tabId, func) {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func });
    return results?.[0]?.result;
  },
};

// ── Auth API ──

const AuthAPI = {
  async login(googleToken) {
    const res = await fetch(`${CONFIG.BASE_API}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: googleToken }),
    });
    return res.json();
  },

  async logout(googleToken) {
    await fetch(`${CONFIG.BASE_API}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${googleToken}` },
    });
  },

  async getMe(googleToken) {
    const res = await fetch(`${CONFIG.BASE_API}/auth/me`, {
      headers: { 'Authorization': `Bearer ${googleToken}` },
    });
    if (!res.ok) throw new Error('Sesi tidak valid.');
  },
};

// ── Coretax API ──

const CoretaxAPI = {
  _headers(accessToken) {
    return {
      'Accept':        'application/json, text/plain, */*',
      'Content-Type':  'application/json',
      'LanguageId':    'id-ID',
      'Authorization': `Bearer ${accessToken}`,
    };
  },

  async listDocuments(accessToken, taxpayerId) {
    const res = await fetch(`${CONFIG.CORETAX_API}/list/listTaxpayerDocuments`, {
      method: 'POST',
      headers: this._headers(accessToken),
      body: JSON.stringify({
        TaxpayerAggregateIdentifier: taxpayerId,
        Filters: [
          {
            PropertyName: "DocumentTypeConfigurationName",
            Value: "Bukti Potong PPh Pasal",
            MatchMode: "startsWith",
            CaseSensitive: false,
            AsString: true
          }
        ],
      }),
    });
    if (!res.ok) throw new Error('Gagal mengambil daftar dokumen.');
    const data = await res.json();
    return data.Payload?.Data || [];
  },

  async downloadDocument(accessToken, taxpayerId, doc) {
    const res = await fetch(`${CONFIG.CORETAX_API}/download`, {
      method: 'POST',
      headers: this._headers(accessToken),
      body: JSON.stringify({
        DocumentId:                    doc.DocumentNumber,
        TaxpayerAggregateIdentifier:   taxpayerId,
        IsNeedWatermark:               true,
        FormCallerName:                'TaxpayerDocuments',
        DocumentAggregateIdentifier:   doc.AggregateIdentifier,
      }),
    });
    if (!res.ok) throw new Error('Gagal mengunduh dokumen dari Coretax.');

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data   = await res.json();
      const base64 = data.Content || data.Payload?.Content;
      if (!base64) return null;
      return fetch(`data:application/pdf;base64,${base64}`).then(r => r.blob());
    }
    return res.blob();
  },
};

// ── Upload API ──

const UploadAPI = {
  // files: Array<{ blob: Blob, fileName: string }>
  async upload(googleToken, files) {
    const formData = new FormData();
    for (const { blob, fileName } of files) {
      formData.append('files', blob, fileName);
    }
    const res = await fetch(`${CONFIG.BASE_API}/sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${googleToken}` },
      body: formData,
    });
    return res.json();
  },
};

// ── Coretax credential helpers ──
// NOTE: extractCoretaxCredentials runs inside the page context via chrome.scripting,
// so it must not reference any outer scope variables.

function extractCoretaxCredentials() {
  const findByKeyPart = (part) => {
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key.includes(part)) return storage.getItem(key);
      }
    }
    return null;
  };
  return {
    tokenData: findByKeyPart('cats-portal-angular-clientuser:'),
    userData:  findByKeyPart('cats-portal-angular-clientuserinfo:'),
  };
}

function parseTaxpayerId(parsedToken, rawUserData) {
  let tpId = 'Not Found';
  if (rawUserData) {
    const u = JSON.parse(rawUserData);
    tpId = u.taxpayer_id || u.profile?.taxpayer_id || u.sub || u.id || u.user_id || 'Not Found';
  }
  if (!tpId || !tpId.includes('-')) {
    tpId = parsedToken.profile?.taxpayer_id || parsedToken.profile?.sub || tpId;
  }
  return tpId;
}
