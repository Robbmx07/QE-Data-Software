/* Module 2: PC-DMIS Routine & Vector Logic Auditor UI */

window.Views = window.Views || {};

const Auditor = (() => {
  let lastResult = null;
  let selectedPartId = '';

  const SAMPLE = `ALIGNMENT/START,RECALL:NONE
A1=FEAT/PLANE,CARTESIAN,DATUM,NO
MEAS/PLANE,F(A1),3
HIT/BASIC,0,0,0,0,0,1
HIT/BASIC,50,0,0,0,0,1
HIT/BASIC,0,50,0,0,0,-1
ENDMEAS
ALIGNMENT/LEVEL,ZPLUS,A1
A2=FEAT/LINE,CARTESIAN,DATUM,NO
MEAS/LINE,F(A2),2
HIT/BASIC,0,0,0,1,0,0
HIT/BASIC,0,100,0,1,0,0
ENDMEAS
ALIGNMENT/ROTATE,XAXIS,XPLUS,A2
ALIGNMENT/END

DIM1=DEPEND/VAR,DIM1/DIM1
'TEMP - ignore this section, left in from debug build
TOL/POS,MMC,0.25,DATA,A1,A2`;

  function runAudit(text) {
    lastResult = PCDMISAuditor.auditRoutine(text);
    render();
  }

  async function saveAudit() {
    if (!lastResult) return;
    const text = document.getElementById('routine-input')?.value || '';
    const name = prompt('Name this audit (e.g. part number / program name):', selectedPartId ? (getPart(selectedPartId)?.partNumber || '') : '');
    if (name === null) return;
    const record = {
      id: Utils.uid('audit'),
      partId: selectedPartId || null,
      name: name || 'Untitled audit',
      text,
      score: lastResult.score,
      rating: lastResult.rating,
      findings: lastResult.findings,
      stats: lastResult.stats,
      createdAt: Utils.nowISO(),
    };
    await DB.dbPut('audits', record);
    await refreshAndRerender();
    alert('Audit saved to history.');
  }

  function severityBadge(sev) {
    const map = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-amber-100 text-amber-700',
      low: 'bg-slate-100 text-slate-600',
    };
    return `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${map[sev] || map.low}">${sev}</span>`;
  }

  function scoreColor(score) {
    if (score >= 90) return 'text-emerald-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  }

  function resultHtml() {
    if (!lastResult) {
      return `<div class="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
        Paste or upload a PC-DMIS routine and click "Audit Routine" to see the code health score and risk advisory here.
      </div>`;
    }
    const r = lastResult;
    return `
      <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 flex flex-wrap items-center gap-6">
          <div>
            <div class="text-xs uppercase text-slate-500 font-medium">Code Health Score</div>
            <div class="text-4xl font-bold ${scoreColor(r.score)}">${r.score}<span class="text-lg text-slate-400">/100</span></div>
          </div>
          <div>
            <div class="text-xs uppercase text-slate-500 font-medium">Rating</div>
            <div class="text-lg font-semibold ${scoreColor(r.score)}">${r.rating}</div>
          </div>
          <div class="flex gap-4 ml-auto text-sm">
            <div class="text-center"><div class="font-bold text-red-600">${r.stats.highCount}</div><div class="text-xs text-slate-500">High</div></div>
            <div class="text-center"><div class="font-bold text-amber-600">${r.stats.mediumCount}</div><div class="text-xs text-slate-500">Medium</div></div>
            <div class="text-center"><div class="font-bold text-slate-500">${r.stats.lowCount}</div><div class="text-xs text-slate-500">Low</div></div>
          </div>
          <button id="btn-save-audit" class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">Save to History</button>
        </div>
        <div class="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
          ${r.findings.length === 0 ? `<div class="p-5 text-center text-emerald-600 font-medium">No risks detected by the heuristic scan. Always confirm alignment and vector logic against the CAD/print.</div>` : ''}
          ${r.findings.map(f => `
            <div class="p-4">
              <div class="flex items-center gap-2 mb-1">
                ${severityBadge(f.severity)}
                <span class="text-xs font-medium text-slate-500">${Utils.escapeHtml(f.category)}</span>
                ${f.line ? `<span class="text-xs text-slate-400 ml-auto">line ${f.line}</span>` : ''}
              </div>
              <div class="text-sm text-slate-800">${Utils.escapeHtml(f.message)}</div>
              ${f.snippet ? `<code class="block mt-1.5 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 overflow-x-auto whitespace-pre">${Utils.escapeHtml(f.snippet)}</code>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function historyHtml() {
    const audits = App.state.audits;
    return `
      <div class="bg-white rounded-lg border border-slate-200 mt-6">
        <div class="px-5 py-3 border-b border-slate-200"><h3 class="font-semibold text-slate-800">Audit History</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th class="text-left px-4 py-2 font-medium">Name</th>
                <th class="text-left px-4 py-2 font-medium">Part</th>
                <th class="text-left px-4 py-2 font-medium">Score</th>
                <th class="text-left px-4 py-2 font-medium">Findings</th>
                <th class="text-left px-4 py-2 font-medium">Date</th>
                <th class="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${audits.length === 0 ? `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">No saved audits yet.</td></tr>` : ''}
              ${audits.map(a => {
                const part = a.partId ? getPart(a.partId) : null;
                return `
                  <tr class="border-t border-slate-100">
                    <td class="px-4 py-2.5 text-slate-800">${Utils.escapeHtml(a.name)}</td>
                    <td class="px-4 py-2.5 text-slate-600">${part ? Utils.escapeHtml(part.partNumber) : '—'}</td>
                    <td class="px-4 py-2.5 font-semibold ${scoreColor(a.score)}">${a.score}</td>
                    <td class="px-4 py-2.5 text-slate-600">${a.findings.length}</td>
                    <td class="px-4 py-2.5 text-xs text-slate-500">${Utils.formatDate(a.createdAt)}</td>
                    <td class="px-4 py-2.5 text-right">
                      <button data-load-audit="${a.id}" class="text-blue-600 hover:underline text-xs mr-3">Reload</button>
                      <button data-delete-audit="${a.id}" class="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    document.getElementById('routine-input').value = text;
  }

  function render(container) {
    container = container || document.getElementById('view-root');
    const parts = App.state.parts;
    container.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white rounded-lg border border-slate-200 p-5">
          <div class="flex items-start justify-between flex-wrap gap-3 mb-3">
            <div>
              <h3 class="font-semibold text-slate-800">PC-DMIS Routine &amp; Vector Logic Auditor</h3>
              <p class="text-sm text-slate-500 mt-1">Paste an exported PC-DMIS program listing (or upload a .txt/.prg file). The scanner checks alignment DOF coverage, 3-2-1 stability, hit-vector integrity/flips, and DEPEND/VAR calculation risks.</p>
            </div>
            <div class="flex items-center gap-2">
              <select id="audit-part-select" class="border border-slate-300 rounded px-2 py-1.5 text-xs">
                <option value="">Link to part (optional)</option>
                ${parts.map(p => `<option value="${p.id}" ${selectedPartId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.partNumber)}</option>`).join('')}
              </select>
            </div>
          </div>
          <textarea id="routine-input" rows="12" class="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono" placeholder="Paste PC-DMIS routine text here...">${lastResult ? Utils.escapeHtml(document.getElementById('routine-input')?.value || '') : ''}</textarea>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <button id="btn-audit" class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Audit Routine</button>
            <label class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer">
              Upload File
              <input type="file" id="routine-file" accept=".txt,.prg,.dmi,.dme" class="hidden" />
            </label>
            <button id="btn-load-sample" class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Load Sample Routine</button>
            <button id="btn-clear-routine" class="px-4 py-2 text-sm rounded text-slate-500 hover:bg-slate-50">Clear</button>
          </div>
        </div>

        ${resultHtml()}
        ${historyHtml()}
      </div>
    `;

    document.getElementById('audit-part-select')?.addEventListener('change', (e) => { selectedPartId = e.target.value; });
    document.getElementById('btn-audit')?.addEventListener('click', () => {
      const text = document.getElementById('routine-input').value;
      if (!text.trim()) { alert('Paste or upload routine text first.'); return; }
      runAudit(text);
    });
    document.getElementById('routine-file')?.addEventListener('change', handleFileUpload);
    document.getElementById('btn-load-sample')?.addEventListener('click', () => {
      document.getElementById('routine-input').value = SAMPLE;
    });
    document.getElementById('btn-clear-routine')?.addEventListener('click', () => {
      document.getElementById('routine-input').value = '';
      lastResult = null;
      render(container);
    });
    document.getElementById('btn-save-audit')?.addEventListener('click', saveAudit);
    container.querySelectorAll('[data-load-audit]').forEach(btn => btn.addEventListener('click', () => {
      const a = App.state.audits.find(x => x.id === btn.dataset.loadAudit);
      if (!a) return;
      selectedPartId = a.partId || '';
      lastResult = { score: a.score, rating: a.rating, findings: a.findings, stats: a.stats };
      render(container);
      document.getElementById('routine-input').value = a.text;
    }));
    container.querySelectorAll('[data-delete-audit]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this saved audit?')) return;
      await DB.dbDelete('audits', btn.dataset.deleteAudit);
      await refreshAndRerender();
    }));
  }

  return { render };
})();

window.Views.Auditor = Auditor;
