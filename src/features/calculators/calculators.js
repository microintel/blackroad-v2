import { sipPlan, lumpsumPlan, goalPlan, swpPlan, inr, inrShort } from "./calculators-service.js";
import { pulseCalculating } from "../../components/task-loader.js";
import { getMutualFundSummary, getStocksSummary, getDepositsSummary } from "../dashboard/dashboard-service.js";
import { COLORS } from "../../components/chart-colors.js";
import { tipAttr } from "../../components/chart-tooltip.js";

/* =========================================================
   CALCULATORS  (Tools)
   SIP, Step-up SIP and Lumpsum. Nothing is saved or sent
   anywhere; the numbers you type stay in this page. Inputs
   you set on a tab are kept while you switch between tabs.
   ========================================================= */

/* Field settings. sMin/sMax/sStep belong to the slider; `max` is the hard
   limit for a typed number. */
const FIELDS = {
    sipAmount:  { label: "Monthly investment", prefix: "₹", sMin: 500, sMax: 100000, sStep: 500, min: 0, max: 100000000, fmt: inrShort },
    lumpAmount: { label: "Total investment", prefix: "₹", sMin: 10000, sMax: 5000000, sStep: 10000, min: 0, max: 10000000000, fmt: inrShort },
    stepUp:     { label: "Yearly step-up", suffix: "%", sMin: 0, sMax: 30, sStep: 1, min: 0, max: 100, fmt: (v) => v + "%" },
    rate:       { label: "Expected return (p.a.)", suffix: "%", sMin: 1, sMax: 30, sStep: 0.5, min: 0, max: 100, fmt: (v) => v + "%" },
    years:      { label: "Time period", suffix: "Yr", sMin: 1, sMax: 40, sStep: 1, min: 1, max: 60, int: true, fmt: (v) => v + " Yr" },
    goalAmount: { label: "Goal amount (today's value)", prefix: "₹", sMin: 100000, sMax: 50000000, sStep: 100000, min: 0, max: 100000000000, fmt: inrShort },
    goalCorpus: { label: "Already invested for this goal", prefix: "₹", sMin: 0, sMax: 10000000, sStep: 50000, min: 0, max: 100000000000, fmt: inrShort },
    swpCorpus:  { label: "Starting corpus", prefix: "₹", sMin: 100000, sMax: 50000000, sStep: 100000, min: 0, max: 100000000000, fmt: inrShort },
    withdraw:   { label: "Monthly withdrawal", prefix: "₹", sMin: 1000, sMax: 500000, sStep: 1000, min: 0, max: 1000000000, fmt: inrShort },
    withdrawStep: { label: "Yearly increase in withdrawal", suffix: "%", sMin: 0, sMax: 15, sStep: 1, min: 0, max: 100, fmt: (v) => v + "%" },
    inflation:  { label: "Inflation (p.a.)", suffix: "%", sMin: 0, sMax: 12, sStep: 0.5, min: 0, max: 30, fmt: (v) => v + "%" }
};

const TABS = {
    sip: {
        label: "SIP",
        title: "SIP calculator",
        text: "Invest a fixed amount every month.",
        fields: ["sipAmount", "rate", "years", "inflation"],
        plan: (v) => sipPlan({ amount: v.sipAmount, rate: v.rate, years: v.years, inflation: v.inflation })
    },
    stepup: {
        label: "Step-up SIP",
        title: "Step-up SIP calculator",
        text: "Start with a monthly amount and raise it every year.",
        fields: ["sipAmount", "stepUp", "rate", "years", "inflation"],
        plan: (v) =>
            sipPlan({ amount: v.sipAmount, stepUp: v.stepUp, rate: v.rate, years: v.years, inflation: v.inflation })
    },
    lumpsum: {
        label: "Lumpsum",
        title: "Lumpsum calculator",
        text: "Invest one amount today and let it grow.",
        fields: ["lumpAmount", "rate", "years", "inflation"],
        plan: (v) => lumpsumPlan({ amount: v.lumpAmount, rate: v.rate, years: v.years, inflation: v.inflation })
    },
    goal: {
        label: "Goal planner",
        kind: "goal",
        title: "Goal planner",
        text: "Find the monthly SIP needed to reach a target.",
        fields: ["goalAmount", "goalCorpus", "rate", "years", "inflation"],
        data: "goalCorpus"
    },
    swp: {
        label: "SWP",
        kind: "swp",
        title: "Withdrawal planner (SWP)",
        text: "See how long your money lasts when you withdraw every month.",
        fields: ["swpCorpus", "withdraw", "withdrawStep", "rate", "years", "inflation"],
        data: "swpCorpus"
    }
};

/* Kept for the life of the page load, so switching tabs does not reset them. */
const values = {
    sipAmount: 10000,
    lumpAmount: 500000,
    stepUp: 10,
    rate: 12,
    years: 10,
    inflation: 6,
    goalAmount: 5000000,
    goalCorpus: 0,
    swpCorpus: 2000000,
    withdraw: 15000,
    withdrawStep: 0
};

/* Which of "my investments" are ticked for each starting-amount field. */
const picked = { goalCorpus: new Set(), swpCorpus: new Set() };
const SOURCES = [
    { key: "mf", label: "Mutual funds" },
    { key: "stocks", label: "Stocks" },
    { key: "fd", label: "Deposits" }
];

let myData = null;
let dataPromise = null;

const safely = async (fn) => {
    try { return await fn(); } catch (e) { console.error("BlackRoad calculators:", e); return null; }
};

/* Read-only: current values already stored in the app. */
function loadMyData() {
    if (!dataPromise) {
        dataPromise = Promise.all([
            safely(getMutualFundSummary),
            safely(getStocksSummary),
            safely(getDepositsSummary)
        ]).then(([mf, st, fd]) => {
            myData = {
                mf: Math.max(0, Math.round(Number(mf?.currentValue) || 0)),
                stocks: Math.max(0, Math.round(Number(st?.currentValue) || 0)),
                fd: Math.max(0, Math.round(Number(fd?.totalCurrentValue) || 0))
            };
            return myData;
        });
    }
    return dataPromise;
}

let currentTab = "sip";
let tableOpen = false;

const reducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (key, raw) => {
    const f = FIELDS[key];
    let n = parseFloat(raw);

    if (!Number.isFinite(n)) n = 0;

    n = Math.min(f.max, Math.max(f.min, n));

    return f.int ? Math.round(n) : n;
};

const plain = (n) => String(+Number(n).toFixed(2));


/* =========================================================
   PAGE
========================================================= */

export async function Calculators() {
    const page = document.createElement("section");

    page.className = "br-page br-calc";

    dataPromise = null;
    myData = null;
    /* The page may not be on screen yet when the data arrives, so retry briefly. */
    const tryPaint = (n = 0) => {
        if (page.isConnected) paintData(page);
        else if (n < 20) setTimeout(() => tryPaint(n + 1), 100);
    };
    loadMyData().then(() => tryPaint());

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Calculators</h2>
                <p>Estimate what your investments could grow to. Nothing here is saved.</p>
            </div>
        </div>

        <div class="br-income-tabs br-tabs-flat" role="group" aria-label="Calculators">
            ${Object.entries(TABS)
                .map(
                    ([key, t]) => `
                <button type="button"
                    class="br-income-tab${key === currentTab ? " active" : ""}"
                    data-calc-tab="${key}"
                    aria-pressed="${key === currentTab}">${t.label}</button>`
                )
                .join("")}
        </div>

        <div class="cl-content" data-calc-content></div>
    `;

    attachEvents(page);
    renderTab(page, true);

    return page;
}


/* =========================================================
   RENDER
========================================================= */

function fieldHTML(key) {
    const f = FIELDS[key];
    const v = values[key];
    const sv = Math.min(f.sMax, Math.max(f.sMin, v));
    const pct = ((sv - f.sMin) / (f.sMax - f.sMin)) * 100;

    return `
        <div class="cl-field">
            <div class="cl-field-head">
                <label for="cl-${key}">${f.label}</label>
                <div class="cl-input-wrap">
                    ${f.prefix ? `<span class="cl-affix" aria-hidden="true">${f.prefix}</span>` : ""}
                    <input class="br-input cl-num" id="cl-${key}" type="number" inputmode="decimal"
                        data-calc-num="${key}" value="${plain(v)}"
                        min="${f.min}" max="${f.max}" step="${f.int ? 1 : "any"}">
                    ${f.suffix ? `<span class="cl-affix" aria-hidden="true">${f.suffix}</span>` : ""}
                </div>
            </div>
            <input class="cl-range" type="range" data-calc-range="${key}"
                min="${f.sMin}" max="${f.sMax}" step="${f.sStep}" value="${sv}"
                style="--p:${pct}%" aria-label="${f.label}">
            <div class="cl-range-scale"><span>${f.fmt(f.sMin)}</span><span>${f.fmt(f.sMax)}</span></div>
        </div>`;
}

/* Draw the inputs for the open tab, then its results. */
function renderTab(page, animate) {
    const tab = TABS[currentTab];
    const content = page.querySelector("[data-calc-content]");

    content.innerHTML = `
      <div class="cl-layout">
        <div class="cl-side">
            ${tab.data ? `<section class="br-card cl-data" data-calc-data="${tab.data}"></section>` : ""}
            <section class="br-card cl-inputs">
                <div class="cl-inputs-head">
                    <h3>${tab.title}</h3>
                    <p class="br-muted">${tab.text}</p>
                </div>
                ${tab.fields.map(fieldHTML).join("")}
            </section>
        </div>

        <div class="cl-results" data-calc-results></div>
      </div>
      <div class="cl-wide" data-calc-wide></div>
    `;

    paintData(page);
    renderResults(page, animate);
}

let tweenFrame = 0;
const lastTotal = {};

/* Count the big number up (or down) to its new value. */
function tweenTotal(el, from, to) {
    cancelAnimationFrame(tweenFrame);

    if (!el) return;

    if (reducedMotion() || from === to) {
        el.textContent = inr(to);
        return;
    }

    const start = performance.now();
    const ms = 420;

    const tick = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = 1 - Math.pow(1 - t, 3);

        el.textContent = inr(from + (to - from) * eased);

        if (t < 1) tweenFrame = requestAnimationFrame(tick);
    };

    tweenFrame = requestAnimationFrame(tick);
}

/* "Use my investments": tap to fill the starting amount from stored records. */
function paintData(page) {
    const box = page.querySelector("[data-calc-data]");

    if (!box) return;

    const key = box.dataset.calcData;
    let body;

    if (!myData) {
        body = `<p class="br-muted cl-data-note">Loading your investments…</p>`;
    } else if (!myData.mf && !myData.stocks && !myData.fd) {
        body = `<p class="br-muted cl-data-note">No holdings found yet. Add some in Stocks, Mutual Fund or Fixed Deposits, or type an amount below.</p>`;
    } else {
        body = `<div class="cl-chips">${SOURCES.map((src) => {
            const amt = myData[src.key];
            const on = picked[key].has(src.key);

            return `<button type="button" class="cl-chip${on ? " is-on" : ""}" data-calc-src="${src.key}"
                aria-pressed="${on}" ${amt ? "" : "disabled"}>
                <span>${src.label}</span><strong>${amt ? inr(amt) : "None yet"}</strong></button>`;
        }).join("")}</div>`;
    }

    box.innerHTML = `
        <div class="cl-inputs-head">
            <h3>Use my investments</h3>
            <p class="br-muted">Tap to fill the amount from your records.</p>
        </div>
        ${body}`;
}

/* Set a field from code (chips) and keep its slider, box and results in step. */
function applyValue(page, key, val) {
    const f = FIELDS[key];
    const box = page.querySelector(`[data-calc-num="${key}"]`);

    values[key] = clamp(key, val);

    if (!box) return;

    const slider = box.closest(".cl-field").querySelector("[data-calc-range]");
    const sv = Math.min(f.sMax, Math.max(f.sMin, values[key]));

    box.value = plain(values[key]);
    slider.value = sv;
    slider.style.setProperty("--p", ((sv - f.sMin) / (f.sMax - f.sMin)) * 100 + "%");
    renderResults(page, false);
}

function planWidth(box) {
    const width = Math.max(280, Math.round(box.clientWidth || 640) - 40);

    box.dataset.width = String(width);

    return width;
}

function statCards(list) {
    return `<div class="cl-stats">${list.map(([label, value, note, cls]) => `
        <div class="br-card br-stat">
            <div class="br-stat-label">${label}</div>
            <div class="br-stat-value ${cls || ""}">${value}</div>
            ${note ? `<p class="br-muted">${note}</p>` : ""}
        </div>`).join("")}</div>`;
}

function emptyHTML(msg) {
    return `
        <section class="br-card">
            <div class="br-empty-state">
                <strong>${msg}</strong>
                <p>The result appears here as soon as you do.</p>
            </div>
        </section>`;
}

function breakdownCard(inner) {
    return `<section class="br-card"><details class="cl-details" ${tableOpen ? "open" : ""}>
        <summary>Year-by-year breakdown</summary>${inner}</details></section>`;
}

function renderGoal(box, v, animate) {
    if (v.goalAmount <= 0 || v.years < 1) {
        box.innerHTML = emptyHTML("Enter a goal amount and a time period");
        return;
    }

    const r = goalPlan({ goal: v.goalAmount, rate: v.rate, years: v.years, corpus: v.goalCorpus, inflation: v.inflation });
    const width = planWidth(box);
    const share = r.value > 0 ? (r.returns / r.value) * 100 : 0;
    const yrs = `${v.years} ${v.years === 1 ? "year" : "years"}`;

    box.innerHTML = `
        <section class="br-card cl-hero">
            <div class="cl-hero-main">
                <div class="br-stat-label">Monthly SIP needed for ${yrs}</div>
                <div class="cl-total" data-calc-total aria-live="polite">${inr(r.requiredSip)}</div>
                ${r.onTrack
                    ? `<p class="cl-ok">You are already on track: your current investment alone is projected to reach ${inr(r.corpusFV)}.</p>`
                    : `<p class="br-muted">to reach ${inr(r.target)}${v.goalCorpus > 0 ? `, after your ${inr(v.goalCorpus)} grows to ${inr(r.corpusFV)}` : ""}</p>`}
                ${v.inflation > 0
                    ? `<p class="cl-real">A goal of <strong>${inr(r.goalToday)}</strong> today is about <strong>${inr(r.target)}</strong> in ${yrs} at ${plain(v.inflation)}% inflation</p>`
                    : ""}
            </div>
            ${donutHTML(r.invested, r.returns, share)}
        </section>

        ${statCards([
            ["Goal in " + yrs, inr(r.target)],
            ["Existing money grows to", inr(r.corpusFV)],
            ["You invest monthly", inr(r.sipTotal), "in total, over " + yrs],
            ["Estimated returns", inr(r.returns), "", "cl-gain"]
        ])}

        <section class="br-card">
            <div class="br-card-heading"><h3>Path to your goal</h3></div>
            <div class="cl-legend">
                <span><i style="background:${COLORS.info}"></i>Invested</span>
                <span><i style="background:${COLORS.success}"></i>Returns</span>
            </div>
            ${chartHTML(r.yearly, width, animate)}
        </section>

        ${breakdownCard(tableHTML(r.yearly, true))}

        <p class="br-field-help cl-note">
            Estimates only: real returns vary and are not guaranteed. SIPs are assumed at the start of each month, compounded monthly; money already invested grows once a year.
        </p>`;

    const from = animate ? 0 : lastTotal.goal ?? 0;

    tweenTotal(box.querySelector("[data-calc-total]"), from, r.requiredSip);
    lastTotal.goal = r.requiredSip;
}

function renderSwp(box, v, animate) {
    if (v.swpCorpus <= 0 || v.withdraw <= 0 || v.years < 1) {
        box.innerHTML = emptyHTML("Enter a corpus, a monthly withdrawal and a time period");
        return;
    }

    const r = swpPlan({ corpus: v.swpCorpus, withdraw: v.withdraw, rate: v.rate, years: v.years, step: v.withdrawStep, inflation: v.inflation });
    const width = planWidth(box);
    const yrs = `${v.years} ${v.years === 1 ? "year" : "years"}`;
    const lasted = `${Math.floor(r.months / 12)} yr ${r.months % 12} mo`;
    const share = r.withdrawn + r.balance > 0 ? (r.interest / (r.withdrawn + r.balance)) * 100 : 0;

    const chartRows = r.yearly.map((d) => ({ year: d.year, invested: d.balance, returns: 0, value: d.balance, withdrawn: d.withdrawn }));
    const tip = (d) => [
        ["Balance left", inr(d.value), COLORS.info],
        ["Withdrawn that year", inr(d.withdrawn), COLORS.success]
    ];

    box.innerHTML = `
        <section class="br-card cl-hero">
            <div class="cl-hero-main">
                <div class="br-stat-label">${r.depleted ? "Your money lasts" : "Money left after " + yrs}</div>
                <div class="cl-total" data-calc-total aria-live="polite">${r.depleted ? lasted : inr(r.balance)}</div>
                ${r.depleted
                    ? `<p class="cl-warn">It runs out before ${yrs}. Lower the withdrawal to about ${inr(r.sustainable)} a month to last the full period.</p>`
                    : `<p class="br-muted">after withdrawing ${inr(r.withdrawn)} in total</p>`}
                ${!r.depleted && v.inflation > 0
                    ? `<p class="cl-real">Worth about <strong>${inr(r.realBalance)}</strong> in today's money at ${plain(v.inflation)}% inflation</p>`
                    : ""}
            </div>
            ${donutHTML(v.swpCorpus, r.interest, share)}
        </section>

        ${statCards([
            ["Total withdrawn", inr(r.withdrawn)],
            ["Interest earned", inr(r.interest), "", "cl-gain"],
            ["Safe monthly withdrawal", inr(r.sustainable), "lasts the full " + yrs],
            ["Starting corpus", inr(v.swpCorpus)]
        ])}

        <section class="br-card">
            <div class="br-card-heading"><h3>Balance over time</h3></div>
            <div class="cl-legend"><span><i style="background:${COLORS.info}"></i>Balance remaining</span></div>
            ${chartHTML(chartRows, width, animate, tip)}
        </section>

        ${breakdownCard(`
            <div class="br-table-wrap cl-table"><table class="br-table">
                <thead><tr><th>Year</th><th class="cl-r">Withdrawn</th><th class="cl-r">Interest</th><th class="cl-r">Balance</th></tr></thead>
                <tbody>${r.yearly.map((d) => `<tr><td>${d.year}</td><td class="cl-r">${inr(d.withdrawn)}</td><td class="cl-r">${inr(d.interest)}</td><td class="cl-r"><strong>${inr(d.balance)}</strong></td></tr>`).join("")}</tbody>
            </table></div>`)}

        <p class="br-field-help cl-note">
            Estimates only: real returns vary and are not guaranteed. Withdrawals are taken at the start of each month and the rest earns returns compounded monthly.
        </p>`;

    if (r.depleted) {
        lastTotal.swp = 0;
        return;
    }

    const from = animate ? 0 : lastTotal.swp ?? 0;

    tweenTotal(box.querySelector("[data-calc-total]"), from, r.balance);
    lastTotal.swp = r.balance;
}

function renderResults(page, animate = false) {
    renderResultsNow(page, animate);
    pulseCalculating();

    /* The summary (total + stat cards) stays beside the inputs; the chart,
       breakdown and note go in one full-width section underneath. */
    const box = page.querySelector("[data-calc-results]");
    const wide = page.querySelector("[data-calc-wide]");

    if (box && wide) {
        const rest = box.querySelector(".cl-hero")
            ? [...box.children].filter((el) => !el.matches(".cl-hero, .cl-stats"))
            : [];

        wide.replaceChildren(...rest);
    }

    requestAnimationFrame(() => fitChart(page));
}

function renderResultsNow(page, animate = false) {
    const box = page.querySelector("[data-calc-results]");

    if (!box) return;

    const tab = TABS[currentTab];
    const v = {};

    Object.keys(FIELDS).forEach((k) => (v[k] = clamp(k, values[k])));

    if (tab.kind === "goal") return renderGoal(box, v, animate);
    if (tab.kind === "swp") return renderSwp(box, v, animate);

    const amount = currentTab === "lumpsum" ? v.lumpAmount : v.sipAmount;

    if (amount <= 0 || v.years < 1) {
        box.innerHTML = `
            <section class="br-card">
                <div class="br-empty-state">
                    <strong>Enter an amount and a time period</strong>
                    <p>The result appears here as soon as you do.</p>
                </div>
            </section>`;
        return;
    }

    const r = tab.plan(v);
    const width = Math.max(280, Math.round(box.clientWidth || 640) - 40);
    const share = r.value > 0 ? (r.returns / r.value) * 100 : 0;

    box.dataset.width = String(width);

    box.innerHTML = `
        <section class="br-card cl-hero">
            <div class="cl-hero-main">
                <div class="br-stat-label">Expected value after ${v.years} ${v.years === 1 ? "year" : "years"}</div>
                <div class="cl-total" data-calc-total aria-live="polite">${inr(r.value)}</div>
                <p class="br-muted">
                    ${inr(r.value - r.invested)} gained on ${inr(r.invested)} invested
                    (${r.multiple.toFixed(2)}×)
                </p>
                ${
                    v.inflation > 0
                        ? `<p class="cl-real">Worth about <strong>${inr(r.realValue)}</strong> in today's money at ${plain(v.inflation)}% inflation</p>`
                        : ""
                }
            </div>
            ${donutHTML(r.invested, r.returns, share)}
        </section>

        <div class="cl-stats">
            <div class="br-card br-stat">
                <div class="br-stat-label">Invested</div>
                <div class="br-stat-value">${inr(r.invested)}</div>
            </div>
            <div class="br-card br-stat">
                <div class="br-stat-label">Estimated returns</div>
                <div class="br-stat-value cl-gain">${inr(r.returns)}</div>
            </div>
            ${
                currentTab === "stepup"
                    ? `<div class="br-card br-stat">
                        <div class="br-stat-label">SIP in year ${v.years}</div>
                        <div class="br-stat-value">${inr(r.finalSip)}</div>
                        <p class="br-muted">per month, up from ${inr(v.sipAmount)}</p>
                    </div>`
                    : `<div class="br-card br-stat">
                        <div class="br-stat-label">Total value</div>
                        <div class="br-stat-value">${inr(r.value)}</div>
                    </div>`
            }
        </div>

        <section class="br-card">
            <div class="br-card-heading"><h3>Growth over time</h3></div>
            <div class="cl-legend">
                <span><i style="background:${COLORS.info}"></i>Invested</span>
                <span><i style="background:${COLORS.success}"></i>Returns</span>
            </div>
            ${chartHTML(r.yearly, width, animate)}
        </section>

        <section class="br-card">
            <details class="cl-details" ${tableOpen ? "open" : ""}>
                <summary>Year-by-year breakdown</summary>
                ${tableHTML(r.yearly, currentTab === "stepup")}
            </details>
        </section>

        <p class="br-field-help cl-note">
            Estimates only: real returns vary and are not guaranteed.
            ${currentTab === "lumpsum"
                ? "Lumpsum growth is compounded once a year."
                : "SIPs are assumed to be paid at the start of each month, with returns compounded monthly."}
        </p>
    `;

    const from = animate ? 0 : lastTotal[currentTab] ?? 0;

    tweenTotal(box.querySelector("[data-calc-total]"), from, r.value);
    lastTotal[currentTab] = r.value;
}


/* =========================================================
   CHARTS
========================================================= */

function donutHTML(invested, returns, share) {
    const R = 52;
    const C = 2 * Math.PI * R;
    const total = invested + returns;
    const inv = total > 0 ? (invested / total) * C : C;
    const ret = Math.max(0, C - inv);

    return `
        <div class="cl-donut" role="img"
            aria-label="${Math.round(100 - share)}% invested, ${Math.round(share)}% returns">
            <svg viewBox="0 0 140 140" width="140" height="140">
                <g transform="rotate(-90 70 70)" fill="none" stroke-width="16">
                    <circle cx="70" cy="70" r="${R}" stroke="${COLORS.info}"
                        stroke-dasharray="${inv.toFixed(2)} ${(C - inv).toFixed(2)}"/>
                    <circle cx="70" cy="70" r="${R}" stroke="${COLORS.success}"
                        stroke-dasharray="${ret.toFixed(2)} ${(C - ret).toFixed(2)}"
                        stroke-dashoffset="${(-inv).toFixed(2)}"/>
                </g>
            </svg>
            <div class="cl-donut-label"><strong>${Math.round(share)}%</strong><span>returns</span></div>
        </div>`;
}

/* A round axis maximum whose quarters are also round numbers. */
function niceMax(v) {
    if (v <= 0) return 1;

    const pow = Math.pow(10, Math.floor(Math.log10(v)));

    for (const m of [1, 2, 3, 4, 6, 8, 10]) {
        if (v <= m * pow) return m * pow;
    }

    return 10 * pow;
}

/* What the chart on screen was drawn from, so it can be redrawn at the width
   the card really has (see fitChart). */
let chartState = null;

/* Up to this many years the chart uses bars; beyond it, bars turn into thin
   slivers, so a filled area chart (edge to edge) is used instead. */
const BAR_LIMIT = 30;

function chartHTML(yearly, W, animate, tip) {
    chartState = { yearly, tip, W };

    const wide = W >= 700;
    const H = wide ? 320 : 250;
    const padL = 56;
    const n = yearly.length;
    const area = n > BAR_LIMIT;
    const padR = area ? 16 : 6;
    const padT = 8;
    const padB = 26;
    const top = niceMax(Math.max(...yearly.map((d) => d.value)));
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const band = plotW / n;
    const barW = Math.max(3, Math.min(band * 0.7, 44));
    const y = (val) => padT + plotH - (val / top) * plotH;
    const xs = yearly.map((_, i) =>
        area ? padL + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2) : padL + band * i + band / 2
    );
    const every = Math.ceil(n / Math.max(3, Math.floor(plotW / 44)));
    const cls = animate ? "cl-bar cl-grow" : "cl-bar";

    const grid = [0, 0.25, 0.5, 0.75, 1]
        .map((f) => {
            const gy = y(top * f);

            return `
            <line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" stroke="currentColor" opacity="${f === 0 ? 0.3 : 0.1}"/>
            <text x="${padL - 6}" y="${gy + 4}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${inrShort(top * f)}</text>`;
        })
        .join("");

    let shapes;

    if (area) {
        const pts = (f) => xs.map((x, i) => `${x.toFixed(2)},${y(f(yearly[i])).toFixed(2)}`);
        const inv = pts((d) => d.invested);
        const val = pts((d) => d.value);
        const base = y(0).toFixed(2);
        const x0 = xs[0].toFixed(2);
        const xn = xs[n - 1].toFixed(2);

        shapes = `
            <g class="${cls}">
                <path d="M${x0},${base} L${inv.join(" L")} L${xn},${base} Z" fill="${COLORS.info}" opacity=".85"/>
                <path d="M${val.join(" L")} L${[...inv].reverse().join(" L")} Z" fill="${COLORS.success}" opacity=".85"/>
                <polyline points="${val.join(" ")}" fill="none" stroke="${COLORS.success}" stroke-width="2" stroke-linejoin="round"/>
                <polyline points="${inv.join(" ")}" fill="none" stroke="${COLORS.info}" stroke-width="2" stroke-linejoin="round"/>
            </g>`;
    } else {
        shapes = yearly
            .map((d, i) => {
                const x = xs[i] - barW / 2;
                const invH = Math.max(0, y(0) - y(d.invested));
                const retH = Math.max(0, y(0) - y(d.value) - invH);
                const delay = animate ? ` style="animation-delay:${Math.min(i * 14, 420)}ms"` : "";

                return `
            <g class="${cls}"${delay}>
                <rect x="${x.toFixed(2)}" y="${(y(0) - invH).toFixed(2)}" width="${barW.toFixed(2)}" height="${invH.toFixed(2)}" fill="${COLORS.info}"/>
                <rect x="${x.toFixed(2)}" y="${(y(0) - invH - retH).toFixed(2)}" width="${barW.toFixed(2)}" height="${retH.toFixed(2)}" fill="${COLORS.success}"/>
            </g>`;
            })
            .join("");
    }

    const labels = yearly
        .map((d, i) =>
            (i + 1) % every === 0 || i === n - 1
                ? `<text x="${xs[i].toFixed(2)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${d.year}</text>`
                : ""
        )
        .join("");

    const hitW = area ? plotW / Math.max(1, n - 1) : band;
    const hits = yearly
        .map(
            (d, i) => `
            <rect class="br-tip-hit" x="${(xs[i] - hitW / 2).toFixed(2)}" y="0" width="${hitW.toFixed(2)}" height="${H}"
                ${tipAttr(`Year ${d.year}`, tip ? tip(d) : [
                    ["Invested", inr(d.invested), COLORS.info],
                    ["Returns", inr(d.returns), COLORS.success],
                    ["Value", inr(d.value), COLORS.text]
                ])}></rect>`
        )
        .join("");

    return `
        <div class="cl-chart">
            <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
                aria-label="Invested amount and returns for each year">
                ${grid}${shapes}${labels}${hits}
            </svg>
        </div>`;
}

/* Redraw the chart at the width its card really has. The first draw happens
   before the page is on screen (no width to measure), and the card width
   changes with the window and the side column, so measure after layout. */
function fitChart(page) {
    const holder = page.querySelector(".cl-chart");

    if (!holder || !chartState) return;

    const w = Math.floor(holder.clientWidth);

    if (w < 200 || Math.abs(w - chartState.W) < 6) return;

    holder.outerHTML = chartHTML(chartState.yearly, w, false, chartState.tip);
}

function tableHTML(yearly, showSip) {
    return `
        <div class="br-table-wrap cl-table">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        ${showSip ? "<th class=\"cl-r\">Monthly SIP</th>" : ""}
                        <th class="cl-r">Invested</th>
                        <th class="cl-r">Returns</th>
                        <th class="cl-r">Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${yearly
                        .map(
                            (d) => `
                    <tr>
                        <td>${d.year}</td>
                        ${showSip ? `<td class="cl-r">${inr(d.sip)}</td>` : ""}
                        <td class="cl-r">${inr(d.invested)}</td>
                        <td class="cl-r">${inr(d.returns)}</td>
                        <td class="cl-r"><strong>${inr(d.value)}</strong></td>
                    </tr>`
                        )
                        .join("")}
                </tbody>
            </table>
        </div>`;
}


/* =========================================================
   EVENTS
========================================================= */

function attachEvents(page) {
    /* Tabs */
    page.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-calc-tab]");

        if (!btn || btn.dataset.calcTab === currentTab) return;

        currentTab = btn.dataset.calcTab;

        page.querySelectorAll("[data-calc-tab]").forEach((b) => {
            const on = b.dataset.calcTab === currentTab;

            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
        });

        renderTab(page, true);
    });

    /* "Use my investments" chips: the ticked sources add up into the field. */
    page.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-calc-src]");

        if (!chip || chip.disabled || !myData) return;

        const key = chip.closest("[data-calc-data]").dataset.calcData;
        const set = picked[key];

        if (set.has(chip.dataset.calcSrc)) set.delete(chip.dataset.calcSrc);
        else set.add(chip.dataset.calcSrc);

        applyValue(page, key, [...set].reduce((sum, k) => sum + (myData[k] || 0), 0));
        paintData(page);
    });

    /* Typing a number or dragging a slider keeps the two in step and updates
       the results. The inputs themselves are never redrawn, so the caret and
       focus stay where they are. */
    page.addEventListener("input", (event) => {
        const num = event.target.closest?.("[data-calc-num]");
        const range = event.target.closest?.("[data-calc-range]");
        const key = (num || range)?.dataset[num ? "calcNum" : "calcRange"];

        if (!key) return;

        const f = FIELDS[key];

        values[key] = clamp(key, event.target.value);

        if (picked[key]?.size) {
            picked[key].clear();
            paintData(page);
        }

        const field = event.target.closest(".cl-field");
        const slider = field.querySelector("[data-calc-range]");
        const box = field.querySelector("[data-calc-num]");

        if (num) {
            slider.value = values[key];
        } else {
            box.value = plain(values[key]);
        }

        const sv = Math.min(f.sMax, Math.max(f.sMin, values[key]));

        slider.style.setProperty("--p", ((sv - f.sMin) / (f.sMax - f.sMin)) * 100 + "%");

        renderResults(page, false);
    });

    /* On leaving a box, show the value that was actually used (for example
       a typed 500 years becomes 60). */
    page.addEventListener("focusout", (event) => {
        const num = event.target.closest?.("[data-calc-num]");

        if (!num) return;

        num.value = plain(clamp(num.dataset.calcNum, num.value));
    });

    /* Remember whether the breakdown is open (toggle does not bubble). */
    page.addEventListener(
        "toggle",
        (event) => {
            if (event.target.matches?.(".cl-details")) tableOpen = event.target.open;
        },
        true
    );

    /* Redraw the charts when the theme or the width changes. */
    const redraw = () => {
        if (!page.isConnected) return cleanup();

        renderResults(page, false);
    };

    let timer = 0;

    const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!page.isConnected) return cleanup();

            fitChart(page);
        }, 120);
    };

    /* Also follows the card itself (side column, sidebar, orientation). */
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;

    watcher?.observe(page);

    function cleanup() {
        window.removeEventListener("br:theme-change", redraw);
        window.removeEventListener("resize", onResize);
        watcher?.disconnect();
    }

    window.addEventListener("br:theme-change", redraw);
    window.addEventListener("resize", onResize);

    requestAnimationFrame(() => fitChart(page));
    setTimeout(() => fitChart(page), 250);
}
