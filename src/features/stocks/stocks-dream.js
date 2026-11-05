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
 */

import { icon } from "../../components/icons.js";
import { genId, round2, fmtMoney, fmtSigned, fmtPct, pnlClass, fmtDate } from "./stocks-service.js";
import { stockMiniLogoHTML, fetchStockDetails, fetchLTPs } from "./stocks-live.js";
import { printDreamReport } from "./stocks-dream-print.js";
import { STOCK_UNIVERSE } from "./stocks-universe.js";

const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const POLL_MS = 20000;

const INFO_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

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

    /* =========================================
       LOAD / PERSIST
    ========================================= */

    async function load() {
        dreams = await ctx.store.getDreams();
    }

    async function reset() {
        dreams = [];
        ltps = {};
        await ctx.store.saveDreams(dreams);
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
        const syms = [...new Set(dreams.map((d) => d.symbol))];
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

        const count = page.querySelector('[data-count="dream"]');
        if (count) count.textContent = dreams.length > 0 ? dreams.length : "";

        root.innerHTML = `
            <section class="inc-section dr-section">
                <div class="inc-section-head">
                    <div class="dr-title">
                        <h3>Dream stocks</h3>
                        <span class="dr-info">
                            <button type="button" class="dr-info-btn" data-dream-act="info" aria-label="About Dream stocks" aria-expanded="false" title="About Dream stocks">${INFO_SVG}</button>
                            <span class="dr-info-pop" role="tooltip" hidden>Your wishlist. Not counted in holdings, totals or net worth.</span>
                        </span>
                    </div>
                    <button type="button" class="br-button dr-download" data-dream-act="download" aria-label="Download PDF report" title="Download PDF report" ${dreams.length ? "" : "disabled"}>${icon("download", { size: 16 })}<span>Report</span></button>
                </div>

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
            </section>`;

        renderSummary();
        renderList();
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

        box.innerHTML = `
            <div class="dr-metrics">
                ${metric("Wishlist", String(dreams.length), "")}
                ${metric("If bought", priced ? fmtMoney(invested, true) : "–", "")}
                ${metric("Value now", priced ? fmtMoney(value, true) : "–", "")}
                ${metric("Growth", priced ? fmtSigned(gain, true) : "–", priced ? fmtPct(pct) : "", tone ? "br-pnl-" + tone : "")}
            </div>`;
    }

    function renderList() {
        const box = root && root.querySelector("[data-dream-list]");
        if (!box) return;
        renderSummary();

        if (!dreams.length) {
            box.innerHTML = `
                <div class="inc-empty dr-empty">
                    ${icon("sparkles", { size: 22 })}
                    <h4>No dream stocks yet</h4>
                </div>`;
            return;
        }

        const rows = dreams
            .map((d) => ({ d, c: calc(d, livePrice(d.symbol)) }))
            .sort((a, b) => (b.d.createdAt || 0) - (a.d.createdAt || 0));

        box.innerHTML = `<div class="stk-list dr-list">${rows.map(({ d, c }) => cardHTML(d, c)).join("")}</div>`;
    }

    function cardHTML(d, c) {
        const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        const has = c.ltp != null;
        const tone = has ? pnlClass(c.gain) : "";

        const right = has
            ? `<div class="dr-growth br-pnl-${tone}">
                    <strong>${fmtPct(c.pct)}</strong>
                    <span>${fmtSigned(c.gain, true)}</span>
               </div>`
            : `<div class="dr-growth dr-growth-na"><strong>–</strong><span>no live price</span></div>`;

        return `
            <article class="inc-entry stk-card dr-card" data-key="${esc(d.id)}">
                <div class="stk-card-top">
                    ${stockMiniLogoHTML(d.symbol, 32)}
                    <div class="stk-id">
                        <span class="stk-name">${esc(d.name)}</span>
                        <div class="inc-meta">${esc(d.symbol)} · ${esc(fmtDate(d.date))}</div>
                    </div>
                    ${right}
                    <div class="dr-menu">
                        <button type="button" class="inc-icon-button dr-menu-btn" data-dream-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More options" title="More">${icon("ellipsis", { size: 18 })}</button>
                        <div class="dr-menu-pop" role="menu" hidden>
                            <button type="button" role="menuitem" data-dream-act="edit" data-id="${esc(d.id)}">${icon("pencil", { size: 15 })}<span>Edit</span></button>
                            <button type="button" role="menuitem" class="is-danger" data-dream-act="delete" data-id="${esc(d.id)}">${icon("trash-2", { size: 15 })}<span>Remove</span></button>
                        </div>
                    </div>
                </div>
                <dl class="stk-stats">
                    ${stat("Saw at", fmtMoney(d.seenPrice))}
                    ${stat("Now", has ? fmtMoney(c.ltp) : "–")}
                    ${stat("Amount", fmtMoney(d.amount, true))}
                    ${stat("Shares", fmtQty(c.qty))}
                    ${stat("Worth", has ? `<span class="br-pnl-${tone}">${fmtMoney(c.value, true)}</span>` : "–")}
                </dl>
                ${d.notes ? `<p class="inc-hint ipo-notes">${esc(d.notes)}</p>` : ""}
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
            box.innerHTML = `<div class="dr-suggest-empty">No match. Try the NSE symbol, e.g. RELIANCE.</div>`;
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
            ${field("Note", `<input name="notes" type="text" autocomplete="off" placeholder="Optional">`)}
        </div>
        <div class="stk-total dr-preview" data-dream-preview></div>`;

    function openAdd(symbol, name) {
        mode = "add";
        activeId = null;
        picked = { symbol, name };

        const form = shell("Add to wishlist", headBlock(symbol, name) + formFields, "Add to wishlist");
        form.date.value = todayStr();
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
            `<p class="br-muted">${esc(d.name)} will be removed from your Dream stocks. Your holdings are not affected.</p>`,
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
        const notes = form.notes.value.trim();

        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.price, form.amount, form.date].forEach((el) => showError(el, ""));

        if (form.price.value === "" || isNaN(price) || price <= 0) bad(form.price, "Enter the price you saw.");
        if (form.amount.value === "" || isNaN(amount) || amount <= 0) bad(form.amount, "Enter the amount.");
        if (!date) bad(form.date, "Pick the date you saw it.");
        if (!ok) return;

        let next;
        let previous = null;
        if (mode === "edit") {
            previous = dreams.find((x) => x.id === activeId);
            if (!previous) return;
            next = { ...previous, seenPrice: round2(price), amount: round2(amount), date, notes };
        } else {
            next = {
                id: "dream_" + genId().slice(4),
                createdAt: Date.now(),
                symbol: picked.symbol,
                name: picked.name || picked.symbol,
                seenPrice: round2(price),
                amount: round2(amount),
                date,
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
    }

    function toggleInfo(btn) {
        const pop = root && root.querySelector(".dr-info-pop");
        const b = root && root.querySelector(".dr-info-btn");
        if (!pop || !b) return;
        const open = !!btn && pop.hidden;
        pop.hidden = !open;
        b.setAttribute("aria-expanded", String(open));
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
            else if (act === "info") toggleInfo(el);
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

        if (root && !event.target.closest(".dr-info")) toggleInfo(null);
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
