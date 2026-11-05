/*
 * stocks-pnl-summary.js
 *
 * "Profit & Loss summary" for the Stocks Analytics tab: realized P&L
 * grouped month by month or year by year over a date range, a monthly
 * dot calendar (one column per month, one dot per weekday: green = profit
 * day, red = loss day, grey = no sale) and a table underneath, for the
 * months in the selected range, with Month-wise / Year-wise / Scrip-wise views.
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

/* Amount under a month: full amount with paise, whole amount once it gets long. */
function monthAmount(n) {
    const v = Math.abs(n);
    const text = fmtMoney(v, v >= 100000);
    return n < 0 ? "-" + text : text;
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

/* date -> { pnl, trades, value } for every day that has a sale. */
function groupByDay(sales) {
    const map = new Map();
    for (const s of sales) {
        const d = map.get(s.date) || { pnl: 0, trades: 0, value: 0 };
        d.pnl = round2(d.pnl + s.pnl);
        d.trades++;
        d.value = round2(d.value + s.value);
        map.set(s.date, d);
    }
    return map;
}

/* One month as rows of weekday cells (Mon-Fri, or Mon-Sun when `cols` is 7).
   A cell is { date, day } or null (blank space before the 1st / after the 30th). */
function monthRows(ym, cols) {
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Mon = 0
    const weeks = new Map();

    for (let d = 1; d <= days; d++) {
        const dow = (firstDow + d - 1) % 7;
        if (dow >= cols) continue;
        const week = Math.floor((firstDow + d - 1) / 7);
        if (!weeks.has(week)) weeks.set(week, new Array(cols).fill(null));
        weeks.get(week)[dow] = { date: `${y}-${pad(m)}-${pad(d)}`, day: d };
    }

    return [...weeks.keys()].sort((a, b) => a - b).map((k) => weeks.get(k));
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
        if (old && old.clientWidth > 0) chartScroll = old.scrollLeft;

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
            ${renderChart(byMonth, sales, from, to)}
            ${renderTable(sales, byMonth, from, to)}
        `;

        const sc = container.querySelector(".stk-ps-scroll");
        if (sc) {
            if (chartScroll !== null) {
                sc.scrollLeft = chartScroll;
            } else if (sc.clientWidth > 0) {
                sc.scrollLeft = sc.scrollWidth;
                chartScroll = sc.scrollLeft;
            } else if (typeof ResizeObserver === "function") {
                // The Analytics tab is hidden while it first renders (no width yet):
                // jump to the newest months the moment it becomes visible.
                const ro = new ResizeObserver(() => {
                    if (sc.clientWidth > 0) {
                        ro.disconnect();
                        if (chartScroll === null) sc.scrollLeft = sc.scrollWidth;
                    }
                });
                ro.observe(sc);
            }
        }
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
            </div>`;
    }

    /* Monthly dot calendar: one column per month in the range, one dot per weekday.
       Green dot = a day with a net profit, red = a net loss, grey = no sale. */
    function renderChart(byMonth, sales, from, to) {
        const lookup = new Map(byMonth.map((b) => [b.key, b]));
        const months = monthsBetween(from, to);
        if (!months.length) return "";

        const byDay = groupByDay(sales);
        // Mon-Fri normally; Sat/Sun columns appear only if a sale was entered on a weekend.
        const cols = sales.some((s) => {
            const dow = new Date(s.date + "T00:00:00").getDay();
            return dow === 0 || dow === 6;
        }) ? 7 : 5;

        const grids = months.map((k) => monthRows(k, cols));
        const rowCount = Math.max(1, ...grids.map((g) => g.length));

        const cols_html = months.map((k, i) => {
            const b = lookup.get(k);
            const v = b ? b.pnl : 0;
            const tone = b ? (v < 0 ? "neg" : "pos") : "";
            const tip = b
                ? tipAttr(monthLabel(k, true), [
                    ["Realized P&L", fmtSigned(v), v < 0 ? "var(--br-danger)" : "var(--br-success)"],
                    ["Sales", `${b.trades} (${b.wins} profit / ${b.losses} loss)`],
                    ["Sale value", fmtMoney(b.sold, true)]
                ])
                : "";

            const dots = grids[i].map((row) => row.map((c) => {
                if (!c) return `<i class="stk-ps-dot gap"></i>`;
                const day = byDay.get(c.date);
                const off = (from && c.date < from) || (to && c.date > to);
                if (!day) return `<i class="stk-ps-dot${off ? " off" : ""}"></i>`;
                const cls = day.pnl > 0 ? "pos" : day.pnl < 0 ? "neg" : "flat";
                const dTip = tipAttr(fmtDate(c.date), [
                    ["Realized P&L", fmtSigned(day.pnl), day.pnl < 0 ? "var(--br-danger)" : "var(--br-success)"],
                    ["Sales", String(day.trades)],
                    ["Sale value", fmtMoney(day.value, true)]
                ]);
                return `<i class="stk-ps-dot ${cls}" ${dTip}></i>`;
            }).join("")).join("");

            return `
                <div class="stk-ps-mcol${b ? " has " + tone : ""}" ${tip}>
                    <div class="stk-ps-mname">${monthLabel(k)}</div>
                    <div class="stk-ps-days" style="--cols:${cols}">${dots}</div>
                    <div class="stk-ps-mnet ${tone}">${b ? monthAmount(v) : ""}</div>
                </div>`;
        });

        return `
            <div class="stk-ps-cal">
                <div class="stk-ps-period" aria-label="Selected period">
                    <span>${from ? fmtDate(from) : "Start"}</span><i></i><span>${to ? fmtDate(to) : "Today"}</span>
                </div>
                <div class="stk-ps-scroll">
                    <div class="stk-ps-months" style="--rows:${rowCount}">${cols_html.join("")}</div>
                </div>
                <div class="stk-ps-legend">
                    <span><i class="stk-ps-dot pos"></i>Profit day</span>
                    <span><i class="stk-ps-dot neg"></i>Loss day</span>
                    <span><i class="stk-ps-dot"></i>No sale</span>
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
                    <p class="stk-ps-showing">Showing P&amp;L summary for <b>${from ? fmtDate(from) : "start"}</b> – <b>${to ? fmtDate(to) : "today"}</b></p>
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
