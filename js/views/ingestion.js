/* Module 3: Inspection Data Ingestion & Normalization Engine */

window.Views = window.Views || {};

const Ingestion = (() => {
  let rawText = '';
  let delimiter = ',';
  let rows = []; // full parsed 2D array, before header/data split
  let headerRow = [];
  let dataRows = [];
  let hasHeaderRow = true;
  let pcdmisPatternDetected = false;
  let mapping = { label: '', nominal: '', actual: '', tolPlus: '', tolMinus: '', serial: '' };
  let selectedPartId = '';
  let serialOverride = '';
  let step = 1; // 1 = input, 2 = mapping/preview
  let lastSavedRunId = null;

  const FIELD_DEFS = [
    { key: 'label', label: 'Characteristic / Label', required: true },
    { key: 'nominal', label: 'Nominal', required: false },
    { key: 'actual', label: 'Actual (measured)', required: true },
    { key: 'tolPlus', label: 'Tolerance +', required: false },
    { key: 'tolMinus', label: 'Tolerance -', required: false },
    { key: 'serial', label: 'Serial Number (optional)', required: false },
  ];

  function guessMapping(header) {
    const norm = header.map(h => (h || '').toLowerCase().trim());
    const find = (patterns) => {
      for (const pat of patterns) {
        const idx = norm.findIndex(h => h.includes(pat));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    return {
      label: find(['char', 'feature', 'dimension', 'label', 'name']),
      nominal: find(['nominal', 'nom']),
      actual: find(['actual', 'meas', 'result']),
      tolPlus: find(['tol+', 'tolplus', 'upper', 'utol', 'tol high']),
      tolMinus: find(['tol-', 'tolminus', 'lower', 'ltol', 'tol low']),
      serial: find(['serial', 's/n', 'sn']),
    };
  }

  // A real header row is almost always mostly text (dimension names); a data row from a
  // headerless PC-DMIS export is mostly numeric (nominal/actual/tol/deviation columns).
  function detectHasHeader(parsedRows) {
    if (!parsedRows.length) return true;
    const first = parsedRows[0];
    const nonBlank = first.filter(c => String(c).trim() !== '');
    if (nonBlank.length === 0) return true;
    const numericCount = nonBlank.filter(c => !isNaN(Utils.toNumber(c))).length;
    return (numericCount / nonBlank.length) < 0.5;
  }

  // Safe to guess even without a header: the label/characteristic-ID column is reliably
  // the first column that is never numeric across every data row. Numeric columns
  // (nominal/actual/tol) are deliberately left for the user to map by eye against the
  // sample values shown in each dropdown - guessing those positionally would risk
  // silently swapping tolerance columns on a layout this app hasn't seen before.
  function guessLabelColumnHeaderless(rowsToScan) {
    if (!rowsToScan.length) return -1;
    const numCols = rowsToScan[0].length;
    for (let c = 0; c < numCols; c++) {
      const allNonNumeric = rowsToScan.every(r => String(r[c] ?? '').trim() !== '' && isNaN(Utils.toNumber(r[c])));
      if (allNonNumeric) return c;
    }
    return -1;
  }

  // PC-DMIS's built-in "Report to Excel" output (sheet named "PCDmisExcelN") always uses a
  // fixed, headerless 9-column layout: Char, Description, Type, Nominal, Actual, Tol+, Tol-,
  // Deviation, OutTol. The Type column is a reliable fingerprint - a short (1-3 letter) code
  // like R/M/A on every single row - because a generic headerless export in some other shop's
  // own format is unlikely to happen to have that same column in that same position too.
  function isNumericColumn(rowsToScan, c) {
    return rowsToScan.every(r => String(r[c] ?? '').trim() !== '' && !isNaN(Utils.toNumber(r[c])));
  }

  function detectPCDMISExcelReport(rowsToScan) {
    if (!rowsToScan.length || rowsToScan[0].length < 9) return false;
    const typeColOk = rowsToScan.every(r => /^[A-Za-z]{1,3}$/.test(String(r[2] ?? '').trim()));
    if (!typeColOk) return false;
    return [3, 4, 5, 6].every(c => isNumericColumn(rowsToScan, c));
  }

  function applyHeaderAndGuess() {
    pcdmisPatternDetected = false;
    if (hasHeaderRow) {
      headerRow = rows[0].map(h => (h === null || h === undefined) ? '' : String(h));
      dataRows = rows.slice(1);
      const guess = guessMapping(headerRow);
      mapping = {
        label: guess.label >= 0 ? String(guess.label) : '',
        nominal: guess.nominal >= 0 ? String(guess.nominal) : '',
        actual: guess.actual >= 0 ? String(guess.actual) : '',
        tolPlus: guess.tolPlus >= 0 ? String(guess.tolPlus) : '',
        tolMinus: guess.tolMinus >= 0 ? String(guess.tolMinus) : '',
        serial: guess.serial >= 0 ? String(guess.serial) : '',
      };
    } else {
      const numCols = Math.max(...rows.map(r => r.length));
      headerRow = Array.from({ length: numCols }, (_, i) => 'Column ' + (i + 1));
      dataRows = rows;
      const labelCol = guessLabelColumnHeaderless(dataRows);
      if (detectPCDMISExcelReport(dataRows)) {
        pcdmisPatternDetected = true;
        mapping = { label: '0', nominal: '3', actual: '4', tolPlus: '5', tolMinus: '6', serial: '' };
      } else {
        mapping = { label: labelCol >= 0 ? String(labelCol) : '', nominal: '', actual: '', tolPlus: '', tolMinus: '', serial: '' };
      }
    }
  }

  function finalizeParsedRows(parsedRows) {
    rows = parsedRows;
    if (rows.length === 0) { alert('No parseable rows found.'); return; }
    hasHeaderRow = detectHasHeader(rows);
    applyHeaderAndGuess();
    step = 2;
    lastSavedRunId = null;
    render();
  }

  function parseInput() {
    delimiter = Utils.detectDelimiter(rawText);
    finalizeParsedRows(Utils.parseDelimited(rawText, delimiter));
  }

  async function parseXlsxFile(file) {
    let wb;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array' });
    } catch (err) {
      alert(`Could not read "${file.name}" as an Excel file: ${err.message}`);
      return;
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) { alert(`"${file.name}" has no sheets.`); return; }
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const asStrings = raw
      .map(r => r.map(c => (c === null || c === undefined) ? '' : String(c)))
      .filter(r => r.some(f => f.trim() !== ''));
    // Keep a plain-text copy of what was imported for the run's audit record.
    rawText = asStrings.map(r => r.join(',')).join('\n');
    delimiter = ',';
    finalizeParsedRows(asStrings);
  }

  function buildNormalizedResults() {
    const part = selectedPartId ? getPart(selectedPartId) : null;
    const charByLabel = {};
    if (part) part.characteristics.forEach(c => { charByLabel[c.label.toLowerCase().trim()] = c; });

    const results = [];
    dataRows.forEach(row => {
      const label = mapping.label !== '' ? (row[parseInt(mapping.label, 10)] || '').trim() : '';
      if (!label) return;
      const actual = mapping.actual !== '' ? Utils.toNumber(row[parseInt(mapping.actual, 10)]) : NaN;
      let nominal = mapping.nominal !== '' ? Utils.toNumber(row[parseInt(mapping.nominal, 10)]) : NaN;
      let tolPlus = mapping.tolPlus !== '' ? Utils.toNumber(row[parseInt(mapping.tolPlus, 10)]) : NaN;
      let tolMinus = mapping.tolMinus !== '' ? Utils.toNumber(row[parseInt(mapping.tolMinus, 10)]) : NaN;

      const matchedChar = charByLabel[label.toLowerCase().trim()];
      if (matchedChar) {
        if (isNaN(nominal)) nominal = Utils.toNumber(matchedChar.nominal);
        if (isNaN(tolPlus)) tolPlus = Utils.toNumber(matchedChar.tolPlus);
        if (isNaN(tolMinus)) tolMinus = Utils.toNumber(matchedChar.tolMinus);
      }

      const deviation = (!isNaN(actual) && !isNaN(nominal)) ? (actual - nominal) : NaN;
      let outOfTol = false;
      if (!isNaN(deviation) && !isNaN(tolPlus) && !isNaN(tolMinus)) {
        outOfTol = deviation > Math.abs(tolPlus) || deviation < -Math.abs(tolMinus);
      }

      results.push({
        charId: matchedChar ? matchedChar.id : null,
        label, nominal, actual, tolPlus, tolMinus, deviation, outOfTol,
        matched: !!matchedChar,
      });
    });
    return results;
  }

  async function saveRun() {
    const results = buildNormalizedResults();
    if (results.length === 0) { alert('No valid rows to save - check your column mapping.'); return; }
    let serial = serialOverride.trim();
    if (!serial && mapping.serial !== '' && dataRows[0]) {
      serial = (dataRows[0][parseInt(mapping.serial, 10)] || '').trim();
    }
    const run = {
      id: Utils.uid('run'),
      partId: selectedPartId || null,
      serial: serial || '(unspecified)',
      timestamp: Utils.nowISO(),
      source: 'import',
      results,
      raw: rawText,
    };
    await DB.dbPut('runs', run);
    await refreshAndRerender();
    lastSavedRunId = run.id;
    render();
  }

  function readMappingFromForm() {
    FIELD_DEFS.forEach(f => {
      const el = document.getElementById(`map-${f.key}`);
      if (el) mapping[f.key] = el.value;
    });
  }

  async function saveMappingProfile() {
    readMappingFromForm();
    const name = prompt('Name this column mapping profile for reuse:');
    if (!name) return;
    const profile = { id: Utils.uid('profile'), name, mapping: { ...mapping }, delimiter };
    await DB.dbPut('mappingProfiles', profile);
    await refreshAndRerender();
    render();
  }

  function applyProfile(profileId) {
    const profile = App.state.mappingProfiles.find(p => p.id === profileId);
    if (!profile) return;
    mapping = { ...profile.mapping };
    render();
  }

  const ACCEPTED_EXTENSIONS = /\.(csv|txt|xlsx|xls)$/i;
  const EXCEL_EXTENSIONS = /\.(xlsx|xls)$/i;

  // Crude binary-content detector (NUL bytes, or a high ratio of control characters) -
  // catches a misnamed or unsupported binary file that slips past the extension check
  // (drag-and-drop bypasses the file input's "accept" filter entirely).
  function looksBinary(text) {
    if (text.indexOf('\u0000') !== -1) return true;
    const sampleLen = Math.min(text.length, 2000);
    if (sampleLen === 0) return false;
    let nonPrintable = 0;
    for (let i = 0; i < sampleLen; i++) {
      const code = text.charCodeAt(i);
      if (code < 9 || (code > 13 && code < 32) || code === 127) nonPrintable++;
    }
    return (nonPrintable / sampleLen) > 0.05;
  }

  async function readAndParseFile(file) {
    if (!file) return;
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      alert(`"${file.name}" doesn't look like a CSV, TXT, or Excel file.`);
      return;
    }
    if (EXCEL_EXTENSIONS.test(file.name)) {
      await parseXlsxFile(file);
      return;
    }
    const text = await file.text();
    if (looksBinary(text)) {
      alert(`"${file.name}" appears to contain binary data, not plain text - it may actually be an Excel/Office file saved with a .csv/.txt extension. Please re-save it as a plain CSV/TXT file, or import the original .xlsx directly.`);
      return;
    }
    rawText = text;
    parseInput();
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    await readAndParseFile(file);
    e.target.value = '';
  }

  function previewTable() {
    readMappingFromFormSilent();
    const results = buildNormalizedResults();
    const oosCount = results.filter(r => r.outOfTol).length;
    return `
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-semibold text-slate-700">Preview (${results.length} rows)</h4>
        ${oosCount > 0 ? `<span class="text-xs font-medium px-2 py-1 rounded bg-red-100 text-red-700">${oosCount} out-of-spec</span>` : `<span class="text-xs font-medium px-2 py-1 rounded bg-emerald-100 text-emerald-700">All in spec</span>`}
      </div>
      <div class="overflow-x-auto border border-slate-200 rounded max-h-72 overflow-y-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-slate-500 uppercase sticky top-0">
            <tr>
              <th class="text-left px-2 py-1.5">Label</th>
              <th class="text-left px-2 py-1.5">Nominal</th>
              <th class="text-left px-2 py-1.5">Actual</th>
              <th class="text-left px-2 py-1.5">Tol +/-</th>
              <th class="text-left px-2 py-1.5">Deviation</th>
              <th class="text-left px-2 py-1.5">Status</th>
              <th class="text-left px-2 py-1.5">Matched Char</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr class="border-t border-slate-100 ${r.outOfTol ? 'bg-red-50' : ''}">
                <td class="px-2 py-1.5 font-medium text-slate-800">${Utils.escapeHtml(r.label)}</td>
                <td class="px-2 py-1.5">${isNaN(r.nominal) ? '—' : r.nominal}</td>
                <td class="px-2 py-1.5">${isNaN(r.actual) ? '—' : r.actual}</td>
                <td class="px-2 py-1.5">${isNaN(r.tolPlus) ? '—' : '+' + r.tolPlus}/${isNaN(r.tolMinus) ? '—' : '-' + r.tolMinus}</td>
                <td class="px-2 py-1.5">${isNaN(r.deviation) ? '—' : r.deviation.toFixed(4)}</td>
                <td class="px-2 py-1.5">${r.outOfTol ? '<span class="text-red-600 font-semibold">OUT OF SPEC</span>' : (isNaN(r.deviation) ? '<span class="text-slate-400">n/a</span>' : '<span class="text-emerald-600">OK</span>')}</td>
                <td class="px-2 py-1.5 text-slate-500">${r.matched ? 'Yes' : 'No (label only)'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Reads current select values without triggering full re-render (used during preview computation)
  function readMappingFromFormSilent() {
    FIELD_DEFS.forEach(f => {
      const el = document.getElementById(`map-${f.key}`);
      if (el) mapping[f.key] = el.value;
    });
  }

  function mappingStepHtml() {
    const part = selectedPartId ? getPart(selectedPartId) : null;
    return `
      <div class="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h3 class="font-semibold text-slate-800">Column Mapping</h3>
          <div class="flex items-center gap-2">
            ${App.state.mappingProfiles.length > 0 ? `
              <select id="profile-select" class="border border-slate-300 rounded px-2 py-1.5 text-xs">
                <option value="">Apply saved profile...</option>
                ${App.state.mappingProfiles.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}
              </select>
            ` : ''}
            <button id="btn-save-profile" class="text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">Save Mapping Profile</button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Link results to Part (for tolerance lookup)</label>
            <select id="ingest-part-select" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">No part linked (use file's own tol columns)</option>
              ${App.state.parts.map(p => `<option value="${p.id}" ${selectedPartId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.partNumber)}${p.revision ? ' (' + Utils.escapeHtml(p.revision) + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Serial / Unit ID (overrides mapped column if set)</label>
            <input id="serial-override" value="${Utils.escapeHtml(serialOverride)}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="e.g. SN-00231" />
          </div>
        </div>

        <div>
          <label class="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" id="has-header-toggle" ${hasHeaderRow ? 'checked' : ''} />
            First row contains column headers
          </label>
          ${!hasHeaderRow && pcdmisPatternDetected ? `<p class="text-xs text-emerald-600 mt-1">Recognized as a standard PC-DMIS Excel Report layout - Nominal/Actual/Tolerance columns have been pre-filled below. Please check them against the sample values before saving.</p>` : ''}
          ${!hasHeaderRow && !pcdmisPatternDetected ? `<p class="text-xs text-amber-600 mt-1">No header row detected - columns are shown generically below, with a sample value from the first row to help you pick the right one.</p>` : ''}
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          ${FIELD_DEFS.map(f => `
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">${f.label}${f.required ? ' *' : ''}</label>
              <select id="map-${f.key}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="">(none)</option>
                ${headerRow.map((h, i) => {
                  const sample = !hasHeaderRow && dataRows[0] ? String(dataRows[0][i] ?? '').trim() : '';
                  const sampleSuffix = sample ? ` (${sample.length > 24 ? sample.slice(0, 24) + '…' : sample})` : '';
                  return `<option value="${i}" ${mapping[f.key] === String(i) ? 'selected' : ''}>${Utils.escapeHtml((h || 'Column ' + (i + 1)) + sampleSuffix)}</option>`;
                }).join('')}
              </select>
            </div>
          `).join('')}
        </div>

        <div id="preview-container">${previewTable()}</div>

        <div class="flex flex-wrap gap-2">
          <button id="btn-save-run" class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save Inspection Run</button>
          <button id="btn-back-input" class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Back</button>
        </div>
        ${lastSavedRunId ? `<div class="text-sm text-emerald-600 font-medium">Run saved successfully. View it in the Dashboard or SPC tab.</div>` : ''}
      </div>
    `;
  }

  function inputStepHtml() {
    return `
      <div class="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <h3 class="font-semibold text-slate-800">Inspection Data Ingestion</h3>
        <p class="text-sm text-slate-500">Drag/upload a CSV, TXT, or Excel (.xlsx) inspection log, or paste raw text. The engine auto-detects the delimiter (and whether there's a header row) and lets you map columns once, then remembers the mapping as a reusable profile.</p>
        <div id="dropzone" class="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer">
          <div class="text-sm">Drag &amp; drop a .csv, .txt, or .xlsx file here, or click to browse</div>
          <input type="file" id="ingest-file" accept=".csv,.txt,.xlsx,.xls" class="hidden" />
        </div>
        <div class="text-xs text-slate-400 text-center">— or paste raw text below —</div>
        <textarea id="ingest-paste" rows="8" class="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono" placeholder="Char,Nominal,Actual,Tol+,Tol-&#10;DIA_1,25.000,25.012,0.020,0.020"></textarea>
        <button id="btn-parse" class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Parse Data</button>
      </div>
    `;
  }

  function render(container) {
    container = container || document.getElementById('view-root');
    container.innerHTML = `<div class="space-y-4">${step === 1 ? inputStepHtml() : mappingStepHtml()}</div>`;

    if (step === 1) {
      const dz = document.getElementById('dropzone');
      const fileInput = document.getElementById('ingest-file');
      dz.addEventListener('click', () => fileInput.click());
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('border-blue-400'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('border-blue-400'));
      dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('border-blue-400');
        const file = e.dataTransfer.files[0];
        await readAndParseFile(file);
      });
      fileInput.addEventListener('change', handleFile);
      document.getElementById('btn-parse').addEventListener('click', () => {
        const pasted = document.getElementById('ingest-paste').value;
        if (!pasted.trim()) { alert('Paste data or upload a file first.'); return; }
        rawText = pasted;
        parseInput();
      });
    } else {
      document.getElementById('ingest-part-select')?.addEventListener('change', (e) => { selectedPartId = e.target.value; render(container); });
      document.getElementById('serial-override')?.addEventListener('input', (e) => { serialOverride = e.target.value; });
      document.getElementById('has-header-toggle')?.addEventListener('change', (e) => {
        hasHeaderRow = e.target.checked;
        applyHeaderAndGuess();
        render(container);
      });
      FIELD_DEFS.forEach(f => {
        document.getElementById(`map-${f.key}`)?.addEventListener('change', () => {
          readMappingFromForm();
          document.getElementById('preview-container').innerHTML = previewTable();
        });
      });
      document.getElementById('profile-select')?.addEventListener('change', (e) => {
        if (e.target.value) applyProfile(e.target.value);
      });
      document.getElementById('btn-save-profile')?.addEventListener('click', saveMappingProfile);
      document.getElementById('btn-save-run')?.addEventListener('click', saveRun);
      document.getElementById('btn-back-input')?.addEventListener('click', () => { step = 1; lastSavedRunId = null; render(container); });
    }
  }

  return { render };
})();

window.Views.Ingestion = Ingestion;
