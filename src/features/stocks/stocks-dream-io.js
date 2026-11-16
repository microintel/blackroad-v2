/*
 * stocks-dream-io.js
 *
 * Export / import for the Dream tab ONLY. It is separate from the global
 * Data Management backup and never touches any other module.
 *
 *   Excel  (.xlsx)  readable report + the same sheets can be imported back
 *   Backup (.json)  exact copy of the Dream data
 *
 * Import accepts .xlsx / .xls / .csv / .json, merges or replaces, and
 * checks every paper trade (no selling shares that were not held, no
 * overspending virtual funds) — bad rows are skipped and reported.
 */

import { loadXlsx } from "../brokers/angel-pnl/angel-libs.js";
import { genId, round2, round6, cmpTxn } from "./stocks-service.js";
import { computeBook, validateBook, normalizeBook, nextSeq, sortTrades } from "./stocks-dream-book.js";

const pad = (n) => String(n).padStart(2, "0");

function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* =========================================
   EXPORT
========================================= */

export function exportDreamJSON({ dreams, book }) {
    const payload = {
        app: "BlackRoad",
        type: "stocks-dream",
        version: 1,
        exportedAt: new Date().toISOString(),
        dreams,
        book: { trades: book.trades, funds: book.funds }
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `BlackRoad-Dream-${stamp()}.json`);
}

/*
 * rows   = [{ d, c }]  wishlist entries with calculated values
 * prices = { SYMBOL: live price } for paper holdings
 */
export async function exportDreamExcel({ rows, book, prices }) {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const s = computeBook(book.trades, prices, book.funds);

    const add = (name, aoa, widths, moneyCols = [], pctCols = []) => {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = widths.map((w) => ({ wch: w }));
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
        for (let r = 1; r <= range.e.r; r++) {
            moneyCols.forEach((c) => {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                if (cell && cell.t === "n") cell.z = "#,##0.00";
            });
            pctCols.forEach((c) => {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                if (cell && cell.t === "n") cell.z = "0.00";
            });
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
    };

    /* ----- Summary ----- */
    const sum = [
        ["BlackRoad — Dream stocks summary"],
        ["Generated", new Date().toLocaleString("en-IN")],
        ["Hypothetical figures. Not part of holdings or net worth."],
        [],
        ["PAPER TRADING", ""],
        ["Virtual funds", book.funds === null ? "No limit" : book.funds],
        ["Cash available", s.cash === null ? "—" : s.cash],
        ["Invested (open positions)", s.invested],
        ["Value now", s.value],
        ["Unrealized P&L", s.unrealized],
        ["Unrealized %", round2(s.unrealizedPct)],
        ["Realized P&L", s.realized],
        ["Total P&L", s.total],
        ["Return % (on cost)", round2(s.returnPct)],
        ["Total bought", s.bought],
        ["Total sold", s.sold],
        ["Trades (buys / sells)", `${s.trades} (${s.buys} / ${s.sellCount})`],
        ["Open positions", s.holdings.length],
        ["Closed positions", s.closed.length],
        ["Win rate % (closed sells)", s.winRate === null ? "—" : round2(s.winRate)],
        ["Best sell", s.best ? `${s.best.symbol} ${s.best.pnl}` : "—"],
        ["Worst sell", s.worst ? `${s.worst.symbol} ${s.worst.pnl}` : "—"],
        [],
        ["WISHLIST", ""],
        ["Stocks on wishlist", rows.length]
    ];
    const priced = rows.filter((r) => r.c.ltp != null);
    const wInv = priced.reduce((a, r) => a + r.d.amount, 0);
    const wVal = priced.reduce((a, r) => a + r.c.value, 0);
    sum.push(["If bought", round2(wInv)], ["Value now", round2(wVal)], ["Growth", round2(wVal - wInv)], ["Growth %", wInv > 0 ? round2(((wVal - wInv) / wInv) * 100) : 0]);
    if (s.monthly.length) {
        sum.push([], ["REALIZED P&L BY MONTH", ""]);
        s.monthly.forEach(([m, v]) => sum.push([m, v]));
    }
    add("Summary", sum, [30, 22], [1]);

    /* ----- Holdings ----- */
    add(
        "Holdings",
        [
            ["Symbol", "Name", "Quantity", "Avg Price", "Live Price", "Invested", "Value Now", "Unrealized P&L", "Unrealized %", "Realized P&L", "Weight %"],
            ...s.holdings.map((h) => [h.symbol, h.name, h.quantity, h.avgPrice, h.priced ? h.currentPrice : "", h.investedValue, h.currentValue, h.unrealizedPnL, h.unrealizedPnLPct, h.realizedPnL, round2(h.weight)])
        ],
        [12, 28, 10, 12, 12, 14, 14, 15, 13, 14, 10],
        [3, 4, 5, 6, 7, 9],
        [8, 10]
    );

    /* ----- Realized ----- */
    add(
        "Realized",
        [
            ["Date", "Time", "Symbol", "Name", "Quantity", "Sell Price", "Sale Value", "Cost Basis", "Realized P&L", "Return %"],
            ...s.sells.map((r) => [r.trade.date, r.trade.time || "", r.symbol, r.name, r.trade.quantity, r.trade.price, r.amount, r.costBasis, r.pnl, r.pct === null ? "" : round2(r.pct)])
        ],
        [12, 10, 12, 28, 10, 12, 14, 14, 14, 11],
        [5, 6, 7, 8],
        [9]
    );

    /* ----- Trades (importable) ----- */
    const pnlById = {};
    s.sells.forEach((r) => (pnlById[r.trade.id] = r.pnl));
    add(
        "Trades",
        [
            ["ID", "Date", "Time", "Symbol", "Name", "Type", "Quantity", "Price", "Amount", "Realized P&L", "Notes"],
            ...sortTrades(book.trades).map((t) => [t.id, t.date, t.time || "", t.symbol, t.name || t.symbol, t.type, t.quantity, t.price, round2(t.quantity * t.price), pnlById[t.id] ?? "", t.notes || ""])
        ],
        [20, 12, 10, 12, 28, 8, 10, 12, 14, 14, 30],
        [7, 8, 9]
    );

    /* ----- Wishlist (importable) ----- */
    add(
        "Wishlist",
        [
            ["ID", "Date Seen", "Time Seen", "Symbol", "Name", "Price Seen", "Amount", "Target Price", "Notes", "Shares", "Live Price", "Worth Now", "Growth", "Growth %"],
            ...rows.map(({ d, c }) => [d.id, d.date, d.time || "", d.symbol, d.name, d.seenPrice, d.amount, d.target > 0 ? d.target : "", d.notes || "", round6(c.qty), c.ltp ?? "", c.ltp != null ? c.value : "", c.ltp != null ? c.gain : "", c.ltp != null ? round2(c.pct) : ""])
        ],
        [20, 12, 10, 12, 28, 12, 12, 12, 30, 10, 12, 14, 12, 10],
        [5, 6, 7, 10, 11, 12],
        [13]
    );

    /* ----- Meta (importable) ----- */
    add("Meta", [["Key", "Value"], ["App", "BlackRoad"], ["Type", "stocks-dream"], ["Version", 1], ["Exported At", new Date().toISOString()], ["Virtual Funds", book.funds === null ? "" : book.funds]], [16, 30]);

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `BlackRoad-Dream-${stamp()}.xlsx`);
}

/* =========================================
   IMPORT — parse a file
========================================= */

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES = {
    id: ["id"],
    date: ["date", "dateseen", "tradedate", "seendate", "day"],
    time: ["time", "timeseen", "tradetime"],
    symbol: ["symbol", "stock", "ticker", "scrip", "code"],
    name: ["name", "company", "companyname", "stockname"],
    type: ["type", "side", "action", "buysell", "tradetype"],
    qty: ["quantity", "qty", "shares", "units"],
    price: ["price", "rate", "tradeprice", "avgprice"],
    seen: ["priceseen", "seenprice", "sawat", "priceisaw", "pricesaw"],
    amount: ["amount", "value", "investment", "invested"],
    target: ["targetprice", "target", "buybelow", "buyprice"],
    notes: ["notes", "note", "remarks", "comment"]
};

function mapHeaders(row) {
    const map = {};
    row.forEach((cell, i) => {
        const h = norm(cell);
        if (!h) return;
        for (const [key, names] of Object.entries(ALIASES)) {
            if (map[key] === undefined && names.includes(h)) map[key] = i;
        }
    });
    return map;
}

function toNum(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    const t = String(v ?? "").replace(/[₹$,\s]/g, "");
    return t === "" ? NaN : Number(t);
}

function makeParsers(XLSX) {
    const toDate = (v) => {
        if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
        if (typeof v === "number" && v > 20000 && v < 80000) {
            const o = XLSX.SSF.parse_date_code(v);
            if (o) return `${o.y}-${pad(o.m)}-${pad(o.d)}`;
        }
        const t = String(v ?? "").trim();
        if (!t) return "";
        let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
        if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
        m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
        if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
        const d = new Date(t + " 12:00");
        return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const toTime = (v) => {
        if (v === "" || v === null || v === undefined) return "";
        if (typeof v === "number") {
            const frac = v - Math.floor(v);
            if (frac <= 0) return "";
            const secs = Math.round(frac * 86400);
            const h = Math.floor(secs / 3600) % 24;
            const mi = Math.floor((secs % 3600) / 60);
            const se = secs % 60;
            return se ? `${pad(h)}:${pad(mi)}:${pad(se)}` : `${pad(h)}:${pad(mi)}`;
        }
        const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(String(v).trim());
        if (!m) return "";
        let h = +m[1];
        if (m[4]) {
            const pm = m[4].toLowerCase() === "pm";
            h = (h % 12) + (pm ? 12 : 0);
        }
        if (h > 23 || +m[2] > 59) return "";
        const se = m[3] ? +m[3] : 0;
        return se ? `${pad(h)}:${m[2]}:${pad(se)}` : `${pad(h)}:${m[2]}`;
    };
    return { toDate, toTime };
}

const cleanSymbol = (v) =>
    String(v ?? "")
        .trim()
        .toUpperCase()
        .replace(/^(NSE|BSE):/, "")
        .replace(/\.(NS|BO)$/, "");

function parseSheet(rows, p, rejected, sheetName) {
    let hi = -1;
    let map = null;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const m = mapHeaders(rows[i]);
        if (m.symbol !== undefined && Object.keys(m).length >= 3) {
            hi = i;
            map = m;
            break;
        }
    }
    if (hi < 0) return null;

    const isTrades = map.type !== undefined && map.qty !== undefined;
    const isWish = !isTrades && (map.seen !== undefined || (map.price !== undefined && map.amount !== undefined));
    if (!isTrades && !isWish) return null;

    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c) => c === "" || c === null || c === undefined)) continue;
        const at = `${sheetName} row ${i + 1}`;
        const get = (k) => (map[k] === undefined ? "" : r[map[k]]);

        const symbol = cleanSymbol(get("symbol"));
        const date = p.toDate(get("date"));
        const time = p.toTime(get("time"));
        const name = String(get("name") ?? "").trim() || symbol;
        const notes = String(get("notes") ?? "").trim();
        const id = String(get("id") ?? "").trim();

        if (!symbol) { rejected.push(`${at}: no symbol`); continue; }
        if (!date) { rejected.push(`${at} (${symbol}): date missing or not readable`); continue; }

        if (isTrades) {
            const t = String(get("type")).trim().toUpperCase();
            const type = t.startsWith("B") ? "BUY" : t.startsWith("S") ? "SELL" : "";
            const quantity = round6(toNum(get("qty")));
            const price = round2(toNum(get("price")));
            if (!type) { rejected.push(`${at} (${symbol}): type must be Buy or Sell`); continue; }
            if (!(quantity > 0)) { rejected.push(`${at} (${symbol}): quantity must be above 0`); continue; }
            if (!(price > 0)) { rejected.push(`${at} (${symbol}): price must be above 0`); continue; }
            out.push({ id, symbol, name, type, quantity, price, date, time, notes });
        } else {
            const seenPrice = round2(toNum(map.seen !== undefined ? get("seen") : get("price")));
            let amount = round2(toNum(get("amount")));
            if (!(amount > 0) && map.qty !== undefined && seenPrice > 0) amount = round2(toNum(get("qty")) * seenPrice);
            const tg = round2(toNum(get("target")));
            if (!(seenPrice > 0)) { rejected.push(`${at} (${symbol}): price seen must be above 0`); continue; }
            if (!(amount > 0)) { rejected.push(`${at} (${symbol}): amount must be above 0`); continue; }
            out.push({ id, symbol, name, seenPrice, amount, date, time, target: tg > 0 ? tg : null, notes });
        }
    }
    return { kind: isTrades ? "trades" : "wishlist", rows: out };
}

/*
 * Reads a file. Returns
 * { fileName, dreams: [] | null, trades: [] | null, funds: number | null | undefined, rejected: [] }
 * dreams / trades are null when the file has no such section.
 */
export async function parseDreamFile(file) {
    const rejected = [];
    const result = { fileName: file.name, dreams: null, trades: null, funds: undefined, rejected };
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".json")) {
        let data;
        try {
            data = JSON.parse(await file.text());
        } catch (e) {
            throw new Error("This file is not valid JSON.");
        }
        const arr = Array.isArray(data) ? data : null;
        const dreams = Array.isArray(data?.dreams) ? data.dreams : arr && arr.length && arr[0].seenPrice !== undefined ? arr : null;
        const trades = Array.isArray(data?.book?.trades) ? data.book.trades : Array.isArray(data?.trades) ? data.trades : arr && arr.length && arr[0].type ? arr : null;
        if (!dreams && !trades) throw new Error("No Dream stocks or paper trades found in this file.");
        if (dreams) {
            result.dreams = [];
            dreams.forEach((d, i) => {
                if (d && d.symbol && d.seenPrice > 0 && d.amount > 0 && d.date) {
                    result.dreams.push({ id: d.id || "", symbol: cleanSymbol(d.symbol), name: d.name || d.symbol, seenPrice: round2(d.seenPrice), amount: round2(d.amount), date: d.date, time: d.time || "", target: d.target > 0 ? round2(d.target) : null, notes: d.notes || "" });
                } else rejected.push(`Wishlist item ${i + 1}: incomplete`);
            });
        }
        if (trades) {
            result.trades = [];
            trades.forEach((t, i) => {
                const ty = String(t?.type || "").toUpperCase();
                if (t && t.symbol && (ty === "BUY" || ty === "SELL") && t.quantity > 0 && t.price > 0 && t.date) {
                    result.trades.push({ id: t.id || "", symbol: cleanSymbol(t.symbol), name: t.name || t.symbol, type: ty, quantity: round6(t.quantity), price: round2(t.price), date: t.date, time: t.time || "", notes: t.notes || "" });
                } else rejected.push(`Trade ${i + 1}: incomplete`);
            });
        }
        if (data?.book && data.book.funds !== undefined) result.funds = normalizeBook({ trades: [], funds: data.book.funds }).funds;
        return result;
    }

    const XLSX = await loadXlsx();
    let wb;
    try {
        wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    } catch (e) {
        throw new Error("This file could not be read. Use an Excel, CSV or JSON file exported from Dream.");
    }
    const p = makeParsers(XLSX);

    wb.SheetNames.forEach((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        const lname = name.toLowerCase();

        if (lname === "meta") {
            rows.forEach((r) => {
                if (norm(r[0]) === "virtualfunds") {
                    const n = toNum(r[1]);
                    result.funds = isNaN(n) || n < 0 ? null : round2(n);
                }
            });
            return;
        }
        if (["summary", "holdings", "realized"].includes(lname)) return; // read-only report sheets

        const parsed = parseSheet(rows, p, rejected, name);
        if (!parsed) return;
        if (parsed.kind === "trades") result.trades = (result.trades || []).concat(parsed.rows);
        else result.dreams = (result.dreams || []).concat(parsed.rows);
    });

    if (!result.dreams && !result.trades) {
        throw new Error("Could not find Wishlist or Trades data. Import a file exported from Dream (sheets named Wishlist and Trades).");
    }
    return result;
}

/* =========================================
   IMPORT — apply (merge / replace)
========================================= */

const tradeSig = (t) => [t.symbol, t.date, t.time || "", t.type, round6(t.quantity), round2(t.price)].join("|");
const wishSig = (d) => [d.symbol, d.date, d.time || "", round2(d.seenPrice), round2(d.amount)].join("|");

/*
 * current = { dreams, book }. mode = "merge" | "replace".
 * Returns { dreams, book, report }. Pure — saves nothing.
 */
export function applyDreamImport(parsed, current, mode) {
    const replace = mode === "replace";
    const report = { wishAdded: 0, wishSkipped: 0, tradesAdded: 0, tradesSkipped: 0, notes: [] };
    let dreams = current.dreams;
    let book = { trades: current.book.trades.slice(), funds: current.book.funds };

    /* wishlist */
    if (parsed.dreams) {
        const base = replace ? [] : dreams.slice();
        const ids = new Set(base.map((d) => d.id));
        const sigs = new Set(base.map(wishSig));
        parsed.dreams.forEach((d) => {
            if ((d.id && ids.has(d.id)) || sigs.has(wishSig(d))) {
                report.wishSkipped++;
                return;
            }
            const id = d.id && !ids.has(d.id) ? d.id : "dream_" + genId().slice(4);
            const item = { id, createdAt: Date.now() + base.length, symbol: d.symbol, name: d.name || d.symbol, seenPrice: d.seenPrice, amount: d.amount, date: d.date, notes: d.notes || "" };
            if (d.time) item.time = d.time;
            if (d.target > 0) item.target = d.target;
            base.push(item);
            ids.add(id);
            sigs.add(wishSig(d));
            report.wishAdded++;
        });
        dreams = base;
    }

    /* paper trades */
    if (parsed.trades || parsed.funds !== undefined) {
        // Replace takes the file's funds; Add only fills them in when none are set
        if (parsed.funds !== undefined && (replace || book.funds === null)) book.funds = parsed.funds;
        let accepted = replace && parsed.trades ? [] : book.trades.slice();

        if (parsed.trades) {
            const ids = new Set(accepted.map((t) => t.id));
            const sigs = new Set(accepted.map(tradeSig));
            let seq = nextSeq(accepted);

            const fresh = [];
            parsed.trades.forEach((t, i) => {
                if ((t.id && ids.has(t.id)) || sigs.has(tradeSig(t))) {
                    report.tradesSkipped++;
                    return;
                }
                const id = t.id && !ids.has(t.id) ? t.id : "ptx_" + genId().slice(4);
                ids.add(id);
                sigs.add(tradeSig(t));
                fresh.push({ id, symbol: t.symbol, name: t.name || t.symbol, type: t.type, quantity: t.quantity, price: t.price, date: t.date, time: t.time || "", notes: t.notes || "", seq: seq + i, createdAt: Date.now() + i });
            });

            // Oldest first, so a buy is always in place before the sell that needs it.
            // A trade that would break the book (oversell / overspend) is skipped.
            fresh.sort(cmpTxn).forEach((t) => {
                const err = validateBook([...accepted, t], book.funds);
                if (err) {
                    report.tradesSkipped++;
                    report.notes.push(`${t.type} ${t.symbol} ${t.date}: ${err.message}`);
                } else {
                    accepted.push(t);
                    report.tradesAdded++;
                }
            });
            book.trades = accepted;
        }

        // New funds must still cover the trades that are kept
        if (book.funds !== current.book.funds && validateBook(book.trades, book.funds)) {
            report.notes.push("Virtual funds in the file are too low for the kept trades — your current funds were kept.");
            book.funds = current.book.funds;
        }
    }

    return { dreams, book, report };
}

