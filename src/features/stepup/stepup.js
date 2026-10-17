import { isUSD, usd } from "../../services/currency.js";
import { icon } from "../../components/icons.js";
import { runTask } from "../../components/task-loader.js";
import { COLORS } from "../../components/chart-colors.js";
import { dataService } from "../../data/data-service.js";
import { loadMfLogos, getCachedMfFunds, findMfLogo, searchMfSchemes, mfLogoHTML } from "../../services/mf-logos.js";

import {
    fmt,
    fmtK,
    fmtPct,
    todayStr,
    dateToStr,
    normalizeSettings,
    amountForDate,
    recalcAll,
    buildSipLedger,
    buildLegacyAllocations,
    sipCountBetween,
    summarizeSip,
    periodGrowth,
    ALLOC_STATUS_LABEL,
    projectGoalScenarios
} from "./stepup-service.js";

import {
    readFileAsJson,
    parseFundFile,
    buildEntriesFromNavHistory,
    fetchSchemeFromMfapi,
    buildSyncDelta,
    buildFundGrowthSeries,
    buildFundProjection,
    buildFundYearlyReturns,
    findNavForDate
} from "./stepup-fund.js";

import { drawChart } from "./stepup-charts.js";

/* Amounts shown in the chosen currency (stored + typed values stay rupees). */
const sipAmt = (n) => (isUSD() ? usd(n, { whole: true }) : "₹" + Number(n).toLocaleString("en-IN"));
const navTxt = (n) => (isUSD() ? usd(n) : "₹" + n);

/* =========================================
   STATE
========================================= */

const ACTIVE_PROFILE_KEY = "sip-active-profile"; // same key as the old app

/* Mutual fund logos (MicroIntel mf-logos service). Starts from the cached
   copy so logos show instantly; refreshed in the background. */
let mfFunds = getCachedMfFunds();
const PENDING_STATUSES = ["payment_initiated", "paid", "processing", "failed", "cancelled"];

let store = null;
let profiles = [];
let profile = null;
let settings = null;
let entries = [];

let tab = "overview"; // overview | history | ledger | fund | settings

/* Fund's own full NAV history, cached per scheme (same idea as the old app). */
let fundCache = { schemeCode: null, data: null };
let fundProjYears = 10;
let fundLoading = false;
let fundError = "";
let historySortDesc = true;
let historyDate = "";
let historyLimit = 30;
let growthMode = "month";
let profitRange = "3M"; // 1M | 3M | 6M | 1Y | ALL
let editingEntryId = null;
let allocTarget = null;
let toastTimer = null;

const STATUS_BADGE = {
    allocated: "br-badge-success",
    paid: "br-badge-info",
    payment_initiated: "br-badge-info",
    processing: "br-badge-warning",
    upcoming: "br-badge-info",
    missed: "br-badge-danger",
    failed: "br-badge-danger",
    cancelled: "br-badge-danger",
    skipped: "br-badge-warning"
};

/* =========================================
   PAGE
========================================= */

export async function StepUp() {
    store = await dataService.getStepUpStore();

    tab = "overview";
    lastViewKey = "";
    historyLimit = 30;
    historyDate = "";

    const page = document.createElement("section");
    page.className = "br-page br-income br-stepup";

    page.innerHTML = `
        <div class="br-page-heading su-heading">
            <div data-su-profilebar></div>
        </div>

        <div class="br-income-tabs br-tabs-flat">
            <button type="button" class="br-income-tab active" data-su-tab="overview">Overview</button>
            <button type="button" class="br-income-tab" data-su-tab="history">History</button>
            <button type="button" class="br-income-tab" data-su-tab="ledger">SIP ledger</button>
            <button type="button" class="br-income-tab" data-su-tab="fund">Fund</button>
            <button type="button" class="br-income-tab" data-su-tab="settings">Settings</button>
        </div>

        <div data-su-content></div>

        ${modalsHTML()}

        <div class="br-toast" data-su-toast></div>
    `;

    attachEvents(page);

    await loadProfiles();
    await loadProfileData();
    render(page);

    // Same as the old app: quietly top up a linked fund's NAV history on load.
    syncLinkedFund(page, { silent: true });

    // Fetch / refresh the fund logo list; redraw the logos only if it was empty before.
    loadMfLogos().then((funds) => {
        if (!funds.length || mfFunds.length) { if (funds.length) mfFunds = funds; return; }
        mfFunds = funds;
        if (!page.isConnected) return;
        renderProfileBar(page);
        if (tab === "settings") render(page);
    });

    return page;
}

function modalsHTML() {
    return `
        <!-- EDIT ENTRY -->
        <div class="br-modal-layer" data-modal="entry" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Edit entry</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="entry">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label><span>Date</span>
                                <input name="date" type="date" class="br-input" required></label>
                            <label><span>% change</span>
                                <input name="pct" type="number" step="0.01" class="br-input" required></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- ALLOCATION -->
        <div class="br-modal-layer" data-modal="alloc" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Update allocation · <span data-alloc-date></span></h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="alloc">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label><span>Payment date</span>
                                <input name="paymentDate" type="date" class="br-input"></label>
                            <label><span>Allocation date (actual)</span>
                                <input name="allocationDate" type="date" class="br-input" required></label>
                            <label><span>NAV</span>
                                <input name="nav" type="number" step="0.0001" min="0" class="br-input"></label>
                            <label><span>Units (optional)</span>
                                <input name="units" type="number" step="0.0001" min="0" class="br-input"></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- CONFIRM -->
        <div class="br-modal-layer" data-modal="confirm" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header"><h3 data-confirm-title>Confirm</h3></div>
                <div class="br-modal-body"><p class="br-muted" data-confirm-body></p></div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm-yes">Confirm</button>
                </div>
            </div>
        </div>

        <!-- NEW / RENAME SIP -->
        <div class="br-modal-layer" data-modal="profile" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-profile-title>New SIP</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="profile">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="su-mf-preview" data-mf-preview hidden></div>
                        <label class="br-form-grid" style="display:block;"><span>Name</span>
                            <input name="name" type="text" class="br-input" placeholder="e.g. Nifty 50 index fund" autocomplete="off" required></label>
                        <div class="su-mf-suggest" data-mf-suggest hidden></div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

/* =========================================
   DATA
========================================= */

/* Same first-run migration as the old loadProfiles(). */
async function loadProfiles() {
    profiles = await store.getProfiles();

    if (!profiles.length) {
        try {
            const legacySettings = await store.settings.get(1);
            const pid = await store.saveProfile({ name: "My SIP" });

            if (legacySettings) {
                await store.saveSettings(pid, { ...legacySettings, id: pid });
            }

            const all = await store.getEntries();

            for (const e of all) {
                if (!e.profileId) {
                    await store.entries.put({ ...e, profileId: pid });
                }
            }

            profiles = await store.getProfiles();
        } catch (_) {
            profiles = [];
        }
    }

    const saved = Number(localStorage.getItem(ACTIVE_PROFILE_KEY));

    profile =
        profiles.find((p) => p.id === saved) || profiles[0] || null;
}

async function loadProfileData() {
    settings = null;
    entries = [];

    if (!profile) return;

    settings = (await store.getProfileSettings(profile.id)) || null;
    entries = await store.getProfileEntries(profile.id);

    if (settings) {
        normalizeSettings(settings);
        await migrateAllocationsIfNeeded();
    }
}

/* One-time per-profile migration (old migrateSipAllocationsIfNeeded). */
async function migrateAllocationsIfNeeded() {
    if (!settings || !profile) return;

    if (!settings.sipAllocations) settings.sipAllocations = {};
    if (settings.sipAllocationsMigrated) return;

    const legacy = buildLegacyAllocations(entries, settings);

    if (Object.keys(legacy).length) {
        settings.sipAllocations = {
            ...legacy,
            ...settings.sipAllocations
        };
    }

    settings.sipAllocationsMigrated = true;

    try {
        await store.saveSettings(profile.id, settings);
    } catch (_) {
        /* best-effort, as in the old app */
    }
}

/* Recalculate every entry, persist, reload (old pattern after any change). */
async function recalcAndReload() {
    await store.saveCalculatedEntries(
        recalcAll(entries, settings),
        profile.id
    );

    entries = await store.getProfileEntries(profile.id);
}

async function switchProfile(page, id) {
    if (profile && profile.id === id) return;

    const content = page.querySelector("[data-su-content]");
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = profiles.findIndex((p) => profile && p.id === profile.id);
    const to = profiles.findIndex((p) => p.id === id);
    const dir = to >= from ? 1 : -1;

    // Presentation only: old fund slides/fades out, the new one slides in.
    if (content && !calm) {
        page.style.setProperty("--su-dir", dir);
        content.classList.add("su-leave");
        await new Promise((r) => setTimeout(r, 150));
    }

    profile = profiles.find((p) => p.id === id) || profile;

    if (profile) {
        localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    }

    await loadProfileData();
    historyLimit = 30;

    if (content) content.classList.remove("su-leave");

    if (!calm) {
        page.classList.add("su-switched");
        clearTimeout(page._suSwitchTimer);
        page._suSwitchTimer = setTimeout(() => page.classList.remove("su-switched"), 900);
    }

    render(page);
}

/* =========================================
   RENDER
========================================= */

let lastViewKey = "";

function render(page) {
    page.querySelectorAll("[data-su-tab]").forEach((b) =>
        b.classList.toggle("active", b.dataset.suTab === tab)
    );

    renderProfileBar(page);

    const content = page.querySelector("[data-su-content]");

    if (!profile) {
        content.innerHTML = `<section class="br-card"><div class="br-empty-state">
            <strong>No SIPs yet</strong>
            <p>Create your first SIP to start tracking.</p>
            <button type="button" class="br-button br-button-primary" data-action="new-profile">+ New SIP</button>
        </div></section>`;
        return;
    }

    // Presentation only: replay the soft entrance when the view changes, not on
    // every data refresh (so adding an entry does not make the page flicker).
    const viewKey = tab + ":" + profile.id;
    const viewChanged = viewKey !== lastViewKey;
    lastViewKey = viewKey;

    if (tab === "settings") content.innerHTML = settingsHTML();
    else if (!settings) content.innerHTML = needSettingsHTML();
    else if (tab === "overview") content.innerHTML = overviewHTML();
    else if (tab === "history") content.innerHTML = historyHTML();
    else if (tab === "fund") content.innerHTML = fundHTML();
    else content.innerHTML = ledgerHTML();

    content.classList.toggle("su-enter", viewChanged);

    drawCharts(page);

    if (tab === "fund" && settings && settings.linkedFund) {
        ensureFundHistory(page);
    }
}

function renderProfileBar(page) {
    const bar = page.querySelector("[data-su-profilebar]");

    if (!profiles.length) {
        bar.innerHTML = "";
        return;
    }

    const cur = profile || profiles[0];

    bar.innerHTML = `
        <div class="su-switch" data-su-switch>
            <button type="button" class="su-switch-btn" data-su-switch-btn aria-haspopup="listbox" aria-expanded="false">
                ${mfLogoHTML(cur.name, mfFunds, "sm")}
                <span class="su-switch-text">
                    <small>${profiles.length > 1 ? "Switch fund" : "Your fund"}</small>
                    <strong>${escapeHTML(cur.name)}</strong>
                </span>
                ${profiles.length > 1 ? icon("chevron-down", { size: 18 }) : ""}
            </button>
            ${
                profiles.length > 1
                    ? `<div class="su-switch-menu" role="listbox" hidden>
                ${profiles
                    .map(
                        (p) => `<button type="button" role="option" class="su-switch-item ${p.id === cur.id ? "is-active" : ""}" data-su-pick="${p.id}" aria-selected="${p.id === cur.id}">
                    ${mfLogoHTML(p.name, mfFunds, "xs")}
                    <span>${escapeHTML(p.name)}</span>
                    ${p.id === cur.id ? icon("check", { size: 16 }) : ""}
                </button>`
                    )
                    .join("")}
            </div>`
                    : ""
            }
        </div>
    `;
}

function needSettingsHTML() {
    return `<section class="br-card"><div class="br-empty-state">
        <strong>Set up this SIP</strong>
        <p>Save your SIP amount and start date first.</p>
        <button type="button" class="br-button br-button-primary" data-su-goto="settings">Open settings</button>
    </div></section>`;
}

function statCard(label, value, cls = "", sub = "") {
    return `
        <div class="br-card br-stat">
            <div class="br-stat-label">${escapeHTML(label)}</div>
            <div class="br-stat-value ${cls}">${value}</div>
            ${sub ? `<div class="br-muted" style="font-size:12px;margin-top:2px;">${sub}</div>` : ""}
        </div>
    `;
}

const posNeg = (n) => (n >= 0 ? "su-pos" : "su-neg");

function factItem(label, value, sub = "", cls = "") {
    return `<div class="su-fact">
        <dt>${escapeHTML(label)}</dt>
        <dd class="${cls}">${value}</dd>
        ${sub ? `<small>${sub}</small>` : ""}
    </div>`;
}

/* ---------- Overview ---------- */

/* Total units actually held = every allocated instalment, priced at its real
   NAV (the same figure the SIP ledger's "Total units" column ends on). The
   daily-entry chain in recalcAll() only counts instalments that fall inside
   an entry's date window, so allocations dated after the last entry (or
   skipped by it) were missing from the Overview total. */
function heldUnits(calc) {
    const series =
        fundCache.data && settings.linkedFund && fundCache.schemeCode === settings.linkedFund.schemeCode
            ? fundCache.data.series
            : null;
    const ledger = buildSipLedger(calc, settings, series);
    return ledger.length ? ledger[ledger.length - 1].unitsRunningTotal : 0;
}

/* Profit growth chart: profit / loss (value - invested) over the last 90 entries. */
function sparkHTML(calc) {
    const pts = calc.slice(-90).map((e) => e.portfolioValue - e.investedAmount);
    if (pts.length < 2) return "";
    const W = 320, H = 84, pad = 6;
    const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1;
    const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
    const zero = y(0).toFixed(1);
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)} ${zero} L${x(0).toFixed(1)} ${zero} Z`;
    const up = pts[pts.length - 1] >= 0;
    return `<svg class="su-spark ${up ? "is-up" : "is-down"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Profit growth">
        <line class="su-spark-zero" x1="0" x2="${W}" y1="${zero}" y2="${zero}"/>
        <path class="su-spark-area" d="${area}"/>
        <path class="su-spark-line" d="${line}"/>
    </svg>`;
}

function overviewHTML() {
    const calc = recalcAll(entries, settings);
    const s = summarizeSip(calc, settings);
    if (s) s.unitsHeld = heldUnits(calc);

    let cards;

    if (!s) {
        cards = `<section class="br-card"><div class="br-empty-state">No entries yet. Add today's % change below.</div></section>`;
    } else {
        const xirr =
            s.xirr !== null
                ? `<span class="${posNeg(s.xirr)}">${s.xirr >= 0 ? "+" : ""}${s.xirr.toFixed(1)}%</span>`
                : s.xirrDaysToUnlock
                ? `~${s.xirrDaysToUnlock}d to unlock`
                : "—";

        const nextSip = s.nextSip
            ? s.nextSip.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
            : "—";

        const todaySub =
            (s.today.isLive
                ? "Today"
                : "As of " +
                  new Date(s.today.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })) +
            ` · ${s.today.amount >= 0 ? "+" : ""}${fmtK(s.today.amount)}`;

        const pnlTxt = (s.pnl >= 0 ? "+" : "") + fmtK(s.pnl);
        const todayTxt = (s.today.pct >= 0 ? "+" : "") + s.today.pct.toFixed(2) + "%";

        cards = `
            <section class="su-hero ${s.pnl >= 0 ? "is-up" : "is-down"}">
                <div class="su-hero-top">
                    <div class="su-hero-main">
                        <span class="su-label">Portfolio value</span>
                        <span class="su-hero-value">${fmtK(s.value)}</span>
                        <span class="su-pill ${posNeg(s.pnl)}">${icon(s.pnl >= 0 ? "trending-up" : "trending-down", { size: 14 })}${pnlTxt} · ${fmtPct(s.ret)}</span>
                    </div>
                    ${sparkHTML(calc)}
                </div>
                <div class="su-kpis">
                    <div class="su-kpi"><span class="su-label">Invested</span><strong>${fmtK(s.invested)}</strong></div>
                    <div class="su-kpi"><span class="su-label">XIRR</span><strong>${xirr}</strong></div>
                    <div class="su-kpi"><span class="su-label">Today</span><strong class="${posNeg(s.today.pct)}">${todayTxt}</strong><em>${todaySub}</em></div>
                </div>
            </section>

            <section class="su-facts">
                <h3 class="su-section-title">Holdings</h3>
                <div class="su-units">
                    <span class="su-units-ico">${icon("gem", { size: 20 })}</span>
                    <div>
                        <span class="su-label">Units held</span>
                        <strong>${s.unitsHeld.toFixed(4)}</strong>
                    </div>
                    <small>NAV ${navTxt(s.navValue)} (sim)</small>
                </div>
                <dl class="su-facts-grid">
                    ${factItem("SIP instalments", s.sips, settings.sipSchedule.length > 1 ? "stepped" : "×" + sipAmt(settings.sipAmount))}
                    ${factItem("Next SIP", nextSip, s.nextSip ? `in ${s.nextSip.daysLeft}d` : "")}
                    ${factItem("Days active", s.daysActive + "d")}
                    ${factItem("Win streak", s.streak + (s.streak === 1 ? " day" : " days"))}
                    ${factItem("Avg daily change", (s.avgDay >= 0 ? "+" : "") + s.avgDay.toFixed(2) + "%", "", posNeg(s.avgDay))}
                </dl>
            </section>
            ${goalHTML(s)}
            <section class="br-card" style="margin-top:20px;">
                <h3 style="margin-bottom:12px;">Portfolio value vs invested</h3>
                <canvas data-su-chart="portfolio" style="width:100%;height:260px;display:block;"></canvas>
                <div class="su-legend">
                    <span><i style="background:var(--br-info)"></i>Portfolio value</span>
                    <span><i style="background:var(--br-text-secondary)"></i>Invested</span>
                </div>
            </section>
            ${growthHTML(calc)}
        `;
    }

    return `
        ${cards}
        <section class="br-card" style="margin-top:20px;">
            <h3 style="margin-bottom:12px;">Add daily entry</h3>
            <form data-form="add-entry" class="su-inline-form">
                <label><span>Date</span>
                    <input name="date" type="date" class="br-input" value="${todayStr()}" required></label>
                <label><span>% change</span>
                    <input name="pct" type="number" step="0.01" class="br-input" placeholder="e.g. 4.73 or -3.32" required></label>
                <button type="submit" class="br-button br-button-primary">Add entry</button>
            </form>
            <p class="br-field-help" data-su-preview style="margin-top:8px;"></p>
        </section>
    `;
}

function goalHTML(s) {
    if (!settings.goalAmount) return "";

    const pct = Math.min(100, (s.value / settings.goalAmount) * 100);

    return `
        <section class="br-card" style="margin-top:20px;">
            <h3 style="margin-bottom:8px;">Goal</h3>
            <p class="br-muted" style="margin:0 0 8px;">
                ${fmtK(s.value)} of ${fmtK(settings.goalAmount)}${settings.goalDate ? ` · target ${escapeHTML(settings.goalDate)}` : ""}
            </p>
            <div class="ll-progress"><div class="ll-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
            <p class="br-muted" style="margin:6px 0 0;">${pct.toFixed(1)}% reached</p>
        </section>
    `;
}

function growthHTML(calc) {
    const rows = periodGrowth(calc, growthMode).slice().reverse();

    if (!rows.length) return "";

    return `
        <section class="br-card" style="margin-top:20px;">
            <div class="br-toolbar" style="margin-bottom:12px;">
                <div class="br-toolbar-left"><h3 style="margin:0;">Growth / loss</h3></div>
                <div class="br-toolbar-right">
                    <select class="br-select" data-su-growth>
                        <option value="month" ${growthMode === "month" ? "selected" : ""}>By month</option>
                        <option value="year" ${growthMode === "year" ? "selected" : ""}>By year</option>
                    </select>
                </div>
            </div>
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr><th>Period</th><th>Invested</th><th>Value</th><th>P/L</th><th>Growth</th></tr></thead>
                <tbody>
                    ${rows
                        .map(
                            (r) => `<tr>
                        <td>${escapeHTML(r.label)}</td>
                        <td>${fmtK(r.invested)}</td>
                        <td>${fmtK(r.value)}</td>
                        <td class="${posNeg(r.pnl)}">${r.pnl >= 0 ? "+" : ""}${fmtK(r.pnl)}</td>
                        <td class="${posNeg(r.growth)}">${r.growth >= 0 ? "+" : ""}${fmtK(r.growth)}${r.growthPct !== null ? ` (${fmtPct(r.growthPct)})` : ""}</td>
                    </tr>`
                        )
                        .join("")}
                </tbody>
            </table></div>
        </section>
    `;
}

/* ---------- Fund (link, NAV sync, history, projection) ---------- */

/* ---------- Profit growth chart with range filter (Fund tab) ---------- */

let profitPts = []; // points currently drawn, read by the hover tooltip

const PROFIT_RANGES = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, ALL: 0 };

function profitCardHTML() {
    const calc = recalcAll(entries, settings);
    if (calc.length < 2) return "";

    const months = PROFIT_RANGES[profitRange];
    let rows = calc;

    if (months) {
        const end = new Date(calc[calc.length - 1].date);
        end.setMonth(end.getMonth() - months);
        const cut = dateToStr(end);
        rows = calc.filter((e) => e.date >= cut);
        if (rows.length < 2) rows = calc.slice(-2);
    }

    const pts = rows.map((e) => ({ date: e.date, v: e.portfolioValue - e.investedAmount }));
    const last = pts[pts.length - 1].v;
    const change = last - pts[0].v;
    const lo = Math.min(0, ...pts.map((p) => p.v));
    const hi = Math.max(0, ...pts.map((p) => p.v));
    const span = hi - lo || 1;
    const W = 640, H = 220, padX = 8, padY = 14;
    const x = (i) => padX + (i / (pts.length - 1)) * (W - padX * 2);
    const y = (v) => H - padY - ((v - lo) / span) * (H - padY * 2);
    const zero = y(0).toFixed(1);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)} ${zero} L${x(0).toFixed(1)} ${zero} Z`;
    profitPts = pts.map((p, i) => ({ date: p.date, v: p.v, fx: i / (pts.length - 1), fy: y(p.v) / H }));
    const up = last >= 0;
    const d = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    const sgn = (n) => (n >= 0 ? "+" : "") + fmtK(n);

    return `
        <section class="br-card su-profit">
            <div class="su-profit-head">
                <div>
                    <span class="su-label">Profit growth</span>
                    <strong class="su-profit-value ${posNeg(last)}">${sgn(last)}</strong>
                    <small class="${posNeg(change)}">${sgn(change)} in this range</small>
                </div>
                <div class="su-range" role="group" aria-label="Range">
                    ${Object.keys(PROFIT_RANGES)
                        .map((r) => `<button type="button" class="su-range-btn ${r === profitRange ? "active" : ""}" data-su-range="${r}">${r === "ALL" ? "All" : r}</button>`)
                        .join("")}
                </div>
            </div>
            <div class="su-profit-plot" data-su-plot>
                <svg class="su-profit-chart ${up ? "is-up" : "is-down"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Profit growth chart">
                    <line class="su-spark-zero" x1="0" x2="${W}" y1="${zero}" y2="${zero}"/>
                    <path class="su-spark-area" d="${area}"/>
                    <path class="su-spark-line" d="${line}"/>
                </svg>
                <i class="su-tip-line" hidden></i>
                <i class="su-tip-dot ${up ? "is-up" : "is-down"}" hidden></i>
                <div class="su-tip" hidden></div>
            </div>
            <div class="su-profit-axis">
                <span>${d(pts[0].date)}</span>
                <span>High ${sgn(hi)} · Low ${sgn(lo)}</span>
                <span>${d(pts[pts.length - 1].date)}</span>
            </div>
        </section>
    `;
}

function fundHTML() {
    const lf = settings.linkedFund;

    const howToCard = `
        <section class="br-card su-howto">
            <header class="su-howto-head">
                <img class="su-howto-logo" src="https://raw.githubusercontent.com/microintel/endgram/main/photo/invisible-home.png" alt="Invisible House" data-mf-howto>
                <div>
                    <h3 class="su-howto-title">How to link a fund</h3>
                    <p class="su-howto-lead">Four quick steps. Takes about a minute.</p>
                </div>
            </header>
            <ol class="su-howto-steps">
                <li>
                    <div>
                        <strong>Open Invisible House</strong>
                        <p>The free tool that gives you a fund's full NAV history.</p>
                        <a class="br-button br-button-primary su-howto-btn" href="https://microintel.github.io/invisible-house/" target="_blank" rel="noopener noreferrer">Go to Invisible House ↗</a>
                    </div>
                </li>
                <li><div><strong>Search your fund</strong><p>${
                    profile ? `Try <em>${escapeHTML(profile.name)}</em>. ` : ""
                }Pick the same plan you invest in (Direct or Regular, Growth or IDCW).</p></div></li>
                <li><div><strong>Download the file</strong><p>Open the fund, find <em>Full NAV History</em> and tap <em>Download</em>.</p></div></li>
                <li><div><strong>Import it here</strong><p>Choose the file below, set your SIP start date and tap <em>Import &amp; link</em>.</p></div></li>
            </ol>
        </section>
    `;

    const linkCard = `
        <section class="br-card su-link">
            <h3 class="su-link-title">Link a fund</h3>
            <p class="su-link-status ${lf ? "is-linked" : ""}" data-su-fund-status>${
                lf
                    ? `Linked: <strong>${escapeHTML(lf.schemeName || lf.schemeCode)}</strong>${
                          lf.fundHouse ? ` · ${escapeHTML(lf.fundHouse)}` : ""
                      }${lf.lastSync ? ` · last synced ${escapeHTML(lf.lastSync)}` : ""}`
                    : "No fund linked yet — pick a NAV file and your SIP start date."
            }</p>
            <form data-form="fund-import" class="su-inline-form su-link-form">
                <label class="su-link-file"><span>Fund NAV file (.json)</span>
                    <input name="file" type="file" accept=".json,application/json" class="br-input" required></label>
                <label><span>SIP start date</span>
                    <input name="start" type="date" class="br-input" value="${escapeHTML(settings.startDate || "")}" required></label>
                <div class="su-link-actions">
                    <button type="submit" class="br-button br-button-primary">Import &amp; link</button>
                    ${
                        lf
                            ? `<button type="button" class="br-button" data-action="sync-fund">Sync now</button>
                               <button type="button" class="br-button br-button-danger" data-action="unlink-fund">Unlink</button>`
                            : ""
                    }
                </div>
            </form>
            <a class="su-link-help" href="https://microintel.github.io/invisible-house/" target="_blank" rel="noopener noreferrer">Get fund data ↗</a>
        </section>
    `;

    if (!lf) return howToCard + `<div style="height:16px"></div>` + linkCard;

    // Already linked: no "Link a fund" form, just a compact status row.
    const linkedCard = `
        <section class="br-card su-linked">
            <div class="su-linked-info">
                <span class="su-linked-dot"></span>
                <div>
                    <strong data-su-fund-status>${escapeHTML(lf.schemeName || lf.schemeCode)}</strong>
                    <small>${lf.fundHouse ? escapeHTML(lf.fundHouse) : "Linked fund"}${lf.lastSync ? ` · synced ${escapeHTML(lf.lastSync)}` : ""}</small>
                </div>
            </div>
            <div class="su-linked-actions">
                <button type="button" class="br-button" data-action="sync-fund">Sync now</button>
                <button type="button" class="br-button br-button-danger" data-action="unlink-fund">Unlink</button>
            </div>
        </section>
    `;

    let history;

    if (fundLoading && !fundCache.data) {
        history = `<section class="br-card" style="margin-top:20px;"><div class="br-empty-state">Loading the fund's full NAV history…</div></section>`;
    } else if (!fundCache.data || fundCache.schemeCode !== lf.schemeCode) {
        history = `<section class="br-card" style="margin-top:20px;"><div class="br-empty-state">${
            escapeHTML(fundError) || "Couldn't load this fund's full history right now — try again later."
        }</div></section>`;
    } else {
        const { series, years, totalGrowthPct, cagrPct } = fundCache.data;
        const stat = (label, value, cls = "") => statCard(label, value, cls);

        history = `
            <section class="br-card" style="margin-top:20px;">
                <h3 style="margin-bottom:4px;">Fund performance history</h3>
                <p class="br-muted" style="margin:0 0 12px;">Growth of ₹100 invested on day one — ${escapeHTML(lf.schemeName || lf.schemeCode)}</p>
                <div class="br-grid br-grid-3" style="margin-bottom:12px;">
                    ${stat("History", years.toFixed(1) + " yrs")}
                    ${stat("Total growth", (totalGrowthPct >= 0 ? "+" : "") + totalGrowthPct.toFixed(1) + "%", posNeg(totalGrowthPct))}
                    ${stat("CAGR", (cagrPct >= 0 ? "+" : "") + cagrPct.toFixed(1) + "%/yr", posNeg(cagrPct))}
                </div>
                <canvas data-su-chart="fund-history" style="width:100%;height:260px;display:block;"></canvas>
            </section>

            ${goalProjectionHTML(series)}
        `;
    }

    return linkedCard + profitCardHTML() + history;
}

function goalScenarios(series) {
    if (!settings.goalAmount || !series || !series.length) return null;

    const yearly = buildFundYearlyReturns(series);
    const calc = recalcAll(entries, settings);

    if (!yearly.length || !calc.length) return null;

    const pcts = yearly.map((y) => y.returnPct);
    const rates = {
        avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
        best: Math.max(...pcts),
        worst: Math.min(...pcts)
    };

    const last = calc[calc.length - 1];

    return {
        rates,
        scenarios: projectGoalScenarios(
            last.portfolioValue,
            Number(settings.sipAmount) || 0,
            rates,
            fundProjYears * 12,
            last.date
        )
    };
}

function goalProjectionHTML(series) {
    const g = goalScenarios(series);

    if (!g) return "";

    const hit = g.scenarios.expected.find((p) => p.value >= settings.goalAmount);

    const reach = hit
        ? `At the expected rate, you'll reach ${fmtK(settings.goalAmount)} by ${new Date(hit.date).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric"
          })}.`
        : `Not projected to reach ${fmtK(settings.goalAmount)} within ${fundProjYears} years at the expected rate — try a longer horizon.`;

    return `
        <section class="br-card" style="margin-top:20px;">
            <div class="br-toolbar" style="margin-bottom:8px;">
                <div class="br-toolbar-left"><h3 style="margin:0;">Path to target corpus</h3></div>
                <div class="br-toolbar-right">
                    <select class="br-select" data-su-fund-years aria-label="Projection horizon">
                        ${[5, 10, 15, 20]
                            .map((y) => `<option value="${y}" ${y === fundProjYears ? "selected" : ""}>${y} years</option>`)
                            .join("")}
                    </select>
                </div>
            </div>
            <p class="${hit ? "su-pos" : "su-neg"}" style="margin:0 0 12px;">${reach}</p>
            <canvas data-su-chart="goal-projection" style="width:100%;height:260px;display:block;"></canvas>
            <div class="su-legend">
                <span><i style="background:var(--br-success)"></i>Optimistic</span>
                <span><i style="background:var(--br-info)"></i>Expected</span>
                <span><i style="background:var(--br-danger)"></i>Pessimistic</span>
                <span><i style="background:var(--br-gold)"></i>Goal</span>
            </div>
        </section>
    `;
}

function drawCharts(page) {
    if (!settings) return;

    const rupee = (n) => (isUSD() ? fmtK(n) : "₹" + fmtK(n).replace(/^₹/, ""));

    const portfolio = page.querySelector('[data-su-chart="portfolio"]');

    if (portfolio) {
        const calc = recalcAll(entries, settings);
        const positive =
            calc.length &&
            calc[calc.length - 1].portfolioValue >= calc[calc.length - 1].investedAmount;

        drawChart(portfolio, {
            yFormat: (n) => fmtK(n),
            series: [
                {
                    name: "Invested",
                    color: COLORS.textSecondary,
                    dashed: true,
                    points: calc.map((e) => ({ x: e.date, y: e.investedAmount }))
                },
                {
                    name: "Value",
                    color: positive ? COLORS.success : COLORS.danger,
                    fill: true,
                    width: 2.5,
                    points: calc.map((e) => ({ x: e.date, y: e.portfolioValue }))
                }
            ]
        });
    }

    if (!fundCache.data) return;

    const { series } = fundCache.data;

    const hist = page.querySelector('[data-su-chart="fund-history"]');
    if (hist) {
        drawChart(hist, {
            yFormat: (n) => "₹" + Math.round(n).toLocaleString("en-IN"),
            series: [
                {
                    name: "₹100 grows to",
                    color: COLORS.info,
                    fill: true,
                    points: series.map((r) => ({ x: r.date, y: r.growth }))
                }
            ]
        });
    }

    const goal = page.querySelector('[data-su-chart="goal-projection"]');
    if (goal) {
        const g = goalScenarios(series);
        if (g) {
            drawChart(goal, {
                goal: settings.goalAmount,
                yFormat: (n) => fmtK(n),
                series: [
                    { name: "Optimistic", color: COLORS.success, dashed: true, points: g.scenarios.optimistic.map((r) => ({ x: r.date, y: r.value })) },
                    { name: "Expected", color: COLORS.info, points: g.scenarios.expected.map((r) => ({ x: r.date, y: r.value })) },
                    { name: "Pessimistic", color: COLORS.danger, dashed: true, points: g.scenarios.pessimistic.map((r) => ({ x: r.date, y: r.value })) }
                ]
            });
        }
    }
}

/* Loads (and caches) the linked fund's full NAV history from mfapi.in. */
async function ensureFundHistory(page, { force = false } = {}) {
    const lf = settings && settings.linkedFund;

    if (!lf || fundLoading) return;
    if (!force && fundCache.schemeCode === lf.schemeCode && fundCache.data) return;

    fundLoading = true;
    fundError = "";
    if (tab === "fund") render(page);

    try {
        const fresh = await fetchSchemeFromMfapi(lf.schemeCode);
        fundCache = {
            schemeCode: lf.schemeCode,
            data: buildFundGrowthSeries(fresh.navHistory)
        };
    } catch (_) {
        fundError = "Couldn't load this fund's full history right now — try again later.";
    }

    fundLoading = false;
    if (tab === "fund" || tab === "overview" || tab === "ledger") render(page);
}

async function importFund(page, form) {
    if (!profile) return toast(page, "No active SIP profile.");

    const file = form.file.files && form.file.files[0];
    const startDate = form.start.value;
    const amt = Number(settings && settings.sipAmount) || 0;

    if (!file) return toast(page, "Choose the fund NAV file.");
    if (!startDate) return toast(page, "Enter the SIP start date.");
    if (!amt) return toast(page, "Set the monthly SIP amount in Settings first.");

    try {
        const json = await runTask(
            { kind: "read", title: "Reading fund file", subtitle: "Checking NAV history" },
            () => readFileAsJson(file)
        );
        const fund = parseFundFile(json);

        if (!fund.schemeCode || !fund.navHistory.length) {
            return toast(page, "That file doesn't look like a fund NAV export.");
        }

        const built = buildEntriesFromNavHistory(fund.navHistory, startDate);

        if (!built.length) return toast(page, "No NAV data on/after that start date.");

        const doImportRaw = async () => {
            await store.clearEntries(profile.id);

            for (const e of built) {
                await store.saveEntry(profile.id, {
                    date: e.date,
                    percentChange: e.percentChange,
                    nav: e.nav,
                    portfolioValue: 0,
                    investedAmount: 0
                });
            }

            settings = normalizeSettings({
                id: profile.id,
                startDate,
                sipAmount: amt,
                sipSchedule: [{ fromDate: startDate, amount: amt }],
                skippedSipDates: settings.skippedSipDates || [],
                sipAllocations: settings.sipAllocations || {},
                goalAmount: settings.goalAmount,
                goalDate: settings.goalDate,
                linkedFund: {
                    schemeCode: fund.schemeCode,
                    schemeName: fund.schemeName,
                    fundHouse: fund.fundHouse,
                    lastSync: built[built.length - 1].date
                }
            });

            await store.saveSettings(profile.id, settings);

            entries = await store.getProfileEntries(profile.id);

            // Same one-time allocation migration a page reload would run,
            // so invested / units show up immediately after linking.
            await migrateAllocationsIfNeeded();
            await recalcAndReload();

            fundCache = {
                schemeCode: fund.schemeCode,
                data: buildFundGrowthSeries(fund.navHistory)
            };

            render(page);
            toast(page, `Linked ${fund.schemeName || fund.schemeCode} — ${built.length} entries imported ✓`);
        };

        const doImport = () => runTask(
            { kind: "import", title: "Importing NAV entries", subtitle: `Saving ${built.length} entries` },
            doImportRaw
        );

        if (entries.length) {
            askConfirm(
                page,
                "Replace existing entries?",
                `This replaces the ${entries.length} existing entries for this SIP with ${built.length} imported from ${fund.schemeName || fund.schemeCode}.`,
                doImport
            );
        } else {
            await doImport();
        }
    } catch (e) {
        toast(page, "Could not import — " + errMsg(e));
    }
}

async function syncLinkedFund(page, { silent = false } = {}) {
    if (!profile || !settings || !settings.linkedFund || !entries.length) return;

    try {
        const fresh = await fetchSchemeFromMfapi(settings.linkedFund.schemeCode);

        fundCache = {
            schemeCode: settings.linkedFund.schemeCode,
            data: buildFundGrowthSeries(fresh.navHistory)
        };

        const delta = buildSyncDelta(entries, fresh.navHistory);

        if (delta === null) {
            if (!silent) toast(page, "Could not match your last entry to mfapi's history — sync it manually.");
            return;
        }

        if (!delta.length) {
            if (!silent) toast(page, "Already up to date ✓");
            render(page);
            return;
        }

        for (const e of delta) {
            await store.saveEntry(profile.id, {
                date: e.date,
                percentChange: e.percentChange,
                nav: e.nav,
                portfolioValue: 0,
                investedAmount: 0
            });
        }

        entries = await store.getProfileEntries(profile.id);
        await recalcAndReload();

        settings.linkedFund.schemeName = fresh.schemeName || settings.linkedFund.schemeName;
        settings.linkedFund.fundHouse = fresh.fundHouse || settings.linkedFund.fundHouse;
        settings.linkedFund.lastSync = entries[entries.length - 1].date;
        await store.saveSettings(profile.id, settings);

        render(page);
        if (!silent) toast(page, `Synced ${delta.length} new day${delta.length > 1 ? "s" : ""} ✓`);
    } catch (e) {
        // Offline, guest (read-only) or API down: silent on load, told otherwise.
        if (!silent) toast(page, "Sync failed — " + errMsg(e));
    }
}

async function unlinkFund(page) {
    delete settings.linkedFund;
    await store.saveSettings(profile.id, settings);
    fundCache = { schemeCode: null, data: null };
    render(page);
    toast(page, "Fund unlinked. Your entries are unchanged.");
}

/* Allocation form: fetch the real NAV for the chosen allocation date. */
async function autoFillAllocationNav(page, form) {
    const dateIso = form.allocationDate.value;
    const lf = settings && settings.linkedFund;

    let status = form.querySelector("[data-alloc-nav-status]");

    if (!status) {
        status = document.createElement("p");
        status.className = "br-field-help";
        status.setAttribute("data-alloc-nav-status", "");
        form.nav.closest("label").insertAdjacentElement("afterend", status);
    }

    if (!dateIso) return;

    if (!lf || !lf.schemeCode) {
        status.textContent = "No fund linked — enter NAV manually.";
        return;
    }

    status.textContent = "Fetching NAV…";

    try {
        if (fundCache.schemeCode !== lf.schemeCode || !fundCache.data) {
            const fresh = await fetchSchemeFromMfapi(lf.schemeCode);
            fundCache = {
                schemeCode: lf.schemeCode,
                data: buildFundGrowthSeries(fresh.navHistory)
            };
        }

        const hit = findNavForDate(fundCache.data.series, dateIso);

        if (!hit) {
            status.textContent = "No NAV on record for that date yet — enter manually.";
            return;
        }

        form.nav.value = hit.nav;

        if (allocTarget) {
            const amount = amountForDate(settings.sipSchedule, allocTarget);
            if (amount) form.units.value = +(amount / hit.nav).toFixed(4);
        }

        status.textContent = hit.exact
            ? `NAV fetched for ${hit.actualDate} — ${navTxt(hit.nav)}`
            : `No trading on ${dateIso} — using ${hit.actualDate}'s NAV (${navTxt(hit.nav)})`;
    } catch (_) {
        status.textContent = "Couldn't fetch NAV right now — enter manually.";
    }
}

/* ---------- History ---------- */

function historyHTML() {
    let rows = recalcAll(entries, settings);

    if (historyDate) rows = rows.filter((r) => r.date === historyDate);

    rows = rows.slice();
    if (historySortDesc) rows.reverse();

    const shown = rows.slice(0, historyLimit);

    const toolbar = `
        <div class="br-toolbar" style="margin-bottom:16px;">
            <div class="br-toolbar-left">
                <input type="date" class="br-input" value="${escapeHTML(historyDate)}" data-su-hdate style="max-width:200px;">
                <button type="button" class="br-button" data-action="sort-history">${historySortDesc ? "Newest first" + icon("chevron-down", { size: 16 }) : "Oldest first" + icon("chevron-up", { size: 16 })}</button>
            </div>
            <div class="br-toolbar-right"><span class="br-muted">${rows.length} entr${rows.length === 1 ? "y" : "ies"}</span></div>
        </div>
    `;

    if (!rows.length) {
        return `${toolbar}<section class="br-card"><div class="br-empty-state">No entries${historyDate ? " for that date" : " yet"}.</div></section>`;
    }

    return `
        ${toolbar}
        <section class="br-card">
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr>
                    <th>Date</th><th>% change</th><th>SIP added</th><th>Invested</th>
                    <th>Value</th><th>Day P/L</th><th>NAV</th><th>Units</th><th></th>
                </tr></thead>
                <tbody>
                    ${shown
                        .map(
                            (r) => `<tr>
                        <td>${escapeHTML(r.date)}</td>
                        <td class="${posNeg(r.percentChange)}">${r.percentChange >= 0 ? "+" : ""}${r.percentChange.toFixed(2)}%</td>
                        <td>${r.sipAdded ? `${sipAmt(r.sipTotal)}${r.sipCount > 1 ? ` (×${r.sipCount})` : ""}` : "—"}</td>
                        <td>${fmt(r.investedAmount)}</td>
                        <td>${fmt(r.portfolioValue)}</td>
                        <td class="${posNeg(r.dailyReturnAmount)}">${r.dailyReturnAmount >= 0 ? "+" : ""}${fmt(r.dailyReturnAmount)}</td>
                        <td>${r.navValue.toFixed(2)}</td>
                        <td>${r.unitsHeld.toFixed(4)}</td>
                        <td style="text-align:right;white-space:nowrap;">
                            <button type="button" class="br-button" data-action="edit-entry" data-id="${r.id}">Edit</button>
                            <button type="button" class="br-button br-button-danger" data-action="delete-entry" data-id="${r.id}">${icon("trash-2", { size: 16 })}Delete</button>
                        </td>
                    </tr>`
                        )
                        .join("")}
                </tbody>
            </table></div>
            ${
                rows.length > shown.length
                    ? `<div style="text-align:center;margin-top:12px;"><button type="button" class="br-button" data-action="load-more">Load more</button></div>`
                    : ""
            }
        </section>
    `;
}

/* ---------- SIP ledger ---------- */

function ledgerHTML() {
    const calc = recalcAll(entries, settings);
    const ledger = buildSipLedger(
        calc,
        settings,
        fundCache.data && settings.linkedFund && fundCache.schemeCode === settings.linkedFund.schemeCode
            ? fundCache.data.series
            : null
    ).slice().reverse();

    if (!ledger.length) {
        return `<section class="br-card"><div class="br-empty-state">No SIP instalments yet.</div></section>`;
    }

    const pending = ledger.filter((r) => PENDING_STATUSES.includes(r.status));

    const pendingBox = pending.length
        ? `<section class="br-card" style="margin-bottom:20px;">
            <h3 style="margin-bottom:4px;">Pending allocations</h3>
            ${pending
                .map(
                    (r) => `
                <div class="su-pending-row">
                    <div>
                        <strong>${sipAmt(r.amount)}</strong>
                        <span class="br-muted"> · scheduled ${escapeHTML(r.date)}${r.paymentDate ? ` · paid ${escapeHTML(r.paymentDate)}` : ""}</span>
                        <span class="br-badge ${STATUS_BADGE[r.status] || ""}">${ALLOC_STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <select class="br-select" data-su-status data-date="${r.date}">
                            ${PENDING_STATUSES.map(
                                (st) => `<option value="${st}" ${r.status === st ? "selected" : ""}>${ALLOC_STATUS_LABEL[st]}</option>`
                            ).join("")}
                        </select>
                        <button type="button" class="br-button br-button-primary" data-action="edit-alloc" data-date="${r.date}">Update allocation</button>
                    </div>
                </div>`
                )
                .join("")}
        </section>`
        : "";

    return `
        ${pendingBox}
        <section class="br-card">
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr>
                    <th>Due date</th><th>Amount</th><th>Step</th><th>Status</th>
                    <th>NAV</th><th>Units</th><th>Total units</th><th></th>
                </tr></thead>
                <tbody>
                    ${ledger
                        .map(
                            (r) => `<tr>
                        <td>${escapeHTML(r.date)}</td>
                        <td>${sipAmt(r.amount)}</td>
                        <td>${r.stepChange ? `<span class="${r.stepChange > 0 ? "su-pos" : "su-neg"}">${r.stepChange > 0 ? icon("arrow-up-right", { size: 14 }) : icon("arrow-down-right", { size: 14 })} ${Math.abs(r.stepChange).toLocaleString("en-IN")}</span>` : "—"}</td>
                        <td><span class="br-badge ${STATUS_BADGE[r.status] || ""}">${ALLOC_STATUS_LABEL[r.status] || r.status}</span></td>
                        <td>${r.navValue != null ? Number(r.navValue).toFixed(4) : "—"}</td>
                        <td>${r.units ? Number(r.units).toFixed(4) : "—"}</td>
                        <td>${Number(r.unitsRunningTotal).toFixed(4)}</td>
                        <td style="text-align:right;">${
                            r.status === "skipped"
                                ? ""
                                : `<button type="button" class="br-button" data-action="edit-alloc" data-date="${r.date}">Edit</button>`
                        }</td>
                    </tr>`
                        )
                        .join("")}
                </tbody>
            </table></div>
        </section>
    `;
}

/* ---------- Settings ---------- */

function upcomingSipDates() {
    if (!settings || !settings.startDate) return [];

    const start = new Date(settings.startDate);
    const sipDay = start.getDate();
    const end = new Date();
    end.setMonth(end.getMonth() + 12);

    const out = [];
    let y = start.getFullYear();
    let m = start.getMonth();

    while (true) {
        const lastDay = new Date(y, m + 1, 0).getDate();
        const d = new Date(y, m, Math.min(sipDay, lastDay));
        if (d > end) break;
        if (d >= start) out.push(dateToStr(d));
        m++;
        if (m > 11) {
            m = 0;
            y++;
        }
    }

    return out;
}

let openSetting = "";

function secOpen(id, title, summary, level, tier) {
    return `<section class="br-card su-opt" data-level="${level}">
        <details class="su-acc" data-su-sec="${id}" ${openSetting === id ? "open" : ""}>
            <summary>
                <span class="su-acc-title">${title}</span>
                <span class="su-acc-sum">${summary}</span>
                ${icon("chevron-down", { size: 16 })}
            </summary>
            <div class="su-acc-body">`;
}

const secClose = () => `</div></details></section>`;

function settingsHTML() {
    const s = settings;
    const skipped = (s && s.skippedSipDates) || [];
    const skipChoices = upcomingSipDates().filter((d) => !skipped.includes(d));

    const schedule = s
        ? s.sipSchedule
              .map((seg, i) => {
                  const prev = i === 0 ? null : s.sipSchedule[i - 1].amount;
                  const arrow =
                      prev === null ? "" : seg.amount > prev ? icon("arrow-up-right", { size: 14 }) + " " : seg.amount < prev ? icon("arrow-down-right", { size: 14 }) + " " : "";
                  return `<div class="su-row">
                    <span><strong>${arrow}${sipAmt(seg.amount)}</strong>
                    <span class="br-muted"> from ${escapeHTML(seg.fromDate)}</span></span>
                    ${
                        i === 0
                            ? `<span class="br-badge br-badge-info">Base</span>`
                            : `<button type="button" class="br-button br-button-danger" data-action="remove-step" data-idx="${i}">Remove</button>`
                    }
                </div>`;
              })
              .join("")
        : "";

    return `
        <div class="su-settings-grid">
            ${secOpen("base", "Base SIP", s ? sipAmt(s.sipSchedule[0].amount) + " / month" : "Not set", "1", "Essential")}
                <form data-form="base" class="su-stack">
                    <label><span>SIP amount (₹)</span>
                        <input name="amount" type="number" step="0.01" min="0" class="br-input" value="${s ? s.sipSchedule[0].amount : ""}" required></label>
                    <label><span>Start date</span>
                        <input name="start" type="date" class="br-input" value="${s ? escapeHTML(s.startDate) : ""}" required></label>
                    <button type="submit" class="br-button br-button-primary">Save settings</button>
                </form>
            ${secClose()}

            ${
                s
                    ? `
            ${secOpen("goal", "Investment goal", s && s.goalAmount ? fmtK(s.goalAmount) : "Not set", "1", "Essential")}
                <form data-form="goal" class="su-stack">
                    <label><span>Target corpus (₹)</span>
                        <input name="amount" type="number" step="1" min="0" class="br-input" value="${s.goalAmount || ""}"></label>
                    <label><span>Target date (optional)</span>
                        <input name="date" type="date" class="br-input" value="${s.goalDate ? escapeHTML(s.goalDate) : ""}"></label>
                    <div style="display:flex;gap:8px;">
                        <button type="submit" class="br-button br-button-primary">Save goal</button>
                        <button type="button" class="br-button" data-action="clear-goal">Clear</button>
                    </div>
                </form>
            ${secClose()}

            ${secOpen("step", "Step-up / step-down", s ? (s.sipSchedule.length > 1 ? (s.sipSchedule.length - 1) + " change" + (s.sipSchedule.length > 2 ? "s" : "") : "None") : "", "2", "Optional")}
                <div class="su-list">${schedule}</div>
                <form data-form="step" class="su-stack" style="margin-top:12px;">
                    <label><span>New amount (₹)</span>
                        <input name="amount" type="number" step="0.01" min="0" class="br-input" required></label>
                    <label><span>Effective from</span>
                        <input name="from" type="date" class="br-input" required></label>
                    <button type="submit" class="br-button">Add change</button>
                </form>
            ${secClose()}

            ${secOpen("skip", "Skip an instalment", skipped.length ? skipped.length + " skipped" : "None", "2", "Optional")}
                <div class="su-list">
                    ${
                        skipped.length
                            ? skipped
                                  .map(
                                      (d) => `<div class="su-row"><span>${icon("skip-forward", { size: 14 })} ${escapeHTML(d)}</span>
                        <button type="button" class="br-button" data-action="restore-skip" data-date="${d}">Restore</button></div>`
                                  )
                                  .join("")
                            : `<span class="br-muted">No skipped months.</span>`
                    }
                </div>
                <form data-form="skip" class="su-stack" style="margin-top:12px;">
                    <label><span>SIP date</span>
                        <select name="date" class="br-select" required>
                            <option value="">Choose…</option>
                            ${skipChoices.map((d) => `<option value="${d}">${d}</option>`).join("")}
                        </select></label>
                    <button type="submit" class="br-button">Skip this instalment</button>
                </form>
            ${secClose()}`
                    : ""
            }

            ${secOpen("manage", "Manage SIPs", profiles.length + (profiles.length === 1 ? " SIP" : " SIPs"), "3", "Advanced")}
                <div class="su-list">
                    ${profiles
                        .map(
                            (p) => `<div class="su-row">
                        <span class="su-mf-name">${mfLogoHTML(p.name, mfFunds, "md")}<span>${escapeHTML(p.name)}${profile && p.id === profile.id ? ` <span class="br-badge br-badge-success">Active</span>` : ""}</span></span>
                        <span style="display:flex;gap:8px;">
                            <button type="button" class="br-button" data-action="rename-profile" data-id="${p.id}">Rename</button>
                            <button type="button" class="br-button br-button-danger" data-action="delete-profile" data-id="${p.id}">Delete</button>
                        </span>
                    </div>`
                        )
                        .join("")}
                </div>
                <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="br-button" data-action="new-profile">+ New SIP</button>
                    ${
                        s
                            ? `<button type="button" class="br-button br-button-danger" data-action="reset-profile">Reset this SIP's data</button>`
                            : ""
                    }
                </div>
            ${secClose()}
        </div>
    `;
}

/* =========================================
   MODALS + TOAST
========================================= */

const modal = (page, name) => page.querySelector(`[data-modal="${name}"]`);

function openModal(page, name) {
    const layer = modal(page, name);
    const err = layer.querySelector("[data-error]");
    if (err) err.style.display = "none";
    layer.hidden = false;
}

function closeModals(page) {
    page.querySelectorAll("[data-modal]").forEach((l) => (l.hidden = true));
}

function showError(page, name, msg) {
    const el = modal(page, name).querySelector("[data-error]");
    if (!el) return toast(page, msg);
    el.textContent = msg;
    el.style.display = "block";
}

function toast(page, msg) {
    const el = page.querySelector("[data-su-toast]");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

let confirmAction = null;

function askConfirm(page, title, body, fn) {
    const layer = modal(page, "confirm");
    layer.querySelector("[data-confirm-title]").textContent = title;
    layer.querySelector("[data-confirm-body]").textContent = body;
    confirmAction = fn;
    openModal(page, "confirm");
}

/* =========================================
   ACTIONS
========================================= */

const errMsg = (e) => (e && e.message ? e.message : "database error");

async function addEntry(page, form) {
    if (!settings) return toast(page, "Save SIP settings first.");

    const date = form.date.value;
    const pct = parseFloat(form.pct.value);

    if (!date || isNaN(pct)) return toast(page, "Enter date and a valid % change.");
    if (entries.find((e) => e.date === date)) return toast(page, "Entry for this date already exists.");

    try {
        await store.saveEntry(profile.id, {
            date,
            percentChange: pct,
            portfolioValue: 0,
            investedAmount: 0
        });
        entries = await store.getProfileEntries(profile.id);
        await recalcAndReload();
        render(page);
        toast(page, `Entry added for ${date} ✓`);
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

function openEditEntry(page, id) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;

    editingEntryId = id;

    const form = modal(page, "entry").querySelector("form");
    form.date.value = e.date;
    form.pct.value = e.percentChange;
    openModal(page, "entry");
}

async function saveEditedEntry(page) {
    const form = modal(page, "entry").querySelector("form");
    const date = form.date.value;
    const pct = parseFloat(form.pct.value);

    if (!date || isNaN(pct)) return showError(page, "entry", "Invalid values.");
    if (entries.find((e) => e.date === date && e.id !== editingEntryId)) {
        return showError(page, "entry", "Another entry already exists for that date.");
    }

    try {
        await store.saveEntry(profile.id, {
            id: editingEntryId,
            date,
            percentChange: pct,
            portfolioValue: 0,
            investedAmount: 0
        });
        entries = await store.getProfileEntries(profile.id);
        await recalcAndReload();
        closeModals(page);
        render(page);
        toast(page, "Entry updated ✓");
    } catch (e) {
        showError(page, "entry", "Couldn't save — " + errMsg(e));
    }
}

async function removeEntry(page, id) {
    try {
        await store.deleteEntry(id);
        entries = await store.getProfileEntries(profile.id);
        await recalcAndReload();
        render(page);
        toast(page, "Entry deleted ✓");
    } catch (e) {
        toast(page, "Couldn't delete — " + errMsg(e));
    }
}

/* -- settings -- */

async function afterSettingsChange(page, message) {
    normalizeSettings(settings);
    await store.saveSettings(profile.id, settings);
    await recalcAndReload();
    render(page);
    if (message) toast(page, message);
}

async function saveBase(page, form) {
    const amt = parseFloat(form.amount.value);
    const date = form.start.value;

    if (!amt || amt <= 0 || !date) {
        return toast(page, "Enter a valid SIP amount and start date.");
    }

    try {
        if (settings && settings.startDate === date) {
            settings.sipSchedule[0] = { fromDate: date, amount: amt };
            settings.sipSchedule = settings.sipSchedule.filter((s) => s.fromDate >= date);
        } else {
            settings = {
                id: profile.id,
                startDate: date,
                sipAmount: amt,
                sipSchedule: [{ fromDate: date, amount: amt }],
                skippedSipDates: settings ? settings.skippedSipDates || [] : []
            };
        }

        normalizeSettings(settings);
        await store.saveSettings(profile.id, settings);
        await migrateAllocationsIfNeeded();
        await recalcAndReload();
        render(page);
        toast(page, "Settings saved ✓");
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function addStep(page, form) {
    if (!settings) return toast(page, "Save base SIP settings first.");

    const newAmt = parseFloat(form.amount.value);
    const from = form.from.value;

    if (!newAmt || newAmt <= 0 || !from) {
        return toast(page, "Enter a valid new amount and effective date.");
    }
    if (from < settings.startDate) {
        return toast(page, "Effective date cannot be before SIP start date.");
    }

    const prior = amountForDate(settings.sipSchedule, from);

    settings.sipSchedule = settings.sipSchedule.filter((s) => s.fromDate !== from);
    settings.sipSchedule.push({ fromDate: from, amount: newAmt });
    settings.sipSchedule.sort((a, b) => a.fromDate.localeCompare(b.fromDate));

    const verb = newAmt > prior ? "Step-up" : newAmt < prior ? "Step-down" : "Amount set";

    try {
        await afterSettingsChange(
            page,
            `${verb} to ${sipAmt(newAmt)} from ${from} ✓`
        );
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function removeStep(page, idx) {
    settings.sipSchedule.splice(idx, 1);

    try {
        await afterSettingsChange(page, "Schedule entry removed ✓");
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function skipDate(page, form) {
    const d = form.date.value;

    if (!settings) return toast(page, "Save base SIP settings first.");
    if (!d) return toast(page, "Pick a SIP date to skip.");
    if (!upcomingSipDates().includes(d)) return toast(page, "That date is not a SIP instalment date.");
    if ((settings.skippedSipDates || []).includes(d)) return toast(page, "Already skipped for that date.");

    settings.skippedSipDates = [...(settings.skippedSipDates || []), d].sort();

    try {
        await afterSettingsChange(page, `SIP skipped for ${d} ✓`);
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function restoreSkip(page, d) {
    settings.skippedSipDates = (settings.skippedSipDates || []).filter((x) => x !== d);

    try {
        await afterSettingsChange(page, "SIP restored ✓");
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function saveGoal(page, form) {
    const amt = parseFloat(form.amount.value);

    if (!settings) return toast(page, "Save your SIP settings first.");
    if (!amt || amt <= 0) return toast(page, "Enter a valid target corpus.");

    settings.goalAmount = amt;
    settings.goalDate = form.date.value || null;

    try {
        await store.saveSettings(profile.id, settings);
        render(page);
        toast(page, "Goal saved ✓");
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

async function clearGoal(page) {
    if (!settings) return;

    settings.goalAmount = null;
    settings.goalDate = null;

    try {
        await store.saveSettings(profile.id, settings);
        render(page);
        toast(page, "Goal cleared");
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

/* -- allocation -- */

async function setAllocationStatus(page, dateStr, status) {
    if (!settings) return;

    if (!settings.sipAllocations) settings.sipAllocations = {};

    const ex = settings.sipAllocations[dateStr] || {};

    settings.sipAllocations[dateStr] = {
        status,
        paymentDate:
            ex.paymentDate ||
            (status === "paid" || status === "payment_initiated" ? dateStr : null),
        processingDate:
            status === "processing" ? ex.processingDate || todayStr() : ex.processingDate || null,
        allocationDate: ex.allocationDate || null,
        nav: ex.nav != null ? ex.nav : null,
        units: ex.units != null ? ex.units : null,
        amount: ex.amount != null ? ex.amount : amountForDate(settings.sipSchedule, dateStr)
    };

    try {
        await store.saveSettings(profile.id, settings);
        render(page);
        toast(page, `Marked ${ALLOC_STATUS_LABEL[status] || status} ✓`);
    } catch (e) {
        toast(page, "Couldn't save — " + errMsg(e));
    }
}

function openAlloc(page, dateStr) {
    allocTarget = dateStr;

    const ex = (settings.sipAllocations && settings.sipAllocations[dateStr]) || {};
    const layer = modal(page, "alloc");
    const form = layer.querySelector("form");

    layer.querySelector("[data-alloc-date]").textContent = dateStr;
    form.paymentDate.value = ex.paymentDate || dateStr;
    form.allocationDate.value = ex.allocationDate || "";
    form.nav.value = ex.nav != null ? ex.nav : "";
    form.units.value = ex.units != null ? ex.units : "";

    openModal(page, "alloc");
}

async function saveAlloc(page) {
    if (!allocTarget) return;

    const form = modal(page, "alloc").querySelector("form");

    const paymentDate = form.paymentDate.value || null;
    const allocationDate = form.allocationDate.value || null;
    const navRaw = parseFloat(form.nav.value);
    const unitsRaw = parseFloat(form.units.value);
    const nav = isNaN(navRaw) ? null : navRaw;
    const unitsEntered = isNaN(unitsRaw) ? null : unitsRaw;

    if (!allocationDate) return showError(page, "alloc", "Enter the actual allocation date.");
    if (nav == null && unitsEntered == null) return showError(page, "alloc", "Enter the actual NAV (or units).");

    const ex = (settings.sipAllocations && settings.sipAllocations[allocTarget]) || {};
    const amount = ex.amount != null ? ex.amount : amountForDate(settings.sipSchedule, allocTarget);
    const units =
        unitsEntered != null
            ? +unitsEntered.toFixed(4)
            : nav
            ? +(amount / nav).toFixed(4)
            : null;

    if (!settings.sipAllocations) settings.sipAllocations = {};

    settings.sipAllocations[allocTarget] = {
        status: "allocated",
        paymentDate,
        processingDate: ex.processingDate || null,
        allocationDate,
        nav,
        units,
        amount
    };

    try {
        await store.saveSettings(profile.id, settings);
        await recalcAndReload();
        const d = allocTarget;
        allocTarget = null;
        closeModals(page);
        render(page);
        toast(page, `Allocation recorded for ${d} ✓`);
    } catch (e) {
        showError(page, "alloc", "Couldn't save — " + errMsg(e));
    }
}

/* -- profiles -- */

let profileEditId = null;

function openProfileModal(page, id) {
    profileEditId = id || null;

    const layer = modal(page, "profile");
    const p = id ? profiles.find((x) => x.id === id) : null;

    layer.querySelector("[data-profile-title]").textContent = p ? "Rename SIP" : "New SIP";
    layer.querySelector("form").name.value = p ? p.name : "";
    updateMfPicker(page);
    hideMfSuggest(page);

    openModal(page, "profile");
}

/* Logo preview for the typed SIP name. */
function updateMfPicker(page) {
    const layer = modal(page, "profile");
    const name = layer.querySelector("form").name.value;
    const box = layer.querySelector("[data-mf-preview]");

    if (name.trim()) {
        const hit = findMfLogo(name, mfFunds);
        box.innerHTML = `${mfLogoHTML(name, mfFunds, "xl")}<span class="su-mf-preview-text">${escapeHTML(hit ? hit.name : name.trim())}</span>`;
        box.hidden = false;
    } else {
        box.innerHTML = "";
        box.hidden = true;
    }
}

/* Fund suggestions from mfapi.in (skeleton rows while loading). */
let mfSuggestTimer = null;
let mfSuggestReq = 0;
let mfSuggestAbort = null;

function hideMfSuggest(page) {
    clearTimeout(mfSuggestTimer);
    mfSuggestReq++;
    if (mfSuggestAbort) mfSuggestAbort.abort();
    const box = modal(page, "profile").querySelector("[data-mf-suggest]");
    box.hidden = true;
    box.innerHTML = "";
}

function scheduleMfSuggest(page) {
    clearTimeout(mfSuggestTimer);
    const q = modal(page, "profile").querySelector("form").name.value.trim();

    if (q.length < 2) return hideMfSuggest(page);

    mfSuggestTimer = setTimeout(() => runMfSuggest(page, q), 300);
}

async function runMfSuggest(page, q) {
    const box = modal(page, "profile").querySelector("[data-mf-suggest]");
    const req = ++mfSuggestReq;

    if (mfSuggestAbort) mfSuggestAbort.abort();
    mfSuggestAbort = new AbortController();

    box.hidden = false;
    box.innerHTML = Array.from({ length: 3 }, () => `
        <div class="su-mf-item su-mf-item-sk">
            <span class="br-sk" style="width:44px;height:44px;border-radius:12px;flex:none"></span>
            <span style="flex:1;display:flex;flex-direction:column;gap:7px;"><span class="br-sk" style="width:80%;height:12px"></span><span class="br-sk" style="width:45%;height:10px"></span></span>
        </div>`).join("");

    try {
        const list = await searchMfSchemes(q, mfSuggestAbort.signal, 6);

        if (req !== mfSuggestReq) return;

        box.innerHTML = list.length
            ? list.map((x, i) => `
                <button type="button" class="su-mf-item" data-mf-pick="${i}">
                    ${mfLogoHTML(x.schemeName, mfFunds, "xs")}
                    <span class="su-mf-item-name">${escapeHTML(x.schemeName)}</span>
                </button>`).join("")
            : `<div class="su-mf-empty">No matching funds — you can still use this name.</div>`;

        box._list = list;
        if (!list.length) updateMfPicker(page);
    } catch (e) {
        if (req !== mfSuggestReq || (e && e.name === "AbortError")) return;
        box.innerHTML = `<div class="su-mf-empty">Couldn't load suggestions — you can still type a name.</div>`;
        updateMfPicker(page);
    }
}

async function saveProfileForm(page) {
    const name = modal(page, "profile").querySelector("form").name.value.trim();

    if (!name) return showError(page, "profile", "Enter a name.");

    try {
        if (profileEditId) {
            const p = profiles.find((x) => x.id === profileEditId);
            await store.saveProfile({ ...p, name });
            profiles = await store.getProfiles();
            profile = profiles.find((x) => x.id === profile.id) || profile;
            closeModals(page);
            render(page);
            toast(page, "SIP renamed ✓");
        } else {
            const pid = await store.saveProfile({ name });
            profiles = await store.getProfiles();
            closeModals(page);
            await switchProfile(page, pid);
            toast(page, `"${name}" created ✓`);
        }
    } catch (e) {
        showError(page, "profile", "Couldn't save — " + errMsg(e));
    }
}

function askDeleteProfile(page, id) {
    if (profiles.length <= 1) return toast(page, "Cannot delete your only SIP.");

    const p = profiles.find((x) => x.id === id);

    askConfirm(
        page,
        "Delete this SIP?",
        `Delete "${p ? p.name : "this SIP"}" and all its data? This can't be undone.`,
        async () => {
            await store.deleteProfile(id);
            profiles = await store.getProfiles();

            if (profile && profile.id === id) {
                profile = profiles[0];
                localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
                await loadProfileData();
            }

            render(page);
            toast(page, "SIP deleted ✓");
        }
    );
}

function askResetProfile(page) {
    askConfirm(
        page,
        "Reset all data?",
        `Reset ALL data for "${profile.name}"? This can't be undone.`,
        async () => {
            await store.clearEntries(profile.id);
            await store.deleteSettings(profile.id);
            settings = null;
            entries = [];
            render(page);
            toast(page, "All data cleared.");
        }
    );
}

/* =========================================
   EVENTS
========================================= */

function attachEvents(page) {
    // Profit chart: hover (or touch-drag) shows the exact value at that point
    const showTip = (event) => {
        const plot = event.target.closest && event.target.closest("[data-su-plot]");
        if (!plot || !profitPts.length) return;
        const r = plot.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
        const pt = profitPts[Math.round(f * (profitPts.length - 1))];
        const line = plot.querySelector(".su-tip-line");
        const dot = plot.querySelector(".su-tip-dot");
        const tip = plot.querySelector(".su-tip");
        const day = new Date(pt.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        tip.innerHTML = `<span>${day}</span><strong class="${posNeg(pt.v)}">${(pt.v >= 0 ? "+" : "") + fmtK(pt.v)}</strong>`;
        [line, dot, tip].forEach((el) => (el.hidden = false));
        line.style.left = dot.style.left = pt.fx * 100 + "%";
        dot.style.top = pt.fy * 100 + "%";
        tip.style.left = pt.fx * 100 + "%";
        tip.classList.toggle("is-left", pt.fx > 0.7);
        tip.classList.toggle("is-right", pt.fx < 0.3);
    };
    const hideTip = (event) => {
        const plot = event.target.closest && event.target.closest("[data-su-plot]");
        if (plot) plot.querySelectorAll(".su-tip-line, .su-tip-dot, .su-tip").forEach((el) => (el.hidden = true));
    };
    page.addEventListener("pointermove", showTip);
    page.addEventListener("pointerdown", showTip);
    page.addEventListener("pointerout", (e) => {
        const plot = e.target.closest && e.target.closest("[data-su-plot]");
        if (plot && !plot.contains(e.relatedTarget)) hideTip(e);
    });

    // Fund switcher (custom menu instead of a native <select>)
    const closeSwitch = () => {
        page.querySelectorAll("[data-su-switch]").forEach((w) => {
            const m = w.querySelector(".su-switch-menu");
            if (m) m.hidden = true;
            const b = w.querySelector("[data-su-switch-btn]");
            if (b) b.setAttribute("aria-expanded", "false");
        });
    };
    page.addEventListener("click", async (event) => {
        const pick = event.target.closest("[data-su-pick]");
        if (pick) {
            closeSwitch();
            await switchProfile(page, Number(pick.dataset.suPick));
            return;
        }
        const btn = event.target.closest("[data-su-switch-btn]");
        if (btn) {
            const menu = btn.parentElement.querySelector(".su-switch-menu");
            if (!menu) return;
            const open = menu.hidden;
            closeSwitch();
            menu.hidden = !open;
            btn.setAttribute("aria-expanded", String(open));
            return;
        }
        closeSwitch();
    });
    page.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSwitch();
    });

    // Settings accordion: remember which section is open (one at a time)
    page.addEventListener(
        "toggle",
        (event) => {
            const d = event.target;
            if (!d || !d.matches || !d.matches("details[data-su-sec]")) return;
            if (d.open) {
                openSetting = d.dataset.suSec;
                page.querySelectorAll("details[data-su-sec]").forEach((o) => { if (o !== d) o.open = false; });
            } else if (openSetting === d.dataset.suSec) {
                openSetting = "";
            }
        },
        true
    );

    // A logo that fails to load is removed so the letter behind it shows
    page.addEventListener(
        "error",
        (event) => {
            const img = event.target;
            if (img && img.matches && img.matches("img[data-mf-logo]")) img.remove();
            if (img && img.matches && img.matches("img[data-mf-howto]")) img.style.display = "none";
        },
        true
    );

    page.addEventListener("input", (event) => {
        if (event.target.matches('[data-form="profile"] [name="name"]')) {
            // While suggestions are open they take the space of the big preview,
            // so the form doesn't jump around; the preview comes back after a pick.
            const typing = event.target.value.trim().length >= 2;
            if (typing) modal(page, "profile").querySelector("[data-mf-preview]").hidden = true;
            else updateMfPicker(page);
            scheduleMfSuggest(page);
        }
    });

    // Keep the input focused when tapping a suggestion; close the list when leaving the field
    page.addEventListener("mousedown", (event) => {
        if (event.target.closest("[data-mf-suggest]")) event.preventDefault();
    });
    page.addEventListener("focusout", (event) => {
        if (!event.target.matches('[data-form="profile"] [name="name"]')) return;
        setTimeout(() => {
            if (!page.isConnected) return;
            hideMfSuggest(page);
            updateMfPicker(page);
        }, 150);
    });

    page.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-mf-pick]");
        if (!pick) return;
        const box = pick.closest("[data-mf-suggest]");
        const item = box && box._list && box._list[Number(pick.dataset.mfPick)];
        if (!item) return;
        modal(page, "profile").querySelector("form").name.value = item.schemeName;
        hideMfSuggest(page);
        updateMfPicker(page);
    });

    page.addEventListener("click", async (event) => {
        const tabBtn = event.target.closest("[data-su-tab]");

        if (tabBtn) {
            tab = tabBtn.dataset.suTab;
            render(page);
            return;
        }

        const rangeBtn = event.target.closest("[data-su-range]");

        if (rangeBtn) {
            profitRange = rangeBtn.dataset.suRange;
            render(page);
            return;
        }

        const go = event.target.closest("[data-su-goto]");

        if (go) {
            tab = go.dataset.suGoto;
            render(page);
            return;
        }

        const el = event.target.closest("[data-action]");
        if (!el) return;

        const id = el.dataset.id ? Number(el.dataset.id) : null;

        switch (el.dataset.action) {
            case "close-modal":
                closeModals(page);
                break;

            case "new-profile":
                openProfileModal(page, null);
                break;
            case "rename-profile":
                openProfileModal(page, id);
                break;
            case "delete-profile":
                askDeleteProfile(page, id);
                break;
            case "reset-profile":
                askResetProfile(page);
                break;

            case "sort-history":
                historySortDesc = !historySortDesc;
                render(page);
                break;
            case "load-more":
                historyLimit += 30;
                render(page);
                break;
            case "edit-entry":
                openEditEntry(page, id);
                break;
            case "delete-entry":
                askConfirm(page, "Delete this entry?", "This can't be undone.", () =>
                    removeEntry(page, id)
                );
                break;

            case "remove-step":
                await removeStep(page, Number(el.dataset.idx));
                break;
            case "restore-skip":
                await restoreSkip(page, el.dataset.date);
                break;
            case "sync-fund":
                await syncLinkedFund(page);
                break;
            case "unlink-fund":
                askConfirm(
                    page,
                    "Unlink fund?",
                    "Your entries stay as they are; automatic NAV sync stops.",
                    () => unlinkFund(page)
                );
                break;
            case "clear-goal":
                await clearGoal(page);
                break;

            case "edit-alloc":
                openAlloc(page, el.dataset.date);
                break;

            case "confirm-yes": {
                const fn = confirmAction;
                confirmAction = null;
                closeModals(page);
                if (fn) {
                    try {
                        await fn();
                    } catch (e) {
                        toast(page, "Failed — " + errMsg(e));
                    }
                }
                break;
            }
        }
    });

    page.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-form]");
        if (!form) return;

        event.preventDefault();

        switch (form.dataset.form) {
            case "add-entry":
                await addEntry(page, form);
                break;
            case "fund-import":
                await importFund(page, form);
                break;
            case "entry":
                await saveEditedEntry(page);
                break;
            case "alloc":
                await saveAlloc(page);
                break;
            case "profile":
                await saveProfileForm(page);
                break;
            case "base":
                await saveBase(page, form);
                break;
            case "step":
                await addStep(page, form);
                break;
            case "skip":
                await skipDate(page, form);
                break;
            case "goal":
                await saveGoal(page, form);
                break;
        }
    });

    page.addEventListener("change", async (event) => {
        const t = event.target;

        if (t.matches("[data-su-profile]")) {
            await switchProfile(page, Number(t.value));
        } else if (t.matches("[data-su-growth]")) {
            growthMode = t.value;
            render(page);
        } else if (t.matches("[data-su-hdate]")) {
            historyDate = t.value;
            historyLimit = 30;
            render(page);
        } else if (t.matches("[data-su-fund-years]")) {
            fundProjYears = Number(t.value);
            render(page);
        } else if (t.matches('[data-form="alloc"] [name="allocationDate"]')) {
            await autoFillAllocationNav(page, t.form);
        } else if (t.matches("[data-su-status]")) {
            await setAllocationStatus(page, t.dataset.date, t.value);
        }
    });

    // Live preview of how many SIP instalments a new entry will sweep in
    page.addEventListener("input", (event) => {
        const form = event.target.closest('[data-form="add-entry"]');
        if (!form || !settings) return;

        const preview = page.querySelector("[data-su-preview]");
        const date = form.date.value;
        const pct = parseFloat(form.pct.value);

        if (!date || isNaN(pct)) {
            preview.textContent = "";
            return;
        }

        const prev = entries.length ? entries[entries.length - 1].date : null;
        const n = sipCountBetween(settings.startDate, prev, date);

        preview.textContent = "";
    });

}

/* =========================================
   ESCAPING
========================================= */

function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}
