/* =========================================================
   BROKER REPORTS - PDF export
   Angel One equity P&L: the original, tested PDF layout moved
   over unchanged (only colours were switched to BlackRoad
   black and gold).
   jsPDF + AutoTable load on demand (broker-libs.js).
   ========================================================= */

import { loadPdfLibs } from "./angel-libs.js";
import { PDF_FONT_REGULAR_B64, PDF_FONT_BOLD_B64 } from "./angel-fonts.js";
import {
    CHARGE_LABELS, BAR_COLORS,
    shortHeader, legendFor, num, fmtMoney, fmtSigned,
    crossCheckTable, yearSummary, shortYearLabel
} from "./angel-parser.js";

/* Quantity is a count, not rupees. */
function fmtCell(header, n){
  return String(header ?? '').trim().toLowerCase() === 'quantity' ? n.toLocaleString('en-IN') : fmtMoney(n);
}

let PDF_BRAND = 'BlackRoad · Equity P&L Report';

function ensurePdfFonts(doc){
  doc.addFileToVFS('DejaVuSans.ttf', PDF_FONT_REGULAR_B64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', PDF_FONT_BOLD_B64);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
}

const PDF_PAGE = { w:297, h:210, mL:10, mR:10, mT:8, mB:8 };
const PDF_CONTENT_W = PDF_PAGE.w - PDF_PAGE.mL - PDF_PAGE.mR;

const PDF_THEME = {
  headerBg:[10,10,10], accent:[168,130,24], accentDark:[138,106,15],
  text:[23,24,26], muted:[107,112,120], line:[231,233,236],
  totalBg:[246,243,234], pos:[28,154,91], neg:[213,75,90],
  gold:[216,166,58], white:[255,255,255], subText:[214,220,232]
};

function pdfHexRGB(hex){
  const h = String(hex).replace('#','');
  return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
}

function ensurePdfSpace(doc, y, needed){
  const bottom = PDF_PAGE.h - PDF_PAGE.mB;
  if(y + needed > bottom){
    doc.addPage();
    return PDF_PAGE.mT;
  }
  return y;
}

// ---- Charts, drawn straight to a canvas (no DOM/CSS involved) and
// embedded as a small PNG — same visual logic as the on-screen SVG
// pie/bar charts (renderPieChart / renderYearBarChart) above.
function pdfPieChartImage(slices, px){
  px = px || 320;
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  const total = slices.reduce((a,s) => a + Math.max(s.value,0), 0);
  const cx = px/2, cy = px/2, r = px/2 - 3;
  if(total <= 0){
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle = '#EEF0F3'; ctx.fill();
  }else{
    let angle = -Math.PI/2;
    slices.filter(s => s.value > 0).forEach(s => {
      const sweep = (s.value/total) * Math.PI*2;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,angle,angle+sweep);
      ctx.closePath(); ctx.fillStyle = s.color; ctx.fill();
      angle += sweep;
    });
  }
  return canvas.toDataURL('image/png');
}
function pdfBarChartImage(rows, px, py){
  px = px || 1000; py = py || 380;
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = py;
  const ctx = canvas.getContext('2d');
  const padL=18, padR=18, padTop=50, baseY=py-60;
  const max = Math.max(1, ...rows.map(r => Math.abs(r.netTotal)));
  ctx.strokeStyle = '#D9DCE1'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(padL,baseY); ctx.lineTo(px-padR,baseY); ctx.stroke();
  rows.forEach((r,i) => {
    const slotW = (px-padL-padR)/rows.length;
    const bw = Math.min(120, slotW-34);
    const x = padL + i*slotW + (slotW-bw)/2;
    const hgt = Math.max(4, Math.abs(r.netTotal)/max * (baseY-padTop));
    const y = r.netTotal >= 0 ? baseY-hgt : baseY;
    ctx.fillStyle = BAR_COLORS[i % BAR_COLORS.length];
    ctx.fillRect(x, y, bw, hgt);
    ctx.fillStyle = '#17181A'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmtSigned(r.netTotal), x+bw/2, r.netTotal >= 0 ? y-12 : y+hgt+28);
    ctx.fillStyle = '#6B7078'; ctx.font = '20px sans-serif';
    ctx.fillText(shortYearLabel(r.label,i), x+bw/2, py-24);
  });
  return canvas.toDataURL('image/png');
}

// ---- Header banner (brand row, title, period, generated date, client info)
function pdfDrawHeader(doc, { title, subLines, clientBits }){
  const x = PDF_PAGE.mL, y = PDF_PAGE.mT, w = PDF_CONTENT_W;
  const bannerH = 22 + (subLines.length * 4.6) + (clientBits.length ? 6 : 0);

  doc.setFillColor(...PDF_THEME.headerBg);
  doc.rect(x, y, w, bannerH, 'F');
  doc.setDrawColor(...PDF_THEME.accent);
  doc.setLineWidth(1.1);
  doc.line(x, y+bannerH, x+w, y+bannerH);

  doc.setFont('DejaVuSans','bold'); doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.subText);
  doc.text(PDF_BRAND.toUpperCase(), x+4, y+7);

  doc.setFillColor(...PDF_THEME.accent);
  doc.roundedRect(x+w-17, y+3.5, 13, 8.5, 1, 1, 'F');
  doc.setTextColor(10,10,10); doc.setFontSize(8);
  doc.text('BR', x+w-17+6.5, y+9, {align:'center'});

  doc.setFont('DejaVuSans','bold'); doc.setFontSize(15);
  doc.setTextColor(255,255,255);
  doc.text(String(title), x+4, y+16, {maxWidth: w-8});

  let subY = y+21;
  doc.setFont('DejaVuSans','normal'); doc.setFontSize(9);
  doc.setTextColor(...PDF_THEME.subText);
  subLines.forEach(line => { doc.text(line, x+4, subY); subY += 4.6; });

  if(clientBits.length){
    doc.setFontSize(8.5);
    doc.text(clientBits.join('      '), x+4, y+bannerH-3.5);
  }

  return y + bannerH + 7;
}

// ---- Summary grid (the "pr-grid" cells: Gross P&L, Brokerage, Net P&L…)
function pdfDrawGrid(doc, cells, startY){
  const x = PDF_PAGE.mL, w = PDF_CONTENT_W, cols = 3, colW = w/cols, rowH = 15;
  const rows = Math.ceil(cells.length/cols);
  const gridH = rows*rowH;
  const y = ensurePdfSpace(doc, startY, gridH+4);

  doc.setDrawColor(...PDF_THEME.line); doc.setLineWidth(0.2);
  doc.line(x, y, x+w, y);
  doc.line(x, y+gridH, x+w, y+gridH);
  cells.forEach((c,i) => {
    const col = i%cols, row = Math.floor(i/cols);
    const cx = x+col*colW, cy = y+row*rowH;
    if(col>0){ doc.line(cx, y, cx, y+gridH); }
    if(row>0){ doc.line(x, cy, x+w, cy); }
    doc.setFont('DejaVuSans','bold'); doc.setFontSize(7);
    doc.setTextColor(...PDF_THEME.muted);
    doc.text(String(c.label).toUpperCase(), cx+4, cy+5.5, {maxWidth:colW-8});
    doc.setFont('DejaVuSans','bold'); doc.setFontSize(12);
    doc.setTextColor(...(c.cls==='pos' ? PDF_THEME.pos : c.cls==='neg' ? PDF_THEME.neg : PDF_THEME.text));
    doc.text(String(c.value), cx+4, cy+11.8, {maxWidth:colW-8});
  });
  return y + gridH + 8;
}

// ---- Composition pie (+ optional year-by-year bar chart underneath)
function pdfDrawCharts(doc, summaryMap, startY, barRows){
  const x = PDF_PAGE.mL, w = PDF_CONTENT_W;
  const pieSize = 32;
  let y = ensurePdfSpace(doc, startY, pieSize+8);

  const gross = summaryMap['Total Gross PnL'] ?? 0;
  const charges = CHARGE_LABELS.reduce((a,l) => a + (summaryMap[l] ?? 0), 0);
  const net = summaryMap['Net PnL'] ?? (gross - charges);
  const slices = [
    { label:'Net P&L kept', value:Math.abs(net), color: net>=0 ? '#1C9A5B' : '#D54B5A' },
    { label:'Charges & taxes', value:Math.abs(charges), color:'#D8A63A' }
  ];

  doc.setFont('DejaVuSans','bold'); doc.setFontSize(8.5); doc.setTextColor(...PDF_THEME.accent);
  doc.text('P&L COMPOSITION', x, y);
  doc.addImage(pdfPieChartImage(slices), 'PNG', x, y+3, pieSize, pieSize);

  let legY = y+9, legX = x+pieSize+8;
  doc.setFont('DejaVuSans','normal'); doc.setFontSize(8);
  slices.forEach(s => {
    doc.setFillColor(...pdfHexRGB(s.color));
    doc.circle(legX+1.1, legY-1.1, 1.1, 'F');
    doc.setTextColor(...PDF_THEME.text);
    doc.text(`${s.label} — ${fmtMoney(s.value)}`, legX+4.5, legY);
    legY += 5.5;
  });
  doc.setTextColor(...PDF_THEME.muted);
  doc.text(`Gross P&L ${fmtSigned(gross)}`, legX+4.5, legY+0.5);

  let nextY = y + pieSize + 10;

  if(barRows && barRows.length){
    const barH = 42;
    nextY = ensurePdfSpace(doc, nextY, barH+8);
    doc.setFont('DejaVuSans','bold'); doc.setFontSize(8.5); doc.setTextColor(...PDF_THEME.accent);
    doc.text('NET P&L BY YEAR', x, nextY);
    doc.addImage(pdfBarChartImage(barRows), 'PNG', x, nextY+3, w*0.62, barH);
    nextY += barH + 10;
  }
  return nextY;
}

// ---- One transaction table (via autoTable — repeats its header and
// never splits a row across a page break, automatically)
function pdfDrawTable(doc, t, startY){
  const check = crossCheckTable(t);
  const allHeaders = t.headers;
  const skip = String(allHeaders[0] ?? '').trim() === 'Scrip Symbol' ? 1 : 0;
  const headers = allHeaders.slice(skip).map(shortHeader);
  const lastIdx = headers.length - 1;
  const x = PDF_PAGE.mL, w = PDF_CONTENT_W;

  let y = ensurePdfSpace(doc, startY, 14);
  const label = String(t.section || 'Transactions').toUpperCase();
  doc.setFont('DejaVuSans','bold'); doc.setFontSize(9); doc.setTextColor(...PDF_THEME.accent);
  doc.text(label, x, y);
  y += 4;

  if(!t.dataRows.length){
    doc.setFont('DejaVuSans','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_THEME.muted);
    doc.text('No transactions in this section.', x, y+4);
    return y+10;
  }

  if(check && !check.ok){
    const msg = "Recalculated from row data vs this sheet's Total row — " + check.mismatches
      .map(m => `${m.header}: computed ${fmtMoney(m.computed)} vs reported ${fmtMoney(m.reported)} (${fmtSigned(m.diff)})`).join('; ');
    doc.setFont('DejaVuSans','normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_THEME.neg);
    const lines = doc.splitTextToSize(msg, w);
    doc.text(lines, x, y+3);
    y += 3 + lines.length*3.4 + 2;
  }

  const body = t.dataRows.map(r => {
    const rr = r.slice(skip);
    return headers.map((h,idx) => {
      if(idx===0) return String(rr[idx] ?? '');
      const n = num(rr[idx]);
      return n===null ? String(rr[idx] ?? '') : fmtCell(allHeaders[idx+skip], n);
    });
  });
  const lastColNumBody = t.dataRows.map(r => num(r.slice(skip)[lastIdx]));

  let footRow = null, lastColNumFoot = null;
  if(t.totalRow){
    const tr = t.totalRow.slice(skip);
    footRow = headers.map((h,idx) => {
      if(idx===0) return 'Total';
      const n = num(tr[idx]);
      return n===null ? '' : fmtCell(allHeaders[idx+skip], n);
    });
    lastColNumFoot = num(tr[lastIdx]);
  }

  const colStyles = {};
  headers.forEach((h,idx) => { if(idx>0) colStyles[idx] = {halign:'right'}; });

  doc.autoTable({
    startY: y,
    head: [headers],
    body: body,
    foot: footRow ? [footRow] : undefined,
    showFoot: 'lastPage',
    margin: { left: PDF_PAGE.mL, right: PDF_PAGE.mR, top: PDF_PAGE.mT, bottom: PDF_PAGE.mB },
    theme: 'plain',
    styles: { font:'DejaVuSans', fontSize:7.5, cellPadding:{top:1.6,bottom:1.6,left:2.2,right:2.2}, textColor: PDF_THEME.text, lineColor: PDF_THEME.line, lineWidth:0.1, overflow:'linebreak' },
    headStyles: { fontStyle:'bold', textColor: PDF_THEME.accent, lineColor: PDF_THEME.accentDark, lineWidth:{bottom:0.35} },
    footStyles: { fontStyle:'bold', textColor: PDF_THEME.text, fillColor: PDF_THEME.totalBg, lineColor: PDF_THEME.accentDark, lineWidth:{top:0.35} },
    columnStyles: colStyles,
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if(data.column.index === lastIdx && data.column.index > 0){
        let n = null;
        if(data.section === 'body') n = lastColNumBody[data.row.index];
        else if(data.section === 'foot') n = lastColNumFoot;
        if(n !== null && n !== undefined){
          data.cell.styles.textColor = n>=0 ? PDF_THEME.pos : PDF_THEME.neg;
        }
      }
    }
  });
  return doc.lastAutoTable.finalY + 8;
}

// ---- Footer note + legend of abbreviations used in the tables above
function pdfDrawFooter(doc, y, note){
  y = ensurePdfSpace(doc, y, 10);
  doc.setDrawColor(...PDF_THEME.line); doc.setLineWidth(0.2);
  doc.line(PDF_PAGE.mL, y, PDF_PAGE.mL+PDF_CONTENT_W, y);
  doc.setFont('DejaVuSans','normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_THEME.muted);
  doc.text(note, PDF_PAGE.mL, y+5);
  doc.setFont('DejaVuSans','bold'); doc.setTextColor(...PDF_THEME.accent);
  doc.text('BlackRoad', PDF_PAGE.mL+PDF_CONTENT_W, y+5, {align:'right'});
  return y+10;
}
function pdfDrawLegend(doc, y, items){
  if(!items || !items.length) return y;
  y = ensurePdfSpace(doc, y, 8 + items.length*4);
  doc.setFont('DejaVuSans','bold'); doc.setFontSize(8); doc.setTextColor(...PDF_THEME.accent);
  doc.text('ABBREVIATIONS USED ABOVE', PDF_PAGE.mL, y);
  y += 4.5;
  doc.setFont('DejaVuSans','normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_THEME.muted);
  items.forEach(l => { y = ensurePdfSpace(doc, y, 5); doc.text(`•  ${l}`, PDF_PAGE.mL+1, y); y += 4; });
  return y + 4;
}

// ---- One financial year's sheet (mirrors renderSheet)
function pdfDrawSheet(doc, s, generatedAt, yearLabel, showClient, legendItems){
  const summaryMap = {};
  s.summary.forEach(item => { summaryMap[item.label] = item.value; });
  const pnlLabelsToShow = [
    ['Total Gross PnL','Gross P&L'], ['Total Brokerage','Brokerage'],
    ['Total GST','GST'], ['Total STT','STT'],
    ['Net PnL','Net P&L'], ['Intraday Net PnL','Intraday Net P&L'],
  ].filter(([key]) => summaryMap[key] !== undefined);

  const cells = pnlLabelsToShow.map(([key,label]) => {
    const v = summaryMap[key];
    const isPnl = key==='Net PnL' || key==='Intraday Net PnL' || key==='Total Gross PnL';
    return { label, value: fmtMoney(v), cls: isPnl ? (v>=0?'pos':'neg') : '' };
  });

  const clientBits = [];
  if(showClient && s.client['Client Name']) clientBits.push(s.client['Client Name']);
  if(showClient && s.client['Client Id']) clientBits.push(`ID ${s.client['Client Id']}`);
  if(showClient && s.client['PAN']) clientBits.push(`PAN ${s.client['PAN']}`);

  const rangeText = (s.range['From Date'] || s.range['To Date'])
    ? `Period: ${s.range['From Date'] || '—'} to ${s.range['To Date'] || '—'}` : '';
  const subLines = [rangeText, `Generated ${generatedAt}`].filter(Boolean);

  let y = pdfDrawHeader(doc, { title: s.name + (yearLabel ? ` — ${yearLabel}` : ''), subLines, clientBits });
  if(cells.length) y = pdfDrawGrid(doc, cells, y);
  y = pdfDrawCharts(doc, summaryMap, y, null);
  s.tables.forEach(t => { y = pdfDrawTable(doc, t, y); });
  y = pdfDrawLegend(doc, y, legendItems);
  pdfDrawFooter(doc, y, 'Informational only, not investment advice. Equity segment only — F&O excluded.');
}

// ---- Overall multi-year summary page (mirrors renderMultiYearSummary)
function pdfDrawMultiYearSummary(doc, years, generatedAt, client){
  const rows = years.map(y => ({ label: y.label, ...yearSummary(y.sheets) }));
  const grand = rows.reduce((a,r) => ({
    grossTotal:a.grossTotal+r.grossTotal, chargesTotal:a.chargesTotal+r.chargesTotal,
    netTotal:a.netTotal+r.netTotal, txnCount:a.txnCount+r.txnCount
  }), {grossTotal:0, chargesTotal:0, netTotal:0, txnCount:0});

  const cells = [
    { label:'Financial years combined', value:String(years.length), cls:'' },
    { label:'Total transactions', value:String(grand.txnCount), cls:'' },
    { label:'Combined gross P&L', value:fmtMoney(grand.grossTotal), cls: grand.grossTotal>=0?'pos':'neg' },
    { label:'Combined charges & taxes', value:fmtMoney(grand.chargesTotal), cls:'' },
    { label:'Combined net P&L', value:fmtMoney(grand.netTotal), cls: grand.netTotal>=0?'pos':'neg' },
  ];
  const clientBits = [];
  if(client && client['Client Name']) clientBits.push(client['Client Name']);
  if(client && client['Client Id']) clientBits.push(`ID ${client['Client Id']}`);
  if(client && client['PAN']) clientBits.push(`PAN ${client['PAN']}`);

  let y = pdfDrawHeader(doc, {
    title: 'Overall Summary — All Financial Years',
    subLines: ['Equity segment only — F&O excluded from every figure below', `Generated ${generatedAt}`],
    clientBits
  });
  y = pdfDrawGrid(doc, cells, y);
  y = pdfDrawCharts(doc, {'Total Gross PnL':grand.grossTotal, 'Net PnL':grand.netTotal, 'Total Brokerage':grand.chargesTotal}, y, rows);

  y = ensurePdfSpace(doc, y, 12);
  doc.setFont('DejaVuSans','bold'); doc.setFontSize(9); doc.setTextColor(...PDF_THEME.accent);
  doc.text('YEAR-BY-YEAR BREAKDOWN', PDF_PAGE.mL, y);
  y += 4;

  const head = [['Financial year','Txns','Gross P&L','Charges','Net P&L']];
  const body = rows.map(r => [r.label, String(r.txnCount), fmtMoney(r.grossTotal), fmtMoney(r.chargesTotal), fmtMoney(r.netTotal)]);
  const foot = [['All years combined', String(grand.txnCount), fmtMoney(grand.grossTotal), fmtMoney(grand.chargesTotal), fmtMoney(grand.netTotal)]];
  const grossSigns = rows.map(r => r.grossTotal); const netSigns = rows.map(r => r.netTotal);

  doc.autoTable({
    startY: y,
    head, body, foot, showFoot:'lastPage',
    margin: { left: PDF_PAGE.mL, right: PDF_PAGE.mR, top: PDF_PAGE.mT, bottom: PDF_PAGE.mB },
    theme: 'plain',
    styles: { font:'DejaVuSans', fontSize:9, cellPadding:{top:2.2,bottom:2.2,left:2.5,right:2.5}, textColor: PDF_THEME.text, lineColor: PDF_THEME.line, lineWidth:0.1 },
    headStyles: { fontStyle:'bold', textColor: PDF_THEME.accent, lineColor: PDF_THEME.accentDark, lineWidth:{bottom:0.35}, halign:'right' },
    footStyles: { fontStyle:'bold', textColor: PDF_THEME.text, fillColor: PDF_THEME.totalBg, lineColor: PDF_THEME.accentDark, lineWidth:{top:0.35}, halign:'right' },
    columnStyles: { 0:{halign:'left'}, 1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'} },
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if(data.column.index===0) return;
      if(data.column.index===2){
        const n = data.section==='body' ? grossSigns[data.row.index] : grand.grossTotal;
        data.cell.styles.textColor = n>=0 ? PDF_THEME.pos : PDF_THEME.neg;
      }
      if(data.column.index===4){
        const n = data.section==='body' ? netSigns[data.row.index] : grand.netTotal;
        data.cell.styles.textColor = n>=0 ? PDF_THEME.pos : PDF_THEME.neg;
      }
    }
  });
  y = doc.lastAutoTable.finalY + 8;
  pdfDrawFooter(doc, y, "Every total was independently recalculated from row-level data and checked against each file's own totals.");
}

/* ---------------------------------------------------------
   Public: Angel One equity P&L
   --------------------------------------------------------- */
export async function downloadAngelPdf(years){
  const jsPDF = await loadPdfLibs();
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4', compress:true });
  ensurePdfFonts(doc);
  doc.setFont('DejaVuSans','normal');
  PDF_BRAND = 'BlackRoad · Equity P&L Report';

  const generatedAt = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const firstClient = years[0].sheets[0] ? years[0].sheets[0].client : {};
  let clientShown = false;
  let firstPageUsed = false;

  if(years.length > 1){
    pdfDrawMultiYearSummary(doc, years, generatedAt, firstClient);
    clientShown = true;
    firstPageUsed = true;
  }

  const allLegendItems = Array.from(new Map(
    years.flatMap(y => y.sheets.flatMap(s => s.tables.flatMap(t => legendFor(t.headers).map(l => [l,l]))))
  ).values());
  const totalSheets = years.reduce((n,y) => n + y.sheets.length, 0);
  let sheetIdx = 0;

  years.forEach(y => { y.sheets.forEach(s => {
    sheetIdx++;
    const isLast = sheetIdx === totalSheets;
    if(firstPageUsed) doc.addPage(); else firstPageUsed = true;
    pdfDrawSheet(doc, s, generatedAt, years.length>1 ? y.label : '', !clientShown, isLast ? allLegendItems : null);
    clientShown = true;
  }); });

  doc.save(`BlackRoad-Angel-One-Equity-PnL-${new Date().toISOString().slice(0,10)}.pdf`);
}
