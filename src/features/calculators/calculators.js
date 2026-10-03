import { sipPlan, lumpsumPlan, inr, inrShort } from "./calculators-service.js";
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
    }
};

/* Kept for the life of the page load, so switching tabs does not reset them. */
const values = {
    sipAmount: 10000,
    lumpAmount: 500000,
    stepUp: 10,
    rate: 12,
    years: 10,
    inflation: 6
};

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

        <div class="cl-layout" data-calc-content></div>
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
        <section class="br-card cl-inputs">
            <div class="cl-inputs-head">
                <h3>${tab.title}</h3>
                <p class="br-muted">${tab.text}</p>
            </div>
            ${tab.fields.map(fieldHTML).join("")}
        </section>

        <div class="cl-results" data-calc-results></div>
    `;

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

function renderResults(page, animate = false) {
    const box = page.querySelector("[data-calc-results]");

    if (!box) return;

    const tab = TABS[currentTab];
    const v = {};

    Object.keys(FIELDS).forEach((k) => (v[k] = clamp(k, values[k])));

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

function chartHTML(yearly, W, animate) {
    const H = 250;
    const padL = 56;
    const padR = 6;
    const padT = 8;
    const padB = 26;
    const n = yearly.length;
    const top = niceMax(Math.max(...yearly.map((d) => d.value)));
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const band = plotW / n;
    const barW = Math.max(3, Math.min(band * 0.7, 30));
    const y = (val) => padT + plotH - (val / top) * plotH;
    const every = Math.ceil(n / Math.max(3, Math.floor(plotW / 44)));

    const grid = [0, 0.25, 0.5, 0.75, 1]
        .map((f) => {
            const gy = y(top * f);

            return `
            <line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" stroke="currentColor" opacity="${f === 0 ? 0.3 : 0.1}"/>
            <text x="${padL - 6}" y="${gy + 4}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${inrShort(top * f)}</text>`;
        })
        .join("");

    const bars = yearly
        .map((d, i) => {
            const cx = padL + band * i + band / 2;
            const x = cx - barW / 2;
            const invH = Math.max(0, y(0) - y(d.invested));
            const retH = Math.max(0, y(0) - y(d.value) - invH);
            const delay = animate ? ` style="animation-delay:${Math.min(i * 14, 420)}ms"` : "";

            return `
            <g class="${animate ? "cl-bar cl-grow" : "cl-bar"}"${delay}>
                <rect x="${x.toFixed(2)}" y="${(y(0) - invH).toFixed(2)}" width="${barW.toFixed(2)}" height="${invH.toFixed(2)}" fill="${COLORS.info}"/>
                <rect x="${x.toFixed(2)}" y="${(y(0) - invH - retH).toFixed(2)}" width="${barW.toFixed(2)}" height="${retH.toFixed(2)}" fill="${COLORS.success}"/>
            </g>`;
        })
        .join("");

    const labels = yearly
        .map((d, i) =>
            (i + 1) % every === 0 || i === n - 1
                ? `<text x="${(padL + band * i + band / 2).toFixed(2)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${d.year}</text>`
                : ""
        )
        .join("");

    const hits = yearly
        .map(
            (d, i) => `
            <rect class="br-tip-hit" x="${(padL + band * i).toFixed(2)}" y="0" width="${band.toFixed(2)}" height="${H}"
                ${tipAttr(`Year ${d.year}`, [
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
                ${grid}${bars}${labels}${hits}
            </svg>
        </div>`;
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
    let lastWidth = 0;

    const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!page.isConnected) return cleanup();

            const box = page.querySelector("[data-calc-results]");
            const w = box ? box.clientWidth : 0;

            if (Math.abs(w - lastWidth) > 24) {
                lastWidth = w;
                renderResults(page, false);
            }
        }, 160);
    };

    function cleanup() {
        window.removeEventListener("br:theme-change", redraw);
        window.removeEventListener("resize", onResize);
    }

    window.addEventListener("br:theme-change", redraw);
    window.addEventListener("resize", onResize);

    requestAnimationFrame(() => {
        const box = page.querySelector("[data-calc-results]");

        lastWidth = box ? box.clientWidth : 0;

        /* The first draw happens before the page is on screen, so it had no
           width to measure. Draw once more at the real width. */
        if (box && page.isConnected && Math.abs(lastWidth - Number(box.dataset.width || 0) - 40) > 24) {
            renderResults(page, true);
        }
    });
}
