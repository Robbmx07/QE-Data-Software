/* Module 1: Dashboard & Part / Program Master Database */

window.Views = window.Views || {};

const PartMaster = (() => {
  let editingPart = null; // draft object while add/edit modal is open
  let modalOpen = false;

  function blankPart() {
    return {
      id: Utils.uid('part'),
      partNumber: '',
      revision: '',
      description: '',
      programId: '',
      characteristics: [],
      createdAt: Utils.nowISO(),
      updatedAt: Utils.nowISO(),
    };
  }

  function blankChar() {
    return { id: Utils.uid('char'), label: '', nominal: '', tolPlus: '', tolMinus: '', unit: 'mm', type: 'linear' };
  }

  function openEditor(partId) {
    const existing = partId ? getPart(partId) : null;
    editingPart = existing ? JSON.parse(JSON.stringify(existing)) : blankPart();
    if (editingPart.characteristics.length === 0) editingPart.characteristics.push(blankChar());
    modalOpen = true;
    render();
  }

  function closeEditor() {
    modalOpen = false;
    editingPart = null;
    render();
  }

  function readFormIntoDraft() {
    if (!editingPart) return;
    editingPart.partNumber = document.getElementById('f-partNumber')?.value.trim() || '';
    editingPart.revision = document.getElementById('f-revision')?.value.trim() || '';
    editingPart.description = document.getElementById('f-description')?.value.trim() || '';
    editingPart.programId = document.getElementById('f-programId')?.value.trim() || '';
    editingPart.characteristics.forEach((c, i) => {
      c.label = document.getElementById(`c-label-${i}`)?.value.trim() || '';
      c.nominal = document.getElementById(`c-nominal-${i}`)?.value.trim() || '';
      c.tolPlus = document.getElementById(`c-tolPlus-${i}`)?.value.trim() || '';
      c.tolMinus = document.getElementById(`c-tolMinus-${i}`)?.value.trim() || '';
      c.unit = document.getElementById(`c-unit-${i}`)?.value.trim() || 'mm';
      c.type = document.getElementById(`c-type-${i}`)?.value || 'linear';
    });
  }

  function addCharRow() {
    readFormIntoDraft();
    editingPart.characteristics.push(blankChar());
    render();
  }

  function removeCharRow(idx) {
    readFormIntoDraft();
    editingPart.characteristics.splice(idx, 1);
    render();
  }

  async function savePart() {
    readFormIntoDraft();
    if (!editingPart.partNumber) {
      alert('Part Number is required.');
      return;
    }
    editingPart.characteristics = editingPart.characteristics.filter(c => c.label);
    editingPart.updatedAt = Utils.nowISO();
    await DB.dbPut('parts', editingPart);
    await refreshAndRerender();
    closeEditor();
  }

  async function deletePart(partId) {
    if (!confirm('Delete this part and all its characteristics? Historical runs will remain but become unlinked. This cannot be undone.')) return;
    await DB.dbDelete('parts', partId);
    await refreshAndRerender();
  }

  function modalHtml() {
    if (!modalOpen || !editingPart) return '';
    const p = editingPart;
    return `
      <div id="part-modal-backdrop" class="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl my-4">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-800">${p.createdAt === p.updatedAt ? 'New Part Record' : 'Edit Part Record'}</h3>
            <button id="btn-close-modal" class="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
          </div>
          <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Part Number *</label>
                <input id="f-partNumber" value="${Utils.escapeHtml(p.partNumber)}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="e.g. 10245-B" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Revision Level</label>
                <input id="f-revision" value="${Utils.escapeHtml(p.revision)}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="e.g. Rev C" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">CMM Program ID</label>
                <input id="f-programId" value="${Utils.escapeHtml(p.programId)}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="e.g. 10245B_FINAL.PRG" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <input id="f-description" value="${Utils.escapeHtml(p.description)}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Short description" />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold text-slate-700">Characteristics (Nominals &amp; Tolerances)</h4>
                <button id="btn-add-char" type="button" class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100">+ Add Characteristic</button>
              </div>
              <div class="overflow-x-auto border border-slate-200 rounded">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th class="text-left px-2 py-2 font-medium">Label</th>
                      <th class="text-left px-2 py-2 font-medium w-24">Nominal</th>
                      <th class="text-left px-2 py-2 font-medium w-20">Tol +</th>
                      <th class="text-left px-2 py-2 font-medium w-20">Tol -</th>
                      <th class="text-left px-2 py-2 font-medium w-20">Unit</th>
                      <th class="text-left px-2 py-2 font-medium w-28">Type</th>
                      <th class="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${p.characteristics.map((c, i) => `
                      <tr class="border-t border-slate-100">
                        <td class="px-2 py-1.5"><input id="c-label-${i}" value="${Utils.escapeHtml(c.label)}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="e.g. DIA_1" /></td>
                        <td class="px-2 py-1.5"><input id="c-nominal-${i}" value="${Utils.escapeHtml(c.nominal)}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="0.000" /></td>
                        <td class="px-2 py-1.5"><input id="c-tolPlus-${i}" value="${Utils.escapeHtml(c.tolPlus)}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="0.005" /></td>
                        <td class="px-2 py-1.5"><input id="c-tolMinus-${i}" value="${Utils.escapeHtml(c.tolMinus)}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="0.005" /></td>
                        <td class="px-2 py-1.5"><input id="c-unit-${i}" value="${Utils.escapeHtml(c.unit)}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="mm" /></td>
                        <td class="px-2 py-1.5">
                          <select id="c-type-${i}" class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                            <option value="linear" ${c.type === 'linear' ? 'selected' : ''}>Linear +/-</option>
                            <option value="gdt" ${c.type === 'gdt' ? 'selected' : ''}>GD&amp;T</option>
                            <option value="basic" ${c.type === 'basic' ? 'selected' : ''}>Basic (ref only)</option>
                          </select>
                        </td>
                        <td class="px-2 py-1.5 text-center">
                          <button data-remove-char="${i}" type="button" class="text-slate-400 hover:text-red-600" title="Remove row">&times;</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
            <button id="btn-cancel-part" class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
            <button id="btn-save-part" class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save Part Record</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindModalEvents() {
    if (!modalOpen) return;
    document.getElementById('btn-close-modal')?.addEventListener('click', closeEditor);
    document.getElementById('btn-cancel-part')?.addEventListener('click', closeEditor);
    document.getElementById('btn-save-part')?.addEventListener('click', savePart);
    document.getElementById('btn-add-char')?.addEventListener('click', addCharRow);
    document.querySelectorAll('[data-remove-char]').forEach(btn => {
      btn.addEventListener('click', () => removeCharRow(parseInt(btn.dataset.removeChar, 10)));
    });
  }

  function statCard(label, value, accent) {
    return `
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-xs uppercase tracking-wide text-slate-500 font-medium">${label}</div>
        <div class="text-2xl font-bold mt-1 ${accent || 'text-slate-800'}">${value}</div>
      </div>
    `;
  }

  function render() {
    const container = document.getElementById('view-root');
    if (!container) return;
    const parts = App.state.parts;
    const runs = App.state.runs;
    const eightDs = App.state.eightDs;

    let totalResults = 0, outOfSpec = 0;
    runs.forEach(r => (r.results || []).forEach(res => { totalResults++; if (res.outOfTol) outOfSpec++; }));
    const oosRate = totalResults ? ((outOfSpec / totalResults) * 100).toFixed(1) + '%' : '—';
    const openEightDs = eightDs.filter(d => d.status !== 'closed').length;

    const recentRuns = runs.slice(0, 8);

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${statCard('Part Records', parts.length)}
          ${statCard('Inspection Runs', runs.length)}
          ${statCard('Out-of-Spec Rate', oosRate, outOfSpec > 0 ? 'text-red-600' : 'text-emerald-600')}
          ${statCard('Open 8D Investigations', openEightDs, openEightDs > 0 ? 'text-amber-600' : 'text-emerald-600')}
        </div>

        <div class="bg-white rounded-lg border border-slate-200">
          <div class="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-semibold text-slate-800">Part &amp; Program Master</h3>
            <button id="btn-new-part" class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">+ New Part Record</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th class="text-left px-4 py-2 font-medium">Part Number</th>
                  <th class="text-left px-4 py-2 font-medium">Rev</th>
                  <th class="text-left px-4 py-2 font-medium">Program ID</th>
                  <th class="text-left px-4 py-2 font-medium">Characteristics</th>
                  <th class="text-left px-4 py-2 font-medium">Updated</th>
                  <th class="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${parts.length === 0 ? `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">No part records yet. Click "New Part Record" to add your first part.</td></tr>` : ''}
                ${parts.map(p => `
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-2.5 font-medium text-slate-800">${Utils.escapeHtml(p.partNumber)}</td>
                    <td class="px-4 py-2.5 text-slate-600">${Utils.escapeHtml(p.revision) || '—'}</td>
                    <td class="px-4 py-2.5 text-slate-600">${Utils.escapeHtml(p.programId) || '—'}</td>
                    <td class="px-4 py-2.5 text-slate-600">${(p.characteristics || []).length}</td>
                    <td class="px-4 py-2.5 text-slate-500 text-xs">${Utils.formatDate(p.updatedAt)}</td>
                    <td class="px-4 py-2.5 text-right">
                      <button data-edit-part="${p.id}" class="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                      <button data-delete-part="${p.id}" class="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-slate-200">
          <div class="px-4 sm:px-5 py-3 border-b border-slate-200">
            <h3 class="font-semibold text-slate-800">Recent Inspection Runs</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th class="text-left px-4 py-2 font-medium">Timestamp</th>
                  <th class="text-left px-4 py-2 font-medium">Part</th>
                  <th class="text-left px-4 py-2 font-medium">Serial</th>
                  <th class="text-left px-4 py-2 font-medium">Results</th>
                  <th class="text-left px-4 py-2 font-medium">Out-of-Spec</th>
                </tr>
              </thead>
              <tbody>
                ${recentRuns.length === 0 ? `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">No inspection runs ingested yet. Use the Data Ingestion tab to import a CSV/TXT log.</td></tr>` : ''}
                ${recentRuns.map(r => {
                  const part = getPart(r.partId);
                  const oos = (r.results || []).filter(x => x.outOfTol).length;
                  return `
                    <tr class="border-t border-slate-100">
                      <td class="px-4 py-2.5 text-slate-500 text-xs">${Utils.formatDate(r.timestamp)}</td>
                      <td class="px-4 py-2.5 text-slate-700">${part ? Utils.escapeHtml(part.partNumber) : '<span class="text-slate-400">Unlinked</span>'}</td>
                      <td class="px-4 py-2.5 text-slate-600">${Utils.escapeHtml(r.serial) || '—'}</td>
                      <td class="px-4 py-2.5 text-slate-600">${(r.results || []).length}</td>
                      <td class="px-4 py-2.5">${oos > 0 ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">${oos} flagged</span>` : `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">All in spec</span>`}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ${modalHtml()}
    `;

    document.getElementById('btn-new-part')?.addEventListener('click', () => openEditor(null));
    document.querySelectorAll('[data-edit-part]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.editPart)));
    document.querySelectorAll('[data-delete-part]').forEach(btn => btn.addEventListener('click', () => deletePart(btn.dataset.deletePart)));
    bindModalEvents();
  }

  return { render: (container) => render(), openEditor };
})();

window.Views.Dashboard = PartMaster;
