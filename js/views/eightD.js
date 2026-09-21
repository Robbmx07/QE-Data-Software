/* Module 5: Automated 8D & 5-Why Root Cause Assistant */

window.Views = window.Views || {};

const EightD = (() => {
  let editingRecord = null;
  let modalOpen = false;

  function blankBranch(label) {
    return { id: Utils.uid('branch'), label: label || 'Branch', whys: ['', '', '', '', ''] };
  }

  function blankRecord() {
    return {
      id: Utils.uid('8d'),
      partId: '', runId: '', charId: '',
      title: '',
      status: 'open',
      d1_team: '',
      d2_problem: '',
      d3_containment: '',
      fiveWhyBranches: [blankBranch('Primary')],
      d5_correctiveAction: '',
      d6_implementation: '',
      d7_prevention: '',
      d8_closure: '',
      createdAt: Utils.nowISO(),
      updatedAt: Utils.nowISO(),
    };
  }

  function findAnomalies() {
    // out-of-spec results across all runs, most recent first
    const list = [];
    App.state.runs.forEach(r => {
      (r.results || []).forEach(res => {
        if (res.outOfTol) list.push({ run: r, result: res });
      });
    });
    return list.sort((a, b) => new Date(b.run.timestamp) - new Date(a.run.timestamp));
  }

  function newFromAnomaly(runId, charLabel) {
    const run = App.state.runs.find(r => r.id === runId);
    const rec = blankRecord();
    if (run) {
      const res = (run.results || []).find(r => r.label === charLabel);
      const part = run.partId ? getPart(run.partId) : null;
      rec.partId = run.partId || '';
      rec.runId = run.id;
      rec.charId = res ? res.charId : '';
      rec.title = `${part ? part.partNumber : 'Unlinked part'} - ${charLabel} out of spec`;
      rec.d2_problem = res ? `On ${Utils.formatDate(run.timestamp)}, characteristic "${charLabel}" on part ${part ? part.partNumber : ''}${part && part.revision ? ' (Rev ' + part.revision + ')' : ''}, serial "${run.serial}", measured ${res.actual} against nominal ${res.nominal} (tol +${res.tolPlus}/-${res.tolMinus}). Deviation of ${!isNaN(res.deviation) ? res.deviation.toFixed(4) : 'n/a'} exceeds the allowed tolerance band.` : '';
      rec.fiveWhyBranches = [blankBranch('Primary')];
      rec.fiveWhyBranches[0].whys[0] = `Why did "${charLabel}" measure out of tolerance?`;
    }
    editingRecord = rec;
    modalOpen = true;
    render();
  }

  function openEditor(id) {
    const existing = id ? App.state.eightDs.find(d => d.id === id) : null;
    editingRecord = existing ? JSON.parse(JSON.stringify(existing)) : blankRecord();
    modalOpen = true;
    render();
  }

  function closeEditor() {
    modalOpen = false;
    editingRecord = null;
    render();
  }

  function readFormIntoDraft() {
    if (!editingRecord) return;
    const g = (id) => document.getElementById(id)?.value ?? '';
    editingRecord.title = g('f-8d-title');
    editingRecord.status = g('f-8d-status') || 'open';
    editingRecord.d1_team = g('f-d1');
    editingRecord.d2_problem = g('f-d2');
    editingRecord.d3_containment = g('f-d3');
    editingRecord.d5_correctiveAction = g('f-d5');
    editingRecord.d6_implementation = g('f-d6');
    editingRecord.d7_prevention = g('f-d7');
    editingRecord.d8_closure = g('f-d8');
    editingRecord.fiveWhyBranches.forEach((b, bi) => {
      b.label = g(`f-branch-label-${bi}`);
      b.whys = b.whys.map((w, wi) => g(`f-why-${bi}-${wi}`));
    });
  }

  function addBranch() {
    readFormIntoDraft();
    editingRecord.fiveWhyBranches.push(blankBranch(`Branch ${editingRecord.fiveWhyBranches.length + 1}`));
    render();
  }

  function removeBranch(idx) {
    readFormIntoDraft();
    editingRecord.fiveWhyBranches.splice(idx, 1);
    render();
  }

  async function saveRecord() {
    readFormIntoDraft();
    if (!editingRecord.title) { alert('Give this 8D a title (D2 problem summary).'); return; }
    editingRecord.updatedAt = Utils.nowISO();
    await DB.dbPut('eightDs', editingRecord);
    await refreshAndRerender();
    closeEditor();
  }

  async function deleteRecord(id) {
    if (!confirm('Delete this 8D record? This cannot be undone.')) return;
    await DB.dbDelete('eightDs', id);
    await refreshAndRerender();
  }

  function buildPrintableHtml(rec) {
    const part = rec.partId ? getPart(rec.partId) : null;
    const esc = Utils.escapeHtml;
    const branchesHtml = rec.fiveWhyBranches.map(b => `
      <div style="margin-bottom:14px;">
        <div style="font-weight:600; margin-bottom:4px;">${esc(b.label)}</div>
        <ol style="margin:0; padding-left:20px;">
          ${b.whys.filter(w => w.trim()).map((w, i) => `<li style="margin-bottom:3px;"><strong>Why ${i + 1}:</strong> ${esc(w)}</li>`).join('') || '<li style="color:#94a3b8;">No entries</li>'}
        </ol>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>8D Report - ${esc(rec.title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; max-width: 800px; margin: 30px auto; padding: 0 20px; }
  h1 { font-size: 20px; border-bottom: 3px solid #1e293b; padding-bottom: 8px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb; margin-top: 24px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
  .meta { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  .field { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
  .badge { display:inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background:#f1f5f9; }
  @media print { body { margin: 0; padding: 15px; } }
</style>
</head><body>
  <h1>8D Corrective Action Report</h1>
  <div class="meta">
    Part: <strong>${part ? esc(part.partNumber) : 'Unlinked'}</strong>${part && part.revision ? ' (Rev ' + esc(part.revision) + ')' : ''}
    &nbsp;|&nbsp; Status: <span class="badge">${esc(rec.status)}</span>
    &nbsp;|&nbsp; Created: ${esc(Utils.formatDate(rec.createdAt))}
    &nbsp;|&nbsp; Updated: ${esc(Utils.formatDate(rec.updatedAt))}
  </div>

  <h2>D1 - Team</h2><div class="field">${esc(rec.d1_team) || '—'}</div>
  <h2>D2 - Problem Statement</h2><div class="field">${esc(rec.d2_problem) || '—'}</div>
  <h2>D3 - Containment Actions</h2><div class="field">${esc(rec.d3_containment) || '—'}</div>
  <h2>D4 - Root Cause Analysis (5-Why)</h2>${branchesHtml}
  <h2>D5 - Corrective Action Plan</h2><div class="field">${esc(rec.d5_correctiveAction) || '—'}</div>
  <h2>D6 - Implementation &amp; Validation</h2><div class="field">${esc(rec.d6_implementation) || '—'}</div>
  <h2>D7 - Prevent Recurrence</h2><div class="field">${esc(rec.d7_prevention) || '—'}</div>
  <h2>D8 - Closure &amp; Team Recognition</h2><div class="field">${esc(rec.d8_closure) || '—'}</div>
</body></html>`;
  }

  function printRecord(id) {
    const rec = App.state.eightDs.find(d => d.id === id);
    if (!rec) return;
    const html = buildPrintableHtml(rec);
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up blocked - allow pop-ups for this page to print the report.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function exportMarkdown(id) {
    const rec = App.state.eightDs.find(d => d.id === id);
    if (!rec) return;
    const part = rec.partId ? getPart(rec.partId) : null;
    let md = `# 8D Corrective Action Report\n\n`;
    md += `**Part:** ${part ? part.partNumber : 'Unlinked'}${part && part.revision ? ' (Rev ' + part.revision + ')' : ''}  \n`;
    md += `**Status:** ${rec.status}  \n**Created:** ${Utils.formatDate(rec.createdAt)}  \n**Updated:** ${Utils.formatDate(rec.updatedAt)}\n\n`;
    md += `## D1 - Team\n${rec.d1_team || '_none_'}\n\n`;
    md += `## D2 - Problem Statement\n${rec.d2_problem || '_none_'}\n\n`;
    md += `## D3 - Containment Actions\n${rec.d3_containment || '_none_'}\n\n`;
    md += `## D4 - Root Cause Analysis (5-Why)\n`;
    rec.fiveWhyBranches.forEach(b => {
      md += `\n**${b.label}**\n`;
      const filled = b.whys.filter(w => w.trim());
      if (filled.length === 0) md += `- _no entries_\n`;
      filled.forEach((w, i) => { md += `${i + 1}. ${w}\n`; });
    });
    md += `\n## D5 - Corrective Action Plan\n${rec.d5_correctiveAction || '_none_'}\n\n`;
    md += `## D6 - Implementation & Validation\n${rec.d6_implementation || '_none_'}\n\n`;
    md += `## D7 - Prevent Recurrence\n${rec.d7_prevention || '_none_'}\n\n`;
    md += `## D8 - Closure & Team Recognition\n${rec.d8_closure || '_none_'}\n`;
    Utils.downloadFile(`8D-${(rec.title || rec.id).replace(/[^\w-]+/g, '_')}.md`, md, 'text/markdown');
  }

  function statusBadge(status) {
    const map = { open: 'bg-red-100 text-red-700', in_progress: 'bg-amber-100 text-amber-700', closed: 'bg-emerald-100 text-emerald-700' };
    const labels = { open: 'Open', in_progress: 'In Progress', closed: 'Closed' };
    return `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[status] || map.open}">${labels[status] || status}</span>`;
  }

  function branchFormHtml(b, bi) {
    return `
      <div class="border border-slate-200 rounded p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
          <input id="f-branch-label-${bi}" value="${Utils.escapeHtml(b.label)}" class="border border-slate-300 rounded px-2 py-1 text-sm font-medium w-48" />
          ${editingRecord.fiveWhyBranches.length > 1 ? `<button data-remove-branch="${bi}" type="button" class="text-xs text-red-500 hover:underline">Remove branch</button>` : ''}
        </div>
        <div class="space-y-1.5">
          ${b.whys.map((w, wi) => `
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-slate-500 w-14 shrink-0">Why ${wi + 1}</span>
              <input id="f-why-${bi}-${wi}" value="${Utils.escapeHtml(w)}" class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" placeholder="${wi === 0 ? 'Why did the problem occur?' : 'Why did the previous cause happen?'}" />
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function anomalyPickerHtml() {
    const anomalies = findAnomalies();
    if (anomalies.length === 0) return '';
    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-600 mb-1">Start from a detected out-of-spec anomaly (optional)</label>
        <select id="anomaly-select" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          <option value="">Select an anomaly to auto-fill D2...</option>
          ${anomalies.slice(0, 30).map((a, i) => {
            const part = a.run.partId ? getPart(a.run.partId) : null;
            return `<option value="${a.run.id}|||${Utils.escapeHtml(a.result.label)}">${part ? Utils.escapeHtml(part.partNumber) : 'Unlinked'} - ${Utils.escapeHtml(a.result.label)} - ${Utils.escapeHtml(a.run.serial)} - ${Utils.formatDate(a.run.timestamp)}</option>`;
          }).join('')}
        </select>
      </div>
    `;
  }

  function modalHtml() {
    if (!modalOpen || !editingRecord) return '';
    const rec = editingRecord;
    return `
      <div id="eightd-modal-backdrop" class="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl my-4">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-800">8D / 5-Why Investigation</h3>
            <button id="btn-close-8d-modal" class="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
          </div>
          <div class="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            ${!rec.runId ? anomalyPickerHtml() : ''}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input id="f-8d-title" value="${Utils.escapeHtml(rec.title)}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Short title for this investigation" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select id="f-8d-status" class="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                  <option value="open" ${rec.status === 'open' ? 'selected' : ''}>Open</option>
                  <option value="in_progress" ${rec.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                  <option value="closed" ${rec.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
              </div>
            </div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D1 - Team</label>
              <textarea id="f-d1" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Team members and roles">${Utils.escapeHtml(rec.d1_team)}</textarea></div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D2 - Problem Statement</label>
              <textarea id="f-d2" rows="3" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="What, where, when, how much/many">${Utils.escapeHtml(rec.d2_problem)}</textarea></div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D3 - Containment Actions</label>
              <textarea id="f-d3" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Immediate actions to protect the customer (sort, quarantine, 100% inspect...)">${Utils.escapeHtml(rec.d3_containment)}</textarea></div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs font-semibold text-blue-700">D4 - Root Cause (Multi-Branch 5-Why)</label>
                <button id="btn-add-branch" type="button" class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100">+ Add Branch</button>
              </div>
              ${rec.fiveWhyBranches.map((b, bi) => branchFormHtml(b, bi)).join('')}
            </div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D5 - Corrective Action Plan</label>
              <textarea id="f-d5" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Permanent corrective actions addressing the root cause(s)">${Utils.escapeHtml(rec.d5_correctiveAction)}</textarea></div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D6 - Implementation &amp; Validation</label>
              <textarea id="f-d6" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="How/when implemented and verified effective">${Utils.escapeHtml(rec.d6_implementation)}</textarea></div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D7 - Prevent Recurrence</label>
              <textarea id="f-d7" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Systemic changes: procedures, poka-yoke, program logic fixes, training">${Utils.escapeHtml(rec.d7_prevention)}</textarea></div>

            <div><label class="block text-xs font-semibold text-blue-700 mb-1">D8 - Closure &amp; Team Recognition</label>
              <textarea id="f-d8" rows="2" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Final sign-off and recognition">${Utils.escapeHtml(rec.d8_closure)}</textarea></div>
          </div>
          <div class="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
            <button id="btn-cancel-8d" class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
            <button id="btn-save-8d" class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save Investigation</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindModalEvents() {
    if (!modalOpen) return;
    document.getElementById('btn-close-8d-modal')?.addEventListener('click', closeEditor);
    document.getElementById('btn-cancel-8d')?.addEventListener('click', closeEditor);
    document.getElementById('btn-save-8d')?.addEventListener('click', saveRecord);
    document.getElementById('btn-add-branch')?.addEventListener('click', addBranch);
    document.querySelectorAll('[data-remove-branch]').forEach(btn => btn.addEventListener('click', () => removeBranch(parseInt(btn.dataset.removeBranch, 10))));
    document.getElementById('anomaly-select')?.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const [runId, label] = e.target.value.split('|||');
      readFormIntoDraft();
      const run = App.state.runs.find(r => r.id === runId);
      const res = run ? (run.results || []).find(r => r.label === label) : null;
      const part = run && run.partId ? getPart(run.partId) : null;
      editingRecord.partId = run.partId || '';
      editingRecord.runId = runId;
      editingRecord.charId = res ? res.charId : '';
      editingRecord.title = `${part ? part.partNumber : 'Unlinked part'} - ${label} out of spec`;
      editingRecord.d2_problem = res ? `On ${Utils.formatDate(run.timestamp)}, characteristic "${label}" on part ${part ? part.partNumber : ''}${part && part.revision ? ' (Rev ' + part.revision + ')' : ''}, serial "${run.serial}", measured ${res.actual} against nominal ${res.nominal} (tol +${res.tolPlus}/-${res.tolMinus}). Deviation of ${!isNaN(res.deviation) ? res.deviation.toFixed(4) : 'n/a'} exceeds the allowed tolerance band.` : '';
      if (editingRecord.fiveWhyBranches[0]) editingRecord.fiveWhyBranches[0].whys[0] = `Why did "${label}" measure out of tolerance?`;
      render();
    });
  }

  function render(container) {
    container = container || document.getElementById('view-root');
    const records = App.state.eightDs;
    container.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white rounded-lg border border-slate-200">
          <div class="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-semibold text-slate-800">8D / 5-Why Root Cause Investigations</h3>
              <p class="text-xs text-slate-500 mt-0.5">Start from a detected out-of-spec anomaly or create a blank investigation.</p>
            </div>
            <button id="btn-new-8d" class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">+ New Investigation</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th class="text-left px-4 py-2 font-medium">Title</th>
                  <th class="text-left px-4 py-2 font-medium">Part</th>
                  <th class="text-left px-4 py-2 font-medium">Status</th>
                  <th class="text-left px-4 py-2 font-medium">Updated</th>
                  <th class="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${records.length === 0 ? `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">No 8D investigations yet.</td></tr>` : ''}
                ${records.map(r => {
                  const part = r.partId ? getPart(r.partId) : null;
                  return `
                    <tr class="border-t border-slate-100 hover:bg-slate-50">
                      <td class="px-4 py-2.5 font-medium text-slate-800">${Utils.escapeHtml(r.title)}</td>
                      <td class="px-4 py-2.5 text-slate-600">${part ? Utils.escapeHtml(part.partNumber) : '—'}</td>
                      <td class="px-4 py-2.5">${statusBadge(r.status)}</td>
                      <td class="px-4 py-2.5 text-xs text-slate-500">${Utils.formatDate(r.updatedAt)}</td>
                      <td class="px-4 py-2.5 text-right whitespace-nowrap">
                        <button data-edit-8d="${r.id}" class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
                        <button data-print-8d="${r.id}" class="text-slate-600 hover:underline text-xs mr-2">Print</button>
                        <button data-export-8d="${r.id}" class="text-slate-600 hover:underline text-xs mr-2">Markdown</button>
                        <button data-delete-8d="${r.id}" class="text-red-500 hover:underline text-xs">Delete</button>
                      </td>
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

    document.getElementById('btn-new-8d')?.addEventListener('click', () => openEditor(null));
    container.querySelectorAll('[data-edit-8d]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.edit8d)));
    container.querySelectorAll('[data-delete-8d]').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.delete8d)));
    container.querySelectorAll('[data-print-8d]').forEach(btn => btn.addEventListener('click', () => printRecord(btn.dataset.print8d)));
    container.querySelectorAll('[data-export-8d]').forEach(btn => btn.addEventListener('click', () => exportMarkdown(btn.dataset.export8d)));
    bindModalEvents();
  }

  return { render, newFromAnomaly };
})();

window.Views.EightD = EightD;
