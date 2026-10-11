import { BROKERS, REPORTS, hasReader } from "../brokers/brokers.js";

/*
 * Rover + brokerage report readers.
 *
 * Attach your file(s) in the message box, type the broker (suggestions list its reports), send:
 * Rover replies with a summary and a PDF download. It uses the same readers as the Brokerage
 * Report Readers page (today: Angel One -> Profit & Loss), so the numbers are identical.
 * Files are read in the browser only; nothing is uploaded or stored.
 */

export const ACCEPT = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

/* What the person is reading right now (kept in memory only). */
export const session = { broker: -1, report: "", years: [] };
export const resetSession = () => { session.broker = -1; session.report = ""; session.years = []; };

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + money(Math.abs(n));
const toneOf = (n) => (n > 0 ? "up" : n < 0 ? "down" : undefined);

/* ---------- what to suggest while files are attached ---------- */

const pickLabel = (b, r) => `${b.name} · ${r.label}`;

/* "Angel One · Profit & Loss" ... every broker with every report; the ones that work today come first. */
export const PICKS = BROKERS
    .flatMap((b) => REPORTS.map((r) => ({ label: pickLabel(b, r), ok: hasReader(b, r.id) })))
    .sort((a, b) => Number(b.ok) - Number(a.ok))
    .map((x) => x.label);

const REPORT_WORDS = [
    ["pnl", /p\s*&\s*l|pnl|profit|loss/i],
    ["trades", /trade|charge/i],
    ["mf", /mutual|\bmf\b|\bsip\b/i],
    ["holdings", /holding/i],
    ["ledger", /ledger/i]
];

/* Works out the broker (and report) from what was typed or picked. null = no broker named. */
export function resolveRequest(text) {
    const t = String(text || "").toLowerCase();
    let i = BROKERS.findIndex((b) => t.includes(b.name.toLowerCase()));
    if (i < 0) i = BROKERS.findIndex((b) => t.includes(b.name.toLowerCase().split(" ")[0]));
    if (i < 0) return null;

    const hit = REPORT_WORDS.find(([, re]) => re.test(t));
    // Only a broker typed: use the report that works for it (Profit & Loss otherwise).
    const report = hit ? hit[0] : (REPORTS.find((r) => hasReader(BROKERS[i], r.id)) || REPORTS[0]).id;
    return { broker: i, report };
}

/* "upload my brokerage report" typed with no file attached. */
export const WANTS = /\b(upload|attach|brokerage|brokers?|report reader|p&l file|pnl file|contract note)\b/i;
export const flowFromText = (text) => (WANTS.test(String(text || "")) ? "start" : null);

export const pickText = (pick) => pickLabel(BROKERS[pick.broker], REPORTS.find((r) => r.id === pick.report) || REPORTS[0]);

/* ---------- Rover's side of the conversation ---------- */

export const flowLabel = () => "Read a brokerage report";

export function flowReply() {
    return {
        text: "Tap the upload button in the message box (or drop your Excel file(s) here), then type your broker, like **Angel One**. I'll suggest its reports, and you'll get a summary and a PDF.",
        upload: { accept: ACCEPT, multiple: true }
    };
}

/* ---------- reading the files ---------- */

/* Reads the files into session.years and returns Rover's reply (summary, or what went wrong). */
export async function readFiles(files, pick) {
    if (pick) {
        // A new report: start from an empty list. (No pick = adding another year to the current one.)
        if (session.broker !== pick.broker || session.report !== pick.report) session.years = [];
        session.broker = pick.broker;
        session.report = pick.report;
    }

    const broker = BROKERS[session.broker];
    const report = REPORTS.find((r) => r.id === session.report);
    if (!broker || !report) return flowReply();
    if (!hasReader(broker, session.report)) {
        return {
            text: `${broker.name} · ${report.label} isn't available yet. It's coming soon.\nRight now I can read **Angel One · Profit & Loss**. Attach that file and pick it from the suggestions.`
        };
    }

    const [{ loadXlsx }, { readAngelWorkbook }] = await Promise.all([
        import("../brokers/angel-pnl/angel-libs.js"),
        import("../brokers/angel-pnl/angel-parser.js")
    ]);

    const errors = [];
    let XLSX;
    try { XLSX = await loadXlsx(); } catch (e) { return retry(e.message); }

    for (const file of files) {
        if (!/\.xlsx?$/i.test(file.name)) { errors.push(`${file.name} isn't an Excel file.`); continue; }
        if (session.years.some((y) => y.fname === file.name)) { errors.push(`${file.name} is already added.`); continue; }
        try {
            const buffer = await file.arrayBuffer();
            session.years.push(readAngelWorkbook(XLSX, buffer, file.name, session.years.length + 1));
        } catch (e) {
            errors.push(e.message || `Couldn't read ${file.name} as an Angel One P&L export.`);
        }
    }

    if (!session.years.length) return retry(errors.join(" "));
    return summaryReply(errors);
}

function retry(message) {
    return { text: `${message || "I couldn't read that file."} Please try another file.`, upload: { accept: ACCEPT, multiple: true } };
}

async function summaryReply(errors) {
    const { yearSummary, crossCheckTable, shortYearLabel } = await import("../brokers/angel-pnl/angel-parser.js");
    const years = session.years;
    const rows = years.map((y, i) => ({ label: shortYearLabel(y.label, i), full: y.label, ...yearSummary(y.sheets) }));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const net = sum("netTotal"), gross = sum("grossTotal"), charges = sum("chargesTotal"), trades = sum("txnCount");

    // Did every total match the file's own totals?
    let checked = 0, off = 0;
    years.forEach((y) => y.sheets.forEach((s) => s.tables.forEach((t) => {
        const c = crossCheckTable(t);
        if (c) { checked += c.checked; off += c.mismatches.length; }
    })));

    // Best and worst scrips by gross P&L, adding up repeats across sections and years.
    const bySymbol = new Map();
    years.forEach((y) => y.sheets.forEach((s) => s.tables.forEach((t) => {
        const iSym = t.headers.findIndex((h) => String(h).trim().toLowerCase() === "scrip symbol");
        const iPnl = t.headers.findIndex((h) => /^gross\s*pnl$/i.test(String(h).trim()));
        if (iSym < 0 || iPnl < 0) return;
        t.dataRows.forEach((r) => {
            const v = parseFloat(String(r[iPnl]).replace(/,/g, ""));
            if (Number.isFinite(v)) bySymbol.set(String(r[iSym]).trim(), (bySymbol.get(String(r[iSym]).trim()) || 0) + v);
        });
    })));
    const ranked = [...bySymbol.entries()].sort((a, b) => b[1] - a[1]);
    const gainers = ranked.filter(([, v]) => v > 0).slice(0, 5);
    const losers = ranked.filter(([, v]) => v < 0).slice(-5).reverse();
    const scripTable = (title, list) => ({
        kind: "table", title,
        columns: [{ label: "Scrip", fmt: "text" }, { label: "Gross P&L", fmt: "text" }],
        rows: list.map(([sym, v]) => [sym, signed(v)])
    });

    const blocks = [{
        kind: "kpi",
        items: [
            { label: "Net P&L", value: signed(net), fmt: "text", tone: toneOf(net) },
            { label: "Gross P&L", value: signed(gross), fmt: "text", tone: toneOf(gross) },
            { label: "Charges & taxes", value: money(charges), fmt: "text" },
            { label: "Transactions", value: String(trades), fmt: "text" }
        ]
    }];

    if (rows.length > 1) {
        blocks.push({
            kind: "table", title: "Year by year",
            columns: [{ label: "Year", fmt: "text" }, { label: "Net P&L", fmt: "text" }, { label: "Gross P&L", fmt: "text" }, { label: "Charges", fmt: "text" }],
            rows: rows.map((r) => [r.label, signed(r.netTotal), signed(r.grossTotal), money(r.chargesTotal)])
        });
    }
    if (gainers.length) blocks.push(scripTable("Top gainers", gainers));
    if (losers.length) blocks.push(scripTable("Top losers", losers));

    const client = years[0]?.sheets[0]?.client || {};
    const name = client["Client Name"] ? ` for ${client["Client Name"]}` : "";
    const period = rows.length === 1 ? rows[0].full : `${rows.length} financial years (${rows.map((r) => r.label).join(", ")})`;
    const verdict = !checked ? "" : off === 0
        ? "\nI recalculated every total and they all match the file's own totals."
        : `\n${off} total${off > 1 ? "s" : ""} didn't match the file's own figures. Please check the PDF before relying on it.`;
    const skipped = errors.length ? `\nNot added: ${errors.join(" ")}` : "";

    return {
        text: `Here's your Angel One Profit & Loss summary${name}, ${period}. Equity only. F&O is left out.${verdict}${skipped}\nWould you like the full report as a PDF?`,
        blocks,
        actions: [{ label: "Download PDF report", download: "broker-pdf" }],
        choices: [
            { label: "Add another year", flow: "more" },
            { label: "Upload another report", flow: "new", quiet: true }
        ]
    };
}

/* ---------- the PDF ---------- */

export async function downloadBrokerPdf(progress) {
    if (!session.years.length) return "empty";
    const { downloadAngelPdf } = await import("../brokers/angel-pnl/angel-pdf.js");
    await downloadAngelPdf(session.years, { beforeSave: () => progress.ready() });
    return "done";
}
