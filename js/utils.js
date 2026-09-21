/* Shared helpers: ids, formatting, CSV parsing, stats */

function uid(prefix) {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return (prefix ? prefix + '_' : '') + rand;
}

function nowISO() {
  return new Date().toISOString();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  const cleaned = String(v).trim().replace(/,/g, '');
  if (cleaned === '') return NaN;
  return parseFloat(cleaned);
}

/* --- CSV / delimited text parsing (handles quoted fields, commas, tabs) --- */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
  };
  let best = ',', bestCount = -1;
  for (const [d, c] of Object.entries(counts)) {
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

function parseDelimited(text, delimiter) {
  delimiter = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) pushField();
      else if (c === '\n') { pushField(); pushRow(); }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/* --- Statistics --- */
function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr, sample) {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - (sample === false ? 0 : 1));
  return Math.sqrt(variance);
}

function calcCpCpk(values, nominal, tolPlus, tolMinus) {
  const usl = nominal + Math.abs(tolPlus);
  const lsl = nominal - Math.abs(tolMinus);
  const m = mean(values);
  const sd = stdev(values, true);
  if (!sd || sd === 0 || isNaN(sd)) return { cp: null, cpk: null, mean: m, stdev: sd, usl, lsl };
  const cp = (usl - lsl) / (6 * sd);
  const cpu = (usl - m) / (3 * sd);
  const cpl = (m - lsl) / (3 * sd);
  const cpk = Math.min(cpu, cpl);
  return { cp, cpk, cpu, cpl, mean: m, stdev: sd, usl, lsl };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.Utils = {
  uid, nowISO, formatDate, escapeHtml, toNumber,
  detectDelimiter, parseDelimited,
  mean, stdev, calcCpCpk,
  downloadFile,
};
