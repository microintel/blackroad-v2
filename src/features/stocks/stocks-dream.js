/*
 * stocks-dream.js
 *
 * "Dream" tab for the Stocks module — a wishlist of stocks you would
 * like to own.
 *
 * For each stock you record the price you saw it at and the amount you
 * would have put in. The tab then shows what that amount would be worth
 * at today's live price (hypothetical value, gain/loss and % growth).
 *
 * Everything here is kept apart from the real portfolio:
 *  - saved under its own "dreams" key in the stocks state store
 *  - never touches transactions, prices, holdings, totals or net worth
 *  - live prices are fetched into a private map, not the portfolio prices
 *
 * Paper trading (pretend buys / sells), Excel/JSON export and import for
 * this tab live in stocks-dream-paper.js, stocks-dream-book.js and
 * stocks-dream-io.js. Everything is Dream-only — separate from the global
 * Data Management backup.
 */

import { icon } from "../../components/icons.js";
import { enhanceTimeInputs } from "../../components/time-picker.js";
import { genId, round2, fmtMoney, fmtSigned, fmtPct, pnlClass, fmtDate, fmtTime } from "./stocks-service.js";
import { stockMiniLogoHTML, fetchStockDetails, fetchLTPs } from "./stocks-live.js";
import { printDreamReport } from "./stocks-dream-print.js";
import { STOCK_UNIVERSE } from "./stocks-universe.js";
import { initDreamPaper } from "./stocks-dream-paper.js";
import { isOpen, openClass, chevron, allButton, bindFold } from "./stocks-dream-fold.js";
import { exportDreamExcel, exportDreamJSON, parseDreamFile, applyDreamImport } from "./stocks-dream-io.js";

const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const POLL_MS = 20000;

function nowTime() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fmtQty = (q) => {
    const v = Math.round(q * 100) / 100;
    return String(v);
};

/* ---------- derived values (nothing calculated is stored) ---------- */

function calc(d, ltp) {
    const qty = d.seenPrice > 0 ? d.amount / d.seenPrice : 0;
    if (!(ltp > 0) || !(qty > 0)) return { qty, ltp: null };
    const value = round2(qty * ltp);
    const gain = round2(value - d.amount);
    const pct = (ltp / d.seenPrice - 1) * 100;
    return { qty, ltp, value, gain, pct };
}

export function initDream(page, ctx) {
    const root = page.querySelector("[data-dream-root]");
    const modal = page.querySelector("[data-dream-modal]");

    let dreams = [];
    let ltps = {}; // private live-price map: { SYMBOL: price }
    let mode = null; // "add" | "edit" | "delete"
    let activeId = null;
    let picked = null; // { symbol, name } while adding
    let saving = false;
    let timer = null;
    let fetching = false;
    let lastUpdated = 0;
    let suggestIdx = -1;
    let lookupReq = 0;
    let view = "wishlist"; // "wishlist" | "paper"
    let pendingImport = null; // parsed file while the import dialog is open
    let toastEl = null;
    let toastTimer = 0;

    /* Same toast element style as Data Management (.br-toast) */
    function toast(message) {
        if (!toastEl || !toastEl.isConnected) {
            toastEl = document.createElement("div");
            toastEl.className = "br-toast";
            page.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl && toastEl.classList.remove("show"), 3200);
    }

    bindFold(page);

    const paper = initDreamPaper(page, {
        store: ctx.store,
        price: (sym) => livePrice(sym),
        setPrice: (sym, p) => { ltps[sym] = p; },
        suggest: (raw) => suggestions(raw),
        toast,
        changed: () => { refresh(); updateCount(); }
    });

    function updateCount() {
        const count = page.querySelector('[data-count="dream"]');
        if (count) count.textContent = dreams.length + paper.getBook().trades.length > 0 ? dreams.length : "";
    }

    /* =========================================
       LOAD / PERSIST
    ========================================= */

    async function load() {
        dreams = await ctx.store.getDreams();
        try {
            await paper.load();
        } catch (err) {
            /* Paper trading is optional — never block the wishlist */
        }
    }

    async function reset() {
        dreams = [];
        ltps = {};
        await ctx.store.saveDreams(dreams);
        try {
            await paper.reset();
        } catch (err) { /* ignore */ }
        render();
    }

    /* =========================================
       LIVE PRICES (only for the wishlist)
    ========================================= */

    const livePrice = (sym) => {
        if (ltps[sym] > 0) return ltps[sym];
        const p = ctx.getPrices()[sym];
        return p > 0 ? p : null;
    };

    async function refresh() {
        if (fetching) return;
        const syms = [...new Set([...dreams.map((d) => d.symbol), ...paper.symbols()])];
        if (!syms.length) return;
        fetching = true;
        try {
            const { updates } = await fetchLTPs(syms);
            if (Object.keys(updates).length) {
                Object.assign(ltps, updates);
                lastUpdated = Date.now();
            }
        } finally {
            fetching = false;
        }
        if (page.isConnected && modal.hidden) renderList();
        else if (page.isConnected) renderSummary();
        if (page.isConnected) paper.tick();
    }

    function start() {
        stop();
        refresh();
        timer = setInterval(() => {
            if (!page.isConnected) return stop();
            if (!document.hidden) refresh();
        }, POLL_MS);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
    }

    /* =========================================
       RENDER
    ========================================= */

    function render() {
        if (!root) return;

        updateCount();

        root.innerHTML = `
            <div class="dr-top">
                <div class="dr-seg" role="group" aria-label="Dream views">
                    <button type="button" class="dr-seg-btn${view === "wishlist" ? " active" : ""}" data-dream-act="view" data-view="wishlist">Wishlist</button>
                    <button type="button" class="dr-seg-btn${view === "paper" ? " active" : ""}" data-dream-act="view" data-view="paper">Paper trading</button>
                </div>
                <div class="dr-menu dr-data">
                    <button type="button" class="inc-icon-button dr-menu-btn dr-data-btn" data-dream-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Export, import and report" title="Export, import and report">${icon("ellipsis", { size: 18 })}</button>
                    <div class="dr-menu-pop" role="menu" hidden>
                        <button type="button" role="menuitem" data-dream-act="export-xlsx">${icon("download", { size: 15 })}<span>Export to Excel</span></button>
                        <button type="button" role="menuitem" data-dream-act="export-json">${icon("file-text", { size: 15 })}<span>Export backup (JSON)</span></button>
                        <button type="button" role="menuitem" data-dream-act="import">${icon("upload", { size: 15 })}<span>Import file</span></button>
                        <button type="button" role="menuitem" data-dream-act="download" ${dreams.length ? "" : "disabled"}>${icon("file-up", { size: 15 })}<span>PDF report</span></button>
                    </div>
                </div>
            </div>

            <div data-dream-pane="wishlist" ${view === "wishlist" ? "" : "hidden"}>
            <section class="inc-section dr-section">
                <div class="dr-search" data-dream-search-wrap>
                    <div class="dr-search-box">
                        <span class="dr-search-icon" aria-hidden="true">${icon("search", { size: 18 })}<i class="dr-spin"></i></span>
                        <input type="text" class="dr-search-input" data-dream-search placeholder="Search stocks" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="search" role="combobox" aria-expanded="false" aria-controls="dr-suggest" aria-label="Search stocks">
                        <button type="button" class="dr-search-clear" data-dream-act="clear-search" aria-label="Clear" hidden>${icon("x", { size: 16 })}</button>
                    </div>
                    <div class="dr-suggest" id="dr-suggest" data-dream-suggest role="listbox" hidden></div>
                </div>

                <div data-dream-summary></div>
                <div data-dream-list></div>
            </section>
            </div>
            <div data-dream-pane="paper" data-paper-root ${view === "paper" ? "" : "hidden"}></div>`;

        renderSummary();
        renderList();
        paper.render();
    }

    function setView(next) {
        if (next === view) return;
        view = next;
        root.querySelectorAll("[data-dream-pane]").forEach((p) => { p.hidden = p.dataset.dreamPane !== view; });
        root.querySelectorAll(".dr-seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
        closeMenus();
        if (view === "paper") paper.render();
    }

    function renderSummary() {
        const box = root && root.querySelector("[data-dream-summary]");
        if (!box) return;
        if (!dreams.length) {
            box.innerHTML = "";
            return;
        }

        let invested = 0;
        let value = 0;
        let priced = 0;
        dreams.forEach((d) => {
            const c = calc(d, livePrice(d.symbol));
            if (c.ltp == null) return;
            invested += d.amount;
            value += c.value;
            priced++;
        });
        invested = round2(invested);
        value = round2(value);
        const gain = round2(value - invested);
        const pct = invested > 0 ? (gain / invested) * 100 : 0;
        const tone = priced ? pnlClass(gain) : "";

        const metric = (label, val, hint, cls = "") => `
            <div class="dr-metric">
                <span class="dr-metric-label">${label}</span>
                <strong class="dr-metric-val ${cls}">${val}</strong>
                ${hint ? `<span class="dr-metric-hint ${cls}">${hint}</span>` : ""}
            </div>`;

        const cls = tone ? "br-pnl-" + tone : "";
        const key = "sum:wish";
        const open = isOpen(key);

        box.innerHTML = `
            <div class="dr-sum${open ? " is-open" : ""}" data-fold-host>
                <button type="button" class="dr-sum-head" data-fold="${key}" aria-expanded="${open}">
                    <span class="dr-sum-main">
                        <span class="dr-sum-label">Growth</span>
                        <strong class="dr-sum-val ${cls}">${priced ? fmtPct(pct) : "–"}</strong>
                        ${priced ? `<span class="dr-sum-sub ${cls}">${fmtSigned(gain, true)}</span>` : ""}
                    </span>
                    ${chevron()}
                </button>
                <div class="dr-more"><div>
                    <div class="dr-metrics">
                        ${metric("Wishlist", String(dreams.length), "")}
                        ${metric("If bought", priced ? fmtMoney(invested, true) : "–", "")}
                        ${metric("Value now", priced ? fmtMoney(value, true) : "–", "")}
                        ${metric("Growth", priced ? fmtSigned(gain, true) : "–", priced ? fmtPct(pct) : "", cls)}
                    </div>
                </div></div>
            </div>`;
    }

    function renderList() {
        const box = root && root.querySelector("[data-dream-list]");
        if (!box) return;
        renderSummary();

        if (!dreams.length) {
            box.innerHTML = `
                <div class="dr-empty">${icon("sparkles", { size: 20 })}<span>No dream stocks yet</span></div>`;
            return;
        }

        const rows = dreams
            .map((d) => ({ d, c: calc(d, livePrice(d.symbol)) }))
            .sort((a, b) => (b.d.createdAt || 0) - (a.d.createdAt || 0));

        box.innerHTML = `
            <div data-fold-scope>
                <div class="dr-listbar">
                    <span class="dr-count">${rows.length} ${rows.length === 1 ? "stock" : "stocks"}</span>
                    ${allButton(rows.map(({ d }) => "w:" + d.id))}
                </div>
                <div class="stk-list dr-list">${rows.map(({ d, c }) => cardHTML(d, c)).join("")}</div>
            </div>`;
    }

    function cardHTML(d, c) {
        const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        const has = c.ltp != null;
        const tone = has ? pnlClass(c.gain) : "";

        const right = has
            ? `<span class="dr-growth br-pnl-${tone}">
                    <strong>${fmtPct(c.pct)}</strong>
                    <span>${fmtSigned(c.gain, true)}</span>
               </span>`
            : `<span class="dr-growth dr-growth-na"><strong>–</strong></span>`;

        const key = "w:" + d.id;
        const open = isOpen(key);

        return `
            <article class="inc-entry stk-card dr-card${open ? " is-open" : ""}" data-key="${esc(d.id)}" data-fold-host>
                <div class="stk-card-top">
                    <button type="button" class="dr-row" data-fold="${esc(key)}" aria-expanded="${open}">
                        ${stockMiniLogoHTML(d.symbol, 32)}
                        <span class="stk-id">
                            <span class="stk-name">${esc(d.name)}</span>
                            <span class="inc-meta">${esc(d.symbol)}</span>
                        </span>
                        ${right}
                        ${chevron()}
                    </button>
                    <div class="dr-menu">
                        <button type="button" class="inc-icon-button dr-menu-btn" data-dream-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More options" title="More">${icon("ellipsis", { size: 18 })}</button>
                        <div class="dr-menu-pop" role="menu" hidden>
                            <button type="button" role="menuitem" data-dream-act="paper-buy" data-id="${esc(d.id)}">${icon("plus", { size: 15 })}<span>Paper buy</span></button>
                            <button type="button" role="menuitem" data-dream-act="edit" data-id="${esc(d.id)}">${icon("pencil", { size: 15 })}<span>Edit</span></button>
                            <button type="button" role="menuitem" class="is-danger" data-dream-act="delete" data-id="${esc(d.id)}">${icon("trash-2", { size: 15 })}<span>Remove</span></button>
                        </div>
                    </div>
                </div>
                <div class="dr-more"><div>
                    <dl class="stk-stats">
                        ${stat("Saw at", fmtMoney(d.seenPrice))}
                        ${stat("Now", has ? fmtMoney(c.ltp) : "–")}
                        ${stat("Amount", fmtMoney(d.amount, true))}
                        ${stat("Shares", fmtQty(c.qty))}
                        ${stat("Worth", has ? `<span class="br-pnl-${tone}">${fmtMoney(c.value, true)}</span>` : "–")}
                        ${stat("Seen", esc(fmtDate(d.date)) + (d.time ? " · " + esc(fmtTime(d.time)) : ""))}
                        ${d.target > 0 ? stat("Target", fmtMoney(d.target) + (has && c.ltp <= d.target ? ` <span class="dr-zone">In buy zone</span>` : "")) : ""}
                    </dl>
                    ${d.notes ? `<p class="inc-hint ipo-notes">${esc(d.notes)}</p>` : ""}
                </div></div>
            </article>`;
    }

    /* =========================================
       SEARCH + SUGGESTIONS
    ========================================= */

    // Lowercased index, built once and only rebuilt when the sources change
    let indexKey = "";
    let index = [];

    function universe() {
        const key = ctx.getTransactions().length + "|" + dreams.length;
        if (key === indexKey && index.length) return index;
        indexKey = key;
        const map = new Map();
        // the user's own stocks first, so names they already use win
        ctx.getTransactions().forEach((t) => {
            if (t.symbol && !map.has(t.symbol)) map.set(t.symbol, t.name || t.symbol);
        });
        dreams.forEach((d) => {
            if (!map.has(d.symbol)) map.set(d.symbol, d.name);
        });
        STOCK_UNIVERSE.forEach(([s, n]) => {
            if (!map.has(s)) map.set(s, n);
        });
        index = [...map].map(([symbol, name]) => ({ symbol, name, s: symbol.toLowerCase(), n: name.toLowerCase(), words: name.toLowerCase().split(/\s+/) }));
        return index;
    }

    function mark(text, q) {
        if (!q) return esc(text);
        const i = text.toLowerCase().indexOf(q);
        if (i < 0) return esc(text);
        return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
    }

    function suggestions(raw) {
        const q = raw.trim().toLowerCase();
        const all = universe();
        if (!q) return { list: all.filter((x) => STOCK_UNIVERSE.slice(0, 8).some((u) => u[0] === x.symbol)).slice(0, 8), popular: true };

        const score = (x) => {
            const s = x.s;
            const n = x.n;
            if (s === q) return 0;
            if (s.startsWith(q)) return 1;
            if (n.startsWith(q)) return 2;
            if (x.words.some((w) => w.startsWith(q))) return 3;
            if (s.includes(q)) return 4;
            if (n.includes(q)) return 5;
            return 99;
        };
        const list = all
            .map((x) => ({ x, s: score(x) }))
            .filter((r) => r.s < 99)
            .sort((a, b) => a.s - b.s || a.x.symbol.length - b.x.symbol.length)
            .slice(0, 7)
            .map((r) => r.x);

        // Any other NSE symbol can be typed — it is verified when picked
        const typed = raw.trim().toUpperCase();
        if (/^[A-Z0-9&-]{1,20}$/.test(typed) && !list.some((x) => x.symbol === typed)) {
            list.push({ symbol: typed, name: "", custom: true });
        }
        return { list, popular: false };
    }

    let searchRaf = 0;
    let spinTimer = 0;

    // One render per frame; the search icon spins briefly while results settle
    function onSearchInput(input) {
        const wrap = root.querySelector(".dr-search-box");
        const clear = root.querySelector(".dr-search-clear");
        if (clear) clear.hidden = !input.value;
        if (wrap) wrap.classList.add("is-searching");
        cancelAnimationFrame(searchRaf);
        clearTimeout(spinTimer);
        searchRaf = requestAnimationFrame(() => renderSuggest(input));
        spinTimer = setTimeout(() => wrap && wrap.classList.remove("is-searching"), 260);
    }

    function renderSuggest(input) {
        const box = root.querySelector("[data-dream-suggest]");
        if (!box) return;
        const raw = input.value.trim().toLowerCase();
        const { list, popular } = suggestions(input.value);
        suggestIdx = list.length ? 0 : -1;

        if (!list.length) {
            box.innerHTML = `<div class="dr-suggest-empty">No match</div>`;
        } else {
            const added = new Set(dreams.map((d) => d.symbol));
            box.innerHTML =
                (popular ? `<div class="dr-suggest-head">Popular</div>` : "") +
                list
                    .map(
                        (x, i) => `
                <div class="dr-suggest-row${i === suggestIdx ? " is-active" : ""}" style="--i:${i}" role="option" data-dream-pick data-symbol="${esc(x.symbol)}" data-name="${esc(x.name)}">
                    ${stockMiniLogoHTML(x.symbol, 30)}
                    <div class="dr-suggest-text">
                        <span class="dr-suggest-name">${x.custom ? `Use “${esc(x.symbol)}”` : mark(x.name, raw)}</span>
                        <span class="dr-suggest-sym">${x.custom ? "Look up live price" : mark(x.symbol, raw)}</span>
                    </div>
                    ${added.has(x.symbol) ? `<span class="br-badge">In wishlist</span>` : `<span class="dr-suggest-add">${icon("plus", { size: 16 })}</span>`}
                </div>`
                    )
                    .join("");
        }
        box.hidden = false;
        input.setAttribute("aria-expanded", "true");
    }

    function closeSuggest() {
        const box = root && root.querySelector("[data-dream-suggest]");
        const input = root && root.querySelector("[data-dream-search]");
        if (box) box.hidden = true;
        if (input) input.setAttribute("aria-expanded", "false");
    }

    function moveSuggest(dir) {
        const rows = [...root.querySelectorAll("[data-dream-pick]")];
        if (!rows.length) return;
        suggestIdx = (suggestIdx + dir + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle("is-active", i === suggestIdx));
        rows[suggestIdx].scrollIntoView({ block: "nearest" });
    }

    /* =========================================
       MODAL
    ========================================= */

    const field = (label, control, hint = "") => `
        <div class="inc-field">
            <label>
                <span class="inc-field-label">${label}</span>
                ${control}
            </label>
            ${hint ? `<span class="inc-hint">${hint}</span>` : ""}
            <p class="inc-error" data-error hidden></p>
        </div>`;

    function shell(title, inner, submitLabel, danger) {
        modal.innerHTML = `
            <div class="br-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="br-modal-header">
                    <h3>${esc(title)}</h3>
                    <button type="button" class="br-modal-close" data-dream-act="close" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
                </div>
                <form data-dream-form novalidate>
                    <div class="inc-form-error" data-dream-error role="alert" hidden></div>
                    ${inner}
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-dream-act="close">Cancel</button>
                        <button type="submit" class="br-button ${danger ? "br-button-danger" : "br-button-primary"}">${esc(submitLabel)}</button>
                    </div>
                </form>
            </div>`;
        modal.hidden = false;
        enhanceTimeInputs(modal);
        return modal.querySelector("[data-dream-form]");
    }

    function closeModal() {
        modal.hidden = true;
        modal.innerHTML = "";
        mode = null;
        activeId = null;
        picked = null;
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
        const b = modal.querySelector("[data-dream-error]");
        if (!b) return;
        b.textContent = msg || "";
        b.hidden = !msg;
    }

    const headBlock = (symbol, name) => `
        <div class="dr-pick">
            ${stockMiniLogoHTML(symbol, 40)}
            <div class="dr-pick-text">
                <strong data-dream-pick-name>${esc(name || symbol)}</strong>
                <span>${esc(symbol)} · <span data-dream-pick-ltp>Fetching live price…</span></span>
            </div>
        </div>`;

    const formFields = `
        <div class="inc-fields stk-txn-fields">
            ${field("Price I saw", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></span>`)}
            ${field("Amount", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></span>`)}
            ${field("Date seen", `<input name="date" type="date" required>`)}
            ${field("Time seen", `<input name="time" type="time" step="1">`)}
            ${field("Target price", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="target" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Optional"></span>`)}
            ${field("Note", `<input name="notes" type="text" autocomplete="off" placeholder="Optional">`)}
        </div>
        <div class="stk-total dr-preview" data-dream-preview></div>`;

    function openAdd(symbol, name) {
        mode = "add";
        activeId = null;
        picked = { symbol, name };

        const form = shell("Add to wishlist", headBlock(symbol, name) + formFields, "Add to wishlist");
        form.date.value = todayStr();
        form.time.value = nowTime();
        updatePreview(form);
        setTimeout(() => form.price.focus(), 30);

        // Live price + official name; prefills "Price I saw" only while it is empty
        const req = ++lookupReq;
        (async () => {
            let ltp = null;
            let companyName = "";
            try {
                const d = await fetchStockDetails(symbol);
                ltp = d.ltp;
                companyName = d.companyName;
            } catch (e) {
                ltp = livePrice(symbol);
            }
            if (req !== lookupReq || mode !== "add" || !modal.contains(form)) return;

            const ltpEl = modal.querySelector("[data-dream-pick-ltp]");
            if (typeof ltp === "number" && isFinite(ltp) && ltp > 0) {
                ltps[symbol] = ltp;
                if (ltpEl) ltpEl.textContent = `Live ${fmtMoney(ltp)}`;
                if (form.price.value === "") {
                    form.price.value = ltp;
                    form.price.dataset.autoFilled = "1";
                }
            } else if (ltpEl) {
                ltpEl.textContent = "Live price unavailable";
            }
            if (companyName && !name) {
                picked.name = companyName;
                const n = modal.querySelector("[data-dream-pick-name]");
                if (n) n.textContent = companyName;
            }
            updatePreview(form);
        })();
    }

    function openEdit(id) {
        const d = dreams.find((x) => x.id === id);
        if (!d) return;
        mode = "edit";
        activeId = id;

        const form = shell("Edit wishlist stock", headBlock(d.symbol, d.name) + formFields, "Save changes");
        form.price.value = d.seenPrice;
        form.amount.value = d.amount;
        form.date.value = d.date;
        form.time.value = d.time || "";
        form.target.value = d.target > 0 ? d.target : "";
        form.notes.value = d.notes || "";
        const ltp = livePrice(d.symbol);
        const ltpEl = modal.querySelector("[data-dream-pick-ltp]");
        if (ltpEl) ltpEl.textContent = ltp ? `Live ${fmtMoney(ltp)}` : "Live price unavailable";
        updatePreview(form);
        setTimeout(() => form.price.focus(), 30);
    }

    function openDelete(id) {
        const d = dreams.find((x) => x.id === id);
        if (!d) return;
        mode = "delete";
        activeId = id;
        shell(
            "Remove from wishlist?",
            `<p class="dr-confirm-name">${esc(d.name)}</p>`,
            "Remove",
            true
        );
    }

    function updatePreview(form) {
        const el = modal.querySelector("[data-dream-preview]");
        if (!el) return;
        const price = Number(form.price.value);
        const amount = Number(form.amount.value);
        const sym = mode === "edit" ? (dreams.find((x) => x.id === activeId) || {}).symbol : picked && picked.symbol;
        const ltp = sym ? livePrice(sym) : null;

        if (!(price > 0) || !(amount > 0)) {
            el.innerHTML = `<span>Growth appears here</span>`;
            return;
        }
        const qty = amount / price;
        if (!ltp) {
            el.innerHTML = `<span>${fmtQty(qty)} shares</span><strong>${fmtMoney(amount, true)}</strong>`;
            return;
        }
        const value = qty * ltp;
        const pct = (ltp / price - 1) * 100;
        el.innerHTML = `<span>${fmtQty(qty)} shares · worth ${fmtMoney(value, true)} now</span><strong class="br-pnl-${pnlClass(pct)}">${fmtPct(pct)}</strong>`;
    }

    async function saveForm(form) {
        const price = Number(form.price.value);
        const amount = Number(form.amount.value);
        const date = form.date.value;
        const time = form.time.value || "";
        const target = form.target.value === "" ? null : Number(form.target.value);
        const notes = form.notes.value.trim();

        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.price, form.amount, form.date, form.target].forEach((el) => showError(el, ""));

        if (form.price.value === "" || isNaN(price) || price <= 0) bad(form.price, "Enter the price you saw.");
        if (form.amount.value === "" || isNaN(amount) || amount <= 0) bad(form.amount, "Enter the amount.");
        if (!date) bad(form.date, "Pick the date you saw it.");
        if (target !== null && (isNaN(target) || target <= 0)) bad(form.target, "Enter a valid target price or leave it empty.");
        if (!ok) return;

        let next;
        let previous = null;
        if (mode === "edit") {
            previous = dreams.find((x) => x.id === activeId);
            if (!previous) return;
            next = { ...previous, seenPrice: round2(price), amount: round2(amount), date, time, target: target === null ? null : round2(target), notes };
        } else {
            next = {
                id: "dream_" + genId().slice(4),
                createdAt: Date.now(),
                symbol: picked.symbol,
                name: picked.name || picked.symbol,
                seenPrice: round2(price),
                amount: round2(amount),
                date,
                time,
                target: target === null ? null : round2(target),
                notes
            };
        }
        await commit(next, previous);
    }

    async function commit(next, previous) {
        if (saving) return;
        saving = true;
        const before = dreams.slice();
        const submit = modal.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;

        try {
            if (next && previous) dreams = dreams.map((x) => (x.id === previous.id ? next : x));
            else if (next) dreams = [...dreams, next];
            else dreams = dreams.filter((x) => x.id !== previous.id);

            await ctx.store.saveDreams(dreams);

            const added = next && !previous ? next.symbol : null;
            closeModal();
            if (added) {
                const input = root.querySelector("[data-dream-search]");
                if (input) input.value = "";
                cancelAnimationFrame(searchRaf);
                closeSuggest();
            }
            render();
            refresh();
        } catch (err) {
            dreams = before;
            formError(err?.message || "Could not save. Please try again.");
        } finally {
            saving = false;
            if (submit) submit.disabled = false;
        }
    }

    /* =========================================
       EXPORT / IMPORT (Dream only)
    ========================================= */

    async function doExport(kind) {
        const book = paper.getBook();
        if (!dreams.length && !book.trades.length) {
            toast("Nothing to export yet");
            return;
        }
        try {
            if (kind === "json") {
                exportDreamJSON({ dreams, book });
                toast("Backup exported");
            } else {
                const rows = dreams.map((d) => ({ d, c: calc(d, livePrice(d.symbol)) }));
                await exportDreamExcel({ rows, book, prices: paper.prices() });
                toast("Excel exported");
            }
        } catch (err) {
            toast(err?.message || "Export failed");
        }
    }

    function pickImportFile() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls,.csv,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        input.addEventListener("change", async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            try {
                openImport(await parseDreamFile(file));
            } catch (err) {
                toast(err?.message || "Could not read this file.");
            }
        });
        input.click();
    }

    function openImport(parsed) {
        pendingImport = parsed;
        mode = "import";
        const line = (label, n) => (n === null ? "" : `<li><strong>${n}</strong> ${label}</li>`);
        const rej = parsed.rejected.length
            ? `<details class="dr-imp-rej"><summary>${parsed.rejected.length} row${parsed.rejected.length === 1 ? "" : "s"} can't be imported</summary><ul>${parsed.rejected.slice(0, 8).map((r) => `<li>${esc(r)}</li>`).join("")}${parsed.rejected.length > 8 ? `<li>…and ${parsed.rejected.length - 8} more</li>` : ""}</ul></details>`
            : "";
        shell(
            "Import Dream data",
            `<p class="br-muted dr-imp-file">${esc(parsed.fileName)}</p>
             <ul class="dr-imp-list">
                ${line("wishlist stocks found", parsed.dreams ? parsed.dreams.length : null)}
                ${line("paper trades found", parsed.trades ? parsed.trades.length : null)}
                ${parsed.funds !== undefined ? `<li>Virtual funds: <strong>${parsed.funds === null ? "No limit" : fmtMoney(parsed.funds, true)}</strong></li>` : ""}
             </ul>
             ${rej}
             <div class="dr-imp-modes" role="radiogroup" aria-label="Import mode">
                <label><input type="radio" name="impmode" value="merge" checked><span><strong>Add to what I have</strong></span></label>
                <label><input type="radio" name="impmode" value="replace"><span><strong>Replace</strong></span></label>
             </div>`,
            "Import"
        );
    }

    async function runImport(form) {
        if (!pendingImport || saving) return;
        saving = true;
        const submit = modal.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;
        try {
            const pick = form.querySelector('input[name="impmode"]:checked');
            const result = applyDreamImport(pendingImport, { dreams, book: paper.getBook() }, pick ? pick.value : "merge");
            const parsed = pendingImport;

            if (parsed.dreams) {
                await ctx.store.saveDreams(result.dreams);
                dreams = result.dreams;
            }
            if (parsed.trades || parsed.funds !== undefined) await paper.setBook(result.book);

            const r = result.report;
            pendingImport = null;
            closeModal();
            render();
            refresh();

            const skipped = r.wishSkipped + r.tradesSkipped;
            const parts = [];
            if (parsed.dreams) parts.push(`${r.wishAdded} wishlist`);
            if (parsed.trades) parts.push(`${r.tradesAdded} trade${r.tradesAdded === 1 ? "" : "s"}`);
            mode = "done";
            shell(
                "Import complete",
                `<p>Imported <strong>${esc(parts.join(" · ") || "settings")}</strong>${skipped ? ` · ${skipped} skipped (duplicates or invalid)` : ""}.</p>
                 ${r.notes.length ? `<details class="dr-imp-rej" open><summary>Why some trades were skipped</summary><ul>${r.notes.slice(0, 8).map((n) => `<li>${esc(n)}</li>`).join("")}${r.notes.length > 8 ? `<li>…and ${r.notes.length - 8} more</li>` : ""}</ul></details>` : ""}`,
                "Done"
            );
            modal.querySelectorAll('[data-dream-act="close"]').forEach((b) => b.remove());
            toast("Imported ✓");
        } catch (err) {
            formError(err?.message || "Import failed. Nothing was changed.");
        } finally {
            saving = false;
            const sb = modal.querySelector('[type="submit"]');
            if (sb) sb.disabled = false;
        }
    }

    /* =========================================
       EVENTS
    ========================================= */

    function closeMenus(except) {
        root && root.querySelectorAll(".dr-menu-pop").forEach((m) => {
            if (m === except) return;
            m.hidden = true;
            const b = m.previousElementSibling;
            if (b) b.setAttribute("aria-expanded", "false");
        });
    }

    function toggleMenu(btn) {
        const pop = btn.nextElementSibling;
        if (!pop) return;
        closeMenus(pop);
        pop.hidden = !pop.hidden;
        btn.setAttribute("aria-expanded", String(!pop.hidden));
        if (!pop.hidden) {
            // open upward when there is no room below the button
            pop.classList.remove("is-up");
            const r = pop.getBoundingClientRect();
            const room = btn.getBoundingClientRect().top;
            if (r.bottom > window.innerHeight - 8 && room > r.height + 12) pop.classList.add("is-up");
        }
    }

    page.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-dream-pick]");
        if (pick && root.contains(pick)) {
            closeSuggest();
            openAdd(pick.dataset.symbol, pick.dataset.name || "");
            return;
        }

        const el = event.target.closest("[data-dream-act]");
        if (el && page.contains(el)) {
            const act = el.dataset.dreamAct;
            if (act !== "menu") closeMenus();
            if (act === "menu") toggleMenu(el);
            else if (act === "edit") openEdit(el.dataset.id);
            else if (act === "delete") openDelete(el.dataset.id);
            else if (act === "close") closeModal();
            else if (act === "view") setView(el.dataset.view);
            else if (act === "export-xlsx") doExport("xlsx");
            else if (act === "export-json") doExport("json");
            else if (act === "import") pickImportFile();
            else if (act === "paper-buy") {
                const d = dreams.find((x) => x.id === el.dataset.id);
                if (d) {
                    setView("paper");
                    const raw = d.seenPrice > 0 ? d.amount / d.seenPrice : 0;
                    paper.openTrade({
                        type: "BUY",
                        symbol: d.symbol,
                        name: d.name,
                        price: d.seenPrice,
                        quantity: Math.floor(raw) || Math.round(raw * 1e4) / 1e4 || "",
                        date: d.date,
                        time: d.time || "",
                        notes: d.notes || ""
                    });
                }
            }
            else if (act === "download") {
                if (dreams.length) printDreamReport(dreams.map((d) => ({ d, c: calc(d, livePrice(d.symbol)) })));
            }
            else if (act === "clear-search") {
                const i = root.querySelector("[data-dream-search]");
                i.value = "";
                i.focus();
                onSearchInput(i);
            }
            return;
        }

        if (root && !event.target.closest(".dr-menu")) closeMenus();

        // click outside the search box closes the suggestions
        if (root && !event.target.closest("[data-dream-search-wrap]")) closeSuggest();
    });

    page.addEventListener("focusin", (event) => {
        if (event.target.matches?.("[data-dream-search]")) renderSuggest(event.target);
    });

    page.addEventListener("submit", async (event) => {
        if (!event.target.matches("[data-dream-form]")) return;
        event.preventDefault();
        formError("");
        if (mode === "add" || mode === "edit") await saveForm(event.target);
        else if (mode === "import") await runImport(event.target);
        else if (mode === "done") closeModal();
        else if (mode === "delete") {
            const d = dreams.find((x) => x.id === activeId);
            if (d) await commit(null, d);
        }
    });

    page.addEventListener("input", (event) => {
        if (event.target.matches?.("[data-dream-search]")) {
            onSearchInput(event.target);
            return;
        }
        const form = event.target.closest?.("[data-dream-form]");
        if (!form) return;
        showError(event.target, "");
        if (event.target.name === "price") delete form.price.dataset.autoFilled;
        if (mode === "add" || mode === "edit") updatePreview(form);
    });

    page.addEventListener("keydown", (event) => {
        if (!event.target.matches?.("[data-dream-search]")) return;
        const box = root.querySelector("[data-dream-suggest]");
        if (event.key === "ArrowDown") { event.preventDefault(); if (box.hidden) renderSuggest(event.target); else moveSuggest(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); moveSuggest(-1); }
        else if (event.key === "Enter") {
            event.preventDefault();
            const row = root.querySelectorAll("[data-dream-pick]")[suggestIdx];
            if (row && !box.hidden) {
                closeSuggest();
                openAdd(row.dataset.symbol, row.dataset.name || "");
            }
        } else if (event.key === "Escape") {
            closeSuggest();
        }
    });

    const onKey = (event) => {
        if (!page.isConnected) {
            document.removeEventListener("keydown", onKey);
            stop();
            return;
        }
        if (event.key === "Escape" && !modal.hidden) closeModal();
    };
    document.addEventListener("keydown", onKey);

    return { load, render, reset, start, stop };
}
