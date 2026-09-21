/* App shell: tab navigation, global state, mounting */

const App = {
  state: {
    activeTab: 'dashboard',
    parts: [],
    runs: [],
    audits: [],
    eightDs: [],
    mappingProfiles: [],
    selectedPartId: null,
  },
  els: {},
};

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'auditor', label: 'Routine Auditor', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'ingestion', label: 'Data Ingestion', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10' },
  { id: 'spc', label: 'SPC & Capability', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'eightd', label: '8D / 5-Why', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
];

async function loadAllData() {
  const [parts, runs, audits, eightDs, mappingProfiles] = await Promise.all([
    DB.dbGetAll('parts'), DB.dbGetAll('runs'), DB.dbGetAll('audits'), DB.dbGetAll('eightDs'), DB.dbGetAll('mappingProfiles'),
  ]);
  App.state.parts = parts.sort((a, b) => (a.partNumber || '').localeCompare(b.partNumber || ''));
  App.state.runs = runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  App.state.audits = audits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  App.state.eightDs = eightDs.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  App.state.mappingProfiles = mappingProfiles;
}

function getPart(id) {
  return App.state.parts.find(p => p.id === id) || null;
}

function switchTab(tabId) {
  App.state.activeTab = tabId;
  renderShell();
}

function renderNav() {
  return `
    <nav class="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 sm:px-4">
      ${TABS.map(t => `
        <button data-tab="${t.id}" class="tab-btn flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${App.state.activeTab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${t.icon}"/></svg>
          <span class="whitespace-nowrap">${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function renderShell() {
  const root = App.els.root;
  root.innerHTML = `
    <header class="bg-slate-900 text-white px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-sm">QE</div>
        <div>
          <div class="font-semibold leading-tight">QE Data Software</div>
          <div class="text-xs text-slate-400 leading-tight">CMM Metrology &amp; Quality Engineering Workbench</div>
        </div>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <button id="btn-export-all" class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors">Backup Data</button>
        <label class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors cursor-pointer">
          Restore Data
          <input type="file" id="input-restore-all" accept="application/json" class="hidden" />
        </label>
      </div>
    </header>
    ${renderNav()}
    <main id="view-root" class="p-3 sm:p-6 max-w-7xl mx-auto w-full"></main>
  `;

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('btn-export-all').addEventListener('click', handleExportAll);
  document.getElementById('input-restore-all').addEventListener('change', handleRestoreAll);

  renderActiveView();
}

async function renderActiveView() {
  const viewRoot = document.getElementById('view-root');
  switch (App.state.activeTab) {
    case 'dashboard': return Views.Dashboard.render(viewRoot);
    case 'auditor': return Views.Auditor.render(viewRoot);
    case 'ingestion': return Views.Ingestion.render(viewRoot);
    case 'spc': return Views.SPC.render(viewRoot);
    case 'eightd': return Views.EightD.render(viewRoot);
    default: viewRoot.innerHTML = '<p>Unknown view</p>';
  }
}

async function refreshAndRerender() {
  await loadAllData();
  renderActiveView();
}

async function handleExportAll() {
  const payload = await DB.dbExportAll();
  payload.__meta = { exportedAt: Utils.nowISO(), app: 'QE Data Software', version: 1 };
  Utils.downloadFile(`qe-data-software-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

async function handleRestoreAll(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const payload = JSON.parse(text);
    if (!confirm('Restoring will merge this backup into your current local database (existing records with matching IDs will be overwritten). Continue?')) {
      e.target.value = '';
      return;
    }
    await DB.dbImportAll(payload);
    await refreshAndRerender();
    alert('Backup restored successfully.');
  } catch (err) {
    alert('Could not read backup file: ' + err.message);
  }
  e.target.value = '';
}

window.App = App;
window.getPart = getPart;
window.refreshAndRerender = refreshAndRerender;

document.addEventListener('DOMContentLoaded', async () => {
  App.els.root = document.getElementById('app-root');
  await loadAllData();
  renderShell();
});
