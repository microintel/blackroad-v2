/* =========================================================
   ANGEL ONE EQUITY P&L PARSER
   Moved as-is from the standalone broker-pnl-report.html so
   the numbers are identical. Reads the label/value block and
   the "Scrip Symbol" transaction tables of the Equity sheet;
   F&O sheets are skipped entirely.
   ========================================================= */

const SUMMARY_LABELS = ['Total Gross PnL','Total Brokerage','Total GST','Total Exchange Service Tax',
  'Total Turnover Tax','Total SEBI Charges','Total Stamp Duty','Total STT','Total Other Charges',
  'Total IPFT Charges','Net PnL','Intraday Net PnL'];
const CLIENT_LABELS = ['Client Name','Client Id','PAN','Date Of Download'];
const RANGE_LABELS = ['From Date','To Date'];
const SKIP_SUM_HEADERS = ['scrip symbol','company name','avg buy price','avg sell price'];
const CHARGE_LABELS = ['Total Brokerage','Total GST','Total Exchange Service Tax','Total Turnover Tax',
  'Total SEBI Charges','Total Stamp Duty','Total STT','Total Other Charges','Total IPFT Charges'];

// Shorter column headers so wide transaction tables fit the printed page —
// the full name is spelled out once in a legend line under each table.
const HEADER_ABBR = {
  'company name': ['Company','Company Name'],
  'quantity': ['Qty','Quantity'],
  'avg buy price': ['ATP','ATP – Avg. Trade Price (Buy)'],
  'avg sell price': ['ASP','ASP – Avg. Trade Price (Sell)'],
  'buy value': ['Buy Val','Buy Val – Buy Value'],
  'sell value': ['Sell Val','Sell Val – Sell Value'],
  'gross pnl': ['Gross P&L','Gross P&L – Gross Profit/Loss'],
  'brokerage': ['Broker.','Broker. – Brokerage'],
  'exchange service tax': ['EST','EST – Exchange Service Tax'],
  'turnover tax': ['TT','TT – Turnover Tax'],
  'sebi charges': ['SEBI','SEBI – SEBI Charges'],
  'stamp duty': ['Stamp','Stamp – Stamp Duty'],
  'other charges': ['Other','Other – Other Charges'],
  'ipft charges': ['IPFT','IPFT – IPFT Charges'],
};
function shortHeader(h){
  const key = String(h ?? '').trim().toLowerCase();
  return HEADER_ABBR[key] ? HEADER_ABBR[key][0] : h;
}
function legendFor(headers){
  const skip = new Set(['company name','quantity']);
  const seen = new Map();
  headers.forEach(h => {
    const key = String(h ?? '').trim().toLowerCase();
    if(HEADER_ABBR[key] && !skip.has(key)) seen.set(HEADER_ABBR[key][0], HEADER_ABBR[key][1]);
  });
  return Array.from(seen.values());
}

function num(v){
  if(v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g,'').trim());
  return isNaN(n) ? null : n;
}
function isRestEmpty(row){ return row.slice(1).every(c => String(c ?? '').trim() === ''); }
// Like isRestEmpty, but ignores column 1 (the value cell) — used for label/value rows
// such as "Net PnL" | 12345, where only columns beyond the value need to be blank.
function isValueRowClean(row){ return row.slice(2).every(c => String(c ?? '').trim() === ''); }
function fmtMoney(n){
  if(n === null || n === undefined || isNaN(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtSigned(n){
  if(n === null || n === undefined || isNaN(n)) return '—';
  const s = n > 0 ? '+' : '';
  return s + fmtMoney(n);
}
function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function parseSheet(name, rows){
  const client = {}, range = {}, summary = [], tables = [];
  let currentSection = '';
  for(let i = 0; i < rows.length; i++){
    const row = rows[i].map(c => (c === undefined || c === null) ? '' : c);
    const c0 = String(row[0] ?? '').trim();
    if(!c0) continue;

    if(CLIENT_LABELS.includes(c0) && isValueRowClean(row)){ client[c0] = row[1]; continue; }
    if(RANGE_LABELS.includes(c0) && isValueRowClean(row)){ range[c0] = row[1]; continue; }
    if(SUMMARY_LABELS.includes(c0) && isValueRowClean(row)){ summary.push({ label: c0, value: num(row[1]) }); continue; }

    if(c0 === 'Scrip Symbol'){
      const headerRow = row.slice();
      const dataRows = [];
      let totalRow = null;
      let j = i + 1;
      for(; j < rows.length; j++){
        const r = rows[j].map(c => (c === undefined || c === null) ? '' : c);
        const first = String(r[0] ?? '').trim();
        const rowAllEmpty = r.every(c => String(c ?? '').trim() === '');
        if(rowAllEmpty) continue;
        if(first === 'Total'){ totalRow = r; j++; break; }
        dataRows.push(r);
      }
      tables.push({ section: currentSection, headers: headerRow, dataRows, totalRow });
      i = j - 1;
      continue;
    }
    if(isRestEmpty(row)) currentSection = c0;
  }
  return { name, client, range, summary, tables };
}

function crossCheckTable(t){
  if(!t.totalRow || t.dataRows.length === 0) return null;
  const mismatches = [];
  let checked = 0;
  t.headers.forEach((h, idx) => {
    const hl = String(h ?? '').toLowerCase().trim();
    if(!hl || SKIP_SUM_HEADERS.some(s => hl.includes(s))) return;
    const vals = t.dataRows.map(r => num(r[idx]));
    if(vals.some(v => v === null)) return;
    const reported = num(t.totalRow[idx]);
    if(reported === null) return;
    checked++;
    const computed = vals.reduce((a,b) => a+b, 0);
    const diff = Math.round((computed - reported) * 100) / 100;
    if(Math.abs(diff) > 0.05) mismatches.push({ header: h, computed, reported, diff });
  });
  return { checked, mismatches, ok: mismatches.length === 0 };
}

function yearSummary(sheets){
  let netTotal = 0, grossTotal = 0, chargesTotal = 0, txnCount = 0, hasNet = false;
  sheets.forEach(s => {
    s.summary.forEach(item => {
      if(item.value === null) return;
      if(item.label === 'Net PnL' || item.label === 'Intraday Net PnL'){ netTotal += item.value; hasNet = true; }
      else if(item.label === 'Total Gross PnL') grossTotal += item.value;
      else if(CHARGE_LABELS.includes(item.label)) chargesTotal += item.value;
    });
    s.tables.forEach(t => txnCount += t.dataRows.length);
  });
  return { netTotal, grossTotal, chargesTotal, txnCount, hasNet };
}

const BAR_COLORS = ['#B8901F','#2563EB','#1C9A5B','#737373','#8B5CF6','#0EA5A4','#F97316','#D54B5A'];

/* "2023-04-01 to 2024-03-31" -> "FY23–24" for chart labels. */
function shortYearLabel(label, idx){
  const years = Array.from(String(label).matchAll(/\d{4}/g)).map(m => m[0]);
  if(years.length >= 2) return `FY${years[0].slice(2)}–${years[1].slice(2)}`;
  if(years.length === 1) return `FY${years[0]}`;
  return `Year ${idx+1}`;
}

/* Reads a workbook and returns {label, sheets} for one financial year.
   Only sheets whose name contains "equity" are parsed (F&O is ignored). */
function readAngelWorkbook(XLSX, buffer, fname, fallbackIndex){
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const equitySheetNames = wb.SheetNames.filter(n => /equity/i.test(n));
  if(!equitySheetNames.length) throw new Error(`No "Equity P&L" sheet found in ${fname} — F&O-only files are skipped.`);
  const sheets = equitySheetNames
    .map(name => parseSheet(name, XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })))
    .filter(s => s.summary.length || s.tables.length);
  if(!sheets.length) throw new Error(`Equity P&L sheet in ${fname} had no recognizable P&L data.`);
  const range = sheets[0].range;
  const label = (range['From Date'] || range['To Date'])
    ? `${range['From Date']||'—'} to ${range['To Date']||'—'}`
    : `File ${fallbackIndex}`;
  return { label, fname, sheets };
}

export {
  SUMMARY_LABELS, CHARGE_LABELS, BAR_COLORS,
  shortHeader, legendFor, num, fmtMoney, fmtSigned, esc,
  parseSheet, crossCheckTable, yearSummary, shortYearLabel, readAngelWorkbook
};
