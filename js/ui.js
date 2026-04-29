// ── DOM refs ──

const DOM = {
  loginScreen:       document.getElementById('login-screen'),
  loginStatus:       document.getElementById('login-status'),
  googleLoginBtn:    document.getElementById('google-login-btn'),
  mainScreen:        document.getElementById('main-screen'),
  loggedInAs:        document.getElementById('logged-in-as'),
  logoutBtn:         document.getElementById('logout-btn'),
  btn:               document.getElementById('btn'),
  btnText:           document.getElementById('btn-text'),
  resetBtn:          document.getElementById('reset-btn'),
  loader:            document.getElementById('loader'),
  statusVal:         document.getElementById('status-val'),
  taxpayerIdVal:     document.getElementById('taxpayer-id-val'),
  docCountContainer: document.getElementById('doc-count-container'),
  docCountVal:       document.getElementById('doc-count-val'),
  logs:              document.getElementById('logs'),
  fileListContainer: document.getElementById('file-list-container'),
  fileList:          document.getElementById('file-list'),
  selectionCount:    document.getElementById('selection-count'),
  selectAllBtn:      document.getElementById('select-all-btn'),
  deselectAllBtn:    document.getElementById('deselect-all-btn'),
  actionRow:   document.getElementById('action-row'),
  syncBtn:     document.getElementById('sync-btn'),
  syncLoader:  document.getElementById('sync-loader'),
  saveBtn:     document.getElementById('save-btn'),
  saveLoader:  document.getElementById('save-loader'),
};

// ── Logging ──

function addLog(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  DOM.logs.prepend(entry);
}

// ── File list ──

function getSelectedDocuments(documents) {
  return Array.from(DOM.fileList.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => documents[parseInt(cb.dataset.index)]);
}

function updateSyncBtn(documents) {
  const selected = getSelectedDocuments(documents);
  DOM.selectionCount.textContent = `Memilih ${selected.length} dari ${documents.length} dokumen`;
  const none = selected.length === 0;
  DOM.btn.disabled     = none;
  DOM.syncBtn.disabled = none;
  DOM.saveBtn.disabled = none;
}

function renderFileList(documents) {
  DOM.fileList.innerHTML = '';
  documents.forEach((doc, i) => {
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
      updateSyncBtn(documents);
    });

    const title = document.createElement('span');
    title.className = 'file-item-title';
    title.textContent = doc.DocumentTitle || doc.FileName || `Dokumen ${i + 1}`;

    const sub = document.createElement('span');
    sub.className = 'file-item-sub';
    sub.textContent = doc.LetterNumber || doc.DocumentNumber || '';

    const info = document.createElement('div');
    info.className = 'file-item-info';
    info.append(title, sub);

    label.append(cb, info);
    DOM.fileList.appendChild(label);
  });
}

// ── UI state machine ──

// target: 'verify' | 'sync' | 'save'
function setBusy(isBusy, target = 'verify') {
  if (target === 'verify') {
    DOM.btn.disabled         = isBusy;
    DOM.loader.style.display = isBusy ? 'inline-block' : 'none';
  } else if (target === 'sync') {
    DOM.syncBtn.disabled         = isBusy;
    DOM.saveBtn.disabled         = isBusy;
    DOM.syncLoader.style.display = isBusy ? 'inline-block' : 'none';
  } else if (target === 'save') {
    DOM.saveBtn.disabled         = isBusy;
    DOM.syncBtn.disabled         = isBusy;
    DOM.saveLoader.style.display = isBusy ? 'inline-block' : 'none';
  }
}

function applyState(state, session) {
  switch (state) {
    case STATE.IDLE:
      DOM.statusVal.textContent           = 'Ready';
      DOM.taxpayerIdVal.textContent       = '-';
      DOM.docCountContainer.style.display = 'none';
      DOM.btnText.textContent             = 'Verify & Start';
      DOM.btn.disabled                    = false;
      DOM.btn.style.display               = 'flex';
      DOM.actionRow.style.display         = 'none';
      DOM.resetBtn.style.display          = 'none';
      DOM.fileListContainer.style.display = 'none';
      break;

    case STATE.VERIFIED:
      DOM.statusVal.textContent           = 'Verified';
      DOM.taxpayerIdVal.textContent       = session.taxpayerId.substring(0, 15) + '...';
      DOM.docCountContainer.style.display = 'flex';
      DOM.docCountVal.textContent         = session.documents.length;
      DOM.fileListContainer.style.display = 'block';
      renderFileList(session.documents);
      updateSyncBtn(session.documents);
      DOM.btn.style.display               = 'none';
      DOM.actionRow.style.display         = 'flex';
      DOM.resetBtn.style.display          = 'flex';
      break;

    case STATE.SYNCING:
      DOM.statusVal.textContent  = 'Syncing...';
      DOM.resetBtn.style.display = 'none';
      break;

    case STATE.FINISH:
      DOM.statusVal.textContent            = 'Completed';
      DOM.btn.style.display                = 'none';
      DOM.actionRow.style.display          = 'flex';
      DOM.syncBtn.disabled                 = true;
      DOM.saveBtn.disabled                 = false;
      DOM.resetBtn.style.display           = 'flex';
      DOM.resetBtn.children[0].textContent = 'Reset / New Session';
      break;
  }
}

// ── Screen transitions ──

function showLoginScreen() {
  DOM.loginScreen.style.display = 'flex';
  DOM.mainScreen.style.display  = 'none';
  DOM.loginStatus.textContent   = '';
  DOM.loginStatus.className     = '';
  DOM.googleLoginBtn.disabled   = false;
}

function showMainScreen(user) {
  DOM.loginScreen.style.display = 'none';
  DOM.mainScreen.style.display  = 'block';
  DOM.loggedInAs.textContent    = `${user.name} · ${user.email}`;
  applyState(STATE.IDLE, null);
}

function setLoginStatus(msg, className = '') {
  DOM.loginStatus.className   = className;
  DOM.loginStatus.textContent = msg;
}
