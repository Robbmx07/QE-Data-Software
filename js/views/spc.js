/* Module 4: Dynamic SPC & Trend Analytics (Cp/Cpk, run charts) */

window.Views = window.Views || {};

const SPC = (() => {
  let selectedPartId = '';
  let selectedCharId = '';
  let chartInstance = null;

  function getSeriesForChar(partId, charId, charLabel) {
    const runs = App.state.runs
      .filter(r => r.partId === partId)
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const points = [];
    runs.forEach(r => {
      let res = null;
      if (charId) res = (r.results || []).find(x => x.charId === charId);
      if (!res && charLabel) res = (r.results || []).find(x => (x.label || '').toLowerCase().trim() === charLabel.toLowerCase().trim());
      if (res && !isNaN(res.actual)) {
        points.push({ timestamp: r.timestamp, serial: r.serial, actual: res.actual, outOfTol: res.outOfTol, deviation: res.deviation });
      }
    });
    return points;
  }

  function statTile(label, value, sub) {
    return `
      <div class="bg-white rounded-lg border border-slate-200 p-3">
        <div class="text-[11px] uppercase tracking-wide text-slate-500 font-medium">${label}</div>
        <div class="text-xl font-bold text-slate-800 mt-0.5">${value}</div>
        ${sub ? `<div class="text-[11px] text-slate-400 mt-0.5">${sub}</div>` : ''}
      </div>
    `;
  }

  function capabilityColor(v) {
    if (v === null || v === undefined || isNaN(v)) return 'text-slate-400';
    if (v >= 1.33) return 'text-emerald-600';
    if (v >= 1.0) return 'text-amber-600';
    return 'text-red-600';
  }

  function renderChart(points, nominal, usl, lsl) {
    const ctx = document.getElementById('spc-chart');
    if (!ctx) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const labels = points.map((p, i) => p.serial && p.serial !== '(unspecified)' ? p.serial : `#${i + 1}`);
    const data = points.map(p => p.actual);
    const pointColors = points.map(p => p.outOfTol ? '#dc2626' : '#2563eb');

    const datasets = [
      {
        label: 'Actual',
        data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 4,
        tension: 0.15,
        fill: false,
      },
    ];
    if (!isNaN(nominal)) datasets.push({ label: 'Nominal', data: labels.map(() => nominal), borderColor: '#64748b', borderDash: [4, 4], pointRadius: 0, borderWidth: 1 });
    if (!isNaN(usl)) datasets.push({ label: 'USL', data: labels.map(() => usl), borderColor: '#dc2626', borderDash: [6, 3], pointRadius: 0, borderWidth: 1 });
    if (!isNaN(lsl)) datasets.push({ label: 'LSL', data: labels.map(() => lsl), borderColor: '#dc2626', borderDash: [6, 3], pointRadius: 0, borderWidth: 1 });

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          y: { ticks: { font: { size: 11 } } },
          x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 } },
        },
      },
    });
  }

  function render(container) {
    container = container || document.getElementById('view-root');
    const parts = App.state.parts;
    const part = selectedPartId ? getPart(selectedPartId) : null;
    const chars = part ? part.characteristics : [];
    if (part && !chars.find(c => c.id === selectedCharId)) selectedCharId = chars[0]?.id || '';
    const char = chars.find(c => c.id === selectedCharId) || null;

    let points = [];
    let cap = null;
    if (part && char) {
      points = getSeriesForChar(part.id, char.id, char.label);
      const nominal = Utils.toNumber(char.nominal);
      const tolPlus = Utils.toNumber(char.tolPlus);
      const tolMinus = Utils.toNumber(char.tolMinus);
      if (points.length >= 2 && !isNaN(nominal) && !isNaN(tolPlus) && !isNaN(tolMinus)) {
        cap = Utils.calcCpCpk(points.map(p => p.actual), nominal, tolPlus, tolMinus);
      }
    }

    container.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white rounded-lg border border-slate-200 p-5">
          <h3 class="font-semibold text-slate-800 mb-3">SPC Trend &amp; Process Capability</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Part</label>
              <select id="spc-part-select" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="">Select a part...</option>
                ${parts.map(p => `<option value="${p.id}" ${selectedPartId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.partNumber)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Characteristic</label>
              <select id="spc-char-select" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" ${!part ? 'disabled' : ''}>
                <option value="">Select a characteristic...</option>
                ${chars.map(c => `<option value="${c.id}" ${selectedCharId === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.label)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        ${!part ? `<div class="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-400">Select a part to view its historical trend data.</div>` : ''}
        ${part && !char ? `<div class="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-400">This part has no characteristics defined yet. Add them in the Dashboard's Part Master.</div>` : ''}
        ${part && char && points.length === 0 ? `<div class="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-400">No inspection runs found for "${Utils.escapeHtml(char.label)}" yet. Ingest data for this part first.</div>` : ''}

        ${part && char && points.length > 0 ? `
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
            ${statTile('n (points)', points.length)}
            ${statTile('Mean', cap && !isNaN(cap.mean) ? cap.mean.toFixed(4) : '—')}
            ${statTile('Std Dev', cap && !isNaN(cap.stdev) ? cap.stdev.toFixed(4) : '—')}
            ${statTile('Cp', cap && cap.cp !== null ? `<span class="${capabilityColor(cap.cp)}">${cap.cp.toFixed(2)}</span>` : '—', 'need n≥2 + tol')}
            ${statTile('Cpk', cap && cap.cpk !== null ? `<span class="${capabilityColor(cap.cpk)}">${cap.cpk.toFixed(2)}</span>` : '—', '≥1.33 = capable')}
          </div>
          <div class="bg-white rounded-lg border border-slate-200 p-5">
            <div class="h-72"><canvas id="spc-chart"></canvas></div>
          </div>
          <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-slate-50 text-slate-500 uppercase">
                  <tr>
                    <th class="text-left px-3 py-2">Timestamp</th>
                    <th class="text-left px-3 py-2">Serial</th>
                    <th class="text-left px-3 py-2">Actual</th>
                    <th class="text-left px-3 py-2">Deviation</th>
                    <th class="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${points.slice().reverse().map(p => `
                    <tr class="border-t border-slate-100 ${p.outOfTol ? 'bg-red-50' : ''}">
                      <td class="px-3 py-1.5 text-slate-500">${Utils.formatDate(p.timestamp)}</td>
                      <td class="px-3 py-1.5">${Utils.escapeHtml(p.serial)}</td>
                      <td class="px-3 py-1.5 font-medium">${p.actual}</td>
                      <td class="px-3 py-1.5">${isNaN(p.deviation) ? '—' : p.deviation.toFixed(4)}</td>
                      <td class="px-3 py-1.5">${p.outOfTol ? '<span class="text-red-600 font-semibold">OOS</span>' : '<span class="text-emerald-600">OK</span>'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('spc-part-select')?.addEventListener('change', (e) => {
      selectedPartId = e.target.value;
      selectedCharId = '';
      render(container);
    });
    document.getElementById('spc-char-select')?.addEventListener('change', (e) => {
      selectedCharId = e.target.value;
      render(container);
    });

    if (part && char && points.length > 0) {
      const nominal = Utils.toNumber(char.nominal);
      const tolPlus = Utils.toNumber(char.tolPlus);
      const tolMinus = Utils.toNumber(char.tolMinus);
      renderChart(points, nominal, isNaN(nominal) ? NaN : nominal + Math.abs(tolPlus), isNaN(nominal) ? NaN : nominal - Math.abs(tolMinus));
    }
  }

  return { render };
})();

window.Views.SPC = SPC;
