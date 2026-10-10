/* =========================================================
   LEDGER PIE CHARTS
   1) Income, Expenses and Cash balance (one pie)
   2) All expenses by category and all invested by category
   Pure SVG. Hover (desktop) or tap (phone) a slice or a legend row to
   focus it: the others dim and the centre shows its name, amount and
   share. Long legends show the first few rows with "Show all", which
   opens the full list inside the chart card (scrolls, never grows).
   Totals come from income-service.js so they match the cards.
   ========================================================= */

import {
    calculateLedgerSummary,
    investmentBreakdownByCategory,
    isInvestmentCategory,
    formatMoney
} from "./income-service.js";
import { COLORS } from "../../components/chart-colors.js";

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

const LEGEND_PREVIEW = 6;

/* Slices: [{ label, value, color }]. Zero / negative values are skipped. */
function pieSVG(rows, total, label, centerTitle, centerValue) {
    const R = 90, r = 56, cx = 100, cy = 100;
    const point = (angle, radius) => [
        cx + radius * Math.sin(angle),
        cy - radius * Math.cos(angle)
    ];

    let start = 0;

    const paths = rows.map((s, i) => {
        const share = s.value / total;

        // A single slice is a full ring.
        if (rows.length === 1) {
            return `<path class="inc-pie-slice" data-i="${i}" fill="${s.color}" fill-rule="evenodd"
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

        return `<path class="inc-pie-slice" data-i="${i}" fill="${s.color}" stroke="var(--br-surface, #000)" stroke-width="1" d="M${x1} ${y1}A${R} ${R} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${large} 0 ${x4} ${y4}Z"/>`;
    });

    return `
        <svg class="inc-pie-svg" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}"
            data-default-title="${esc(centerTitle)}" data-default-value="${esc(centerValue)}">
            ${paths.join("")}
            <text class="inc-pie-c1" x="100" y="92" text-anchor="middle" font-size="10" fill="currentColor" opacity=".65" data-c-title>${esc(centerTitle)}</text>
            <text class="inc-pie-c2" x="100" y="109" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" data-c-value>${esc(centerValue)}</text>
            <text class="inc-pie-c3" x="100" y="123" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".65" data-c-share></text>
        </svg>`;
}

function legend(rows, total) {
    const many = rows.length > LEGEND_PREVIEW;

    return `
        <ul class="inc-pie-legend${many ? " is-collapsed" : ""}" data-legend>${rows.map((s, i) => `
            <li class="${i >= LEGEND_PREVIEW ? "inc-pie-more" : ""}" data-i="${i}" tabindex="0">
                <span class="inc-pie-dot" style="background:${s.color}"></span>
                <span class="inc-pie-name">${esc(s.label)}</span>
                <span class="inc-pie-val">${formatMoney(s.value)}
                    <small>${((s.value / total) * 100).toFixed(1)}%</small></span>
            </li>`).join("")}
        </ul>
        ${many ? `<button type="button" class="inc-pie-toggle" data-legend-toggle aria-expanded="false">Show all ${rows.length}</button>` : ""}`;
}

function card(title, hint, slices, centerTitle, centerValue, emptyText, extra = "") {
    const rows = slices.filter((s) => s.value > 0);
    const total = rows.reduce((n, s) => n + s.value, 0);

    const data = esc(JSON.stringify(rows.map((s) => [s.label, formatMoney(s.value), ((s.value / (total || 1)) * 100).toFixed(1) + "%"])));

    return `
        <div class="inc-pie-card" data-pie-card data-rows="${data}">
            <h4>${esc(title)}</h4>
            <p class="inc-pie-hint">${esc(hint)}</p>
            ${total
                ? `<div class="inc-pie-body">${pieSVG(rows, total, title, centerTitle, centerValue)}${legend(rows, total)}</div>`
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

/* Two bars: total expenses vs total invested (same figures as the summary cards). */
function barsSection(expense, invested) {
    const bars = [
        { label: "Expenses", value: Math.max(0, Number(expense) || 0), color: COLORS.danger },
        { label: "Invested", value: Math.max(0, Number(invested) || 0), color: "#8B5CF6" }
    ];
    const max = Math.max(...bars.map((b) => b.value), 1);
    const W = 420, H = 260, base = 220, top = 36, bw = 110;
    const xs = [W / 2 - bw - 30, W / 2 + 30];

    const body = bars.map((b, i) => {
        const h = Math.max(b.value > 0 ? 3 : 0, (b.value / max) * (base - top));

        return `
            <rect x="${xs[i]}" y="${base - h}" width="${bw}" height="${h}" rx="8" fill="${b.color}"/>
            <text x="${xs[i] + bw / 2}" y="${base - h - 10}" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${esc(formatMoney(b.value))}</text>
            <text x="${xs[i] + bw / 2}" y="${base + 22}" text-anchor="middle" font-size="13" fill="currentColor" opacity=".75">${b.label}</text>`;
    }).join("");

    const ratio = bars[0].value > 0
        ? `Invested is ${((bars[1].value / bars[0].value) * 100).toFixed(0)}% of what you spent.`
        : "";

    return `
        <section class="inc-section" aria-labelledby="inc-bar-title">
            <div class="inc-section-head">
                <div>
                    <h3 id="inc-bar-title">Total invested vs total expenses</h3>
                    <p>${esc(ratio) || "Money put to work compared with money spent."}</p>
                </div>
            </div>
            <div class="inc-pie-card inc-bar-card">
                <svg class="inc-bar-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Total invested versus total expenses">
                    <line x1="20" x2="${W - 20}" y1="${base}" y2="${base}" stroke="currentColor" opacity=".2"/>
                    ${body}
                </svg>
            </div>
        </section>`;
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
        <section class="inc-section" aria-labelledby="inc-pie-title">
            <div class="inc-section-head">
                <div>
                    <h3 id="inc-pie-title">Income, expenses and invested</h3>
                    <p>Tap or hover a slice or a row to focus it.</p>
                </div>
            </div>
            <div class="inc-pie-grid">
                ${card("Income, expenses and balance", "Income vs expenses vs cash balance", overview,
                    "Income", formatMoney(summary.income), "Nothing recorded yet.", negative)}
                ${card("All expenses", "By category", expenses,
                    "Total", formatMoney(expTotal), "No expenses recorded yet.")}
                ${card("All invested", "Net invested by category", invested,
                    "Total", formatMoney(invTotal), "No investments recorded yet.")}
            </div>
        </section>

        ${barsSection(summary.expense, summary.contributions)}`;
}

export const renderIncomeOverview = renderLedgerCharts;
export const bindIncomeOverview = bindLedgerCharts;

/* Focus + "Show all" behaviour. Call once after the HTML is in the page. */
export function bindLedgerCharts(root) {
    root.querySelectorAll("[data-pie-card]").forEach((cardEl) => {
        const svg = cardEl.querySelector(".inc-pie-svg");

        if (!svg) return;

        let rows = [];

        try { rows = JSON.parse(cardEl.dataset.rows || "[]"); } catch { rows = []; }

        const cTitle = svg.querySelector("[data-c-title]");
        const cValue = svg.querySelector("[data-c-value]");
        const cShare = svg.querySelector("[data-c-share]");
        const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
        const fit = (el, text) => el.setAttribute("font-size", text.length > 13 ? "9.5" : text.length > 10 ? "11" : "12");

        let sticky = -1;
        let hover = -1;

        const paint = () => {
            const i = hover >= 0 ? hover : sticky;

            cardEl.querySelectorAll("[data-i]").forEach((el) =>
                el.classList.toggle("is-focus", Number(el.dataset.i) === i)
            );

            cardEl.toggleAttribute("data-focus", i >= 0);

            if (i >= 0 && rows[i]) {
                cTitle.textContent = short(rows[i][0], 16);
                cValue.textContent = rows[i][1];
                fit(cValue, rows[i][1]);
                cShare.textContent = rows[i][2];
            } else {
                cTitle.textContent = svg.dataset.defaultTitle;
                cValue.textContent = svg.dataset.defaultValue;
                fit(cValue, svg.dataset.defaultValue);
                cShare.textContent = "";
            }
        };

        const indexOf = (target) => {
            const el = target.closest?.("[data-i]");

            return el && cardEl.contains(el) ? Number(el.dataset.i) : -1;
        };

        cardEl.addEventListener("pointerover", (e) => {
            if (e.pointerType !== "mouse") return;

            const i = indexOf(e.target);

            if (i !== hover) { hover = i; paint(); }
        });

        cardEl.addEventListener("pointerleave", (e) => {
            if (e.pointerType !== "mouse" || hover < 0) return;

            hover = -1;
            paint();
        });

        // Click / tap keeps the focus; tapping it again, or empty space, clears it.
        cardEl.addEventListener("click", (e) => {
            if (e.target.closest("[data-legend-toggle]")) return;

            const i = indexOf(e.target);

            sticky = i >= 0 && i !== sticky ? i : -1;
            hover = -1;
            paint();
        });

        cardEl.addEventListener("keydown", (e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("li[data-i]")) {
                e.preventDefault();
                e.target.click();
            }
        });

        const list = cardEl.querySelector("[data-legend]");
        const toggle = cardEl.querySelector("[data-legend-toggle]");

        if (toggle && list) {
            toggle.addEventListener("click", () => {
                const open = list.classList.toggle("is-expanded");

                list.classList.toggle("is-collapsed", !open);
                toggle.setAttribute("aria-expanded", String(open));
                toggle.textContent = open ? "Show less" : `Show all ${rows.length}`;

                if (!open) list.scrollTop = 0;
            });
        }

        paint();
    });
}
