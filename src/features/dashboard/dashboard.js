import { navigate } from "../../app/router.js";
import { currentUser } from "../../services/auth.js";
import { tipAttr } from "../../components/chart-tooltip.js";
import { icon, FEATURE_ICON } from "../../components/icons.js";

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
    "/mutualfund": FEATURE_ICON.mutualFunds,
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
            path: "/mutualfund",
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
                    <b >${formatINR(0)}</b>
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
                <circle class="br-dash-seg br-dash-c-${item.key} br-tip-seg" data-seg="${item.key}"
                    ${tipAttr(item.label, [["Share", item.pct + "%"], ["Value", formatINR(item.amount)]])}
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
            <li tabindex="0" data-seg="${item.key}">
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
                <b >${formatINR(data.chartTotal)}</b>
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

/* Hover / touch bands for the P&L line, thinned on long series. */
function pnlBands(series, x, width, height, pad) {
    const n = series.length;
    const stride = Math.max(1, Math.ceil(n / 300));
    const bandW =
        n === 1 ? width : ((width - pad * 2) / (n - 1)) * stride;

    return series
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => i % stride === 0)
        .map(({ p, i }) => {
            const sign = p.pnl >= 0 ? "+" : "";
            const left = n === 1 ? 0 : x(i) - bandW / 2;

            return `<rect class="br-tip-hit" x="${left.toFixed(1)}" y="0" width="${bandW.toFixed(1)}" height="${height}" ${tipAttr(p.date, [["P&L", sign + formatINR(p.pnl), p.pnl >= 0 ? "var(--br-success)" : "var(--br-danger)"]])}></rect>`;
        })
        .join("");
}

function buildPnlChart(series) {
    if (!series.length) {
        return `<div class="br-empty-state">
            No SIP entries yet — add one in Mutual Fund.
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
            aria-label="Mutual fund profit and loss" class="br-tip-scrub">
            <line class="br-dash-zero"
                x1="0" x2="${width}" y1="${zeroY}" y2="${zeroY}"></line>
            ${
                series.length > 1
                    ? `<polygon class="br-dash-area" points="${x(0).toFixed(1)},${zeroY} ${points} ${x(series.length - 1).toFixed(1)},${zeroY}"></polygon>`
                    : ""
            }
            <polyline points="${points}" fill="none"></polyline>
            ${
                series.length === 1
                    ? `<circle cx="${x(0)}" cy="${y(last.pnl)}" r="4"></circle>`
                    : ""
            }
            ${pnlBands(series, x, width, height, pad)}
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

/* ---------------- Page helpers ---------------- */

function greeting() {
    const h = new Date().getHours();

    return h < 5 ? "Good night"
        : h < 12 ? "Good morning"
        : h < 17 ? "Good afternoon"
        : "Good evening";
}

function firstName(user) {
    const name = String((user && user.name) || "").trim();

    return name ? name.split(/\s+/)[0] : "";
}

function longDate() {
    return new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long"
    });
}

/* Count the net worth up from 0 once, unless the user prefers less motion. */
function countUp(el, target) {
    const reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !target) return;

    const start = performance.now();
    const duration = 700;

    const frame = (now) => {
        if (!el.isConnected) return;

        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);

        el.textContent = formatINR(target * eased);

        if (t < 1) requestAnimationFrame(frame);
        else el.textContent = formatINR(target);
    };

    requestAnimationFrame(frame);
}

function hasAnyData(data) {
    return Boolean(
        data.income.hasData ||
        data.mutualFunds.hasData ||
        data.stocks.holdings ||
        data.deposits.activeCount ||
        data.deposits.totalCurrentValue ||
        data.lending.liabilities ||
        data.lending.peopleReceivable
    );
}

function buildOnboarding() {
    const steps = [
        ["/income", FEATURE_ICON.income, "Add income", "Log salary and expenses"],
        ["/stocks", FEATURE_ICON.stocks, "Add stocks", "Track your holdings"],
        ["/mutualfund", FEATURE_ICON.mutualFunds, "Start a SIP", "Follow mutual fund growth"],
        ["/deposits", FEATURE_ICON.deposits, "Add a deposit", "Watch maturity dates"]
    ];

    return `
        <div class="br-card br-dash-start dash-reveal">
            <div>
                <h3>Let’s build your picture</h3>
                <p class="br-muted">Add your first entry anywhere below and this overview fills in on its own.</p>
            </div>
            <div class="br-dash-start-grid">
                ${steps.map(([path, ic, title, sub]) => `
                    <button type="button" class="br-dash-start-item" data-path="${path}">
                        <span class="br-dash-tile-icon">${icon(ic, { size: 18 })}</span>
                        <span class="br-dash-start-text"><b>${title}</b><small>${sub}</small></span>
                        ${icon("chevron-right", { size: 16 })}
                    </button>`).join("")}
            </div>
        </div>
    `;
}

/* ---------------- Page ---------------- */

export async function Dashboard() {
    const data = await getDashboardData();

    const tiles = buildTiles(data);

    const page = document.createElement("section");

    page.className = "br-page br-dash";

    let user = null;

    try {
        user = await currentUser();
    } catch { /* guest or signed out: greet without a name */ }

    const initial = firstName(user)
        ? escapeText(firstName(user).charAt(0).toUpperCase())
        : "";

    const hello = firstName(user)
        ? `${greeting()}, ${escapeText(firstName(user))}`
        : greeting();

    const showMF = data.mutualFunds.hasData && data.series.length > 0;

    const grossTotal = data.totalAssets + data.totalLiabilities;

    const assetShare =
        grossTotal > 0
            ? Math.max(0, Math.min(100, (data.totalAssets / grossTotal) * 100))
            : 0;

    const mfUp = data.mutualFunds.pnl >= 0;

    page.innerHTML = `
        <div class="br-dash-heading dash-reveal">
            <div class="br-dash-hello">
                <p class="br-dash-date">${longDate()}</p>
                <h2>${hello}</h2>
                <p class="br-dash-sub">Here’s how your money looks today.</p>
            </div>
            ${initial ? `<button type="button" class="br-dash-avatar" data-path="/account" aria-label="Open account">${initial}</button>` : ""}
        </div>

        ${hasAnyData(data) ? "" : buildOnboarding()}

        <div class="br-dash-top">
            <div class="br-card br-dash-hero dash-reveal">
                <span class="br-stat-label">${icon(FEATURE_ICON.networth, { size: 16 })}Total net worth</span>

                <strong class="br-dash-networth ${
                    data.netWorth < 0 ? "br-text-danger" : ""
                }" data-networth>${formatINR(data.netWorth)}</strong>

                <div class="br-dash-chips">
                    <span class="br-badge ${mfUp ? "br-badge-success" : "br-badge-danger"}">Mutual Funds ${
                        data.mutualFunds.hasData ? signed(data.mutualFunds.pnlPct) : "0.0%"
                    }</span>

                    <span class="br-badge ${data.stocks.pnl >= 0 ? "br-badge-success" : "br-badge-danger"}">Stocks ${
                        data.stocks.holdings ? signed(data.stocks.pnlPct) : "0.0%"
                    }</span>
                </div>

                <div class="br-dash-ratio" role="img"
                    aria-label="Assets are ${assetShare.toFixed(0)} percent of assets plus liabilities">
                    <div class="br-dash-ratio-bar">
                        <span style="width:${assetShare.toFixed(1)}%"></span>
                    </div>
                    <div class="br-dash-ratio-legend">
                        <span><i class="br-dash-dot br-dash-ratio-a"></i>Assets</span>
                        <span><i class="br-dash-dot br-dash-ratio-l"></i>Liabilities</span>
                    </div>
                </div>

                <div class="br-dash-foot">
                    <div>
                        <span class="br-stat-label">Total Assets</span>
                        <strong >${formatINR(data.totalAssets)}</strong>
                    </div>
                    <div>
                        <span class="br-stat-label">Total Liabilities</span>
                        <strong class="br-text-danger">${formatINR(data.totalLiabilities)}</strong>
                    </div>
                    <div>
                        <span class="br-stat-label">Cash &amp; Bank</span>
                        <strong class="${toneClass(data.income.cash)}">${formatINR(data.income.cash)}</strong>
                    </div>
                </div>
            </div>

            <div class="br-card br-dash-allocation dash-reveal">
                <div class="br-card-heading">
                    <h3>Asset allocation</h3>
                </div>

                <div class="br-dash-alloc" data-alloc>${buildDonut(data)}</div>
            </div>
        </div>

        <div class="br-card-heading br-dash-lanes-title">
            <h3>Your wealth lanes</h3>
        </div>

        <div class="br-dash-lanes">
            ${tiles.map((tile) => `
                <button type="button"
                    class="br-card br-dash-tile dash-reveal"
                    data-path="${tile.path}">
                    <span class="br-dash-tile-top">
                        <span class="br-dash-tile-icon">${icon(TILE_ICON[tile.path] || "coins", { size: 18 })}</span>
                        <span class="br-dash-tile-chev">${icon("chevron-right", { size: 16 })}</span>
                    </span>
                    <span class="br-dash-tile-name">${tile.name}</span>
                    <strong class="br-dash-tile-value">${tile.value}</strong>
                    <span class="br-dash-trend ${
                        tile.neutral ? "br-text-secondary" : tile.up ? "br-text-success" : "br-text-danger"
                    }">${
                        tile.neutral ? "" : icon(tile.up ? "trending-up" : "trending-down", { size: 14 })
                    }<span>${tile.trend}</span></span>
                </button>`).join("")}
        </div>

        ${showMF ? `
        <div class="br-card br-dash-pnl-card dash-reveal">
            <div class="br-card-heading">
                <h3>Mutual fund profit / loss</h3>
                <span class="br-badge ${mfUp ? "br-badge-success" : "br-badge-danger"}">${signed(data.mutualFunds.pnlPct)}</span>
            </div>

            <div class="br-dash-mini">
                <div><span class="br-stat-label">Invested</span><strong >${formatINR(data.mutualFunds.invested)}</strong></div>
                <div><span class="br-stat-label">Current value</span><strong >${formatINR(data.mutualFunds.currentValue)}</strong></div>
                <div><span class="br-stat-label">Profit / loss</span><strong class="${toneClass(data.mutualFunds.pnl)}">${data.mutualFunds.pnl >= 0 ? "+" : ""}${formatINR(data.mutualFunds.pnl)}</strong></div>
            </div>

            <div class="br-dash-pills" data-range-pills>
                ${RANGES.map((r) => `<button type="button"
                    class="br-dash-pill${r.key === "all" ? " active" : ""}"
                    data-range="${r.key}">${r.label}</button>`).join("")}
            </div>

            <div data-pnl-chart>${buildPnlChart(data.series)}</div>
        </div>` : ""}
    `;

    /* Open a section */
    page.querySelectorAll("[data-path]").forEach((tile) => {
        tile.addEventListener("click", () => {
            navigate(tile.dataset.path);
        });
    });

    /* Legend <-> donut highlight */
    const alloc = page.querySelector("[data-alloc]");

    const highlight = (key) => {
        if (key) alloc.dataset.hover = key;
        else delete alloc.dataset.hover;
    };

    alloc.querySelectorAll("li[data-seg]").forEach((li) => {
        li.addEventListener("mouseenter", () => highlight(li.dataset.seg));
        li.addEventListener("mouseleave", () => highlight(null));
        li.addEventListener("focus", () => highlight(li.dataset.seg));
        li.addEventListener("blur", () => highlight(null));
    });

    alloc.querySelectorAll("circle[data-seg]").forEach((c) => {
        c.addEventListener("mouseenter", () => highlight(c.dataset.seg));
        c.addEventListener("mouseleave", () => highlight(null));
    });

    /* Range pills (only present when the graph is shown) */
    const chart = page.querySelector("[data-pnl-chart]");

    if (chart) {
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
    }

    /* Stagger the cards in */
    page.querySelectorAll(".dash-reveal").forEach((el, i) => {
        el.style.setProperty("--dash-i", String(Math.min(i, 9)));
    });

    countUp(page.querySelector("[data-networth]"), data.netWorth);

    return page;
}

function escapeText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
