/*
 * stocks-dream-paper.js
 *
 * Dream "Paper trading" pane — buy and sell stocks with pretend money,
 * tracked like a real portfolio: holdings, trade log with date and time,
 * realized / unrealized P&L and a summary.
 *
 * Kept apart from the real portfolio:
 *  - saved under its own "dreamBook" key in the stocks state store
 *  - never touches real transactions, prices, holdings, totals or net worth
 *
 * Maths lives in stocks-dream-book.js (it reuses the real Stocks engine).
 */

import { icon } from "../../components/icons.js";
import { enhanceTimeInputs } from "../../components/time-picker.js";
import { confirmDialog } from "../../components/confirm-dialog.js";
import { genId, round2, round6, fmtMoney, fmtSigned, fmtPct, pnlClass, fmtDate, fmtTime, replaySymbol } from "./stocks-service.js";
import { stockMiniLogoHTML, fetchStockDetails } from "./stocks-live.js";
import { isOpen, chevron, allButton, foldSection } from "./stocks-dream-fold.js";
import { emptyBook, normalizeBook, nextSeq, sortTrades, validateBook, computeBook } from "./stocks-dream-book.js";

const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nowTime = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtQty = (q) => String(Math.round(q * 1e4) / 1e4);
const when = (t) => fmtDate(t.date) + (t.time ? " · " + fmtTime(t.time) : "");

export function initDreamPaper(page, ctx) {
    let book = emptyBook();
    let sub = "holdings"; // holdings | trades | summary
    let filter = { type: "all", symbol: "" };

    let mode = null; // "trade" | "funds" | "delete"
    let draft = null; // { type, symbol, name, editId }
    let activeId = null;
    let saving = false;
    let lookupReq = 0;
    let suggestIdx = -1;

    const layer = document.createElement("div");
    layer.className = "br-modal-layer";
    layer.hidden = true;
    layer.setAttribute("data-paper-modal", "");
    page.appendChild(layer);

    const rootEl = () => page.querySelector("[data-paper-root]");

    /* =========================================
       LOAD / PERSIST
    ========================================= */

    async function load() {
        book = normalizeBook(await ctx.store.getDreamBook());
    }

    async function persist(next) {
        const before = book;
        book = next;
        try {
            await ctx.store.saveDreamBook({ trades: next.trades, funds: next.funds });
        } catch (err) {
            book = before;
            throw err;
        }
    }

    async function setBook(next) {
        await persist(normalizeBook(next));
        render();
    }

    async function reset() {
        book = emptyBook();
        await ctx.store.saveDreamBook(book);
        render();
    }

    const symbols = () => [...new Set(book.trades.map((t) => t.symbol))];

    function prices() {
        const m = {};
        symbols().forEach((s) => {
            const p = ctx.price(s);
            if (p > 0) m[s] = p;
        });
        return m;
    }

    const stats = () => computeBook(book.trades, prices(), book.funds);

    /* =========================================
       RENDER
    ========================================= */

    function metric(label, val, hint, cls = "") {
        return `<div class="dr-metric"><span class="dr-metric-label">${label}</span><strong class="dr-metric-val ${cls}">${val}</strong>${hint ? `<span class="dr-metric-hint ${cls}">${hint}</span>` : ""}</div>`;
    }

    function render() {
        const root = rootEl();
        if (!root) return;
        const s = stats();
        const tone = (n) => "br-pnl-" + pnlClass(n);
        const hasTrades = book.trades.length > 0;
        const hasPrice = s.holdings.some((h) => h.priced);

        const fundsText =
            book.funds === null
                ? `<span class="br-muted">No fund limit</span>`
                : `<span>Cash <strong>${fmtMoney(s.cash, true)}</strong></span><span class="br-muted">of ${fmtMoney(book.funds, true)}</span>`;

        const cashCell =
            s.cash === null
                ? metric("Trades", String(s.trades), `${s.buys} buys · ${s.sellCount} sells`)
                : metric("Equity", fmtMoney(s.equity, true), `Cash ${fmtMoney(s.cash, true)}`);

        const body = sub === "holdings" ? holdingsHTML(s) : sub === "trades" ? tradesHTML(s) : summaryHTML(s);

        const sumKey = "sum:paper";
        const sumOpen = isOpen(sumKey);
        const totalCls = hasTrades ? tone(s.total) : "";

        root.innerHTML = `
            <section class="inc-section dr-section dp-section">
                <div class="dp-bar">
                    <div class="dp-funds">${fundsText}<button type="button" class="dp-link" data-paper-act="funds">${book.funds === null ? "Set funds" : "Edit"}</button></div>
                    <div class="dp-bar-actions">
                        <button type="button" class="br-button" data-paper-act="sell" ${s.holdings.length ? "" : "disabled"}>Sell</button>
                        <button type="button" class="br-button br-button-primary" data-paper-act="buy">${icon("plus", { size: 16 })}<span>Buy</span></button>
                    </div>
                </div>

                <div class="dr-sum${sumOpen ? " is-open" : ""}" data-fold-host>
                    <button type="button" class="dr-sum-head" data-fold="${sumKey}" aria-expanded="${sumOpen}">
                        <span class="dr-sum-main">
                            <span class="dr-sum-label">Total P&amp;L</span>
                            <strong class="dr-sum-val ${totalCls}">${hasTrades ? fmtSigned(s.total, true) : "–"}</strong>
                            ${hasTrades ? `<span class="dr-sum-sub ${totalCls}">${fmtPct(s.returnPct)}</span>` : ""}
                        </span>
                        ${chevron()}
                    </button>
                    <div class="dr-more"><div>
                        <div class="dp-metrics">
                            ${metric("Invested", hasTrades ? fmtMoney(s.invested, true) : "–", "")}
                            ${metric("Value now", hasTrades ? fmtMoney(s.value, true) : "–", "")}
                            ${metric("Unrealized", hasTrades && hasPrice ? fmtSigned(s.unrealized, true) : "–", hasTrades && hasPrice ? fmtPct(s.unrealizedPct) : "", hasTrades && hasPrice ? tone(s.unrealized) : "")}
                            ${metric("Realized", hasTrades ? fmtSigned(s.realized, true) : "–", "", hasTrades ? tone(s.realized) : "")}
                            ${metric("Total P&L", hasTrades ? fmtSigned(s.total, true) : "–", hasTrades ? fmtPct(s.returnPct) : "", totalCls)}
                            ${cashCell}
                        </div>
                    </div></div>
                </div>

                <div class="br-chip-row dp-subtabs" role="group" aria-label="Paper trading views">
                    <button type="button" class="br-chip${sub === "holdings" ? " active" : ""}" data-paper-act="sub" data-sub="holdings">Holdings${s.holdings.length ? ` · ${s.holdings.length}` : ""}</button>
                    <button type="button" class="br-chip${sub === "trades" ? " active" : ""}" data-paper-act="sub" data-sub="trades">Trades${book.trades.length ? ` · ${book.trades.length}` : ""}</button>
                    <button type="button" class="br-chip${sub === "summary" ? " active" : ""}" data-paper-act="sub" data-sub="summary">Summary</button>
                </div>

                <div data-paper-body>${body}</div>
            </section>`;
    }

    const emptyBox = (title) => `<div class="dr-empty">${icon("sparkles", { size: 20 })}<span>${title}</span></div>`;

    function menu(items) {
        return `
            <div class="dr-menu">
                <button type="button" class="inc-icon-button dr-menu-btn" data-dream-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More options" title="More">${icon("ellipsis", { size: 18 })}</button>
                <div class="dr-menu-pop" role="menu" hidden>${items}</div>
            </div>`;
    }

    const menuItem = (act, attrs, ic, label, danger) =>
        `<button type="button" role="menuitem"${danger ? ' class="is-danger"' : ""} data-paper-act="${act}" ${attrs}>${icon(ic, { size: 15 })}<span>${label}</span></button>`;

    /* ----- holdings ----- */

    function holdingsHTML(s) {
        if (!s.holdings.length) {
            return emptyBox(book.trades.length ? "No open positions" : "No paper trades yet");
        }
        const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        const keys = s.holdings.map((h) => "h:" + h.symbol);
        return `<div data-fold-scope>
            <div class="dr-listbar"><span class="dr-count">${s.holdings.length} ${s.holdings.length === 1 ? "position" : "positions"}</span>${allButton(keys)}</div>
            <div class="stk-list dr-list">${s.holdings
            .map((h) => {
                const tone = pnlClass(h.unrealizedPnL);
                const key = "h:" + h.symbol;
                const open = isOpen(key);
                return `
                <article class="inc-entry stk-card dr-card${open ? " is-open" : ""}" data-key="${esc(h.symbol)}" data-fold-host>
                    <div class="stk-card-top">
                        <button type="button" class="dr-row" data-fold="${esc(key)}" aria-expanded="${open}">
                            ${stockMiniLogoHTML(h.symbol, 32)}
                            <span class="stk-id">
                                <span class="stk-name">${esc(h.name)}</span>
                                <span class="inc-meta">${esc(h.symbol)} · ${fmtQty(h.quantity)} shares</span>
                            </span>
                            <span class="dr-growth br-pnl-${tone}">
                                <strong>${fmtPct(h.unrealizedPnLPct)}</strong>
                                <span>${fmtSigned(h.unrealizedPnL, true)}</span>
                            </span>
                            ${chevron()}
                        </button>
                        ${menu(
                            menuItem("buy", `data-symbol="${esc(h.symbol)}"`, "plus", "Buy more") +
                                menuItem("sell", `data-symbol="${esc(h.symbol)}"`, "arrow-right", "Sell") +
                                menuItem("history", `data-symbol="${esc(h.symbol)}"`, "list-checks", "Trade history")
                        )}
                    </div>
                    <div class="dr-more"><div>
                        <dl class="stk-stats">
                            ${stat("Avg", fmtMoney(h.avgPrice))}
                            ${stat(h.priced ? "Now" : "Last", fmtMoney(h.currentPrice))}
                            ${stat("Invested", fmtMoney(h.investedValue, true))}
                            ${stat("Value", `<span class="br-pnl-${tone}">${fmtMoney(h.currentValue, true)}</span>`)}
                            ${h.realizedPnL ? stat("Realized", `<span class="br-pnl-${pnlClass(h.realizedPnL)}">${fmtSigned(h.realizedPnL, true)}</span>`) : ""}
                        </dl>
                    </div></div>
                </article>`;
            })
            .join("")}</div></div>`;
    }

    /* ----- trades ----- */

    function tradesHTML(s) {
        if (!book.trades.length) return emptyBox("No paper trades yet");

        const pnlById = {};
        s.sells.forEach((r) => (pnlById[r.trade.id] = r));
        const syms = symbols().sort();
        let list = sortTrades(book.trades).reverse();
        if (filter.type !== "all") list = list.filter((t) => t.type === filter.type);
        if (filter.symbol) list = list.filter((t) => t.symbol === filter.symbol);

        const chip = (v, label) => `<button type="button" class="br-chip${filter.type === v ? " active" : ""}" data-paper-act="ftype" data-type="${v}">${label}</button>`;
        const tools = `
            <div class="dp-filters">
                <div class="br-chip-row" role="group" aria-label="Filter trades">${chip("all", "All")}${chip("BUY", "Buys")}${chip("SELL", "Sells")}</div>
                <select class="br-select" data-paper-fsym aria-label="Filter by stock"><option value="">All stocks</option>${syms.map((x) => `<option value="${esc(x)}"${filter.symbol === x ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>
            </div>`;

        if (!list.length) return tools + emptyBox("No trades match");

        const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        return (
            tools +
            `<div data-fold-scope>
            <div class="dr-listbar"><span class="dr-count">${list.length} ${list.length === 1 ? "trade" : "trades"}</span>${allButton(list.map((t) => "t:" + t.id))}</div>
            <div class="stk-list dr-list">${list
                .map((t) => {
                    const amt = round2(t.quantity * t.price);
                    const r = pnlById[t.id];
                    const right = r
                        ? `<span class="dr-growth br-pnl-${pnlClass(r.pnl)}"><strong>${fmtSigned(r.pnl, true)}</strong><span>${r.pct === null ? "" : fmtPct(r.pct)}</span></span>`
                        : `<span class="dr-growth"><strong>${fmtMoney(amt, true)}</strong></span>`;
                    const key = "t:" + t.id;
                    const open = isOpen(key);
                    return `
                    <article class="inc-entry stk-card dr-card dp-trade dp-${t.type.toLowerCase()}${open ? " is-open" : ""}" data-key="${esc(t.id)}" data-fold-host>
                        <div class="stk-card-top">
                            <button type="button" class="dr-row" data-fold="${esc(key)}" aria-expanded="${open}">
                                ${stockMiniLogoHTML(t.symbol, 32)}
                                <span class="stk-id">
                                    <span class="stk-name"><span class="dp-tag dp-tag-${t.type.toLowerCase()}">${t.type}</span> ${esc(t.name || t.symbol)}</span>
                                    <span class="inc-meta">${esc(t.symbol)} · ${esc(when(t))}</span>
                                </span>
                                ${right}
                                ${chevron()}
                            </button>
                            ${menu(menuItem("edit", `data-id="${esc(t.id)}"`, "pencil", "Edit") + menuItem("delete", `data-id="${esc(t.id)}"`, "trash-2", "Delete", true))}
                        </div>
                        <div class="dr-more"><div>
                            <dl class="stk-stats">
                                ${stat("Qty", fmtQty(t.quantity))}
                                ${stat("Price", fmtMoney(t.price))}
                                ${stat("Amount", fmtMoney(amt, true))}
                            </dl>
                            ${t.notes ? `<p class="inc-hint ipo-notes">${esc(t.notes)}</p>` : ""}
                        </div></div>
                    </article>`;
                })
                .join("")}</div></div>`
        );
    }

    /* ----- summary ----- */

    function summaryHTML(s) {
        if (!book.trades.length) return emptyBox("No trades yet");
        const tone = (n) => "br-pnl-" + pnlClass(n);
        const cell = (k, v, cls = "") => `<div class="dp-sum-cell"><span>${k}</span><strong class="${cls}">${v}</strong></div>`;
        const trade = (r) => (r ? `${esc(r.symbol)} <span class="${tone(r.pnl)}">${fmtSigned(r.pnl, true)}</span>` : "–");

        const all = [...s.holdings, ...s.closed].sort((a, b) => b.unrealizedPnL + b.realizedPnL - (a.unrealizedPnL + a.realizedPnL));
        const rows = all
            .map((h) => {
                const tot = round2(h.unrealizedPnL + h.realizedPnL);
                return `<tr>
                    <td><strong>${esc(h.symbol)}</strong><div class="br-muted dp-sub">${h.quantity > 0 ? fmtQty(h.quantity) + " held" : "closed"}</div></td>
                    <td class="num">${h.quantity > 0 ? fmtMoney(h.avgPrice) : "–"}</td>
                    <td class="num">${h.quantity > 0 ? fmtMoney(h.currentValue, true) : "–"}</td>
                    <td class="num ${h.quantity > 0 ? tone(h.unrealizedPnL) : ""}">${h.quantity > 0 ? fmtSigned(h.unrealizedPnL, true) : "–"}</td>
                    <td class="num ${tone(h.realizedPnL)}">${fmtSigned(h.realizedPnL, true)}</td>
                    <td class="num ${tone(tot)}"><strong>${fmtSigned(tot, true)}</strong></td>
                </tr>`;
            })
            .join("");

        const months = s.monthly.length
            ? foldSection("sum:months", "Realized by month", `<div class="dp-months">${s.monthly
                   .slice()
                   .reverse()
                   .map(([m, v]) => {
                       const [y, mo] = m.split("-");
                       const label = new Date(+y, +mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
                       return `<div><span>${label}</span><strong class="${tone(v)}">${fmtSigned(v, true)}</strong></div>`;
                   })
                   .join("")}</div>`)
            : "";

        const overview = `
            <div class="dp-sum">
                ${cell("Total P&L", fmtSigned(s.total, true), tone(s.total))}
                ${cell("Return on cost", fmtPct(s.returnPct), tone(s.total))}
                ${cell("Total bought", fmtMoney(s.bought, true))}
                ${cell("Total sold", fmtMoney(s.sold, true))}
                ${cell("Win rate", s.winRate === null ? "–" : s.winRate.toFixed(0) + "%")}
                ${cell("Wins · Losses", `${s.wins} · ${s.losses}`)}
                ${cell("Best sell", trade(s.best))}
                ${cell("Worst sell", trade(s.worst))}
                ${cell("Open · Closed", `${s.holdings.length} · ${s.closed.length}`)}
                ${cell("First trade", s.firstDate ? esc(fmtDate(s.firstDate)) : "–")}
            </div>`;
        const byStock = `
            <div class="dp-table-wrap"><table class="dp-table">
                <thead><tr><th>Stock</th><th class="num">Avg</th><th class="num">Value</th><th class="num">Unrealized</th><th class="num">Realized</th><th class="num">Total</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`;

        return `
            ${foldSection("sum:overview", "Overview", overview, true)}
            ${foldSection("sum:bystock", "By stock", byStock)}
            ${months}
            <div class="dp-reset"><button type="button" class="dp-link is-danger" data-paper-act="reset">Reset paper trading</button></div>`;
    }

    /* =========================================
       MODAL
    ========================================= */

    const field = (label, control, hint = "") => `
        <div class="inc-field">
            <label><span class="inc-field-label">${label}</span>${control}</label>
            ${hint ? `<span class="inc-hint" data-hint>${hint}</span>` : ""}
            <p class="inc-error" data-error hidden></p>
        </div>`;

    function shell(title, inner, submitLabel, danger) {
        layer.innerHTML = `
            <div class="br-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="br-modal-header">
                    <h3>${esc(title)}</h3>
                    <button type="button" class="br-modal-close" data-paper-act="close" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
                </div>
                <form data-paper-form novalidate>
                    <div class="inc-form-error" data-paper-error role="alert" hidden></div>
                    ${inner}
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-paper-act="close">Cancel</button>
                        <button type="submit" class="br-button ${danger ? "br-button-danger" : "br-button-primary"}">${esc(submitLabel)}</button>
                    </div>
                </form>
            </div>`;
        layer.hidden = false;
        enhanceTimeInputs(layer);
        return layer.querySelector("[data-paper-form]");
    }

    function closeModal() {
        layer.hidden = true;
        layer.innerHTML = "";
        mode = null;
        draft = null;
        activeId = null;
        lookupReq++;
    }

    function showError(el, msg) {
        if (!el) return;
        const f = el.closest(".inc-field");
        const p = f && f.querySelector("[data-error]");
        if (msg) {
            el.setAttribute("aria-invalid", "true");
            if (p) { p.textContent = msg; p.hidden = false; }
        } else {
            el.removeAttribute("aria-invalid");
            if (p) { p.textContent = ""; p.hidden = true; }
        }
    }

    function formError(msg) {
        const b = layer.querySelector("[data-paper-error]");
        if (!b) return;
        b.textContent = msg || "";
        b.hidden = !msg;
    }

    const heldQty = (sym) => {
        const r = replaySymbol(sym, book.trades);
        return r.error ? 0 : r.quantity;
    };

    /* ----- stock chooser (search or picked) ----- */

    function stockBlock() {
        if (draft.symbol) {
            return `
                <div class="dr-pick">
                    ${stockMiniLogoHTML(draft.symbol, 40)}
                    <div class="dr-pick-text">
                        <strong data-paper-pick-name>${esc(draft.name || draft.symbol)}</strong>
                        <span>${esc(draft.symbol)} · <span data-paper-pick-ltp>${ctx.price(draft.symbol) ? "Live " + fmtMoney(ctx.price(draft.symbol)) : "Fetching live price…"}</span></span>
                    </div>
                    ${draft.editId ? "" : `<button type="button" class="dp-link" data-paper-act="change-stock">Change</button>`}
                </div>`;
        }
        return `
            <div class="dr-search dp-search">
                <div class="dr-search-box">
                    <span class="dr-search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
                    <input type="text" class="dr-search-input" data-paper-search placeholder="${draft.type === "SELL" ? "Search your holdings" : "Search stocks"}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Search stocks">
                </div>
                <div class="dr-suggest" data-paper-suggest role="listbox" hidden></div>
            </div>`;
    }

    function candidates(raw) {
        const q = raw.trim().toLowerCase();
        if (draft.type === "SELL") {
            const list = stats()
                .holdings.filter((h) => !q || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q))
                .map((h) => ({ symbol: h.symbol, name: h.name, held: h.quantity }));
            return { list, head: list.length && !q ? "Your paper holdings" : "" };
        }
        const { list, popular } = ctx.suggest(raw);
        return { list, head: popular ? "Popular" : "" };
    }

    function renderSuggest(input) {
        const box = layer.querySelector("[data-paper-suggest]");
        if (!box) return;
        const { list, head } = candidates(input.value);
        suggestIdx = list.length ? 0 : -1;
        if (!list.length) {
            box.innerHTML = `<div class="dr-suggest-empty">${draft.type === "SELL" ? "No matching paper holding." : "No match. Try the NSE symbol, e.g. RELIANCE."}</div>`;
        } else {
            box.innerHTML =
                (head ? `<div class="dr-suggest-head">${head}</div>` : "") +
                list
                    .map(
                        (x, i) => `
                    <div class="dr-suggest-row${i === suggestIdx ? " is-active" : ""}" role="option" data-paper-pick data-symbol="${esc(x.symbol)}" data-name="${esc(x.name)}">
                        ${stockMiniLogoHTML(x.symbol, 30)}
                        <div class="dr-suggest-text">
                            <span class="dr-suggest-name">${x.custom ? `Use “${esc(x.symbol)}”` : esc(x.name)}</span>
                            <span class="dr-suggest-sym">${x.custom ? "Look up live price" : esc(x.symbol)}${x.held ? " · " + fmtQty(x.held) + " held" : ""}</span>
                        </div>
                    </div>`
                    )
                    .join("");
        }
        box.hidden = false;
    }

    function moveSuggest(dir) {
        const rows = [...layer.querySelectorAll("[data-paper-pick]")];
        if (!rows.length) return;
        suggestIdx = (suggestIdx + dir + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle("is-active", i === suggestIdx));
        rows[suggestIdx].scrollIntoView({ block: "nearest" });
    }

    function pickSymbol(symbol, name) {
        draft.symbol = symbol;
        draft.name = name || "";
        const host = layer.querySelector("[data-paper-stock]");
        if (host) host.innerHTML = stockBlock();
        const form = layer.querySelector("[data-paper-form]");
        if (form) {
            if (draft.type === "SELL" && form.quantity.value === "") form.quantity.value = fmtQty(heldQty(symbol));
            updateHint(form);
            lookupLive(form);
            setTimeout(() => (form.price.value === "" ? form.price : form.quantity).focus(), 30);
        }
    }

    async function lookupLive(form) {
        const sym = draft.symbol;
        if (!sym) return;
        const req = ++lookupReq;
        let ltp = null;
        let companyName = "";
        try {
            const d = await fetchStockDetails(sym);
            ltp = d.ltp;
            companyName = d.companyName;
        } catch (e) {
            ltp = ctx.price(sym);
        }
        if (req !== lookupReq || !draft || draft.symbol !== sym || !layer.contains(form)) return;

        const ltpEl = layer.querySelector("[data-paper-pick-ltp]");
        if (typeof ltp === "number" && isFinite(ltp) && ltp > 0) {
            ctx.setPrice(sym, ltp);
            if (ltpEl) ltpEl.textContent = `Live ${fmtMoney(ltp)}`;
            if (form.price.value === "" && !form.price.dataset.touched) {
                form.price.value = ltp;
            }
        } else if (ltpEl) {
            ltpEl.textContent = "Live price unavailable";
        }
        if (companyName && !draft.name) {
            draft.name = companyName;
            const n = layer.querySelector("[data-paper-pick-name]");
            if (n) n.textContent = companyName;
        }
        updatePreview(form);
    }

    /* ----- buy / sell / edit ----- */

    function typeChips() {
        return `<div class="br-chip-row dp-type" role="group" aria-label="Buy or sell">
            <button type="button" class="br-chip${draft.type === "BUY" ? " active" : ""}" data-paper-act="type" data-type="BUY">Buy</button>
            <button type="button" class="br-chip${draft.type === "SELL" ? " active" : ""}" data-paper-act="type" data-type="SELL">Sell</button>
        </div>`;
    }

    function openTrade(opts = {}) {
        const edit = opts.editId ? book.trades.find((t) => t.id === opts.editId) : null;
        if (opts.editId && !edit) return;

        mode = "trade";
        activeId = edit ? edit.id : null;
        draft = {
            type: edit ? edit.type : opts.type || "BUY",
            symbol: edit ? edit.symbol : opts.symbol || "",
            name: edit ? edit.name : opts.name || "",
            editId: edit ? edit.id : null
        };

        const title = edit ? "Edit paper trade" : draft.type === "SELL" ? "Paper sell" : "Paper buy";
        const form = shell(
            title,
            `${typeChips()}
             <div data-paper-stock>${stockBlock()}</div>
             <div class="inc-fields stk-txn-fields">
                ${field("Quantity", `<input name="quantity" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required>`, "")}
                ${field("Price", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></span>`)}
                ${field("Date", `<input name="date" type="date" required>`)}
                ${field("Time", `<input name="time" type="time" step="1">`)}
                ${field("Note", `<input name="notes" type="text" autocomplete="off" placeholder="Optional">`)}
             </div>
             <div class="stk-total dr-preview" data-paper-preview></div>`,
            edit ? "Save changes" : draft.type === "SELL" ? "Record sell" : "Record buy"
        );

        form.date.value = edit ? edit.date : opts.date || todayStr();
        form.time.value = edit ? edit.time || "" : opts.time !== undefined ? opts.time : nowTime();
        form.quantity.value = edit ? edit.quantity : opts.quantity || "";
        form.price.value = edit ? edit.price : opts.price || "";
        if (opts.price) form.price.dataset.touched = "1";
        form.notes.value = edit ? edit.notes || "" : opts.notes || "";
        enhanceTimeInputs(layer);

        updateHint(form);
        updatePreview(form);
        if (draft.symbol) {
            lookupLive(form);
            setTimeout(() => (form.quantity.value === "" ? form.quantity : form.price).focus(), 30);
        } else {
            setTimeout(() => layer.querySelector("[data-paper-search]")?.focus(), 30);
        }
    }

    function setType(type) {
        if (!draft || draft.type === type) return;
        draft.type = type;
        layer.querySelectorAll("[data-paper-act='type']").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
        const form = layer.querySelector("[data-paper-form]");
        const sub = form.querySelector('[type="submit"]');
        if (sub && !draft.editId) sub.textContent = type === "SELL" ? "Record sell" : "Record buy";
        const h = layer.querySelector(".br-modal-header h3");
        if (h && !draft.editId) h.textContent = type === "SELL" ? "Paper sell" : "Paper buy";
        const inp = layer.querySelector("[data-paper-search]");
        if (inp) inp.placeholder = type === "SELL" ? "Search your holdings" : "Search stocks";
        if (type === "SELL" && draft.symbol && form.quantity.value === "") form.quantity.value = fmtQty(heldQty(draft.symbol));
        updateHint(form);
        updatePreview(form);
    }

    function updateHint(form) {
        const qField = form.quantity.closest(".inc-field");
        let hint = qField.querySelector("[data-hint]");
        if (!hint) {
            hint = document.createElement("span");
            hint.className = "inc-hint";
            hint.setAttribute("data-hint", "");
            qField.insertBefore(hint, qField.querySelector("[data-error]"));
        }
        if (draft.type === "SELL" && draft.symbol) {
            const q = heldQty(draft.symbol);
            hint.innerHTML = `Held: ${fmtQty(q)} <button type="button" class="dp-link" data-paper-act="max">Sell all</button>`;
        } else {
            hint.textContent = "";
        }
    }

    function candidateTrade(form, id) {
        return {
            id,
            symbol: draft.symbol,
            name: draft.name || draft.symbol,
            type: draft.type,
            quantity: round6(Number(form.quantity.value)),
            price: round2(Number(form.price.value)),
            date: form.date.value,
            time: form.time.value || "",
            notes: form.notes.value.trim()
        };
    }

    function updatePreview(form) {
        const el = layer.querySelector("[data-paper-preview]");
        if (!el) return;
        const q = Number(form.quantity.value);
        const p = Number(form.price.value);
        if (!draft.symbol || !(q > 0) || !(p > 0) || !form.date.value) {
            el.innerHTML = `<span>${draft.type === "SELL" ? "Realized P&L appears here" : "Total appears here"}</span>`;
            return;
        }
        const amount = round2(q * p);
        if (draft.type === "BUY") {
            el.innerHTML = `<span>${fmtQty(q)} shares at ${fmtMoney(p)}</span><strong>${fmtMoney(amount, true)}</strong>`;
            return;
        }
        const others = book.trades.filter((t) => t.id !== draft.editId);
        const t = candidateTrade(form, "__preview");
        t.seq = draft.editId ? (book.trades.find((x) => x.id === draft.editId) || {}).seq || nextSeq(others) : nextSeq(others);
        const r = replaySymbol(draft.symbol, [...others, t]);
        const pnl = r.error ? null : r.txnPnL["__preview"];
        el.innerHTML =
            pnl === null || pnl === undefined
                ? `<span>${fmtQty(q)} shares · ${fmtMoney(amount, true)}</span><strong class="br-pnl-neg">Not enough shares</strong>`
                : `<span>${fmtQty(q)} shares · ${fmtMoney(amount, true)} · realized</span><strong class="br-pnl-${pnlClass(pnl)}">${fmtSigned(pnl, true)}</strong>`;
    }

    async function saveTrade(form) {
        const q = Number(form.quantity.value);
        const p = Number(form.price.value);
        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.quantity, form.price, form.date].forEach((el) => showError(el, ""));

        if (!draft.symbol) { formError("Choose a stock first."); return; }
        if (form.quantity.value === "" || !(q > 0)) bad(form.quantity, "Enter the quantity.");
        if (form.price.value === "" || !(p > 0)) bad(form.price, "Enter the price.");
        if (!form.date.value) bad(form.date, "Pick the date.");
        else if (form.date.value > todayStr()) bad(form.date, "A trade can't be in the future.");
        if (!ok) return;

        const trade = candidateTrade(form, draft.editId || "ptx_" + genId().slice(4));
        let next;
        if (draft.editId) {
            const prev = book.trades.find((t) => t.id === draft.editId);
            if (!prev) return;
            trade.seq = prev.seq;
            trade.createdAt = prev.createdAt;
            next = book.trades.map((t) => (t.id === prev.id ? trade : t));
        } else {
            trade.seq = nextSeq(book.trades);
            trade.createdAt = Date.now();
            next = [...book.trades, trade];
        }

        const err = validateBook(next, book.funds);
        if (err) { formError(err.message); return; }

        await commit({ trades: next, funds: book.funds }, draft.editId ? "Trade updated" : `${trade.type === "BUY" ? "Buy" : "Sell"} added`);
    }

    async function commit(next, message) {
        if (saving) return;
        saving = true;
        const submit = layer.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;
        try {
            await persist(next);
            closeModal();
            render();
            ctx.changed();
            if (message) ctx.toast(message);
        } catch (err) {
            formError(err?.message || "Could not save. Please try again.");
        } finally {
            saving = false;
            if (submit) submit.disabled = false;
        }
    }

    /* ----- funds ----- */

    function openFunds() {
        mode = "funds";
        const form = shell(
            "Virtual funds",
            `<div class="inc-fields">
                ${field("Starting funds", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="funds" type="number" inputmode="decimal" step="0.01" min="0" placeholder="No limit"></span>`)}
             </div>`,
            "Save"
        );
        form.funds.value = book.funds === null ? "" : book.funds;
        setTimeout(() => form.funds.focus(), 30);
    }

    async function saveFunds(form) {
        showError(form.funds, "");
        const raw = form.funds.value.trim();
        const funds = raw === "" ? null : round2(Number(raw));
        if (funds !== null && (isNaN(funds) || funds < 0)) { showError(form.funds, "Enter a valid amount."); return; }
        const err = validateBook(book.trades, funds);
        if (err) { formError(err.message); return; }
        await commit({ trades: book.trades, funds }, funds === null ? "Fund limit removed" : "Funds updated");
    }

    /* ----- delete ----- */

    function openDelete(id) {
        const t = book.trades.find((x) => x.id === id);
        if (!t) return;
        mode = "delete";
        activeId = id;
        shell("Delete this trade?", `<p class="dr-confirm-name">${esc(t.type)} ${fmtQty(t.quantity)} × ${esc(t.symbol)} · ${esc(when(t))}</p>`, "Delete", true);
    }

    async function confirmDelete() {
        const next = book.trades.filter((t) => t.id !== activeId);
        const err = validateBook(next, book.funds);
        if (err) { formError("Can't delete this — later trades depend on it. " + err.message); return; }
        await commit({ trades: next, funds: book.funds }, "Trade deleted");
    }

    async function resetAll() {
        const ok = await confirmDialog({
            title: "Reset paper trading?",
            message: "All paper trades and your virtual funds will be cleared. Your wishlist and real holdings are not affected.",
            confirmLabel: "Reset"
        });
        if (!ok) return;
        try {
            await reset();
            ctx.changed();
            ctx.toast("Paper trading reset");
        } catch (err) {
            ctx.toast("Could not reset. Please try again.");
        }
    }

    /* =========================================
       EVENTS
    ========================================= */

    const closeMenus = () => {
        page.querySelectorAll("[data-paper-root] .dr-menu-pop").forEach((m) => {
            m.hidden = true;
            const b = m.previousElementSibling;
            if (b) b.setAttribute("aria-expanded", "false");
        });
    };

    const nameOf = (sym) => {
        const t = book.trades.filter((x) => x.symbol === sym).pop();
        return t ? t.name : sym;
    };

    page.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-paper-pick]");
        if (pick && layer.contains(pick)) {
            pickSymbol(pick.dataset.symbol, pick.dataset.name || "");
            return;
        }

        const el = event.target.closest("[data-paper-act]");
        if (!el || !page.contains(el)) {
            if (!layer.hidden && layer.contains(event.target) && !event.target.closest("[data-paper-suggest], .dp-search")) {
                const box = layer.querySelector("[data-paper-suggest]");
                if (box) box.hidden = true;
            }
            return;
        }

        const act = el.dataset.paperAct;
        closeMenus();
        const sym = el.dataset.symbol;

        if (act === "buy") openTrade({ type: "BUY", symbol: sym || "", name: sym ? nameOf(sym) : "" });
        else if (act === "sell") {
            if (sym) openTrade({ type: "SELL", symbol: sym, name: nameOf(sym), quantity: fmtQty(heldQty(sym)), price: ctx.price(sym) || "" });
            else openTrade({ type: "SELL" });
        } else if (act === "edit") openTrade({ editId: el.dataset.id });
        else if (act === "delete") openDelete(el.dataset.id);
        else if (act === "funds") openFunds();
        else if (act === "close") closeModal();
        else if (act === "sub") {
            sub = el.dataset.sub;
            render();
        } else if (act === "history") {
            sub = "trades";
            filter = { type: "all", symbol: sym };
            render();
        } else if (act === "ftype") {
            filter.type = el.dataset.type;
            render();
        } else if (act === "type") setType(el.dataset.type);
        else if (act === "change-stock") {
            draft.symbol = "";
            draft.name = "";
            lookupReq++;
            const host = layer.querySelector("[data-paper-stock]");
            host.innerHTML = stockBlock();
            const form = layer.querySelector("[data-paper-form]");
            updateHint(form);
            updatePreview(form);
            host.querySelector("[data-paper-search]")?.focus();
        } else if (act === "max") {
            const form = layer.querySelector("[data-paper-form]");
            form.quantity.value = fmtQty(heldQty(draft.symbol));
            updatePreview(form);
        } else if (act === "reset") resetAll();
    });

    page.addEventListener("change", (event) => {
        if (event.target.matches?.("[data-paper-fsym]")) {
            filter.symbol = event.target.value;
            render();
        }
    });

    page.addEventListener("submit", async (event) => {
        if (!event.target.matches("[data-paper-form]")) return;
        event.preventDefault();
        formError("");
        if (mode === "trade") await saveTrade(event.target);
        else if (mode === "funds") await saveFunds(event.target);
        else if (mode === "delete") await confirmDelete();
    });

    page.addEventListener("input", (event) => {
        const t = event.target;
        if (t.matches?.("[data-paper-search]")) {
            renderSuggest(t);
            return;
        }
        const form = t.closest?.("[data-paper-form]");
        if (!form || mode !== "trade") return;
        showError(t, "");
        formError("");
        if (t.name === "price") form.price.dataset.touched = "1";
        updatePreview(form);
    });

    page.addEventListener("focusin", (event) => {
        if (event.target.matches?.("[data-paper-search]")) renderSuggest(event.target);
    });

    page.addEventListener("keydown", (event) => {
        if (!event.target.matches?.("[data-paper-search]")) return;
        const box = layer.querySelector("[data-paper-suggest]");
        if (event.key === "ArrowDown") { event.preventDefault(); if (box.hidden) renderSuggest(event.target); else moveSuggest(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); moveSuggest(-1); }
        else if (event.key === "Enter") {
            event.preventDefault();
            const row = layer.querySelectorAll("[data-paper-pick]")[suggestIdx];
            if (row && !box.hidden) pickSymbol(row.dataset.symbol, row.dataset.name || "");
        } else if (event.key === "Escape") box.hidden = true;
    });

    const onKey = (event) => {
        if (!page.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
        }
        if (event.key === "Escape" && !layer.hidden) closeModal();
    };
    document.addEventListener("keydown", onKey);

    /* Called on every live-price tick; leaves open menus and dialogs alone */
    function tick() {
        const root = rootEl();
        if (!root || !layer.hidden) return;
        if (root.querySelector(".dr-menu-pop:not([hidden])")) return;
        render();
    }

    return {
        load,
        render,
        reset,
        tick,
        symbols,
        getBook: () => ({ trades: book.trades.slice(), funds: book.funds }),
        setBook,
        prices,
        openTrade
    };
}
