import { navigate } from "../../app/router.js";
import { dataService } from "../../data/data-service.js";

import {
    genId,
    round2,
    calculateStockHolding,
    getActiveHoldings,
    calculatePortfolioTotals,
    calculatePortfolioWeight,
    validateTransaction,
    getTxnPnLMap,
    getAllSymbols,
    getAllTags,
    extractTags,
    calculateMonthlySummary,
    calculateAllTimeSummary,
    getAvailableMonths,
    transactionsToCSV,
    fmtMoney,
    fmtSigned,
    fmtPct,
    pnlClass,
    fmtDate,
    getSymbolTransactions,
    getSymbolName
} from "./stocks-service.js";

import { printStocksReport } from "./stocks-print.js";
import { isGuestSync } from "../../services/auth.js";
import { fetchLTPs, fetchChartHistory, LIVE_PRICE_POLL_MS } from "./stocks-live.js";

let store = null;

// In-memory mirror of the persisted state — reloaded on every entry
// into the module, kept in sync with every write.
let transactions = [];
let prices = {};
let seqCounter = 0;

let currentTab = "holdings";
let editingTxnId = null;
let pollTimer = null;
let refreshing = false;
let detailSymbol = null;

export async function Stocks() {
    store = await dataService.getStocksStore();

    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `

        <div class="br-page-heading">
            <div>
                <h2>Stocks</h2>
                <p>Your equity portfolio, transactions and reports.</p>
            </div>

            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="br-muted" data-live-status></span>

                <button
                    type="button"
                    class="br-button"
                    data-action="open-search"
                >
                    Search
                </button>

                <button
                    type="button"
                    class="br-button"
                    data-action="refresh-prices"
                >
                    Refresh prices
                </button>

                <button
                    type="button"
                    class="br-button br-button-primary"
                    data-action="add-txn"
                >
                    <span>+</span>
                    Add transaction
                </button>
            </div>
        </div>

        <div class="br-income-tabs">
            <button type="button" class="br-income-tab active" data-stocks-tab="holdings">Holdings</button>
            <button type="button" class="br-income-tab" data-stocks-tab="transactions">Transactions</button>
            <button type="button" class="br-income-tab" data-stocks-tab="analytics">Analytics</button>
            <button type="button" class="br-income-tab" data-stocks-tab="reports">Reports</button>
        </div>

        <!-- SUMMARY -->
        <div class="br-grid br-grid-4" data-stocks-summary></div>

        <!-- HOLDINGS -->
        <div data-stocks-view="holdings">
            <section class="br-card" style="margin-top:20px;">
                <div class="br-card-heading">
                    <div>
                        <h3>Active holdings</h3>
                        <p class="br-muted">Stocks you currently hold, valued at the last known price.</p>
                    </div>
                </div>
                <div data-holdings-list></div>
            </section>
        </div>

        <!-- TRANSACTIONS -->
        <div data-stocks-view="transactions" hidden>
            <section class="br-card" style="margin-top:20px;">
                <div class="br-toolbar">
                    <div class="br-toolbar-left">
                        <div class="br-search-box">
                            <span>⌕</span>
                            <input type="search" placeholder="Search stock, symbol or notes..." data-txn-search>
                        </div>

                        <select class="br-select" data-txn-filter-type>
                            <option value="">All types</option>
                            <option value="BUY">Buy</option>
                            <option value="SELL">Sell</option>
                        </select>

                        <select class="br-select" data-txn-filter-tag>
                            <option value="">All tags</option>
                        </select>
                    </div>

                    <div class="br-toolbar-right">
                        <button type="button" class="br-button" data-action="export-csv">Export CSV</button>
                        <button type="button" class="br-button" data-action="open-data">Backup &amp; restore</button>
                    </div>
                </div>

                <div class="br-table-wrap" style="margin-top:16px;">
                    <table class="br-table" data-txn-table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Stock</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Amount</th>
                                <th>Realized P&amp;L</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </section>
        </div>

        <!-- REPORTS -->
        <div data-stocks-view="analytics" hidden>
            <div class="br-grid br-grid-3" style="margin-top:20px;" data-an-insights></div>

            <section class="br-card" style="margin-top:20px;">
                <div class="br-card-heading"><h3>How you're doing overall</h3></div>
                <div data-an-overall></div>
            </section>

            <div class="br-grid br-grid-2" style="margin-top:20px;">
                <section class="br-card">
                    <div class="br-card-heading"><h3>Where your money is spread</h3></div>
                    <div data-an-alloc></div>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>How each stock is doing</h3></div>
                    <div data-an-perf></div>
                </section>
            </div>

            <section class="br-card" style="margin-top:20px;">
                <div class="br-card-heading"><h3>Portfolio health</h3></div>
                <div data-an-health></div>
            </section>
        </div>

        <div data-stocks-view="reports" hidden>
            <section class="br-card" style="margin-top:20px;">
                <div class="br-card-heading">
                    <div>
                        <h3>Monthly report</h3>
                        <p class="br-muted">Invested, withdrawn and realized P&amp;L for a period.</p>
                    </div>

                    <select class="br-select" data-report-month></select>
                </div>

                <div class="br-grid br-grid-4" data-report-summary></div>

                <div class="br-page-actions" style="margin-top:16px;">
                    <button type="button" class="br-button br-button-primary" data-action="print-report">Print / Save as PDF</button>
                </div>
                <p class="br-field-help">Choose "Save as PDF" in the print dialog to keep a one-page copy of this period.</p>
            </section>

            <section class="br-card" style="margin-top:20px;">
                <div class="br-card-heading">
                    <div>
                        <h3>Clear all stocks data</h3>
                        <p class="br-muted">Deletes every stock transaction and stored price from this device. This can't be undone &mdash; take a backup in Data Management first.</p>
                    </div>
                </div>
                <button type="button" class="br-button br-button-danger" data-action="clear-data">Clear all stocks data</button>
            </section>
        </div>

        <!-- ADD / EDIT TRANSACTION MODAL -->
        <div class="br-modal-layer" data-txn-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <div>
                        <h3 data-txn-modal-title>Add transaction</h3>
                        <p class="br-muted">Stored in the existing BlackRoad stocks ledger.</p>
                    </div>
                    <button type="button" class="br-button" data-action="close-txn-modal">×</button>
                </div>

                <form data-txn-form>
                    <div class="br-modal-body">
                        <p class="br-field-help" data-txn-error style="display:none;color:var(--br-danger);"></p>

                        <div class="br-form-grid">
                            <label>
                                <span>Type</span>
                                <select name="type" class="br-select" data-txn-type>
                                    <option value="BUY">Buy</option>
                                    <option value="SELL">Sell</option>
                                </select>
                            </label>

                            <label>
                                <span>Date</span>
                                <input name="date" type="date" class="br-input" required>
                            </label>

                            <label>
                                <span>Stock name</span>
                                <input name="name" type="text" class="br-input" placeholder="Reliance Industries" required>
                            </label>

                            <label>
                                <span>Symbol</span>
                                <input name="symbol" type="text" class="br-input" placeholder="RELIANCE" required>
                            </label>

                            <label>
                                <span>Quantity</span>
                                <input name="quantity" type="number" step="0.000001" min="0" class="br-input" required>
                            </label>

                            <label>
                                <span>Price</span>
                                <input name="price" type="number" step="0.01" min="0" class="br-input" required>
                            </label>

                            <label>
                                <span>Notes (#tags supported)</span>
                                <input name="notes" type="text" class="br-input">
                            </label>

                            <label style="display:flex;align-items:center;gap:8px;">
                                <input name="isMTF" type="checkbox">
                                <span>Bought via MTF</span>
                            </label>
                        </div>
                    </div>

                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-txn-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save transaction</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- TRANSACTION DETAIL MODAL -->
        <div class="br-modal-layer" data-txn-detail-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-txn-detail-title>Transaction</h3>
                    <button type="button" class="br-button" data-action="close-txn-detail">×</button>
                </div>
                <div class="br-modal-body">
                    <div class="br-detail-grid" data-txn-detail-grid></div>
                    <div data-txn-detail-tags></div>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="txn-detail-edit">Edit</button>
                    <button type="button" class="br-button" data-action="txn-detail-duplicate">Duplicate</button>
                    <button type="button" class="br-button br-button-danger" data-action="txn-detail-delete">Delete</button>
                </div>
            </div>
        </div>

        <!-- SEARCH MODAL -->
        <div class="br-modal-layer" data-search-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Search</h3>
                    <button type="button" class="br-button" data-action="close-search">×</button>
                </div>
                <div class="br-modal-body">
                    <input type="search" class="br-input" style="width:100%;" placeholder="Search stocks, transactions, notes, tags…" data-search-input>
                    <div data-search-results style="margin-top:16px;"></div>
                </div>
            </div>
        </div>

        <!-- STOCK DETAIL MODAL -->
        <div class="br-modal-layer" data-detail-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true" style="width:min(820px,100%);">
                <div class="br-modal-header">
                    <div>
                        <h3 data-detail-title>Stock detail</h3>
                        <p class="br-muted">Everything about this one holding.</p>
                    </div>
                    <button type="button" class="br-button" data-action="close-detail">×</button>
                </div>
                <div class="br-modal-body">
                    <div class="br-detail-grid" data-detail-grid></div>

                    <label style="display:block;margin-bottom:20px;">
                        <span class="br-muted">Current price (manual override)</span>
                        <input type="number" step="0.01" min="0" class="br-input" style="width:140px;display:block;" data-detail-price>
                    </label>

                    <h4>Price since you bought</h4>
                    <div data-detail-chart></div>
                    <div class="br-chart-tip" data-detail-tip></div>

                    <h4 style="margin-top:20px;">Every buy and sell</h4>
                    <div class="br-table-wrap">
                        <table class="br-table">
                            <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th></tr></thead>
                            <tbody data-detail-txns></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- CLEAR ALL DATA MODAL -->
        <div class="br-modal-layer" data-clear-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Clear all stocks data?</h3>
                </div>
                <div class="br-modal-body">
                    <p class="br-muted">This deletes every transaction and current price from this device. This can't be undone.</p>
                    <p class="br-field-help" data-clear-error style="display:none;color:var(--br-danger);"></p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="cancel-clear">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm-clear">Clear everything</button>
                </div>
            </div>
        </div>

        <!-- DELETE CONFIRM MODAL -->
        <div class="br-modal-layer" data-delete-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Delete transaction?</h3>
                </div>
                <div class="br-modal-body">
                    <p class="br-muted">This cannot be undone.</p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="cancel-delete">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm-delete">Delete</button>
                </div>
            </div>
        </div>

    `;

    attachEvents(page);
    await loadState(page);

    // Live prices: fetch once now, then keep fresh in the background.
    // Not awaited — the page must render immediately.
    refreshPrices(page, true);
    startPolling(page);

    return page;
}

async function loadState(page) {
    const state = await store.loadAll();
    transactions = state.transactions;
    prices = state.prices;
    seqCounter = state.seqCounter;

    renderAll(page);
}

/* =========================================
   LIVE PRICES
========================================= */

async function refreshPrices(page, silent) {
    if (refreshing || !page.isConnected) return;

    const symbols = getActiveHoldings(transactions, prices).map(
        (h) => h.symbol
    );

    const status = page.querySelector("[data-live-status]");

    if (symbols.length === 0) {
        if (!silent && status) status.textContent = "No holdings to refresh";
        return;
    }

    refreshing = true;
    if (!silent && status) status.textContent = "Refreshing prices…";

    try {
        const { updates, updated, failed } = await fetchLTPs(symbols);

        // The user may have left the page while the request was running
        if (!page.isConnected) return;

        if (updated > 0) {
            Object.assign(prices, updates);
            await persist();

            // Don't rebuild the table under a price the user is typing
            const typing = document.activeElement?.matches?.(
                "[data-price-input]"
            );

            if (!typing) {
                renderSummary(page);
                renderHoldings(page);
                renderAnalytics(page);
                renderDetail(page);
            }
        }

        if (status) {
            status.textContent =
                failed === 0
                    ? updated > 0
                        ? "Prices live"
                        : ""
                    : `Updated ${updated}, ${failed} failed — enter manually`;
        }
    } finally {
        refreshing = false;
    }
}

function startPolling(page) {
    stopPolling();

    pollTimer = setInterval(() => {
        // Page was replaced by another route -> stop
        if (!page.isConnected) {
            stopPolling();
            return;
        }
        refreshPrices(page, true);
    }, LIVE_PRICE_POLL_MS);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

async function persist() {
    await store.saveAll({ transactions, prices, seqCounter });
}

function renderAll(page) {
    renderSummary(page);
    renderHoldings(page);
    renderTransactions(page);
    renderTagFilter(page);
    renderReports(page);
    renderAnalytics(page);
}

/* =========================================
   SUMMARY
========================================= */

function renderSummary(page) {
    const totals = calculatePortfolioTotals(transactions, prices);
    const el = page.querySelector("[data-stocks-summary]");

    el.innerHTML = `
        ${statCard("Invested", fmtMoney(totals.investedValue, true))}
        ${statCard("Current value", fmtMoney(totals.currentValue, true))}
        ${statCard(
            "Unrealized P&L",
            fmtSigned(totals.unrealizedPnL, true),
            pnlClass(totals.unrealizedPnL)
        )}
        ${statCard(
            "Realized P&L",
            fmtSigned(totals.realizedPnL, true),
            pnlClass(totals.realizedPnL)
        )}
    `;
}

function statCard(label, value, tone) {
    return `
        <div class="br-card br-stat">
            <div class="br-stat-label">${escapeHTML(label)}</div>
            <div class="br-stat-value${tone ? " br-pnl-" + tone : ""}">${value}</div>
        </div>
    `;
}

/* =========================================
   HOLDINGS
========================================= */

function renderHoldings(page) {
    const container = page.querySelector("[data-holdings-list]");
    const holdings = getActiveHoldings(transactions, prices).sort(
        (a, b) => b.currentValue - a.currentValue
    );

    if (holdings.length === 0) {
        container.innerHTML =
            '<div class="br-empty-state">No active holdings yet. Add a transaction to get started.</div>';
        return;
    }

    container.innerHTML = `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Stock</th>
                        <th>Qty</th>
                        <th>Avg price</th>
                        <th>Current price</th>
                        <th>Invested</th>
                        <th>Current value</th>
                        <th>P&amp;L</th>
                        <th>Weight</th>
                    </tr>
                </thead>
                <tbody>
                    ${holdings
                        .map((h) => {
                            const weight = calculatePortfolioWeight(
                                h.symbol,
                                transactions,
                                prices
                            );

                            return `
                                <tr>
                                    <td>
                                        <div><button type="button" class="br-stock-link" data-action="open-detail" data-symbol="${escapeAttribute(h.symbol)}">${escapeHTML(h.name)}</button></div>
                                        <div class="br-muted">${escapeHTML(h.symbol)}${
                                h.isMTF
                                    ? ' <span class="br-badge br-badge-warning">MTF</span>'
                                    : ""
                            }</div>
                                    </td>
                                    <td>${h.quantity}</td>
                                    <td>${fmtMoney(h.avgPrice)}</td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            class="br-input"
                                            style="width:110px;"
                                            value="${h.currentPrice}"
                                            data-price-input="${escapeAttribute(h.symbol)}"
                                        >
                                    </td>
                                    <td>${fmtMoney(h.investedValue, true)}</td>
                                    <td>${fmtMoney(h.currentValue, true)}</td>
                                    <td class="br-pnl-${pnlClass(h.unrealizedPnL)}">
                                        ${fmtSigned(h.unrealizedPnL, true)}
                                        <div class="br-muted">${fmtPct(h.unrealizedPnLPct)}</div>
                                    </td>
                                    <td>${weight.toFixed(1)}%</td>
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>
    `;
}

/* =========================================
   TRANSACTION DETAIL
========================================= */

let txnDetailId = null;

function openTxnDetail(page, id) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return;

    txnDetailId = id;

    const isBuy = t.type === "BUY";
    const pnl = !isBuy ? getTxnPnLMap(transactions)[t.id] : undefined;
    const cell = (k, v, cls) =>
        `<div><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;

    page.querySelector("[data-txn-detail-title]").textContent =
        `${t.name} (${t.symbol})`;

    page.querySelector("[data-txn-detail-grid]").innerHTML = [
        cell("Type", escapeHTML(t.type) + (t.isMTF ? ' <span class="br-badge br-badge-warning">MTF</span>' : "")),
        cell("Date", fmtDate(t.date)),
        cell("Shares", t.quantity),
        cell("Price per share", fmtMoney(t.price)),
        cell("Total amount", fmtMoney(round2(t.quantity * t.price), true)),
        pnl !== undefined && pnl !== null
            ? cell("Realized P&L", fmtSigned(pnl, true), "br-pnl-" + pnlClass(pnl))
            : "",
        t.notes
            ? `<div style="grid-column:1/-1;"><div class="k">Notes</div><div class="v" style="font-size:13px;font-weight:500;">${escapeHTML(t.notes)}</div></div>`
            : ""
    ].join("");

    page.querySelector("[data-txn-detail-tags]").innerHTML = extractTags(t.notes)
        .map((tag) => `<span class="br-badge">#${escapeHTML(tag)}</span>`)
        .join(" ");

    page.querySelector("[data-txn-detail-modal]").hidden = false;
}

function closeTxnDetail(page) {
    txnDetailId = null;
    page.querySelector("[data-txn-detail-modal]").hidden = true;
}

/* =========================================
   SEARCH
========================================= */

function openSearch(page) {
    const input = page.querySelector("[data-search-input]");
    page.querySelector("[data-search-modal]").hidden = false;
    input.value = "";
    renderSearchResults(page, "");
    setTimeout(() => input.focus(), 30);
}

function closeSearch(page) {
    page.querySelector("[data-search-modal]").hidden = true;
}

function renderSearchResults(page, raw) {
    const box = page.querySelector("[data-search-results]");
    const term = raw.trim().toLowerCase();

    const stocks = getAllSymbols(transactions)
        .map((sym) => ({ symbol: sym, name: getSymbolName(sym, transactions) }))
        .filter(
            (x) =>
                !term ||
                x.name.toLowerCase().includes(term) ||
                x.symbol.toLowerCase().includes(term)
        )
        .slice(0, 6);

    const txns = !term
        ? []
        : transactions
              .filter(
                  (t) =>
                      t.name.toLowerCase().includes(term) ||
                      t.symbol.toLowerCase().includes(term) ||
                      (t.notes || "").toLowerCase().includes(term)
              )
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 8);

    if (!term && stocks.length === 0) {
        box.innerHTML = '<div class="br-muted">Start typing to search your stocks, transactions, notes and tags.</div>';
        return;
    }

    if (term && stocks.length === 0 && txns.length === 0) {
        box.innerHTML = `<div class="br-muted">No matches for "${escapeHTML(raw)}".</div>`;
        return;
    }

    const row = (symbol, main, sub) => `
        <div data-action="search-pick" data-symbol="${escapeAttribute(symbol)}" style="padding:8px 4px;cursor:pointer;border-bottom:1px solid var(--br-border);">
            <div>${main}</div>
            <div class="br-muted" style="font-size:12px;">${sub}</div>
        </div>`;

    let html = "";

    if (stocks.length) {
        html += '<div class="br-muted" style="margin:4px 0;">Stocks</div>';
        html += stocks.map((x) => row(x.symbol, escapeHTML(x.name), escapeHTML(x.symbol))).join("");
    }

    if (txns.length) {
        html += '<div class="br-muted" style="margin:12px 0 4px;">Transactions</div>';
        html += txns
            .map((t) =>
                row(
                    t.symbol,
                    `${escapeHTML(t.name)} (${escapeHTML(t.symbol)})`,
                    `${t.type} · ${fmtDate(t.date)} · ${t.quantity} @ ${fmtMoney(t.price)}${t.notes ? " · " + escapeHTML(t.notes) : ""}`
                )
            )
            .join("");
    }

    box.innerHTML = html;
}

/* =========================================
   ANALYTICS
========================================= */

const CHART_PALETTE = [
    "#5B9DFF", "#E3AC54", "#3ECF8E", "#B98CF0", "#F27A8A",
    "#4FD1C5", "#F0B429", "#7C93FF", "#E879B0", "#8FD14F"
];

function chartColor(i) {
    return CHART_PALETTE[i % CHART_PALETTE.length];
}

function emptyAnalytics(text) {
    return `<div class="br-empty-state">${text}</div>`;
}

function renderAnalytics(page) {
    const holdings = getActiveHoldings(transactions, prices);
    const totals = calculatePortfolioTotals(transactions, prices);
    const none = "No active holdings yet.";

    // Overall performance
    page.querySelector("[data-an-overall]").innerHTML = `
        <div class="br-grid br-grid-3">
            ${statCard("Total P&L", fmtSigned(totals.totalPnL, true) + " (" + fmtPct(totals.totalPnLPct) + ")", pnlClass(totals.totalPnL))}
            ${statCard("Already banked", fmtSigned(totals.realizedPnL, true), pnlClass(totals.realizedPnL))}
            ${statCard("If you sold today", fmtSigned(totals.unrealizedPnL, true), pnlClass(totals.unrealizedPnL))}
        </div>
    `;

    if (holdings.length === 0) {
        page.querySelector("[data-an-insights]").innerHTML = "";
        page.querySelector("[data-an-alloc]").innerHTML = emptyAnalytics(none);
        page.querySelector("[data-an-perf]").innerHTML = emptyAnalytics(none);
        page.querySelector("[data-an-health]").innerHTML = emptyAnalytics(none);
        return;
    }

    // Best / worst / biggest
    const best = holdings.slice().sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct)[0];
    const worst = holdings.slice().sort((a, b) => a.unrealizedPnLPct - b.unrealizedPnLPct)[0];
    const largest = holdings.slice().sort((a, b) => b.currentValue - a.currentValue)[0];

    const insight = (label, h, value, cls) => `
        <div class="br-card">
            <div class="br-muted">${label}</div>
            <div style="font-weight:600;margin:4px 0;">${escapeHTML(h.name)}</div>
            <div class="${cls}">${value}</div>
        </div>`;

    page.querySelector("[data-an-insights]").innerHTML =
        insight("Best performer", best, fmtPct(best.unrealizedPnLPct), "br-pnl-" + pnlClass(best.unrealizedPnLPct)) +
        insight("Worst performer", worst, fmtPct(worst.unrealizedPnLPct), "br-pnl-" + pnlClass(worst.unrealizedPnLPct)) +
        insight("Biggest holding", largest, fmtMoney(largest.currentValue, true), "");

    // Allocation: donut + rows
    const byValue = holdings.slice().sort((a, b) => b.currentValue - a.currentValue);
    const weighted = byValue.map((h) => ({
        ...h,
        weight: calculatePortfolioWeight(h.symbol, transactions, prices)
    }));

    page.querySelector("[data-an-alloc]").innerHTML = `
        <div style="display:flex;justify-content:center;position:relative;margin-bottom:16px;">
            ${buildDonut(weighted, totals.currentValue)}
        </div>
        ${weighted
            .map(
                (h, i) => `
            <div style="display:grid;grid-template-columns:90px 1fr 52px;gap:10px;align-items:center;margin:8px 0;">
                <span style="color:${chartColor(i)};font-weight:600;">${escapeHTML(h.symbol)}</span>
                <div style="height:8px;background:var(--br-border);border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${Math.min(100, h.weight)}%;background:${chartColor(i)};"></div>
                </div>
                <span style="text-align:right;">${h.weight.toFixed(1)}%</span>
            </div>`
            )
            .join("")}
    `;

    // Performance bars
    const sorted = holdings.slice().sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct);
    const maxAbs = Math.max(1, ...sorted.map((h) => Math.abs(h.unrealizedPnLPct)));

    page.querySelector("[data-an-perf]").innerHTML = sorted
        .map((h) => {
            const cls = pnlClass(h.unrealizedPnLPct);
            const w = Math.min(100, (Math.abs(h.unrealizedPnLPct) / maxAbs) * 100);
            const color = cls === "pos" ? "var(--br-success)" : "var(--br-danger)";
            return `
            <div style="display:grid;grid-template-columns:90px 1fr 70px;gap:10px;align-items:center;margin:8px 0;" title="${escapeAttribute(h.name)}">
                <span>${escapeHTML(h.symbol)}</span>
                <div style="height:8px;background:var(--br-border);border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${w}%;background:${color};"></div>
                </div>
                <span class="br-pnl-${cls}" style="text-align:right;">${fmtPct(h.unrealizedPnLPct)}</span>
            </div>`;
        })
        .join("");

    // Portfolio health
    const profitable = holdings.filter((h) => h.unrealizedPnL >= 0).length;
    const lossMaking = holdings.length - profitable;
    const largestPct = weighted[0].weight;
    const top3Pct = round2(weighted.slice(0, 3).reduce((s, h) => s + h.weight, 0));

    page.querySelector("[data-an-health]").innerHTML = `
        <div class="br-grid br-grid-3">
            ${statCard("Holdings", holdings.length)}
            ${statCard("Profitable", profitable, "pos")}
            ${statCard("Loss-making", lossMaking, lossMaking > 0 ? "neg" : "")}
            ${statCard("Largest holding", largestPct.toFixed(1) + "%")}
            ${statCard("Top 3 holdings", top3Pct.toFixed(1) + "%")}
            ${statCard("Total invested", fmtMoney(totals.investedValue, true))}
        </div>
        <p class="br-muted" style="margin-top:12px;">${escapeHTML(weighted[0].name)} makes up ${largestPct.toFixed(1)}% of your portfolio. This is informational only, not investment advice.</p>
    `;
}

function buildDonut(weighted, totalValue) {
    const size = 168, c = size / 2, r = 58, sw = 24;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    const arcs = weighted
        .map((h, i) => {
            const dash = (Math.max(0, Math.min(100, h.weight)) / 100) * circ;
            const arc = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${chartColor(i)}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${Math.max(circ - dash, 0).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"></circle>`;
            offset += dash;
            return arc;
        })
        .join("");

    return `<div style="position:relative;width:${size}px;height:${size}px;">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Portfolio allocation by holding">
            <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--br-border)" stroke-width="${sw}"></circle>
            ${arcs}
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
            <span class="br-muted" style="font-size:11px;">Total value</span>
            <span style="font-weight:600;">${fmtMoney(totalValue, true)}</span>
        </div>
    </div>`;
}

/* =========================================
   TRANSACTIONS
========================================= */

function getFilteredTransactions(page) {
    const search = (
        page.querySelector("[data-txn-search]")?.value || ""
    )
        .trim()
        .toLowerCase();
    const typeFilter =
        page.querySelector("[data-txn-filter-type]")?.value || "";
    const tagFilter =
        page.querySelector("[data-txn-filter-tag]")?.value || "";

    return transactions
        .filter((t) => {
            if (typeFilter && t.type !== typeFilter) return false;
            if (
                tagFilter &&
                !extractTags(t.notes).includes(tagFilter)
            )
                return false;
            if (search) {
                const haystack = `${t.name} ${t.symbol} ${
                    t.notes || ""
                }`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        })
        .slice()
        .sort((a, b) =>
            a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1
        );
}

function renderTransactions(page) {
    const tbody = page.querySelector("[data-txn-table] tbody");
    const pnlMap = getTxnPnLMap(transactions);
    const list = getFilteredTransactions(page);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="br-empty-state">No transactions match.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = list
        .map((t) => {
            const pnl = t.type === "SELL" ? pnlMap[t.id] : undefined;

            return `
                <tr data-action="view-txn" data-id="${t.id}" style="cursor:pointer;">
                    <td>${escapeHTML(t.date)}</td>
                    <td>
                        <span class="br-badge ${
                            t.type === "BUY"
                                ? "br-badge-success"
                                : "br-badge-danger"
                        }">${t.type}</span>
                        ${t.isMTF ? '<span class="br-badge br-badge-warning">MTF</span>' : ""}
                    </td>
                    <td>
                        <div>${escapeHTML(t.name)}</div>
                        <div class="br-muted">${escapeHTML(t.symbol)}</div>
                    </td>
                    <td>${t.quantity}</td>
                    <td>${fmtMoney(t.price)}</td>
                    <td>${fmtMoney(round2(t.quantity * t.price), true)}</td>
                    <td class="${
                        pnl !== undefined ? "br-pnl-" + pnlClass(pnl) : ""
                    }">${pnl !== undefined ? fmtSigned(pnl, true) : "—"}</td>
                    <td>
                        <button type="button" class="br-button" data-action="edit-txn" data-id="${t.id}">Edit</button>
                        <button type="button" class="br-button" data-action="duplicate-txn" data-id="${t.id}">Duplicate</button>
                        <button type="button" class="br-button br-button-danger" data-action="delete-txn" data-id="${t.id}">Delete</button>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function renderTagFilter(page) {
    const select = page.querySelector("[data-txn-filter-tag]");
    const current = select.value;
    const tags = getAllTags(transactions);

    select.innerHTML =
        '<option value="">All tags</option>' +
        tags
            .map(
                (tag) =>
                    `<option value="${escapeAttribute(tag)}">#${escapeHTML(tag)}</option>`
            )
            .join("");

    select.value = current;
}

/* =========================================
   REPORTS
========================================= */

function renderReports(page) {
    const select = page.querySelector("[data-report-month]");
    const months = getAvailableMonths(transactions);
    const current = select.value;

    select.innerHTML =
        '<option value="all">All time</option>' +
        months
            .map((m) => `<option value="${m}">${m}</option>`)
            .join("");

    select.value = months.includes(current) ? current : "all";

    renderReportSummary(page, select.value);
}

function renderReportSummary(page, ym) {
    const summary =
        ym === "all"
            ? calculateAllTimeSummary(transactions, prices)
            : calculateMonthlySummary(ym, transactions, prices);

    const el = page.querySelector("[data-report-summary]");

    el.innerHTML = `
        ${statCard("Invested", fmtMoney(summary.invested, true))}
        ${statCard("Withdrawn", fmtMoney(summary.withdrawn, true))}
        ${statCard(
            "Realized P&L",
            fmtSigned(summary.realizedPnLThisMonth, true),
            pnlClass(summary.realizedPnLThisMonth)
        )}
        ${statCard("Transactions", String(summary.transactionCount))}
    `;
}

/* =========================================
   TRANSACTION MODAL
========================================= */

function openTxnModal(page, id, duplicate) {
    const modal = page.querySelector("[data-txn-modal]");
    const form = page.querySelector("[data-txn-form]");
    const errorEl = page.querySelector("[data-txn-error]");

    errorEl.style.display = "none";
    form.reset();
    // A duplicate is saved as a brand-new transaction through the
    // normal validated save path, so it never carries the source id.
    editingTxnId = id && !duplicate ? id : null;

    if (id) {
        const t = transactions.find((x) => x.id === id);
        if (!t) return;

        page.querySelector("[data-txn-modal-title]").textContent =
            duplicate ? "Duplicate transaction" : "Edit transaction";
        form.type.value = t.type;
        form.date.value = duplicate
            ? new Date().toISOString().slice(0, 10)
            : t.date;
        form.name.value = t.name;
        form.symbol.value = t.symbol;
        form.quantity.value = t.quantity;
        form.price.value = t.price;
        form.notes.value = t.notes || "";
        form.isMTF.checked = !!t.isMTF;
    } else {
        page.querySelector("[data-txn-modal-title]").textContent =
            "Add transaction";
        form.type.value = "BUY";
        form.date.value = new Date().toISOString().slice(0, 10);
    }

    modal.hidden = false;
}
function closeTxnModal(page) {
    page.querySelector("[data-txn-modal]").hidden = true;
    editingTxnId = null;
}

async function saveTxn(page) {
    const form = page.querySelector("[data-txn-form]");
    const errorEl = page.querySelector("[data-txn-error]");

    const type = form.type.value;
    const date = form.date.value;
    const name = form.name.value.trim();
    const symbol = form.symbol.value.trim().toUpperCase();
    const quantity = Number(form.quantity.value);
    const price = Number(form.price.value);
    const notes = form.notes.value.trim();
    const isMTF = form.isMTF.checked;

    if (
        !date ||
        !name ||
        !symbol ||
        !quantity ||
        quantity <= 0 ||
        isNaN(price) ||
        price < 0
    ) {
        errorEl.textContent =
            "Fill in date, stock name, symbol, a positive quantity, and a valid price.";
        errorEl.style.display = "block";
        return;
    }

    const id = editingTxnId;
    const existing = id
        ? transactions.find((t) => t.id === id)
        : null;

    const candidate = {
        id: id || genId(),
        seq: id ? existing.seq : ++seqCounter,
        date,
        type,
        symbol,
        name,
        quantity,
        price,
        notes,
        isMTF
    };

    const check = validateTransaction(candidate, id, transactions);
    if (!check.ok) {
        errorEl.textContent = `You don't have that many shares to sell — you only hold ${check.available}.`;
        errorEl.style.display = "block";
        return;
    }

    if (id) {
        const idx = transactions.findIndex((t) => t.id === id);
        transactions[idx] = candidate;
    } else {
        transactions.push(candidate);
    }

    await persist();
    closeTxnModal(page);
    renderAll(page);
}

/* =========================================
   DELETE
========================================= */

let pendingDeleteId = null;

function openDeleteModal(page, id) {
    pendingDeleteId = id;
    page.querySelector("[data-delete-modal]").hidden = false;
}

function closeDeleteModal(page) {
    pendingDeleteId = null;
    page.querySelector("[data-delete-modal]").hidden = true;
}

async function confirmDelete(page) {
    if (!pendingDeleteId) return;

    transactions = transactions.filter(
        (t) => t.id !== pendingDeleteId
    );

    await persist();
    closeDeleteModal(page);
    renderAll(page);
}

async function confirmClear(page) {
    const errorEl = page.querySelector("[data-clear-error]");

    if (isGuestSync()) {
        errorEl.textContent = "Sign in to clear data \u2014 guest mode is view-only.";
        errorEl.style.display = "block";
        return;
    }

    transactions = [];
    prices = {};
    seqCounter = 0;

    try {
        await persist();
    } catch (err) {
        errorEl.textContent = err?.message || "Could not clear data.";
        errorEl.style.display = "block";
        return;
    }

    page.querySelector("[data-clear-modal]").hidden = true;
    renderAll(page);
}

/* =========================================
   EXPORT CSV (transactions report)
   Full backup / restore lives in Data Management.
========================================= */

function exportCSV() {
    if (transactions.length === 0) return;

    const csv = transactionsToCSV(transactions);
    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);

    a.href = url;
    a.download = `stocks-transactions-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/* =========================================
   STOCK DETAIL
========================================= */

let chartRequest = 0;

function openDetail(page, symbol) {
    detailSymbol = symbol;
    page.querySelector("[data-detail-modal]").hidden = false;
    renderDetail(page);
    loadDetailChart(page, symbol);
}

function closeDetail(page) {
    detailSymbol = null;
    chartRequest++;
    page.querySelector("[data-detail-modal]").hidden = true;
}

function renderDetail(page) {
    if (!detailSymbol) return;

    const h = calculateStockHolding(detailSymbol, transactions, prices);
    const cell = (k, v, cls) =>
        `<div><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;

    page.querySelector("[data-detail-title]").textContent =
        `${h.name} (${h.symbol})`;

    page.querySelector("[data-detail-grid]").innerHTML = [
        cell("Shares you own", h.quantity),
        cell("Average price paid", fmtMoney(h.avgPrice)),
        cell("Current price", fmtMoney(h.currentPrice)),
        cell("Share of portfolio", calculatePortfolioWeight(h.symbol, transactions, prices).toFixed(1) + "%"),
        cell("Invested", fmtMoney(h.investedValue, true)),
        cell("Worth now", fmtMoney(h.currentValue, true)),
        cell("Unrealized P&L", fmtSigned(h.unrealizedPnL, true), "br-pnl-" + pnlClass(h.unrealizedPnL)),
        cell("Growth", fmtPct(h.unrealizedPnLPct), "br-pnl-" + pnlClass(h.unrealizedPnLPct)),
        cell("Bought in total", h.totalBuyQty),
        cell("Sold in total", h.totalSellQty),
        cell("Realized P&L", fmtSigned(h.realizedPnL, true), "br-pnl-" + pnlClass(h.realizedPnL))
    ].join("");

    const priceInput = page.querySelector("[data-detail-price]");
    if (document.activeElement !== priceInput) {
        priceInput.value = h.currentPrice;
    }

    page.querySelector("[data-detail-txns]").innerHTML =
        getSymbolTransactions(detailSymbol, transactions)
            .slice()
            .reverse()
            .map(
                (t) => `
                <tr>
                    <td>${fmtDate(t.date)}</td>
                    <td><span class="br-badge ${t.type === "BUY" ? "br-badge-success" : "br-badge-danger"}">${t.type}</span></td>
                    <td>${t.quantity}</td>
                    <td>${fmtMoney(t.price)}</td>
                </tr>`
            )
            .join("");
}

async function loadDetailChart(page, symbol) {
    const box = page.querySelector("[data-detail-chart]");
    const tip = page.querySelector("[data-detail-tip]");
    const req = ++chartRequest;

    tip.textContent = "";
    box.innerHTML = '<div class="br-muted">Loading price history…</div>';

    const txns = getSymbolTransactions(symbol, transactions);
    const buyDate = txns.length ? txns[0].date : null;

    try {
        const data = await fetchChartHistory(symbol);
        if (req !== chartRequest) return;

        const full = Array.isArray(data.history) ? data.history : [];
        let history = full;

        if (buyDate) {
            const clipped = full.filter((p) => p.date >= buyDate);
            if (clipped.length >= 2) history = clipped;
        }

        if (history.length < 2) {
            box.innerHTML = `<div class="br-muted">Not enough price history available yet for ${escapeHTML(symbol)}.</div>`;
            return;
        }

        box.innerHTML = buildChart(history, buyDate);

        if (full.length && buyDate && full[0].date > buyDate) {
            tip.textContent = `Source data starts ${fmtDate(full[0].date)}.`;
        }

        const svg = box.querySelector("svg");
        svg.addEventListener("mousemove", (e) => {
            const r = svg.getBoundingClientRect();
            const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            const p = history[Math.round(frac * (history.length - 1))];
            tip.textContent = `${fmtDate(p.date)} — ${fmtMoney(p.close)}`;
        });
    } catch (err) {
        if (req !== chartRequest) return;
        box.innerHTML = `<div class="br-muted">Couldn't load price history (${escapeHTML(err.message)}).</div>`;
    }
}

function buildChart(history, buyDate) {
    const w = 600, h = 220, padL = 54, padR = 12, padT = 14, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const n = history.length;
    const closes = history.map((p) => p.close);

    let min = Math.min(...closes), max = Math.max(...closes);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.1;
    min -= pad; max += pad;

    const x = (i) => padL + (i / (n - 1)) * plotW;
    const y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

    const up = closes[n - 1] >= closes[0];
    const color = up ? "var(--br-success)" : "var(--br-danger)";
    const pts = history.map((p, i) => `${x(i).toFixed(2)},${y(p.close).toFixed(2)}`);

    let marker = "";
    if (buyDate && buyDate >= history[0].date && buyDate <= history[n - 1].date) {
        let idx = history.findIndex((p) => p.date >= buyDate);
        if (idx === -1) idx = 0;
        marker = `<line x1="${x(idx).toFixed(2)}" x2="${x(idx).toFixed(2)}" y1="${padT}" y2="${padT + plotH}" class="br-chart-buy-line"></line>
                  <circle cx="${x(idx).toFixed(2)}" cy="${y(history[idx].close).toFixed(2)}" r="4.5" class="br-chart-buy-dot"></circle>`;
    }

    const yTicks = [max - (max - min) * 0.05, (max + min) / 2, min + (max - min) * 0.05];
    const xTicks = [0, Math.floor((n - 1) / 2), n - 1];

    return `<svg viewBox="0 0 ${w} ${h}" class="br-price-chart" preserveAspectRatio="none" role="img" aria-label="Price chart">
        ${yTicks.map((v) => `<line x1="${padL}" x2="${w - padR}" y1="${y(v).toFixed(2)}" y2="${y(v).toFixed(2)}" class="br-chart-grid"></line>`).join("")}
        <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"></polyline>
        ${marker}
        ${yTicks.map((v) => `<text x="2" y="${(y(v) + 4).toFixed(2)}" class="br-chart-label">${fmtMoney(v, true)}</text>`).join("")}
        ${xTicks.map((i) => `<text x="${x(i).toFixed(2)}" y="${h - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" class="br-chart-label">${fmtDate(history[i].date).replace(/\s\d{4}$/, "")}</text>`).join("")}
    </svg>${marker ? `<div class="br-muted" style="font-size:12px;">Bought ${fmtDate(buyDate)}</div>` : ""}`;
}

/* =========================================
   TABS
========================================= */

function switchTab(page, tab) {
    currentTab = tab;

    page.querySelectorAll("[data-stocks-tab]").forEach((btn) => {
        btn.classList.toggle(
            "active",
            btn.dataset.stocksTab === tab
        );
    });

    page.querySelectorAll("[data-stocks-view]").forEach((view) => {
        view.hidden = view.dataset.stocksView !== tab;
    });
}

/* =========================================
   EVENTS
========================================= */

function attachEvents(page) {
    page.addEventListener("click", async (event) => {
        const tabBtn = event.target.closest("[data-stocks-tab]");
        if (tabBtn) {
            switchTab(page, tabBtn.dataset.stocksTab);
            return;
        }

        const actionEl = event.target.closest("[data-action]");
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === "add-txn") {
            openTxnModal(page);
        } else if (action === "edit-txn") {
            openTxnModal(page, actionEl.dataset.id);
        } else if (action === "delete-txn") {
            openDeleteModal(page, actionEl.dataset.id);
        } else if (action === "close-txn-modal") {
            closeTxnModal(page);
        } else if (action === "cancel-delete") {
            closeDeleteModal(page);
        } else if (action === "confirm-delete") {
            await confirmDelete(page);
        } else if (action === "print-report") {
            const ym = page.querySelector("[data-report-month]").value;
            if (!transactions.length) return;
            printStocksReport(ym, transactions, prices);
        } else if (action === "clear-data") {
            page.querySelector("[data-clear-error]").style.display = "none";
            page.querySelector("[data-clear-modal]").hidden = false;
        } else if (action === "cancel-clear") {
            page.querySelector("[data-clear-modal]").hidden = true;
        } else if (action === "confirm-clear") {
            await confirmClear(page);
        } else if (action === "open-data") {
            navigate("/data");
        } else if (action === "export-csv") {
            exportCSV();
        } else if (action === "view-txn") {
            openTxnDetail(page, actionEl.dataset.id);
        } else if (action === "duplicate-txn") {
            openTxnModal(page, actionEl.dataset.id, true);
        } else if (action === "close-txn-detail") {
            closeTxnDetail(page);
        } else if (action === "txn-detail-edit") {
            const id = txnDetailId;
            closeTxnDetail(page);
            if (id) openTxnModal(page, id);
        } else if (action === "txn-detail-duplicate") {
            const id = txnDetailId;
            closeTxnDetail(page);
            if (id) openTxnModal(page, id, true);
        } else if (action === "txn-detail-delete") {
            const id = txnDetailId;
            closeTxnDetail(page);
            if (id) openDeleteModal(page, id);
        } else if (action === "open-search") {
            openSearch(page);
        } else if (action === "close-search") {
            closeSearch(page);
        } else if (action === "search-pick") {
            const symbol = actionEl.dataset.symbol;
            closeSearch(page);
            switchTab(page, "holdings");
            openDetail(page, symbol);
        } else if (action === "open-detail") {
            openDetail(page, actionEl.dataset.symbol);
        } else if (action === "close-detail") {
            closeDetail(page);
        } else if (action === "refresh-prices") {
            await refreshPrices(page, false);
        }
    });

    page.addEventListener("submit", async (event) => {
        if (event.target.matches("[data-txn-form]")) {
            event.preventDefault();
            await saveTxn(page);
        }
    });

    page.addEventListener("input", (event) => {
        if (event.target.matches("[data-search-input]")) {
            renderSearchResults(page, event.target.value);
            return;
        }

        if (
            event.target.matches(
                "[data-txn-search], [data-txn-filter-type], [data-txn-filter-tag]"
            )
        ) {
            renderTransactions(page);
        }
    });

    page.addEventListener("change", async (event) => {
        if (event.target.matches("[data-detail-price]") && detailSymbol) {
            const val = Number(event.target.value);
            if (isNaN(val) || val < 0) return;

            prices[detailSymbol] = val;
            await persist();
            renderAll(page);
            renderDetail(page);
            return;
        }

        if (event.target.matches("[data-price-input]")) {
            const symbol = event.target.dataset.priceInput;
            const val = Number(event.target.value);
            if (isNaN(val) || val < 0) return;

            prices[symbol] = val;
            await persist();
            renderAll(page);
        }

        if (
            event.target.matches(
                "[data-txn-filter-type], [data-txn-filter-tag]"
            )
        ) {
            renderTransactions(page);
        }

        if (event.target.matches("[data-report-month]")) {
            renderReportSummary(page, event.target.value);
        }
    });

    page.querySelector("[data-txn-modal]").addEventListener(
        "click",
        (event) => {
            if (event.target === event.currentTarget) {
                closeTxnModal(page);
            }
        }
    );

    ["[data-txn-detail-modal]", "[data-search-modal]", "[data-clear-modal]"].forEach((sel) => {
        page.querySelector(sel).addEventListener("click", (event) => {
            if (event.target !== event.currentTarget) return;
            if (sel === "[data-search-modal]") closeSearch(page);
            else if (sel === "[data-clear-modal]") page.querySelector("[data-clear-modal]").hidden = true;
            else closeTxnDetail(page);
        });
    });

    // Ctrl/Cmd+K -> search, Esc -> close the top open modal.
    // Removes itself once the page has been replaced by another route.
    const onKey = (event) => {
        if (!page.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            openSearch(page);
            return;
        }

        if (event.key === "Escape") {
            const open = page.querySelector(".br-modal-layer:not([hidden])");
            if (!open) return;
            if (open.hasAttribute("data-search-modal")) closeSearch(page);
            else if (open.hasAttribute("data-txn-detail-modal")) closeTxnDetail(page);
            else if (open.hasAttribute("data-detail-modal")) closeDetail(page);
            else if (open.hasAttribute("data-delete-modal")) closeDeleteModal(page);
            else if (open.hasAttribute("data-clear-modal")) open.hidden = true;
            else closeTxnModal(page);
        }
    };
    document.addEventListener("keydown", onKey);

    page.querySelector("[data-detail-modal]").addEventListener(
        "click",
        (event) => {
            if (event.target === event.currentTarget) {
                closeDetail(page);
            }
        }
    );

    page.querySelector("[data-delete-modal]").addEventListener(
        "click",
        (event) => {
            if (event.target === event.currentTarget) {
                closeDeleteModal(page);
            }
        }
    );
}

/* =========================================
   ESCAPING
========================================= */

function escapeHTML(s) {
    return String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c])
    );
}

function escapeAttribute(s) {
    return escapeHTML(s);
}
