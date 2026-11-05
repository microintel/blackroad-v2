/*
 * stocks-pnl-summary.js
 *
 * "Profit & Loss summary" for the Stocks Analytics tab: realized P&L
 * grouped month by month or year by year over a date range, a monthly
 * strip (one dot per sale: green = profit, red = loss) and a table
 * underneath with Month-wise / Year-wise / Scrip-wise views.
 *
 *  - Uses the same realized P&L the rest of the module uses
 *    (getTxnPnLMap, average-cost method), counted on the SELL date.
 *  - Click a month / year / scrip row to see the individual sales.
 *  - Read-only: never writes anything, never touches stored data.
 */

import {
    getTxnPnLMap,
    getSymbolName,
    fmtMoney,
    fmtSigned,
    fmtPct,
    fmtDate,
    pnlClass,
    round2,
    cmpTxn
} from "./stocks-service.js";
import { tipAttr } from "../../components/chart-tooltip.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PLOT_H = 250;      // height of the bar area (px)
const LABEL_PAD = 24;    // room for the value label above / below a bar (px)
const NF = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

const RANGES = [
    { key: "3m", label: "3 Months", months: 3 },
    { key: "6m", label: "6 Months", months: 6 },
    { key: "1y", label: "1 Year", months: 12 },
    { key: "all", label: "All", months: 0 },
    { key: "custom", label: "Custom", months: 0 }
];

const VIEWS = [
    { key: "month", label: "Month-Wise" },
    { key: "year", label: "Year-Wise" },
    { key: "scrip", label: "Scrip-Wise" }
];

function esc(s) {
    return String(s ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

function plural(n, one) {
    return `${n} ${one}${n === 1 ? "" : "s"}`;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function ymd(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(ym, long) {
    const [y, m] = ym.split("-").map(Number);
    return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/* 1.2L, 45K ... with the app's currency symbol. Full amounts are in the tooltip. */
function short(n) {
    const sym = fmtMoney(0, true).replace(/[0-9.,\s-]/g, "");
    const v = Math.abs(n);
    return (n < 0 ? "-" : "") + sym + (v < 1000 ? Math.round(v).toString() : NF.format(v));
}

/* =========================================
   DATA
========================================= */

/* Every SELL with its realized P&L, oldest first. */
function collectSales(transactions) {
    const pnlMap = getTxnPnLMap(transactions);

    return transactions
        .filter((t) => t.type === "SELL" && t.date)
        .slice()
        .sort(cmpTxn)
        .map((t) => {
            const value = round2(t.quantity * t.price);
            const pnl = pnlMap[t.id] || 0;
            const cost = round2(value - pnl);
            return {
                id: t.id,
                date: t.date,
                symbol: t.symbol,
                quantity: t.quantity,
                price: t.price,
                value,
                pnl,
                pct: cost > 0 ? (pnl / cost) * 100 : null
            };
        });
}

function emptyBucket(key, label) {
    return { key, label, trades: 0, wins: 0, losses: 0, sold: 0, pnl: 0, sales: [] };
}

function group(sales, keyOf, labelOf) {
    const map = new Map();

    for (const s of sales) {
        const k = keyOf(s);
        let b = map.get(k);
        if (!b) {
            b = emptyBucket(k, labelOf(k, s));
            map.set(k, b);
        }
        b.trades++;
        if (s.pnl >= 0) b.wins++;
        else b.losses++;
        b.sold = round2(b.sold + s.value);
        b.pnl = round2(b.pnl + s.pnl);
        b.sales.push(s);
    }

    return [...map.values()];
}

/* Resolve the active range to { from, to } date strings (inclusive). */
function resolveRange(state, sales) {
    const today = new Date();
    const todayStr = ymd(today);

    if (state.range === "custom") {
        return { from: state.from || "", to: state.to || todayStr };
    }

    const def = RANGES.find((r) => r.key === state.range);
    if (def && def.months) {
        // Start of the month (months - 1) back, so "3 Months" = this month + 2 before.
        const start = new Date(today.getFullYear(), today.getMonth() - (def.months - 1), 1);
        return { from: ymd(start), to: todayStr };
    }

    return { from: sales.length ? sales[0].date : "", to: todayStr };
}

function monthsBetween(from, to) {
    if (!from || !to) return [];
    const out = [];
    let [y, m] = from.slice(0, 7).split("-").map(Number);
    const [ey, em] = to.slice(0, 7).split("-").map(Number);

    while ((y < ey || (y === ey && m <= em)) && out.length < 240) {
        out.push(`${y}-${pad(m)}`);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
    }
    return out;
}

/* =========================================
   COMPONENT
========================================= */

export function createPnlSummary(container) {
    if (!container) return { update() {} };

    const state = {
        range: "all",
        from: "",
        to: "",
        view: "month",
        open: new Set()
    };

    let transactions = [];
    let chartScroll = null; // null = show the newest months first time

    function render() {
        const all = collectSales(transactions);

        if (!all.length) {
            container.innerHTML = `<div class="br-empty-state">No sales yet. Once you sell a stock, its profit or loss shows up here month by month.</div>`;
            return;
        }

        const { from, to } = resolveRange(state, all);
        const sales = all.filter((s) => (!from || s.date >= from) && (!to || s.date <= to));

        const total = round2(sales.reduce((s, x) => s + x.pnl, 0));
        const wins = sales.filter((s) => s.pnl >= 0).length;
        const losses = sales.length - wins;
        const sold = round2(sales.reduce((s, x) => s + x.value, 0));

        const byMonth = group(sales, (s) => s.date.slice(0, 7), (k) => monthLabel(k, true));
        const best = byMonth.slice().sort((a, b) => b.pnl - a.pnl)[0];
        const worst = byMonth.slice().sort((a, b) => a.pnl - b.pnl)[0];

        // Keep the chart where the person scrolled it (first time: the newest months).
        const old = container.querySelector(".stk-ps-scroll");
        if (old) chartScroll = old.scrollLeft;

        container.innerHTML = `
            ${renderControls(from, to)}
            <div class="stk-ps-tiles">
                <div class="stk-ps-tile stk-ps-tile-main">
                    <span class="stk-ps-tile-label">Realized P&amp;L</span>
                    <strong class="stk-ps-tile-value ${sales.length ? "br-pnl-" + pnlClass(total) : ""}">${sales.length ? fmtSigned(total, true) : fmtMoney(0, true)}</strong>
                    <span class="stk-ps-tile-sub">${plural(sales.length, "sale")} · <span class="br-pnl-pos">${wins} profit</span> · <span class="br-pnl-neg">${losses} loss</span></span>
                </div>
                ${tile("Best month", best ? fmtSigned(best.pnl, true) : "–", best ? pnlClass(best.pnl) : "", best ? monthLabel(best.key, true) : "")}
                ${tile("Worst month", worst ? fmtSigned(worst.pnl, true) : "–", worst ? pnlClass(worst.pnl) : "", worst ? monthLabel(worst.key, true) : "")}
                ${tile("Sale value", fmtMoney(sold, true), "", "")}
            </div>
            ${renderChart(byMonth, from, to)}
            ${renderTable(sales, byMonth, from, to)}
        `;

        const sc = container.querySelector(".stk-ps-scroll");
        if (sc) sc.scrollLeft = chartScroll === null ? sc.scrollWidth : chartScroll;
    }

    function tile(label, value, tone, sub) {
        return `
            <div class="stk-ps-tile">
                <span class="stk-ps-tile-label">${label}</span>
                <strong class="stk-ps-tile-value${tone ? " br-pnl-" + tone : ""}">${value}</strong>
                ${sub ? `<span class="stk-ps-tile-sub">${esc(sub)}</span>` : ""}
            </div>`;
    }

    function renderControls(from, to) {
        return `
            <div class="stk-ps-controls">
                <div class="br-chip-row" role="group" aria-label="Date range">
                    ${RANGES.map((r) => `<button type="button" class="br-chip${state.range === r.key ? " active" : ""}" data-ps-range="${r.key}">${r.label}</button>`).join("")}
                </div>
                ${state.range === "custom" ? `
                <div class="stk-ps-custom">
                    <label>From <input type="date" class="br-input" data-ps-from value="${esc(state.from || from)}"></label>
                    <label>To <input type="date" class="br-input" data-ps-to value="${esc(state.to || to)}"></label>
                </div>` : ""}
            </div>
            <div class="br-muted stk-ps-period">Showing P&amp;L summary for <b>${from ? fmtDate(from) : "start"}</b> – <b>${to ? fmtDate(to) : "today"}</b></div>`;
    }

    /* Monthly bar chart: green up for profit, red down for loss, one column per month. */
    function renderChart(byMonth, from, to) {
        const lookup = new Map(byMonth.map((b) => [b.key, b]));
        const months = monthsBetween(from, to);
        if (!months.length) return "";

        const vals = months.map((k) => lookup.get(k)?.pnl || 0);
        const maxPos = Math.max(0, ...vals);
        const maxNeg = Math.max(0, ...vals.map((v) => -v));
        const span = maxPos + maxNeg || 1;
        const usable = PLOT_H - (maxPos > 0 ? LABEL_PAD : 0) - (maxNeg > 0 ? LABEL_PAD : 0);
        const upH = (maxPos > 0 ? LABEL_PAD : 0) + (usable * maxPos) / span;
        const downH = (maxNeg > 0 ? LABEL_PAD : 0) + (usable * maxNeg) / span;
        const barH = (v) => (v === 0 ? 0 : Math.max(6, Math.round((usable * Math.abs(v)) / span)));

        const cols = months.map((k) => {
            const b = lookup.get(k);
            const v = b ? b.pnl : 0;
            const up = v > 0;
            const down = v < 0;
            const tip = b
                ? tipAttr(monthLabel(k, true), [
                    ["Realized P&L", fmtSigned(v), up || v === 0 ? "var(--br-success)" : "var(--br-danger)"],
                    ["Sales", `${b.trades} (${b.wins} profit / ${b.losses} loss)`],
                    ["Sale value", fmtMoney(b.sold, true)]
                ])
                : "";

            return `
                <div class="stk-ps-col${b ? " has" : ""}" ${tip}>
                    <div class="stk-ps-up" style="height:${upH}px">
                        ${up ? `<span class="stk-ps-val pos">${short(v)}</span><i class="stk-ps-bar pos" style="height:${barH(v)}px"></i>` : ""}
                    </div>
                    <div class="stk-ps-down" style="height:${downH}px">
                        ${down ? `<i class="stk-ps-bar neg" style="height:${barH(v)}px"></i><span class="stk-ps-val neg">${short(v)}</span>` : ""}
                        ${!b ? `<i class="stk-ps-stub"></i>` : ""}
                    </div>
                    <div class="stk-ps-month">${monthLabel(k)}</div>
                    <div class="stk-ps-count">${b ? plural(b.trades, "sale") : "–"}</div>
                </div>`;
        });

        return `
            <div class="stk-ps-chart">
                <div class="stk-ps-scroll">
                    <div class="stk-ps-bars" style="min-width:${months.length * 64}px">${cols.join("")}</div>
                </div>
            </div>`;
    }

    function renderTable(sales, byMonth, from, to) {
        let rows;
        let first;

        if (state.view === "year") {
            rows = group(sales, (s) => s.date.slice(0, 4), (k) => k);
            rows.sort((a, b) => (a.key < b.key ? 1 : -1));
            first = "Year";
        } else if (state.view === "scrip") {
            rows = group(sales, (s) => s.symbol, (k) => getSymbolName(k, transactions) || k);
            rows.sort((a, b) => b.pnl - a.pnl);
            first = "Scrip";
        } else {
            rows = byMonth.slice().sort((a, b) => (a.key < b.key ? 1 : -1));
            first = "Month";
        }

        const body = rows.length
            ? rows.map((r) => rowHTML(r)).join("")
            : `<tr><td colspan="6" class="br-muted" style="text-align:center;padding:24px;">No sales in this date range.</td></tr>`;

        return `
            <div class="stk-ps-table-card">
                <div class="stk-ps-table-head">
                    <h3>${first}-wise profit &amp; loss</h3>
                    <div class="br-chip-row" role="group" aria-label="Table view">
                        ${VIEWS.map((v) => `<button type="button" class="br-chip${state.view === v.key ? " active" : ""}" data-ps-view="${v.key}">${v.label}</button>`).join("")}
                    </div>
                </div>
                <div class="br-table-wrap">
                    <table class="br-table stk-ps-table">
                        <thead>
                            <tr>
                                <th>${first}</th>
                                <th class="num">Trades</th>
                                <th class="num">Profit / Loss</th>
                                <th class="num sm-hide">Sale value</th>
                                <th class="num">Realized P&amp;L</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>`;
    }

    function rowHTML(r) {
        const id = `${state.view}:${r.key}`;
        const open = state.open.has(id);
        const label = state.view === "month" ? monthLabel(r.key, true) : r.label;
        const labelHTML = state.view === "month"
            ? `<span class="stk-ps-long">${esc(label)}</span><span class="stk-ps-short">${esc(monthLabel(r.key))}</span>`
            : esc(label);
        const sub = state.view === "scrip" && r.label !== r.key ? `<span class="br-muted stk-ps-sub">${esc(r.key)}</span>` : "";

        let html = `
            <tr class="stk-ps-row${open ? " open" : ""}" data-ps-toggle="${esc(id)}" tabindex="0" role="button" aria-expanded="${open}">
                <td><span class="stk-ps-caret">${open ? "▾" : "▸"}</span> <span class="stk-ps-link">${labelHTML}</span> ${sub}</td>
                <td class="num">${r.trades}</td>
                <td class="num"><span class="br-pnl-pos">${r.wins}</span> / <span class="br-pnl-neg">${r.losses}</span></td>
                <td class="num sm-hide">${fmtMoney(r.sold, true)}</td>
                <td class="num br-pnl-${pnlClass(r.pnl)}"><b>${fmtSigned(r.pnl, true)}</b></td>
            </tr>`;

        if (open) {
            html += `
            <tr class="stk-ps-detail"><td colspan="5">
                <div class="br-table-wrap"><table class="br-table stk-ps-inner">
                    <thead><tr><th>Date</th><th>Scrip</th><th class="num">Qty</th><th class="num sm-hide">Sold at</th><th class="num">Realized P&amp;L</th></tr></thead>
                    <tbody>${r.sales
                        .slice()
                        .reverse()
                        .map(
                            (s) => `<tr>
                                <td>${fmtDate(s.date)}</td>
                                <td>${esc(s.symbol)}</td>
                                <td class="num">${s.quantity}</td>
                                <td class="num sm-hide">${fmtMoney(s.price)}</td>
                                <td class="num br-pnl-${pnlClass(s.pnl)}">${fmtSigned(s.pnl)}${s.pct === null ? "" : ` <span class="br-muted">(${fmtPct(s.pct)})</span>`}</td>
                            </tr>`
                        )
                        .join("")}</tbody>
                </table></div>
            </td></tr>`;
        }

        return html;
    }

    /* ---------- events (delegated, bound once) ---------- */

    container.addEventListener("click", (e) => {
        const range = e.target.closest("[data-ps-range]");
        if (range) {
            state.range = range.dataset.psRange;
            if (state.range === "custom" && !state.from) {
                const all = collectSales(transactions);
                state.from = all.length ? all[0].date : "";
                state.to = ymd(new Date());
            }
            render();
            return;
        }

        const view = e.target.closest("[data-ps-view]");
        if (view) {
            state.view = view.dataset.psView;
            render();
            return;
        }

        const row = e.target.closest("[data-ps-toggle]");
        if (row) toggle(row.dataset.psToggle);
    });

    container.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest("[data-ps-toggle]");
        if (!row) return;
        e.preventDefault();
        toggle(row.dataset.psToggle);
    });

    container.addEventListener("change", (e) => {
        if (e.target.matches("[data-ps-from]")) {
            state.from = e.target.value;
            render();
        } else if (e.target.matches("[data-ps-to]")) {
            state.to = e.target.value;
            render();
        }
    });

    function toggle(id) {
        if (state.open.has(id)) state.open.delete(id);
        else state.open.add(id);
        render();
    }

    return {
        update(txns) {
            transactions = txns || [];
            render();
        }
    };
}
