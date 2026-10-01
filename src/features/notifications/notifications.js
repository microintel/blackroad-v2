import {
    formatINR,
    formatPct,
    loadStocks,
    loadMutualFunds,
    loadDues
} from "./notifications-service.js";

import { navigate } from "../../app/router.js";

const DUE_META = {
    overdue: { label: "Overdue", badge: "br-badge-danger" },
    "due-soon": { label: "Due soon", badge: "br-badge-warning" },
    upcoming: { label: "Upcoming", badge: "br-badge-success" }
};

export async function Notifications() {
    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Notifications</h2>
                <p data-updated>Alerts and reminders</p>
            </div>

            <button type="button" class="br-button" data-action="refresh">Refresh</button>
        </div>

        <div class="br-grid br-grid-4" data-tiles></div>

        <section class="br-card nf-panel">
            <div class="br-card-heading">
                <div><h3>Stocks — live LTP</h3><p class="br-muted" data-sub="stocks">Loading…</p></div>
                <strong data-total="stocks"></strong>
            </div>
            <div data-body="stocks"></div>
        </section>

        <section class="br-card nf-panel">
            <div class="br-card-heading">
                <div><h3>Mutual funds — live NAV</h3><p class="br-muted" data-sub="mf">Loading…</p></div>
                <strong data-total="mf"></strong>
            </div>
            <div data-body="mf"></div>
        </section>

        <section class="br-card nf-panel">
            <div class="br-card-heading">
                <div><h3>Due &amp; reminders</h3><p class="br-muted" data-sub="due">Loading…</p></div>
            </div>
            <div data-body="due"></div>
        </section>
    `;

    page.addEventListener("click", (event) => {
        if (event.target.closest('[data-action="refresh"]')) {
            refresh(page);
            return;
        }

        const row = event.target.closest("[data-path]");

        if (row) navigate(row.dataset.path);
    });

    // Renders immediately; live prices fill in as they arrive.
    refresh(page);

    return page;
}

/* ---------------- refresh ---------------- */

async function refresh(page) {
    if (!page.isConnected && page.__ran) return;
    page.__ran = true;

    const [stocks, mf, dues] = await Promise.all([
        section(page, "stocks", loadStocks, renderStocks),
        section(page, "mf", loadMutualFunds, renderMF),
        section(page, "due", loadDues, renderDues)
    ]);

    renderTiles(page, {
        stocks: stocks ? stocks.totalPnl : 0,
        mf: mf ? mf.totalDayPnl : 0,
        overdue: dues ? dues.filter((d) => d.status === "overdue").length : 0
    });

    page.querySelector("[data-updated]").textContent =
        "Updated " +
        new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit"
        });
}

async function section(page, name, load, render) {
    const body = page.querySelector(`[data-body="${name}"]`);
    if (!body) return null;

    try {
        const data = await load();
        render(page, body, data);
        return data;
    } catch (error) {
        console.error(`Notifications: ${name} failed`, error);

        body.innerHTML = `<div class="br-empty-state">Couldn't load this section.</div>`;
        setText(page, `[data-sub="${name}"]`, "Load failed");

        return null;
    }
}

function setText(page, selector, text) {
    const el = page.querySelector(selector);
    if (el) el.textContent = text;
}

function tone(value) {
    return value >= 0 ? "nf-pos" : "nf-neg";
}

/* ---------------- sections ---------------- */

function renderStocks(page, body, data) {
    const { rows, totalPnl, liveCount } = data;

    if (!rows.length) {
        body.innerHTML = `<div class="br-empty-state">No stock holdings yet.</div>`;
        setText(page, '[data-sub="stocks"]', "No holdings");
        setText(page, '[data-total="stocks"]', "");
        return;
    }

    setText(page, '[data-sub="stocks"]', `${rows.length} holdings · ${liveCount} live`);

    const total = page.querySelector('[data-total="stocks"]');
    total.textContent = formatINR(totalPnl);
    total.className = tone(totalPnl);

    body.innerHTML = rows
        .map((r) => `
            <div class="nf-item" data-path="/stocks">
                <div class="nf-main">
                    <b>${escapeHTML(r.name)}</b>
                    <span class="br-muted">${r.quantity} qty · avg ${formatINR(r.avgPrice)} · LTP ${formatINR(r.ltp)}
                        <span class="br-badge ${r.live ? "br-badge-success" : "br-badge-info"}">${r.live ? "live" : "cached"}</span></span>
                </div>
                <div class="nf-side ${tone(r.pnl)}">
                    <b>${r.pnl >= 0 ? "+" : ""}${formatINR(r.pnl)}</b>
                    <span>${formatPct(r.pnlPct)}</span>
                </div>
            </div>`)
        .join("");
}

function renderMF(page, body, data) {
    const { rows, totalDayPnl, liveCount } = data;

    if (!rows.length) {
        body.innerHTML = `<div class="br-empty-state">No SIPs yet.</div>`;
        setText(page, '[data-sub="mf"]', "No SIPs");
        setText(page, '[data-total="mf"]', "");
        return;
    }

    setText(page, '[data-sub="mf"]', `${rows.length} SIPs · ${liveCount} with live NAV`);

    const total = page.querySelector('[data-total="mf"]');
    total.textContent = formatINR(totalDayPnl);
    total.className = tone(totalDayPnl);

    body.innerHTML = rows
        .map((r) => `
            <div class="nf-item" data-path="/mutualfund">
                <div class="nf-main">
                    <b>${escapeHTML(r.name)}</b>
                    <span class="br-muted">NAV ${r.latestNav != null ? formatINR(r.latestNav) : "—"} · Invested ${formatINR(r.invested)}
                        ${r.live ? "" : '<span class="br-badge br-badge-info">no live NAV</span>'}</span>
                </div>
                <div class="nf-side ${r.live ? tone(r.dayPnl) : ""}">
                    ${r.live
                        ? `<b>${r.dayPnl >= 0 ? "+" : ""}${formatINR(r.dayPnl)}</b><span>${formatPct(r.dayChangePct)}</span>`
                        : "<b>—</b>"}
                </div>
            </div>`)
        .join("");
}

function renderDues(page, body, items) {
    setText(
        page,
        '[data-sub="due"]',
        items.length ? `${items.length} upcoming item${items.length === 1 ? "" : "s"}` : "All clear"
    );

    if (!items.length) {
        body.innerHTML = `<div class="br-empty-state">No upcoming dues or maturities.</div>`;
        return;
    }

    body.innerHTML = items
        .map((it) => {
            const meta = DUE_META[it.status];

            const when =
                it.days < 0
                    ? `${Math.abs(it.days)}d overdue`
                    : it.days === 0
                    ? "Today"
                    : `in ${it.days}d`;

            return `
                <div class="nf-item" data-path="${it.path}">
                    <div class="nf-main">
                        <b>${escapeHTML(it.title)}</b>
                        <span class="br-muted">${it.date} · ${when}</span>
                    </div>
                    <div class="nf-side">
                        <b>${formatINR(it.amount)}</b>
                        <span class="br-badge ${meta.badge}">${meta.label}</span>
                    </div>
                </div>`;
        })
        .join("");
}

function renderTiles(page, { stocks, mf, overdue }) {
    const total = stocks + mf;

    const tiles = [
        ["Total P&L", formatINR(total), total >= 0],
        ["Stocks P&L (live)", formatINR(stocks), stocks >= 0],
        ["Mutual funds day P&L", formatINR(mf), mf >= 0],
        ["Dues needing attention", String(overdue), overdue === 0]
    ];

    page.querySelector("[data-tiles]").innerHTML = tiles
        .map(
            ([label, value, good]) => `
            <div class="br-card br-stat">
                <div class="br-stat-label">${label}</div>
                <div class="br-stat-value ${good ? "nf-pos" : "nf-neg"}">${value}</div>
            </div>`
        )
        .join("");
}

function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
