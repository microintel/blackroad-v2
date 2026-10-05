import { icon } from "../../components/icons.js";
import { SERIES } from "../../components/chart-colors.js";
import { tipAttr } from "../../components/chart-tooltip.js";
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
    getSymbolName,
    mtfSplit
} from "./stocks-service.js";

import { printStocksReport } from "./stocks-print.js";
import { isGuestSync } from "../../services/auth.js";
import { fetchLTP, fetchLTPs, fetchChartHistory, LIVE_PRICE_POLL_MS, stockLogoUrl } from "./stocks-live.js";

/* Stock logo from the symbol. If the image fails to load, the
   capture-phase error handler below swaps it for the symbol's initials. */
function stockLogoHTML(symbol, size) {
    const sym = String(symbol || "");
    return `<span class="stk-logo stk-logo-${size}" data-initials="${escapeAttribute(sym.slice(0, 2).toUpperCase())}"><img src="${escapeAttribute(stockLogoUrl(sym))}" alt="${escapeAttribute(sym)} logo" loading="lazy" decoding="async" data-stk-logo></span>`;
}

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
let holdingFilter = "all";
let flashSymbol = null;
let flashTxnId = null;
let saving = false;

export async function Stocks() {
    store = await dataService.getStocksStore();

    const page = document.createElement("section");
    page.className = "br-page br-income br-stocks";

    page.innerHTML = `

        <div class="br-income-tabs" role="group" aria-label="Stocks views">
            <button type="button" class="br-income-tab active" data-stocks-tab="holdings">Holdings <span class="stk-count" data-count="holdings"></span></button>
            <button type="button" class="br-income-tab" data-stocks-tab="transactions">Transactions <span class="stk-count" data-count="transactions"></span></button>
            <button type="button" class="br-income-tab" data-stocks-tab="analytics">Analytics</button>
            <button type="button" class="br-income-tab" data-stocks-tab="reports">Reports</button>
        </div>

        <!-- SUMMARY -->
        <section class="inc-summary" aria-label="Portfolio summary">
            <div class="inc-metric inc-metric-primary">
                <span class="inc-label">Current value</span>
                <div class="inc-total-row">
                    <strong class="inc-amount inc-amount-lg" data-sum-value>${fmtMoney(0, true)}</strong>
                    <div class="stk-actions">
                        <button type="button" class="br-button stk-icon-btn" data-action="open-search" aria-label="Search" title="Search (Ctrl+K)">${icon("search", { size: 18 })}</button>
                        <button type="button" class="br-button stk-icon-btn" data-action="refresh-prices" aria-label="Refresh prices" title="Refresh prices">${icon("refresh-cw", { size: 18 })}</button>
                        <button type="button" class="br-button br-button-primary inc-add" data-action="add-txn" aria-label="Add transaction" title="Add transaction">${icon("plus", { size: 18 })}</button>
                    </div>
                </div>
                <span class="inc-hint" data-live-status>Your equity portfolio</span>
            </div>
            <div class="inc-metrics" data-stocks-summary></div>
        </section>

        <!-- HOLDINGS -->
        <div class="inc-view" data-stocks-view="holdings">
            <section class="stk-mtf" data-mtf-summary hidden></section>

            <section class="inc-section">
                <div class="inc-section-head">
                    <div>
                        <h3>Active holdings</h3>
                        <p>Stocks you currently hold, valued at the last known price.</p>
                    </div>
                    <div class="br-chip-row" data-hold-filters role="group" aria-label="Filter holdings" hidden>
                        <button type="button" class="br-chip active" data-action="hold-filter" data-filter="all">All</button>
                        <button type="button" class="br-chip" data-action="hold-filter" data-filter="mtf">MTF</button>
                        <button type="button" class="br-chip" data-action="hold-filter" data-filter="own">My money only</button>
                    </div>
                </div>
                <div data-holdings-list></div>
            </section>
        </div>

                <!-- TRANSACTIONS -->
        <div data-stocks-view="transactions" hidden>
            <section class="br-card">
                <div class="br-toolbar">
                    <div class="br-toolbar-left">
                        <div class="br-search-box">
                            <span class="br-search-icon">${icon("search", { size: 16 })}</span>
                            <input type="search" placeholder="Search stock, symbol or notes..." data-txn-search>
                        </div>

                        <select class="br-select" data-txn-filter-type>
                            <option value="">All types</option>
                            <option value="BUY">Buy</option>
                            <option value="SELL">Sell</option>
                            <option value="MTF">MTF buys</option>
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
            <div class="br-grid br-grid-3" data-an-insights></div>

            <section class="br-card">
                <div class="br-card-heading"><h3>How you're doing overall</h3></div>
                <div data-an-overall></div>
            </section>

            <div class="br-grid br-grid-2">
                <section class="br-card">
                    <div class="br-card-heading"><h3>Where your money is spread</h3></div>
                    <div data-an-alloc></div>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>How each stock is doing</h3></div>
                    <div data-an-perf></div>
                </section>
            </div>

            <section class="br-card">
                <div class="br-card-heading"><h3>Portfolio health</h3></div>
                <div data-an-health></div>
            </section>
        </div>

        <div data-stocks-view="reports" hidden>
            <section class="br-card">
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

            <section class="br-card">
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
            <div class="br-modal" role="dialog" aria-modal="true" aria-labelledby="stk-txn-title">
                <div class="br-modal-header">
                    <div>
                        <h3 id="stk-txn-title" data-txn-modal-title>Add transaction</h3>
                        <p class="br-muted">Stored in the existing BlackRoad stocks ledger.</p>
                    </div>
                    <button type="button" class="br-modal-close" data-action="close-txn-modal" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
                </div>

                <form data-txn-form novalidate>
                    <div class="inc-form-error" data-txn-error role="alert" hidden></div>

                    <!-- Live logo + LTP for the typed symbol -->
                    <div class="stk-sym-preview" data-sym-preview hidden>
                        <span data-sym-logo></span>
                        <div class="stk-sym-info">
                            <strong data-sym-title></strong>
                            <span class="br-muted" data-sym-ltp></span>
                        </div>
                        <button type="button" class="br-button" data-action="use-ltp" data-sym-use hidden>Use price</button>
                    </div>

                    <div class="inc-fields">
                        ${fieldHTML("Type", `<select name="type" data-txn-type><option value="BUY">Buy</option><option value="SELL">Sell</option></select>`)}
                        ${fieldHTML("Date", `<input name="date" type="date" required>`)}
                        ${fieldHTML("Symbol", `<input name="symbol" type="text" list="stk-symbols" placeholder="RELIANCE" autocomplete="off" autocapitalize="characters" required><datalist id="stk-symbols" data-symbol-list></datalist>`)}
                        ${fieldHTML("Stock name", `<input name="name" type="text" placeholder="Reliance Industries" autocomplete="off" required>`)}
                        ${fieldHTML("Quantity", `<input name="quantity" type="number" inputmode="decimal" step="0.000001" min="0" placeholder="0" required><span class="inc-hint" data-qty-hint></span>`)}
                        ${fieldHTML("Price per share", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></span>`)}
                        ${fieldHTML("Notes (#tags supported)", `<input name="notes" type="text" autocomplete="off">`, "stk-span-2")}
                    </div>

                    <div class="stk-total" data-txn-total></div>

                    <!-- MTF: "my amount" + broker-funded part -->
                    <div class="inc-modal-section stk-mtf-box" data-mtf-box>
                        <label class="stk-switch">
                            <input name="isMTF" type="checkbox">
                            <span class="stk-switch-ui" aria-hidden="true"></span>
                            <span class="stk-switch-text">
                                <strong>Bought with MTF</strong>
                                <small>The broker funds part of the trade. You pay only your margin.</small>
                            </span>
                        </label>

                        <div class="stk-mtf-fields" data-mtf-fields hidden>
                            <input type="hidden" name="mtfMode" value="amount">
                            <div class="stk-seg" role="group" aria-label="Enter margin as">
                                <button type="button" class="active" data-action="mtf-mode" data-mode="amount">My amount (₹)</button>
                                <button type="button" data-action="mtf-mode" data-mode="percent">Margin (%)</button>
                            </div>

                            ${fieldHTML("<span data-mtf-label>My amount (paid from my funds)</span>", `<input name="mtfValue" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">`)}

                            <div class="stk-preview" data-mtf-preview></div>
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
                    <button type="button" class="br-modal-close" data-action="close-txn-detail" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
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
                    <button type="button" class="br-modal-close" data-action="close-search" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
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
                    <div class="stk-detail-head">
                        <span data-detail-logo></span>
                        <div>
                            <h3 data-detail-title>Stock detail</h3>
                            <p class="br-muted">Everything about this one holding.</p>
                        </div>
                    </div>
                    <button type="button" class="br-modal-close" data-action="close-detail" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
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

                    <h4>Every buy and sell</h4>
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
            // Guests are read-only: show the live prices but don't write them to the DB.
            if (!isGuestSync()) await persist();

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
    renderSymbolList(page);
    updateCounts(page);
    flashTxnId = null;
    flashSymbol = null;
}

function renderSymbolList(page) {
    page.querySelector("[data-symbol-list]").innerHTML = getAllSymbols(transactions)
        .map((sym) => `<option value="${escapeAttribute(sym)}">${escapeHTML(getSymbolName(sym, transactions))}</option>`)
        .join("");
}

function updateCounts(page) {
    const set = (key, n) => {
        const el = page.querySelector(`[data-count="${key}"]`);
        if (el) el.textContent = n > 0 ? n : "";
    };
    set("holdings", getActiveHoldings(transactions, prices).length);
    set("transactions", transactions.length);
}

/* =========================================
   SUMMARY
========================================= */

function renderSummary(page) {
    const totals = calculatePortfolioTotals(transactions, prices);

    const value = page.querySelector("[data-sum-value]");
    if (value) value.textContent = fmtMoney(totals.currentValue, true);

    const metric = (label, val, hint, tone) => `
        <div class="inc-metric">
            <span class="inc-label">${label}</span>
            <strong class="inc-amount${tone ? " br-pnl-" + tone : ""}">${val}</strong>
            <span class="inc-hint">${hint}</span>
        </div>`;

    page.querySelector("[data-stocks-summary]").innerHTML =
        metric(
            "Invested",
            fmtMoney(totals.investedValue, true),
            totals.hasMTF
                ? `Mine ${fmtMoney(totals.ownInvested, true)} + MTF ${fmtMoney(totals.fundedInvested, true)}`
                : "Cost of open holdings"
        ) +
        metric("Unrealized P&amp;L", fmtSigned(totals.unrealizedPnL, true), fmtPct(totals.unrealizedPnLPct), pnlClass(totals.unrealizedPnL)) +
        metric("Realized P&amp;L", fmtSigned(totals.realizedPnL, true), "Booked from sales", pnlClass(totals.realizedPnL)) +
        metric("Total P&amp;L", fmtSigned(totals.totalPnL, true), fmtPct(totals.totalPnLPct), pnlClass(totals.totalPnL));

    renderMtfSummary(page, totals);
}

// "My amount" vs "MTF funded" side by side
function splitBar(own, funded) {
    const total = own + funded;
    const ownPct = total > 0 ? Math.max(0, Math.min(100, (own / total) * 100)) : 100;
    return `<div class="stk-split" role="img" aria-label="My amount ${ownPct.toFixed(0)}%, MTF funded ${(100 - ownPct).toFixed(0)}%">
        <span class="stk-split-own" style="width:${ownPct.toFixed(2)}%"></span>
        <span class="stk-split-mtf" style="width:${(100 - ownPct).toFixed(2)}%"></span>
    </div>`;
}

function renderMtfSummary(page, totals) {
    const box = page.querySelector("[data-mtf-summary]");

    if (!totals.hasMTF) {
        box.hidden = true;
        box.innerHTML = "";
        return;
    }

    const m = (label, val, hint, tone) => `
        <div class="inc-metric">
            <span class="inc-label">${label}</span>
            <strong class="inc-amount${tone ? " br-pnl-" + tone : ""}">${val}</strong>
            <span class="inc-hint">${hint}</span>
        </div>`;

    box.hidden = false;
    box.innerHTML = `
        <div class="inc-section-head">
            <div>
                <h3>MTF position</h3>
                <p>Your own money and the broker-funded part, kept apart.</p>
            </div>
        </div>
        ${splitBar(totals.ownInvested, totals.fundedInvested)}
        <div class="stk-split-legend">
            <span><i class="own"></i>My amount</span>
            <span><i class="mtf"></i>MTF funded</span>
        </div>
        <div class="stk-mtf-metrics">
            ${m("My amount", fmtMoney(totals.ownInvested, true), "Paid from my funds")}
            ${m("MTF funded", fmtMoney(totals.fundedInvested, true), "Funded by the broker")}
            ${m("Leverage", totals.leverage.toFixed(2) + "×", "Position ÷ my amount")}
            ${m("Net equity", fmtMoney(totals.netEquity, true), "Value after repaying MTF")}
            ${m("Return on my amount", fmtPct(totals.returnOnOwnPct), "Unrealized P&amp;L ÷ my amount", pnlClass(totals.returnOnOwnPct))}
        </div>
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
    const all = getActiveHoldings(transactions, prices).sort(
        (a, b) => b.currentValue - a.currentValue
    );

    // The MTF filter only matters once an MTF holding exists
    const anyMtf = all.some((h) => h.isMTF);
    const filters = page.querySelector("[data-hold-filters]");
    filters.hidden = !anyMtf;
    if (!anyMtf) holdingFilter = "all";
    filters.querySelectorAll("[data-filter]").forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === holdingFilter)
    );

    const holdings = all.filter((h) =>
        holdingFilter === "mtf" ? h.isMTF : holdingFilter === "own" ? !h.isMTF : true
    );

    if (all.length === 0) {
        container.innerHTML = `
            <div class="inc-empty">
                ${icon("chart-candlestick", { size: 22 })}
                <h4>No active holdings yet</h4>
                <p>Add your first buy and your portfolio, P&amp;L and allocation will appear here.</p>
                <button type="button" class="br-button br-button-primary" data-action="add-txn">${icon("plus", { size: 18 })} Add transaction</button>
            </div>`;
        return;
    }

    if (holdings.length === 0) {
        container.innerHTML = `<div class="inc-empty"><h4>No holdings in this filter</h4><p>Switch to “All” to see everything.</p></div>`;
        return;
    }

    const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;

    container.innerHTML = `<div class="stk-list">${holdings
        .map((h) => {
            const weight = calculatePortfolioWeight(h.symbol, transactions, prices);

            const badge = h.hasMargin
                ? `<span class="br-badge br-badge-warning">MTF ${h.leverage.toFixed(1)}×</span>`
                : h.isMTF
                ? `<span class="br-badge br-badge-warning" title="Margin not recorded — edit the MTF buy to add it">MTF · margin not set</span>`
                : "";

            const mtfBlock = h.hasMargin
                ? `<div class="stk-card-mtf">
                        ${splitBar(h.ownInvested, h.fundedInvested)}
                        <div class="stk-card-mtf-line">
                            <span><i class="own"></i>Mine <strong>${fmtMoney(h.ownInvested, true)}</strong></span>
                            <span><i class="mtf"></i>MTF <strong>${fmtMoney(h.fundedInvested, true)}</strong></span>
                            <span>Net equity <strong>${fmtMoney(h.netEquity, true)}</strong></span>
                            <span>On my amount <strong class="br-pnl-${pnlClass(h.returnOnOwnPct)}">${fmtPct(h.returnOnOwnPct)}</strong></span>
                        </div>
                   </div>`
                : "";

            return `
                <article class="inc-entry stk-card${h.symbol === flashSymbol ? " stk-flash" : ""}">
                    <div class="stk-card-top">
                        ${stockLogoHTML(h.symbol, "lg")}
                        <div class="stk-id">
                            <button type="button" class="br-stock-link stk-name" data-action="open-detail" data-symbol="${escapeAttribute(h.symbol)}">${escapeHTML(h.name)}</button>
                            <div class="inc-meta">${escapeHTML(h.symbol)} ${badge}</div>
                        </div>
                        <div class="stk-value">
                            <strong>${fmtMoney(h.currentValue, true)}</strong>
                            <span class="br-pnl-${pnlClass(h.unrealizedPnL)}">${fmtSigned(h.unrealizedPnL, true)} · ${fmtPct(h.unrealizedPnLPct)}</span>
                        </div>
                    </div>
                    <dl class="stk-stats">
                        ${stat("Qty", h.quantity)}
                        ${stat("Avg price", fmtMoney(h.avgPrice))}
                        ${stat("Invested", fmtMoney(h.investedValue, true))}
                        ${stat("Weight", weight.toFixed(1) + "%")}
                        <div class="stk-price">
                            <dt>Current price</dt>
                            <dd><input type="number" inputmode="decimal" step="0.01" min="0" class="br-input" value="${h.currentPrice}" aria-label="Current price of ${escapeAttribute(h.symbol)}" data-price-input="${escapeAttribute(h.symbol)}"></dd>
                        </div>
                    </dl>
                    ${mtfBlock}
                </article>`;
        })
        .join("")}</div>`;
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
        ...mtfDetailCells(t, cell),
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

function mtfDetailCells(t, cell) {
    if (t.type !== "BUY" || !t.isMTF) return [];
    const sp = mtfSplit(t);
    if (t.mtfOwn === undefined || t.mtfOwn === null) {
        return [cell("MTF margin", "Not set")];
    }
    return [
        cell("My amount", fmtMoney(sp.own, true)),
        cell("MTF funded", fmtMoney(sp.funded, true)),
        cell("Leverage", sp.own > 0 ? (sp.total / sp.own).toFixed(2) + "×" : "—")
    ];
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

const CHART_PALETTE = SERIES;

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
            ${totals.hasMTF ? statCard("My amount", fmtMoney(totals.ownInvested, true)) : ""}
            ${totals.hasMTF ? statCard("MTF funded", fmtMoney(totals.fundedInvested, true)) : ""}
            ${totals.hasMTF ? statCard("Net equity (after MTF)", fmtMoney(totals.netEquity, true)) : ""}
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
            const arc = `<circle class="br-tip-seg" ${tipAttr(h.name || h.symbol, [["Share", h.weight.toFixed(1) + "%", chartColor(i)]])} cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${chartColor(i)}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${Math.max(circ - dash, 0).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"></circle>`;
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
            if (typeFilter === "MTF") {
                if (!(t.type === "BUY" && t.isMTF)) return false;
            } else if (typeFilter && t.type !== typeFilter) return false;
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
        tbody.innerHTML = `<tr><td colspan="8"><div class="inc-empty">${icon(transactions.length ? "search" : "arrow-left-right", { size: 22 })}<h4>${transactions.length ? "No matching transactions" : "No transactions yet"}</h4><p>${transactions.length ? "Try a different search or filter." : "Your buys and sells will be listed here."}</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = list
        .map((t) => {
            const pnl = t.type === "SELL" ? pnlMap[t.id] : undefined;

            return `
                <tr data-action="view-txn" data-id="${t.id}" class="stk-row${t.id === flashTxnId ? " stk-flash" : ""}">
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
                        <div class="stk-txn-stock">
                            ${stockLogoHTML(t.symbol, "sm")}
                            <div class="stk-txn-stock-text">
                                <div>${escapeHTML(t.name)}</div>
                                <div class="br-muted">${escapeHTML(t.symbol)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${t.quantity}</td>
                    <td>${fmtMoney(t.price)}</td>
                    <td>${fmtMoney(round2(t.quantity * t.price), true)}${txnSplitNote(t)}</td>
                    <td class="${
                        pnl !== undefined ? "br-pnl-" + pnlClass(pnl) : ""
                    }">${pnl !== undefined ? fmtSigned(pnl, true) : "—"}</td>
                    <td class="stk-row-actions">
                        <button type="button" class="inc-icon-button" data-action="edit-txn" data-id="${t.id}" aria-label="Edit transaction" title="Edit">${icon("pencil", { size: 16 })}</button>
                        <button type="button" class="inc-icon-button" data-action="duplicate-txn" data-id="${t.id}" aria-label="Duplicate transaction" title="Duplicate">${icon("copy", { size: 16 })}</button>
                        <button type="button" class="inc-icon-button inc-icon-danger" data-action="delete-txn" data-id="${t.id}" aria-label="Delete transaction" title="Delete">${icon("trash-2", { size: 16 })}</button>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function txnSplitNote(t) {
    if (t.type !== "BUY" || !t.isMTF) return "";
    if (t.mtfOwn === undefined || t.mtfOwn === null) {
        return '<div class="br-muted stk-sub">MTF · margin not set</div>';
    }
    const sp = mtfSplit(t);
    return `<div class="br-muted stk-sub">Mine ${fmtMoney(sp.own, true)} · MTF ${fmtMoney(sp.funded, true)}</div>`;
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
        ${summary.investedFunded > 0 ? statCard("Invested · my amount", fmtMoney(summary.investedOwn, true)) : ""}
        ${summary.investedFunded > 0 ? statCard("Invested · MTF funded", fmtMoney(summary.investedFunded, true)) : ""}
    `;
}

/* =========================================
   TRANSACTION MODAL
========================================= */

/* ---------- live symbol lookup (logo + LTP) ---------- */

let symLookupTimer = null;
let symLookupReq = 0;
let symLookupLtp = null;

function resetSymPreview(page) {
    clearTimeout(symLookupTimer);
    symLookupReq++;
    symLookupLtp = null;
    const box = page.querySelector("[data-sym-preview]");
    box.hidden = true;
    page.querySelector("[data-sym-logo]").innerHTML = "";
    page.querySelector("[data-sym-logo]").dataset.symbol = "";
    page.querySelector("[data-sym-use]").hidden = true;
}

// Waits until typing pauses (or fires right away on blur / list pick)
function scheduleSymLookup(page, immediate) {
    clearTimeout(symLookupTimer);
    const form = page.querySelector("[data-txn-form]");
    if (!form.symbol.value.trim()) {
        resetSymPreview(page);
        return;
    }
    symLookupTimer = setTimeout(() => lookupSymbol(page), immediate ? 0 : 700);
}

async function lookupSymbol(page) {
    const form = page.querySelector("[data-txn-form]");
    const sym = form.symbol.value.trim().toUpperCase();
    if (!sym) return resetSymPreview(page);

    const req = ++symLookupReq;
    const box = page.querySelector("[data-sym-preview]");
    const logoHost = page.querySelector("[data-sym-logo]");
    const ltpEl = page.querySelector("[data-sym-ltp]");
    const useBtn = page.querySelector("[data-sym-use]");

    box.hidden = false;
    useBtn.hidden = true;
    symLookupLtp = null;
    page.querySelector("[data-sym-title]").textContent =
        getAllSymbols(transactions).includes(sym) ? `${getSymbolName(sym, transactions)} (${sym})` : sym;
    ltpEl.textContent = "Fetching live price…";

    if (logoHost.dataset.symbol !== sym) {
        logoHost.dataset.symbol = sym;
        logoHost.innerHTML = stockLogoHTML(sym, "lg");
    }

    let ltp = null;
    try {
        ltp = await fetchLTP(sym);
    } catch (err) {
        ltp = null;
    }

    // Symbol changed (or modal closed) while we were waiting — drop this result
    if (req !== symLookupReq) return;

    if (typeof ltp === "number" && isFinite(ltp) && ltp >= 0) {
        symLookupLtp = ltp;
        ltpEl.textContent = `Live price ${fmtMoney(ltp)}`;

        const priceEl = form.price;
        if (priceEl.value === "" || priceEl.dataset.autoFilled === "1") {
            // Empty (or still our own earlier suggestion) -> fill it in
            priceEl.value = ltp;
            priceEl.dataset.autoFilled = "1";
            updateTxnForm(page);
        } else if (Number(priceEl.value) !== ltp) {
            // The user typed / saved their own price — never overwrite it
            useBtn.hidden = false;
        }
    } else {
        ltpEl.textContent = "Live price unavailable — enter it manually";
    }
}

function openTxnModal(page, id, duplicate) {
    const modal = page.querySelector("[data-txn-modal]");
    const form = page.querySelector("[data-txn-form]");

    form.reset();
    clearTxnErrors(page);
    resetSymPreview(page);
    delete form.price.dataset.autoFilled;
    // A duplicate is saved as a brand-new transaction through the
    // normal validated save path, so it never carries the source id.
    editingTxnId = id && !duplicate ? id : null;
    form.mtfMode.value = "amount";

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
        if (t.mtfOwn !== undefined && t.mtfOwn !== null) {
            form.mtfValue.value = t.mtfOwn;
        }
    } else {
        page.querySelector("[data-txn-modal-title]").textContent =
            "Add transaction";
        form.type.value = "BUY";
        form.date.value = new Date().toISOString().slice(0, 10);
    }

    setMtfMode(page, "amount", true);
    updateTxnForm(page);
    modal.hidden = false;

    // Editing / duplicating: show the logo + live price right away
    if (id && form.symbol.value.trim()) lookupSymbol(page);

    // Land the cursor where typing is most likely to start
    setTimeout(() => (id ? form.quantity : form.symbol).focus(), 30);
}

function closeTxnModal(page) {
    resetSymPreview(page);
    page.querySelector("[data-txn-modal]").hidden = true;
    editingTxnId = null;
}

/* ---------- field helpers ---------- */

function fieldHTML(label, control, extraClass = "") {
    return `
        <div class="inc-field ${extraClass}">
            <label>
                <span class="inc-field-label">${label}</span>
                ${control}
            </label>
            <p class="inc-error" data-error hidden></p>
        </div>`;
}

function fieldError(input, message) {
    const field = input.closest(".inc-field");
    const p = field && field.querySelector("[data-error]");

    if (message) {
        input.setAttribute("aria-invalid", "true");
        if (p) { p.textContent = message; p.hidden = false; }
    } else {
        input.removeAttribute("aria-invalid");
        if (p) { p.textContent = ""; p.hidden = true; }
    }
}

function clearTxnErrors(page) {
    const form = page.querySelector("[data-txn-form]");
    form.querySelectorAll("[aria-invalid]").forEach((el) => fieldError(el, ""));
    const banner = page.querySelector("[data-txn-error]");
    banner.hidden = true;
    banner.textContent = "";
}

/* ---------- MTF input: "my amount" or margin % ---------- */

function setMtfMode(page, mode, silent) {
    const form = page.querySelector("[data-txn-form]");
    const prev = form.mtfMode.value;
    const total = round2(Number(form.quantity.value) * Number(form.price.value));
    const raw = form.mtfValue.value.trim();

    // Keep what was typed meaningful when switching units
    if (!silent && prev !== mode && raw !== "" && total > 0) {
        const v = Number(raw);
        if (!isNaN(v)) {
            form.mtfValue.value =
                mode === "percent"
                    ? String(round2((v / total) * 100))
                    : String(round2((total * v) / 100));
        }
    }

    form.mtfMode.value = mode;
    form.querySelectorAll("[data-mode]").forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === mode)
    );

    const input = form.mtfValue;
    input.max = mode === "percent" ? "100" : "";
    input.placeholder = mode === "percent" ? "25" : "0.00";
    page.querySelector("[data-mtf-label]").textContent =
        mode === "percent" ? "Margin you pay (% of trade value)" : "My amount (paid from my funds)";

    if (!silent) updateTxnForm(page);
}

// Own money for the current form values (undefined if not entered)
function readMtfOwn(form, total) {
    const raw = form.mtfValue.value.trim();
    if (raw === "") return undefined;
    const v = Number(raw);
    if (isNaN(v) || v < 0) return NaN;
    return form.mtfMode.value === "percent"
        ? round2((total * v) / 100)
        : round2(v);
}

// Everything that reacts live while the form is being filled
function updateTxnForm(page) {
    const form = page.querySelector("[data-txn-form]");
    const isBuy = form.type.value === "BUY";
    const qty = Number(form.quantity.value) || 0;
    const price = Number(form.price.value) || 0;
    const total = round2(qty * price);

    page.querySelector("[data-txn-total]").innerHTML =
        total > 0
            ? `<span>Trade value</span><strong>${fmtMoney(total)}</strong>`
            : `<span>Trade value appears here</span>`;

    // MTF only applies to buys
    page.querySelector("[data-mtf-box]").hidden = !isBuy;
    const mtfOn = isBuy && form.isMTF.checked;
    page.querySelector("[data-mtf-fields]").hidden = !mtfOn;

    // Sell helper: what you can sell + one-tap "sell all"
    const hint = page.querySelector("[data-qty-hint]");
    const sym = form.symbol.value.trim().toUpperCase();
    if (!isBuy && sym) {
        const others = transactions.filter((t) => t.id !== editingTxnId);
        const held = calculateStockHolding(sym, others, prices).quantity;
        hint.innerHTML = held > 0
            ? `You hold ${held} · <button type="button" class="stk-link" data-action="sell-all" data-qty="${held}">Sell all</button>`
            : `You don't hold ${escapeHTML(sym)}`;
    } else {
        hint.textContent = "";
    }

    // MTF preview: trade value = my amount + MTF funded
    const preview = page.querySelector("[data-mtf-preview]");
    if (!mtfOn) { preview.innerHTML = ""; return; }

    const own = readMtfOwn(form, total);
    if (own === undefined || isNaN(own) || total <= 0) {
        preview.innerHTML = `<p class="inc-hint">Enter your margin to see how the trade splits between your money and the broker's.</p>`;
        return;
    }
    if (own > total + 0.004) {
        preview.innerHTML = `<p class="inc-hint" style="color:var(--danger)">My amount is more than the trade value.</p>`;
        return;
    }

    const funded = round2(total - own);
    const lev = own > 0 ? (total / own).toFixed(2) + "×" : "—";
    const pct = total > 0 ? ((own / total) * 100).toFixed(1) : "0";

    preview.innerHTML = `
        ${splitBar(own, funded)}
        <div class="stk-preview-grid">
            <div><span>My amount</span><strong>${fmtMoney(own)}</strong><em>${pct}% margin</em></div>
            <div><span>MTF funded</span><strong>${fmtMoney(funded)}</strong><em>by the broker</em></div>
            <div><span>Leverage</span><strong>${lev}</strong><em>trade ÷ mine</em></div>
        </div>`;
}

async function saveTxn(page) {
    if (saving) return;

    const form = page.querySelector("[data-txn-form]");
    const errorEl = page.querySelector("[data-txn-error]");

    clearTxnErrors(page);

    const type = form.type.value;
    const date = form.date.value;
    const name = form.name.value.trim();
    const symbol = form.symbol.value.trim().toUpperCase();
    const quantity = Number(form.quantity.value);
    const price = Number(form.price.value);
    const notes = form.notes.value.trim();
    const isBuy = type === "BUY";
    const total = round2(quantity * price);

    let ok = true;
    const bad = (el, msg) => {
        fieldError(el, msg);
        if (ok) el.focus();
        ok = false;
    };

    if (!date) bad(form.date, "Pick a date.");
    if (!symbol) bad(form.symbol, "Enter the stock symbol.");
    if (!name) bad(form.name, "Enter the stock name.");
    if (!quantity || quantity <= 0) bad(form.quantity, "Enter a quantity above 0.");
    if (form.price.value === "" || isNaN(price) || price < 0) bad(form.price, "Enter a valid price.");

    const id = editingTxnId;
    const existing = id ? transactions.find((t) => t.id === id) : null;

    // MTF = my amount + broker-funded part
    const wantsMtf = isBuy && form.isMTF.checked;
    let mtfOwn;

    if (wantsMtf) {
        const raw = form.mtfValue.value.trim();
        // Older MTF buys never recorded a margin; let them be re-saved as-is
        const legacy = !!existing && existing.isMTF && (existing.mtfOwn === undefined || existing.mtfOwn === null);
        const v = Number(raw);

        if (raw === "") {
            if (!legacy) bad(form.mtfValue, "Enter how much of this buy is your own money.");
        } else if (isNaN(v) || v < 0) {
            bad(form.mtfValue, "Enter a valid amount.");
        } else if (form.mtfMode.value === "percent") {
            if (v <= 0 || v > 100) bad(form.mtfValue, "Margin must be between 0 and 100%.");
            else mtfOwn = round2((total * v) / 100);
        } else if (v > total + 0.004) {
            bad(form.mtfValue, `Can't be more than the trade value (${fmtMoney(total)}).`);
        } else {
            mtfOwn = round2(v);
        }
    }

    if (!ok) return;

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
        // A sell keeps whatever flag it already had; the box is buy-only
        isMTF: isBuy ? wantsMtf : !!(existing && existing.isMTF)
    };
    if (mtfOwn !== undefined) candidate.mtfOwn = mtfOwn;

    const check = validateTransaction(candidate, id, transactions);
    if (!check.ok) {
        if (!id) seqCounter--;
        fieldError(form.quantity, `You only hold ${check.available} share(s) to sell.`);
        form.quantity.focus();
        return;
    }

    saving = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;

    try {
        if (id) {
            const idx = transactions.findIndex((t) => t.id === id);
            transactions[idx] = candidate;
        } else {
            transactions.push(candidate);
        }

        await persist();
        flashTxnId = candidate.id;
        flashSymbol = candidate.symbol;
        closeTxnModal(page);
        renderAll(page);
    } catch (err) {
        errorEl.textContent = err?.message || "Could not save the transaction.";
        errorEl.hidden = false;
    } finally {
        saving = false;
        submit.disabled = false;
    }
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

    // Only rebuild the logo when the symbol changes (renderDetail re-runs on price updates)
    const logoHost = page.querySelector("[data-detail-logo]");
    if (logoHost.dataset.symbol !== h.symbol) {
        logoHost.dataset.symbol = h.symbol;
        logoHost.innerHTML = stockLogoHTML(h.symbol, "xl");
    }

    page.querySelector("[data-detail-grid]").innerHTML = [
        cell("Shares you own", h.quantity),
        cell("Average price paid", fmtMoney(h.avgPrice)),
        cell("Current price", fmtMoney(h.currentPrice)),
        cell("Share of portfolio", calculatePortfolioWeight(h.symbol, transactions, prices).toFixed(1) + "%"),
        cell("Invested", fmtMoney(h.investedValue, true)),
        cell("Worth now", fmtMoney(h.currentValue, true)),
        cell("Unrealized P&L", fmtSigned(h.unrealizedPnL, true), "br-pnl-" + pnlClass(h.unrealizedPnL)),
        cell("Growth", fmtPct(h.unrealizedPnLPct), "br-pnl-" + pnlClass(h.unrealizedPnLPct)),
        ...(h.hasMargin
            ? [
                  cell("My amount", fmtMoney(h.ownInvested, true)),
                  cell("MTF funded", fmtMoney(h.fundedInvested, true)),
                  cell("Leverage", h.leverage.toFixed(2) + "×"),
                  cell("Net equity", fmtMoney(h.netEquity, true)),
                  cell("Return on my amount", fmtPct(h.returnOnOwnPct), "br-pnl-" + pnlClass(h.returnOnOwnPct))
              ]
            : []),
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

    /* Hover / touch bands: one per point, thinned on long histories. */
    const stride = Math.max(1, Math.ceil(n / 300));
    const bandW = (plotW / Math.max(n - 1, 1)) * stride;
    const bands = history
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => i % stride === 0)
        .map(({ p, i }) => `<rect class="br-tip-hit" x="${(x(i) - bandW / 2).toFixed(2)}" y="0" width="${bandW.toFixed(2)}" height="${h}" ${tipAttr(fmtDate(p.date), [["Close", fmtMoney(p.close), color]])}></rect>`)
        .join("");

    return `<svg viewBox="0 0 ${w} ${h}" class="br-price-chart br-tip-scrub" preserveAspectRatio="none" role="img" aria-label="Price chart">
        ${yTicks.map((v) => `<line x1="${padL}" x2="${w - padR}" y1="${y(v).toFixed(2)}" y2="${y(v).toFixed(2)}" class="br-chart-grid"></line>`).join("")}
        <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"></polyline>
        ${marker}
        ${yTicks.map((v) => `<text x="2" y="${(y(v) + 4).toFixed(2)}" class="br-chart-label">${fmtMoney(v, true)}</text>`).join("")}
        ${xTicks.map((i) => `<text x="${x(i).toFixed(2)}" y="${h - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" class="br-chart-label">${fmtDate(history[i].date).replace(/\s\d{4}$/, "")}</text>`).join("")}
        ${bands}
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
    page.addEventListener(
        "error",
        (event) => {
            const img = event.target;
            if (img && img.matches && img.matches("img[data-stk-logo]")) {
                img.remove();
            }
        },
        true
    );

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
        } else if (action === "use-ltp") {
            const form = page.querySelector("[data-txn-form]");
            if (symLookupLtp != null) {
                form.price.value = symLookupLtp;
                form.price.dataset.autoFilled = "1";
                actionEl.hidden = true;
                updateTxnForm(page);
            }
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
        } else if (action === "hold-filter") {
            holdingFilter = actionEl.dataset.filter;
            renderHoldings(page);
        } else if (action === "mtf-mode") {
            setMtfMode(page, actionEl.dataset.mode);
        } else if (action === "sell-all") {
            page.querySelector("[data-txn-form]").quantity.value = actionEl.dataset.qty;
            updateTxnForm(page);
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

        // Add / edit form: clear that field's error, keep previews live
        if (event.target.closest("[data-txn-form]")) {
            const form = event.target.closest("[data-txn-form]");
            fieldError(event.target, "");

            // Known symbol -> fill the name and last price for you
            if (event.target === form.symbol) {
                const sym = form.symbol.value.trim().toUpperCase();
                if (getAllSymbols(transactions).includes(sym)) {
                    if (!form.name.value.trim()) form.name.value = getSymbolName(sym, transactions);
                    if (form.price.value === "" && prices[sym] != null) {
                        form.price.value = prices[sym];
                        form.price.dataset.autoFilled = "1";
                    }
                }
                // Picked from the suggestion list -> look up now; typing -> after a short pause
                scheduleSymLookup(
                    page,
                    !event.inputType || event.inputType === "insertReplacementText"
                );
            }

            // A hand-typed price is the user's own: stop auto-filling over it
            if (event.target === form.price) delete form.price.dataset.autoFilled;

            updateTxnForm(page);
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
        if (event.target.matches('[data-txn-form] [name="symbol"]')) {
            scheduleSymLookup(page, true);
            return;
        }

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

    page.addEventListener("wheel", (event) => {
        const el = event.target;
        if (el.matches?.('input[type="number"]') && document.activeElement === el) el.blur();
    }, { passive: true });

    page.addEventListener("focusin", (event) => {
        if (event.target.matches?.("[data-price-input]")) event.target.select();
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
