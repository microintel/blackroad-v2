import { isUSD, usdShort } from "../../services/currency.js";
import { tipAttr } from "../../components/chart-tooltip.js";
import { icon, FEATURE_ICON } from "../../components/icons.js";
import { formatINR } from "../dashboard/dashboard-service.js";

import {
    loadNetWorthSource,
    getAvailableYears,
    computeNetWorthEvolution,
    summarizeSeries,
    formatCompactINR,
    localTodayISO
} from "./networth-service.js";

/*
 * Net Worth Evolution page.
 * Everything shown is calculated from the user's existing dated records
 * each time the page opens or a filter changes. Nothing is stored here.
 */

const VIEWS = [
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" }
];

function signedINR(value) {
    const n = Number(value) || 0;

    return (n > 0 ? "+" : n < 0 ? "-" : "") + formatCompactINR(Math.abs(n));
}

function signedPct(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function toneClass(value) {
    return value >= 0 ? "br-text-success" : "br-text-danger";
}

/* ---------------- chart ---------------- */

/* A few round tick values covering [min, max]. */
function niceTicks(min, max, count = 4) {
    const span = max - min || Math.abs(max) || 1;
    const rough = span / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || pow * 10;

    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;

    const ticks = [];

    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

    return ticks;
}

function tickLabel(value) {
    if (isUSD()) return usdShort(value);

    const abs = Math.abs(value);
    const [unit, suffix] = abs >= 1e7 ? [1e7, "Cr"] : abs >= 1e5 ? [1e5, "L"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
    const text = String(parseFloat((abs / unit).toFixed(2)));

    return (value < 0 ? "-" : "") + "₹" + text + suffix;
}

function buildChart(series, width) {
    const known = series.filter((p) => p.available);

    const W = Math.max(280, Math.round(width));
    const H = W < 520 ? 250 : 320;
    const padL = W < 520 ? 48 : 60;
    const padR = 14;
    const padT = 14;
    const padB = 30;

    const ticks = niceTicks(
        Math.min(...known.map((p) => p.netWorth)),
        Math.max(...known.map((p) => p.netWorth))
    );

    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];

    const n = series.length;

    const x = (i) =>
        n === 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);

    const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);

    const baseY = y(Math.max(lo, Math.min(0, hi)));

    /* Consecutive available points form one line; gaps break it. */
    const runs = [];
    let run = [];

    series.forEach((p, i) => {
        if (p.available) {
            run.push([x(i), y(p.netWorth)]);
        } else if (run.length) {
            runs.push(run);
            run = [];
        }
    });

    if (run.length) runs.push(run);

    const labelEvery = Math.ceil(n / Math.max(1, Math.floor((W - padL - padR) / 44)));

    const bandW = n === 1 ? W - padL - padR : (W - padL - padR) / (n - 1);

    const lastIndex = series.map((p) => p.available).lastIndexOf(true);

    return `
        <svg class="nw-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
            role="img" aria-label="Net worth over time">
            ${ticks.map((t) => `
                <line class="nw-grid${t === 0 ? " nw-grid-zero" : ""}"
                    x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"></line>
                <text class="nw-axis nw-axis-y" x="${padL - 8}" y="${(y(t) + 3.5).toFixed(1)}"
                    text-anchor="end">${tickLabel(t)}</text>`).join("")}

            ${series.map((p, i) => i % labelEvery === 0 ? `
                <text class="nw-axis${p.available ? "" : " nw-axis-off"}"
                    x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.label}</text>` : "").join("")}

            ${runs.filter((r) => r.length > 1).map((r) => `
                <polygon class="nw-area"
                    points="${r[0][0].toFixed(1)},${baseY.toFixed(1)} ${r.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")} ${r[r.length - 1][0].toFixed(1)},${baseY.toFixed(1)}"></polygon>
                <polyline class="nw-line"
                    points="${r.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}"></polyline>`).join("")}

            ${series.map((p, i) => p.available ? `
                <circle class="nw-dot${i === lastIndex ? " nw-dot-last" : ""}"
                    cx="${x(i).toFixed(1)}" cy="${y(p.netWorth).toFixed(1)}"
                    r="${i === lastIndex ? 4.5 : 3}"></circle>` : "").join("")}

            ${series.map((p, i) => `
                <rect class="br-tip-hit" x="${(x(i) - bandW / 2).toFixed(1)}" y="0"
                    width="${bandW.toFixed(1)}" height="${H}"
                    ${tipAttr(p.longLabel, p.available ? [
                        ["Net Worth", formatINR(p.netWorth), "var(--br-gold)"],
                        ["Assets", formatINR(p.assets), "var(--br-success)"],
                        ["Liabilities", formatINR(p.liabilities), "var(--br-danger)"],
                        ["Cash & Bank", formatINR(p.assetItems.cash)],
                        ["Stocks", formatINR(p.assetItems.stocks)],
                        ["Mutual Funds", formatINR(p.assetItems.mutualFunds)],
                        ["Fixed Deposits", formatINR(p.assetItems.deposits)],
                        ["Lending receivable", formatINR(p.assetItems.lendingReceivable)],
                        ["Lending payable", formatINR(p.liabilityItems.lendingPayable)],
                        ["Loans", formatINR(p.liabilityItems.loans)],
                        [`In ${p.label}: income`, formatINR(p.flows.income)],
                        [`In ${p.label}: expenses`, formatINR(p.flows.expenses)],
                        [`In ${p.label}: invested`, formatINR(p.flows.invested)],
                        [`In ${p.label}: sold`, formatINR(p.flows.sold)]
                    ] : [["Net Worth", "No data yet"]])}></rect>`).join("")}
        </svg>
    `;
}

/* ---------------- sections ---------------- */

function buildSummary(summary, view, year, today) {
    const currentYear = Number(today.slice(0, 4));

    const currentLabel = summary.current.isCurrent
        ? "Current Net Worth"
        : `Net Worth · ${summary.current.longLabel}`;

    const changeLabel =
        view === "yearly"
            ? "Change Over Time"
            : year === currentYear
              ? "Change This Year"
              : `Change in ${year}`;

    const tiles = [
        {
            label: currentLabel,
            value: formatCompactINR(summary.current.netWorth),
            tone: summary.current.netWorth < 0 ? "br-text-danger" : "",
            sub: summary.current.longLabel
        },
        {
            label: changeLabel,
            value: summary.hasChange ? signedINR(summary.change) : "—",
            tone: summary.hasChange ? toneClass(summary.change) : "",
            sub: summary.hasChange ? `since ${summary.first.longLabel}` : "Needs two periods"
        },
        {
            label: "Growth",
            value: summary.growth === null ? "—" : signedPct(summary.growth),
            tone: summary.growth === null ? "" : toneClass(summary.growth),
            sub: summary.growth === null ? "Needs a positive starting point" : `since ${summary.first.longLabel}`
        },
        {
            label: "Highest Net Worth",
            value: formatCompactINR(summary.highest.netWorth),
            tone: "",
            sub: summary.highest.longLabel
        }
    ];

    return tiles.map((t) => `
        <div class="br-card nw-stat">
            <span class="br-stat-label">${t.label}</span>
            <strong class="nw-stat-value ${t.tone}">${t.value}</strong>
            <small class="nw-stat-sub">${t.sub}</small>
        </div>`).join("");
}

function emptyState() {
    return `
        <div class="br-empty-state nw-empty">
            <strong>Not enough historical data</strong>
            <p>BlackRoad needs dated financial records to calculate<br>net worth evolution for this period.</p>
        </div>`;
}

/* ---------------- page ---------------- */

export async function NetWorth() {
    const source = await loadNetWorthSource();
    const today = localTodayISO();
    const years = getAvailableYears(source, today);

    const state = {
        view: "monthly",
        year: years.length ? years[years.length - 1] : Number(today.slice(0, 4))
    };

    const page = document.createElement("section");
    page.className = "br-page nw";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Net Worth Evolution</h2>
                <p>Assets minus liabilities, calculated from your dated records.</p>
            </div>
        </div>

        <div class="nw-controls">
            <div class="br-dash-pills nw-pills" role="group" aria-label="View">
                ${VIEWS.map((v) => `<button type="button" class="br-dash-pill${v.key === state.view ? " active" : ""}"
                    data-view="${v.key}">${v.label}</button>`).join("")}
            </div>

            <label class="nw-year">
                <span class="br-stat-label">Year</span>
                <select class="br-select" data-year aria-label="Year">
                    ${years.slice().reverse().map((y) => `<option value="${y}"${y === state.year ? " selected" : ""}>${y}</option>`).join("")}
                </select>
            </label>
        </div>

        <div class="nw-summary" data-summary></div>

        <div class="br-card nw-chart-card">
            <div class="br-card-heading">
                <h3>${icon(FEATURE_ICON.networth, { size: 16 })} <span data-title>Net worth</span></h3>
            </div>

            <div data-chart></div>
            <p class="br-field-help nw-note" data-note></p>
        </div>
    `;

    const summaryEl = page.querySelector("[data-summary]");
    const chartEl = page.querySelector("[data-chart]");
    const noteEl = page.querySelector("[data-note]");
    const titleEl = page.querySelector("[data-title]");
    const yearEl = page.querySelector("[data-year]");

    let lastSeries = [];

    const draw = () => {
        const first = years.length ? years[0] : Number(today.slice(0, 4));

        const series =
            state.view === "yearly"
                ? computeNetWorthEvolution(`${first}-01-01`, today, "yearly", source, today)
                : computeNetWorthEvolution(`${state.year}-01-01`, `${state.year}-12-31`, "monthly", source, today);

        lastSeries = series;

        const summary = summarizeSeries(series);

        titleEl.textContent =
            state.view === "yearly" ? "Net worth by year" : `Net worth · ${state.year}`;

        yearEl.disabled = state.view === "yearly";

        if (!summary) {
            summaryEl.innerHTML = "";
            chartEl.innerHTML = emptyState();
            noteEl.textContent = "";
            return;
        }

        summaryEl.innerHTML = buildSummary(summary, state.view, state.year, today);

        chartEl.innerHTML = buildChart(series, chartEl.clientWidth || 640);

        const hidden = series.filter((p) => !p.available).length;

        noteEl.textContent =
            (hidden ? `${hidden} earlier ${state.view === "yearly" ? "year" : "month"}${hidden > 1 ? "s" : ""} not shown: no dated records existed yet. ` : "") +
            "Past stock values use the last traded price in your transactions; only the current period uses today’s prices.";
    };

    page.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            state.view = button.dataset.view;

            page.querySelectorAll("[data-view]").forEach((b) =>
                b.classList.toggle("active", b === button)
            );

            draw();
        });
    });

    yearEl.addEventListener("change", () => {
        state.year = Number(yearEl.value);
        draw();
    });

    draw();

    /* Keep text crisp: redraw at the real width once attached and on resize. */
    if (typeof ResizeObserver !== "undefined") {
        let lastWidth = 0;

        const observer = new ResizeObserver(() => {
            if (!page.isConnected) {
                observer.disconnect();
                return;
            }

            const w = chartEl.clientWidth;

            if (w && Math.abs(w - lastWidth) > 1 && lastSeries.some((p) => p.available)) {
                lastWidth = w;
                chartEl.innerHTML = buildChart(lastSeries, w);
            }
        });

        observer.observe(chartEl);
    }

    return page;
}
