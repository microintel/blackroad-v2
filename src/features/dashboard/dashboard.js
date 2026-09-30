import { navigate } from "../../app/router.js";
import { icon, FEATURE_ICON } from "../../components/icons.js";
import { FinancialIntelligence } from "./intelligence/financial-intelligence.js";

import {
    getDashboardData,
    formatINR
} from "./dashboard-service.js";

const RANGES = [
    { key: "7d", label: "1W", days: 7 },
    { key: "1", label: "1M", months: 1 },
    { key: "6", label: "6M", months: 6 },
    { key: "12", label: "1Y", months: 12 },
    { key: "36", label: "3Y", months: 36 },
    { key: "60", label: "5Y", months: 60 },
    { key: "all", label: "Max" }
];

const CIRCUMFERENCE = 2 * Math.PI * 52;

const TILE_ICON = {
    "/income": FEATURE_ICON.income,
    "/stepup": FEATURE_ICON.mutualFunds,
    "/stocks": FEATURE_ICON.stocks,
    "/deposits": FEATURE_ICON.deposits,
    "/lending": FEATURE_ICON.lending
};

function signed(value, digits = 1) {
    const number = Number(value) || 0;

    return (number >= 0 ? "+" : "") + number.toFixed(digits) + "%";
}

function toneClass(value) {
    return value >= 0 ? "br-text-success" : "br-text-danger";
}

/* ---------------- Wealth lane tiles ---------------- */

function buildTiles(data) {
    const { income, mutualFunds, stocks, lending, deposits } =
        data;

    const incomeUp = income.cash >= 0;

    const loansTrend =
        lending.activeLoanCount > 0
            ? `${lending.activeLoanCount} active EMI · ${formatINR(
                  lending.monthlyEmi
              )}/mo`
            : lending.liabilities > 0
              ? "Lending balance outstanding"
              : "No liabilities yet";

    const depositsTrend = deposits.nextMaturity
        ? `${deposits.activeCount} active · next matures ${deposits.nextMaturity.date}`
        : deposits.totalCurrentValue > 0
          ? `${deposits.activeCount} active instrument${
                deposits.activeCount === 1 ? "" : "s"
            }`
          : "No instruments yet";

    return [
        {
            name: "Income & Expenses",
            path: "/income",
            value:
                (incomeUp ? "+" : "-") +
                formatINR(Math.abs(income.cash)),
            trend: incomeUp ? "Net surplus" : "Net deficit",
            up: incomeUp
        },
        {
            name: "Mutual Funds",
            path: "/stepup",
            value: formatINR(mutualFunds.currentValue),
            trend: mutualFunds.hasData
                ? signed(mutualFunds.pnlPct)
                : "No SIP entries yet",
            up: mutualFunds.pnl >= 0
        },
        {
            name: "Stocks",
            path: "/stocks",
            value: formatINR(stocks.currentValue),
            trend: stocks.holdings
                ? signed(stocks.pnlPct)
                : "No holdings yet",
            up: stocks.pnl >= 0
        },
        {
            name: "Fixed Deposits",
            path: "/deposits",
            value: formatINR(deposits.totalCurrentValue),
            trend: depositsTrend,
            up: true,
            neutral: true
        },
        {
            name: "Loans & Liabilities",
            path: "/lending",
            value: formatINR(lending.liabilities),
            trend: loansTrend,
            up: false
        }
    ];
}

/* ---------------- Asset allocation donut ---------------- */

function buildDonut(data) {
    if (!data.chartItems.length) {
        return `
            <div class="br-dash-donut">
                <svg viewBox="0 0 132 132" aria-hidden="true">
                    <circle class="br-dash-ring-empty"
                        cx="66" cy="66" r="52"></circle>
                </svg>
                <div class="br-dash-donut-center">
                    <small>Assets</small>
                    <b>${formatINR(0)}</b>
                </div>
            </div>
            <p class="br-muted">No allocation yet.</p>
        `;
    }

    let offset = 0;

    const segments = data.chartItems
        .map((item) => {
            const length = (item.pct / 100) * CIRCUMFERENCE;

            const segment = `
                <circle class="br-dash-seg br-dash-c-${item.key}"
                    cx="66" cy="66" r="52"
                    stroke-dasharray="${length} ${CIRCUMFERENCE - length}"
                    stroke-dashoffset="${-offset}"></circle>
            `;

            offset += length;

            return segment;
        })
        .join("");

    const legend = data.chartItems
        .map(
            (item) => `
            <li>
                <span class="br-dash-dot br-dash-bg-${item.key}"></span>
                <span class="br-dash-legend-label">${item.label}</span>
                <span class="br-dash-legend-pct">${item.pct}%</span>
                <span class="br-dash-legend-amt">${formatINR(item.amount)}</span>
            </li>`
        )
        .join("");

    return `
        <div class="br-dash-donut">
            <svg viewBox="0 0 132 132" aria-hidden="true">
                <circle class="br-dash-ring-empty"
                    cx="66" cy="66" r="52"></circle>
                ${segments}
            </svg>
            <div class="br-dash-donut-center">
                <small>Assets</small>
                <b>${formatINR(data.chartTotal)}</b>
            </div>
        </div>
        <ul class="br-dash-legend">${legend}</ul>
    `;
}

/* ---------------- Mutual fund profit / loss chart ---------------- */

function filterSeries(series, rangeKey) {
    const range = RANGES.find((r) => r.key === rangeKey);

    if (!range || rangeKey === "all") {
        return series;
    }

    const cutoff = new Date();

    if (range.days) {
        cutoff.setDate(cutoff.getDate() - range.days);
    } else {
        cutoff.setMonth(cutoff.getMonth() - range.months);
    }

    const cutoffISO = cutoff.toISOString().slice(0, 10);

    return series.filter((point) => point.date >= cutoffISO);
}

function buildPnlChart(series) {
    if (!series.length) {
        return `<div class="br-empty-state">
            No SIP entries yet — add one in StepUp.
        </div>`;
    }

    const width = 600;
    const height = 200;
    const pad = 12;

    const values = series.map((p) => p.pnl);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = max - min || 1;

    const x = (i) =>
        series.length === 1
            ? width / 2
            : pad + (i / (series.length - 1)) * (width - pad * 2);

    const y = (v) =>
        pad + (1 - (v - min) / span) * (height - pad * 2);

    const points = series
        .map((p, i) => `${x(i).toFixed(1)},${y(p.pnl).toFixed(1)}`)
        .join(" ");

    const last = series[series.length - 1];

    const tone = last.pnl >= 0 ? "up" : "down";

    const zeroY = y(0).toFixed(1);

    return `
        <svg class="br-dash-pnl br-dash-pnl-${tone}"
            viewBox="0 0 ${width} ${height}"
            preserveAspectRatio="none" role="img"
            aria-label="Mutual fund profit and loss">
            <line class="br-dash-zero"
                x1="0" x2="${width}" y1="${zeroY}" y2="${zeroY}"></line>
            <polyline points="${points}" fill="none"></polyline>
            ${
                series.length === 1
                    ? `<circle cx="${x(0)}" cy="${y(last.pnl)}" r="4"></circle>`
                    : ""
            }
        </svg>
        <div class="br-dash-pnl-foot">
            <span>${series[0].date}</span>
            <strong class="${toneClass(last.pnl)}">${
                last.pnl >= 0 ? "+" : ""
            }${formatINR(last.pnl)}</strong>
            <span>${last.date}</span>
        </div>
    `;
}

/* ---------------- Page ---------------- */

export async function Dashboard() {
    const data = await getDashboardData();

    const tiles = buildTiles(data);

    const page = document.createElement("section");

    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Overview</h2>
                <p>Your financial activity at a glance.</p>
            </div>
        </div>

        <div class="br-card">
            <div class="br-card-heading">
                <h3>Mutual fund profit / loss</h3>
                <span class="br-badge ${
                    data.mutualFunds.pnl >= 0
                        ? "br-badge-success"
                        : "br-badge-danger"
                }">${signed(data.mutualFunds.pnlPct)}</span>
            </div>

            <div class="br-dash-pills" data-range-pills>
                ${RANGES.map(
                    (r) => `<button type="button"
                        class="br-dash-pill${
                            r.key === "all" ? " active" : ""
                        }"
                        data-range="${r.key}">${r.label}</button>`
                ).join("")}
            </div>

            <div data-pnl-chart>${buildPnlChart(data.series)}</div>
        </div>

        <div class="br-grid br-grid-2 br-dash-hero-grid">
            <div class="br-card br-dash-hero">
                <span class="br-stat-label">${icon(FEATURE_ICON.networth, { size: 16 })}Total net worth</span>

                <strong class="br-dash-networth ${
                    data.netWorth < 0 ? "br-text-danger" : ""
                }">${formatINR(data.netWorth)}</strong>

                <div class="br-dash-chips">
                    <span class="br-badge ${
                        data.mutualFunds.pnl >= 0
                            ? "br-badge-success"
                            : "br-badge-danger"
                    }">Mutual Funds ${
                        data.mutualFunds.hasData
                            ? signed(data.mutualFunds.pnlPct)
                            : "0.0%"
                    }</span>

                    <span class="br-badge ${
                        data.stocks.pnl >= 0
                            ? "br-badge-success"
                            : "br-badge-danger"
                    }">Stocks ${
                        data.stocks.holdings
                            ? signed(data.stocks.pnlPct)
                            : "0.0%"
                    }</span>
                </div>

                <div class="br-divider"></div>

                <div class="br-dash-foot">
                    <div>
                        <span class="br-stat-label">Total Assets</span>
                        <strong>${formatINR(data.totalAssets)}</strong>
                    </div>
                    <div>
                        <span class="br-stat-label">Total Liabilities</span>
                        <strong class="br-text-danger">${formatINR(
                            data.totalLiabilities
                        )}</strong>
                    </div>
                    <div>
                        <span class="br-stat-label">Cash &amp; Bank</span>
                        <strong class="${toneClass(data.income.cash)}">${formatINR(
                            data.income.cash
                        )}</strong>
                    </div>
                </div>
            </div>

            <div class="br-card">
                <div class="br-card-heading">
                    <h3>Asset allocation</h3>
                </div>

                <div class="br-dash-alloc">${buildDonut(data)}</div>
            </div>
        </div>

        <div class="br-card-heading br-dash-lanes-title">
            <h3>Your wealth lanes</h3>
        </div>

        <div class="br-grid br-grid-3">
            ${tiles
                .map(
                    (tile) => `
                <button type="button"
                    class="br-card br-dash-tile"
                    data-path="${tile.path}">
                    <span class="br-stat-label">${icon(
                        TILE_ICON[tile.path] || "coins",
                        { size: 16 }
                    )}${tile.name}</span>
                    <strong class="br-stat-value">${tile.value}</strong>
                    <span class="br-dash-trend ${
                        tile.neutral
                            ? "br-text-secondary"
                            : tile.up
                              ? "br-text-success"
                              : "br-text-danger"
                    }">${
                        tile.neutral
                            ? ""
                            : icon(tile.up ? "trending-up" : "trending-down", { size: 14 })
                    }${tile.trend}</span>
                </button>`
                )
                .join("")}
        </div>
    `;

    /* Presentation-only layout foundation for the future
       financial intelligence features (no data, no logic). */
    page.appendChild(await FinancialIntelligence());

    page.querySelectorAll("[data-path]").forEach((tile) => {
        tile.addEventListener("click", () => {
            navigate(tile.dataset.path);
        });
    });

    const chart = page.querySelector("[data-pnl-chart]");

    page.querySelectorAll("[data-range]").forEach((pill) => {
        pill.addEventListener("click", () => {
            page
                .querySelectorAll("[data-range]")
                .forEach((p) => p.classList.remove("active"));

            pill.classList.add("active");

            chart.innerHTML = buildPnlChart(
                filterSeries(data.series, pill.dataset.range)
            );
        });
    });

    return page;
}
