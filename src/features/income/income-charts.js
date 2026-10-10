/* =========================================================
   LEDGER PIE CHARTS
   1) Income, Expenses and Cash balance (one pie)
   2) All expenses by category and all invested by category
   Pure SVG, same tooltip helper as the other Income charts.
   Totals come from income-service.js so they match the cards.
   ========================================================= */

import {
    calculateLedgerSummary,
    investmentBreakdownByCategory,
    isInvestmentCategory,
    formatMoney
} from "./income-service.js";
import { COLORS } from "../../components/chart-colors.js";
import { tipAttr } from "../../components/chart-tooltip.js";

/* Distinct hues so every slice is easy to tell apart. */
const PALETTE = [
    "#3B82F6", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4",
    "#F97316", "#EF4444", "#84CC16", "#14B8A6", "#A855F7", "#EAB308"
];

const esc = (v) =>
    String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

/* Slices: [{ label, value, color }]. Zero / negative values are skipped. */
function pieSVG(slices, label, centerTitle, centerValue) {
    const rows = slices.filter((s) => s.value > 0);
    const total = rows.reduce((n, s) => n + s.value, 0);

    if (!total) return "";

    const R = 80, r = 50, cx = 100, cy = 100;
    const point = (angle, radius) => [
        cx + radius * Math.sin(angle),
        cy - radius * Math.cos(angle)
    ];

    let start = 0;

    const paths = rows.map((s) => {
        const share = s.value / total;
        const tip = tipAttr(s.label, [
            ["Amount", formatMoney(s.value), s.color],
            ["Share", (share * 100).toFixed(1) + "%"]
        ]);

        // A single slice is a full ring.
        if (rows.length === 1) {
            return `<path class="inc-pie-slice" fill="${s.color}" fill-rule="evenodd" ${tip}
                d="M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z
                   M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z"/>`;
        }

        const end = start + share * Math.PI * 2;
        const large = end - start > Math.PI ? 1 : 0;
        const [x1, y1] = point(start, R);
        const [x2, y2] = point(end, R);
        const [x3, y3] = point(end, r);
        const [x4, y4] = point(start, r);

        start = end;

        return `<path class="inc-pie-slice" fill="${s.color}" stroke="var(--br-surface, #000)" stroke-width="1.5" ${tip}
            d="M${x1} ${y1}A${R} ${R} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${large} 0 ${x4} ${y4}Z"/>`;
    });

    return `
        <svg class="inc-pie-svg" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}">
            ${paths.join("")}
            <text x="100" y="94" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">${esc(centerTitle)}</text>
            <text x="100" y="112" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor">${esc(centerValue)}</text>
        </svg>`;
}

function legend(slices) {
    const rows = slices.filter((s) => s.value > 0);
    const total = rows.reduce((n, s) => n + s.value, 0);

    return `<ul class="inc-pie-legend">${rows.map((s) => `
        <li>
            <span class="inc-pie-dot" style="background:${s.color}"></span>
            <span class="inc-pie-name">${esc(s.label)}</span>
            <span class="inc-pie-val">${formatMoney(s.value)}
                <small>${total ? ((s.value / total) * 100).toFixed(1) : "0.0"}%</small></span>
        </li>`).join("")}</ul>`;
}

function card(title, hint, slices, centerTitle, centerValue, emptyText, extra = "") {
    const svg = pieSVG(slices, title, centerTitle, centerValue);

    return `
        <div class="inc-pie-card">
            <h4>${esc(title)}</h4>
            <p class="inc-pie-hint">${esc(hint)}</p>
            ${svg
                ? `<div class="inc-pie-body">${svg}${legend(slices)}</div>`
                : `<p class="inc-quiet">${esc(emptyText)}</p>`}
            ${extra}
        </div>`;
}

/* Expenses by category: every normal (non-investment) transaction. */
function expenseSlices(entries) {
    const totals = new Map();

    (entries || []).forEach((e) =>
        (e.transactions || []).forEach((t) => {
            if (isInvestmentCategory(t.category)) return;

            const name = String(t.category || "").trim() || "Uncategorized";
            const amount = Math.max(0, Number(t.amount) || 0);

            totals.set(name, (totals.get(name) || 0) + amount);
        })
    );

    return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
}

function investedSlices(entries) {
    return investmentBreakdownByCategory(entries)
        .filter((row) => row.net > 0)
        .map((row, i) => ({
            label: row.category,
            value: row.net,
            color: PALETTE[(i + 4) % PALETTE.length]
        }));
}

export function renderLedgerCharts(entries) {
    const summary = calculateLedgerSummary(entries);
    const balance = Number(summary.cash) || 0;

    const overview = [
        { label: "Income", value: Number(summary.income) || 0, color: COLORS.success },
        { label: "Expenses", value: Number(summary.expense) || 0, color: COLORS.danger },
        { label: "Balance", value: Math.max(0, balance), color: COLORS.info }
    ];

    const negative = balance < 0
        ? `<p class="inc-pie-note">Cash balance is ${esc(formatMoney(balance))} (below zero), so it has no slice.</p>`
        : "";

    const expenses = expenseSlices(entries);
    const invested = investedSlices(entries);
    const expTotal = expenses.reduce((n, s) => n + s.value, 0);
    const invTotal = invested.reduce((n, s) => n + s.value, 0);

    return `
        <section class="inc-section" aria-labelledby="inc-pie-overview-title">
            <div class="inc-section-head">
                <div>
                    <h3 id="inc-pie-overview-title">Income, expenses and balance</h3>
                    <p>How your income compares with what you spent and what is left.</p>
                </div>
            </div>
            <div class="inc-pie-grid inc-pie-grid--one">
                ${card("Overview", "Income vs expenses vs cash balance", overview,
                    "Income", formatMoney(summary.income), "Nothing recorded yet.", negative)}
            </div>
        </section>

        <section class="inc-section" aria-labelledby="inc-pie-split-title">
            <div class="inc-section-head">
                <div>
                    <h3 id="inc-pie-split-title">All expenses and all invested</h3>
                    <p>Where your spending went, and where your investments sit.</p>
                </div>
            </div>
            <div class="inc-pie-grid">
                ${card("All expenses", "By category", expenses,
                    "Total", formatMoney(expTotal), "No expenses recorded yet.")}
                ${card("All invested", "Net invested by category", invested,
                    "Total", formatMoney(invTotal), "No investments recorded yet.")}
            </div>
        </section>`;
}
