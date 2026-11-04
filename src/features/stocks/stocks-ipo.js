/*
 * stocks-ipo.js
 *
 * IPO tracker for the Stocks module.
 *
 * Flow:  Apply  ->  Allotment  ->  Refund  ->  normal Buy / Sell
 *
 *  - "Apply" records the application (company, lots, issue price).
 *  - "Allotment" records how many shares you got (0 = none). Allotted
 *    shares become a normal BUY transaction at the issue price, so they
 *    show up in Holdings / Analytics / Reports and can be sold or
 *    topped up with the regular Add transaction form.
 *  - "Refund" tracks the money returned for the shares not allotted.
 *
 * IPO applications live under their own "ipos" key in the stocks state
 * store. The only thing written to the existing transaction ledger is
 * the BUY created on allotment, in exactly the same shape the normal
 * form produces — no existing calculation or screen is changed.
 */

import { icon } from "../../components/icons.js";
import {
    genId,
    round2,
    replaySymbol,
    calculateStockHolding,
    fmtMoney,
    fmtSigned,
    fmtPct,
    pnlClass,
    fmtDate
} from "./stocks-service.js";

const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- derived values (nothing calculated is stored) ---------- */

function statusOf(ipo) {
    if (!ipo.allotRecorded) return "applied";
    return ipo.allottedQty > 0 ? "allotted" : "not_allotted";
}

const appliedAmount = (i) => round2(i.appliedQty * i.issuePrice);
const refundDue = (i) =>
    i.allotRecorded
        ? round2(Math.max(0, i.appliedQty - i.allottedQty) * i.issuePrice)
        : 0;

const STATUS_LABEL = {
    applied: ["Pending", "br-badge-info"],
    allotted: ["Allotted", "br-badge-success"],
    not_allotted: ["Not allotted", "br-badge-danger"]
};

export function initIpo(page, ctx) {
    const root = page.querySelector("[data-ipo-root]");
    const modal = page.querySelector("[data-ipo-modal]");

    let ipos = [];
    let filter = "all";
    let mode = null; // "ipo" | "allot" | "refund" | "delete"
    let activeId = null;
    let saving = false;

    const txns = () => ctx.getTransactions();
    const linkedTxn = (ipo) =>
        ipo.txnId ? txns().find((t) => t.id === ipo.txnId) || null : null;

    /* =========================================
       LOAD / PERSIST
    ========================================= */

    async function load() {
        ipos = await ctx.store.getIpos();
    }

    async function reset() {
        ipos = [];
        await ctx.store.saveIpos(ipos);
        render();
    }

    /* =========================================
       LEDGER SYNC — allotment <-> BUY transaction
    ========================================= */

    /*
     * Works out what the transaction ledger must look like for this IPO
     * and checks it never leaves a negative holding anywhere in time.
     * Returns { error } or { apply(), undo() }.
     */
    function planLedger(ipo) {
        const list = txns();
        const existing = linkedTxn(ipo);
        const wantBuy = ipo.allottedQty > 0 && !!ipo.symbol;

        const rest = list.filter((t) => t !== existing);
        let cand = null;

        if (wantBuy) {
            cand = existing
                ? {
                      ...existing,
                      date: ipo.allotDate,
                      symbol: ipo.symbol,
                      name: ipo.name,
                      quantity: ipo.allottedQty,
                      price: ipo.issuePrice
                  }
                : {
                      id: genId(),
                      seq: 0,
                      date: ipo.allotDate,
                      type: "BUY",
                      symbol: ipo.symbol,
                      name: ipo.name,
                      quantity: ipo.allottedQty,
                      price: ipo.issuePrice,
                      notes: ("#ipo " + (ipo.notes || "")).trim(),
                      isMTF: false
                  };
        }

        const trial = cand ? rest.concat([cand]) : rest;
        const symbols = new Set([cand?.symbol, existing?.symbol].filter(Boolean));

        for (const sym of symbols) {
            const r = replaySymbol(sym, trial);
            if (r.error) {
                return {
                    error: `Some shares from this IPO were already sold (sell on ${fmtDate(r.error.date)}). Edit or delete that sell first.`
                };
            }
        }

        let snapshot = null;
        let gaveSeq = false;

        return {
            nextTxnId: cand ? cand.id : null,
            apply() {
                snapshot = list.slice();
                if (cand && !existing) {
                    cand.seq = ctx.takeSeq();
                    gaveSeq = true;
                }
                const idx = existing ? list.indexOf(existing) : -1;
                if (cand && idx >= 0) list[idx] = cand;
                else if (cand) list.push(cand);
                else if (idx >= 0) list.splice(idx, 1);
            },
            undo() {
                if (snapshot) list.splice(0, list.length, ...snapshot);
                if (gaveSeq) ctx.giveBackSeq();
            }
        };
    }

    /* =========================================
       SUMMARY + LIST
    ========================================= */

    function render() {
        if (!root) return;

        const prices = ctx.getPrices();
        const list = txns();

        const count = page.querySelector('[data-count="ipo"]');
        if (count) count.textContent = ipos.length > 0 ? ipos.length : "";

        const waiting = ipos.filter((i) => statusOf(i) === "applied");
        const allotted = ipos.filter((i) => statusOf(i) === "allotted");
        const missed = ipos.filter((i) => statusOf(i) === "not_allotted");
        const refundPending = ipos.filter((i) => refundDue(i) > 0 && !i.refund);

        const blocked = round2(waiting.reduce((s, i) => s + appliedAmount(i), 0));
        const allottedValue = round2(
            allotted.reduce((s, i) => s + i.allottedQty * i.issuePrice, 0)
        );
        const refundAmt = round2(refundPending.reduce((s, i) => s + refundDue(i), 0));

        // P&L of the stocks that came from an IPO allotment
        const syms = [...new Set(allotted.map((i) => i.symbol).filter(Boolean))];
        let pnl = 0;
        syms.forEach((sym) => {
            const h = calculateStockHolding(sym, list, prices);
            pnl += h.realizedPnL + h.unrealizedPnL;
        });
        pnl = round2(pnl);

        const metric = (label, val, hint, tone) => `
            <div class="inc-metric">
                <span class="inc-label">${label}</span>
                <strong class="inc-amount${tone ? " br-pnl-" + tone : ""}">${val}</strong>
                ${hint ? `<span class="inc-hint">${hint}</span>` : ""}
            </div>`;

        const chips = [
            ["all", "All"],
            ["applied", "Pending"],
            ["allotted", "Allotted"],
            ["not_allotted", "Not allotted"],
            ["refund", "Refund due"]
        ]
            .map(
                ([k, label]) =>
                    `<button type="button" class="br-chip${filter === k ? " active" : ""}" data-ipo-act="filter" data-filter="${k}">${label}</button>`
            )
            .join("");

        const shown = ipos
            .filter((i) =>
                filter === "all"
                    ? true
                    : filter === "refund"
                    ? refundDue(i) > 0 && !i.refund
                    : statusOf(i) === filter
            )
            .sort((a, b) =>
                a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1
            );

        let body;
        if (ipos.length === 0) {
            body = `
                <div class="inc-empty">
                    ${icon("gem", { size: 22 })}
                    <h4>No IPO records</h4>
                    <button type="button" class="br-button br-button-primary" data-ipo-act="add">${icon("plus", { size: 18 })} Add IPO</button>
                </div>`;
        } else if (shown.length === 0) {
            body = `<div class="inc-empty"><h4>No results</h4></div>`;
        } else {
            body = `<div class="stk-list">${shown.map((i) => cardHTML(i, list, prices)).join("")}</div>`;
        }

        root.innerHTML = `
            <section class="inc-section">
                <div class="inc-section-head">
                    <div><h3>Applications</h3></div>
                    <button type="button" class="br-button br-button-primary" data-ipo-act="add">${icon("plus", { size: 18 })} Add IPO</button>
                </div>
                ${
                    ipos.length
                        ? `<div class="ipo-metrics">
                            ${metric("Pending", String(waiting.length), `${fmtMoney(blocked, true)} blocked`)}
                            ${metric("Allotted", String(allotted.length), `${fmtMoney(allottedValue, true)} @ issue`)}
                            ${metric("Not allotted", String(missed.length), "")}
                            ${metric("Refund due", fmtMoney(refundAmt, true), refundPending.length ? `${refundPending.length} open` : "")}
                            ${metric("IPO P&amp;L", fmtSigned(pnl, true), "", allotted.length ? pnlClass(pnl) : "")}
                        </div>
                        <div class="br-chip-row ipo-filters" role="group" aria-label="Filter IPOs">${chips}</div>`
                        : ""
                }
                ${body}
            </section>`;
    }

    function cardHTML(i, list, prices) {
        const status = statusOf(i);
        const [label, cls] = STATUS_LABEL[status];
        const due = refundDue(i);
        const txn = linkedTxn(i);
        const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        const lots = i.lotSize > 1 ? ` (${i.lots} lot${i.lots === 1 ? "" : "s"})` : "";

        let stats =
            stat("Date", fmtDate(i.date)) +
            stat("Qty", `${i.appliedQty}${lots}`) +
            stat("Issue", fmtMoney(i.issuePrice)) +
            stat("Amount", fmtMoney(appliedAmount(i), true));

        if (i.allotRecorded) {
            stats += stat("Allotted", `${i.allottedQty}`);
            if (i.allotDate) stats += stat("Allot date", fmtDate(i.allotDate));
            if (due > 0) {
                stats += stat(
                    i.refund ? "Refund received" : "Refund due",
                    i.refund
                        ? `${fmtMoney(i.refund.amount, true)} · ${fmtDate(i.refund.date)}`
                        : fmtMoney(due, true)
                );
            }
        }

        // Holding info once the shares are in the ledger
        let holdBlock = "";
        let canSell = false;
        if (status === "allotted" && i.symbol) {
            const h = calculateStockHolding(i.symbol, list, prices);
            canSell = h.quantity > 0;
            const total = round2(h.realizedPnL + h.unrealizedPnL);
            holdBlock = `
                <dl class="stk-stats ipo-hold">
                    ${stat("Hold", h.quantity)}
                    ${stat("Avg", fmtMoney(h.avgPrice))}
                    ${stat("LTP", fmtMoney(h.currentPrice))}
                    ${stat("P&amp;L", `<span class="br-pnl-${pnlClass(total)}">${fmtSigned(total, true)}${h.investedValue > 0 ? " · " + fmtPct(h.unrealizedPnLPct) : ""}</span>`)}
                </dl>`;
        }

        const warn =
            status === "allotted" && !txn
                ? `<p class="inc-hint ipo-warn">Buy entry missing in Transactions. Open Allotment to restore.</p>`
                : "";

        const refundBadge =
            due > 0
                ? i.refund
                    ? `<span class="br-badge br-badge-success">Refunded</span>`
                    : `<span class="br-badge br-badge-warning">Refund due</span>`
                : "";

        const actions = [];
        if (status === "applied") {
            actions.push(`<button type="button" class="br-button br-button-primary" data-ipo-act="allot" data-id="${i.id}">Allotment</button>`);
        } else {
            actions.push(`<button type="button" class="br-button" data-ipo-act="allot" data-id="${i.id}">Allotment</button>`);
        }
        if (due > 0) {
            actions.push(
                i.refund
                    ? `<button type="button" class="br-button" data-ipo-act="refund" data-id="${i.id}">Edit refund</button>
                       <button type="button" class="br-button" data-ipo-act="undo-refund" data-id="${i.id}">Undo refund</button>`
                    : `<button type="button" class="br-button br-button-primary" data-ipo-act="refund" data-id="${i.id}">Mark refunded</button>`
            );
        }
        if (status === "allotted" && i.symbol) {
            actions.push(`<button type="button" class="br-button" data-ipo-act="buy" data-id="${i.id}">Buy</button>`);
            if (canSell) {
                actions.push(`<button type="button" class="br-button" data-ipo-act="sell" data-id="${i.id}">Sell</button>`);
            }
        }

        return `
            <article class="inc-entry stk-card ipo-card" data-key="${i.id}">
                <div class="stk-card-top">
                    <div class="stk-id">
                        <span class="stk-name">${esc(i.name)}</span>
                        <div class="inc-meta">${i.symbol ? esc(i.symbol) + " " : ""}<span class="br-badge ${cls}">${label}</span> ${refundBadge}</div>
                    </div>
                    <div class="stk-row-actions ipo-icons">
                        <button type="button" class="inc-icon-button" data-ipo-act="edit" data-id="${i.id}" aria-label="Edit IPO" title="Edit">${icon("pencil", { size: 16 })}</button>
                        <button type="button" class="inc-icon-button inc-icon-danger" data-ipo-act="delete" data-id="${i.id}" aria-label="Delete IPO" title="Delete">${icon("trash-2", { size: 16 })}</button>
                    </div>
                </div>
                <dl class="stk-stats">${stats}</dl>
                ${holdBlock}
                ${i.notes ? `<p class="inc-hint ipo-notes">${esc(i.notes)}</p>` : ""}
                ${warn}
                <div class="ipo-actions">${actions.join("")}</div>
            </article>`;
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
                    <button type="button" class="br-modal-close" data-ipo-act="close" aria-label="Close" title="Close">${icon("x", { size: 18 })}</button>
                </div>
                <form data-ipo-form novalidate>
                    <div class="inc-form-error" data-ipo-error role="alert" hidden></div>
                    ${inner}
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-ipo-act="close">Cancel</button>
                        <button type="submit" class="br-button ${danger ? "br-button-danger" : "br-button-primary"}">${esc(submitLabel)}</button>
                    </div>
                </form>
            </div>`;
        modal.hidden = false;
        return modal.querySelector("[data-ipo-form]");
    }

    function closeModal() {
        modal.hidden = true;
        modal.innerHTML = "";
        mode = null;
        activeId = null;
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
        const b = modal.querySelector("[data-ipo-error]");
        if (!b) return;
        b.textContent = msg || "";
        b.hidden = !msg;
    }

    /* ----- Add / edit the IPO application ----- */

    function openIpoForm(id) {
        const ipo = id ? ipos.find((x) => x.id === id) : null;
        if (id && !ipo) return;
        mode = "ipo";
        activeId = id || null;

        const form = shell(
            ipo ? "Edit IPO" : "Add IPO",
            `<div class="inc-fields stk-txn-fields">
                ${field("Company name", `<input name="name" type="text" placeholder="Company Ltd" autocomplete="off" required>`)}
                ${field("Symbol", `<input name="symbol" type="text" placeholder="NSE/BSE" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false">`)}
                ${field("Date", `<input name="date" type="date" required>`)}
                ${field("Lot size", `<input name="lotSize" type="number" inputmode="numeric" step="1" min="1" value="1" required>`)}
                ${field("Lots applied", `<input name="lots" type="number" inputmode="numeric" step="1" min="1" value="1" required>`)}
                ${field("Issue price", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></span>`)}
                ${field("Notes", `<input name="notes" type="text" autocomplete="off">`)}
            </div>
            <div class="stk-total" data-ipo-preview></div>`,
            ipo ? "Save changes" : "Add IPO"
        );

        form.date.value = ipo ? ipo.date : todayStr();
        if (ipo) {
            form.name.value = ipo.name;
            form.symbol.value = ipo.symbol || "";
            form.lotSize.value = ipo.lotSize;
            form.lots.value = ipo.lots;
            form.price.value = ipo.issuePrice;
            form.notes.value = ipo.notes || "";
        }

        updateIpoPreview(form);
        setTimeout(() => form.name.focus(), 30);
    }

    function updateIpoPreview(form) {
        const el = modal.querySelector("[data-ipo-preview]");
        if (!el) return;
        const qty = Math.round(Number(form.lotSize.value) * Number(form.lots.value)) || 0;
        const total = round2(qty * (Number(form.price.value) || 0));
        el.innerHTML =
            total > 0
                ? `<span>${qty} share${qty === 1 ? "" : "s"} · amount blocked</span><strong>${fmtMoney(total)}</strong>`
                : `<span>Amount blocked appears here</span>`;
    }

    async function saveIpoForm(form) {
        const name = form.name.value.trim();
        const symbol = form.symbol.value.trim().toUpperCase();
        const date = form.date.value;
        const lotSize = Number(form.lotSize.value);
        const lots = Number(form.lots.value);
        const price = Number(form.price.value);
        const notes = form.notes.value.trim();

        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.name, form.date, form.lotSize, form.lots, form.price].forEach((el) => showError(el, ""));

        if (!name) bad(form.name, "Enter the company name.");
        if (!date) bad(form.date, "Pick the date you applied.");
        if (!Number.isInteger(lotSize) || lotSize < 1) bad(form.lotSize, "Enter a whole number, 1 or more.");
        if (!Number.isInteger(lots) || lots < 1) bad(form.lots, "Enter a whole number, 1 or more.");
        if (form.price.value === "" || isNaN(price) || price <= 0) bad(form.price, "Enter the issue price.");
        if (!ok) return;

        const appliedQty = lotSize * lots;
        const existing = activeId ? ipos.find((x) => x.id === activeId) : null;

        const next = existing
            ? { ...existing, name, symbol, date, lotSize, lots, appliedQty, issuePrice: price, notes }
            : {
                  id: "ipo_" + genId().slice(4),
                  createdAt: Date.now(),
                  name, symbol, date, lotSize, lots, appliedQty,
                  issuePrice: price, notes,
                  allotRecorded: false, allottedQty: 0, allotDate: "",
                  txnId: null, refund: null
              };

        if (existing && existing.allotRecorded && appliedQty < existing.allottedQty) {
            bad(form.lots, `You were allotted ${existing.allottedQty} shares — applied can't be lower.`);
            return;
        }

        // Keep the buy entry in step with name / symbol / price changes
        let plan = null;
        if (existing && linkedTxn(existing)) {
            if (existing.allottedQty > 0 && !symbol) {
                bad(form.symbol, "This IPO has an allotment — keep its symbol.");
                return;
            }
            plan = planLedger(next);
            if (plan.error) { formError(plan.error); return; }
        }

        await commit(next, plan, existing);
    }

    /* ----- Allotment ----- */

    function openAllotForm(id) {
        const ipo = ipos.find((x) => x.id === id);
        if (!ipo) return;
        mode = "allot";
        activeId = id;

        const form = shell(
            "Allotment",
            `<p class="br-muted ipo-modal-note">${esc(ipo.name)} · ${ipo.appliedQty} @ ${fmtMoney(ipo.issuePrice)} = ${fmtMoney(appliedAmount(ipo), true)}</p>
            <div class="inc-fields stk-txn-fields">
                ${field("Allotted qty", `<input name="allotted" type="number" inputmode="numeric" step="1" min="0" placeholder="0" required>`, ipo.lotSize > 1 ? `Lot ${ipo.lotSize} · 0 = none` : "0 = none")}
                ${field("Allotment date", `<input name="allotDate" type="date" required>`)}
                ${field("Symbol", `<input name="symbol" type="text" placeholder="RELIANCE" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false">`)}
            </div>
            <div class="stk-total" data-ipo-preview></div>`,
            "Save allotment"
        );

        form.allotted.value = ipo.allotRecorded ? ipo.allottedQty : "";
        form.allotDate.value = ipo.allotDate || todayStr();
        form.symbol.value = ipo.symbol || "";
        updateAllotPreview(form, ipo);
        setTimeout(() => form.allotted.focus(), 30);
    }

    function updateAllotPreview(form, ipo) {
        const el = modal.querySelector("[data-ipo-preview]");
        if (!el) return;
        const raw = form.allotted.value;
        if (raw === "") { el.innerHTML = `<span>Enter shares allotted</span>`; return; }
        const q = Number(raw);
        if (!Number.isFinite(q) || q < 0) { el.innerHTML = ""; return; }
        const refund = round2(Math.max(0, ipo.appliedQty - q) * ipo.issuePrice);
        el.innerHTML = `<span>${q > 0 ? `Buy entry ${fmtMoney(round2(q * ipo.issuePrice))}` : "No shares"}${refund > 0 ? ` · Refund due` : ""}</span><strong>${refund > 0 ? fmtMoney(refund) : "No refund"}</strong>`;
    }

    async function saveAllotForm(form) {
        const ipo = ipos.find((x) => x.id === activeId);
        if (!ipo) return;

        const qty = Number(form.allotted.value);
        const date = form.allotDate.value;
        const symbol = form.symbol.value.trim().toUpperCase();

        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.allotted, form.allotDate, form.symbol].forEach((el) => showError(el, ""));

        if (form.allotted.value === "" || !Number.isInteger(qty) || qty < 0) bad(form.allotted, "Enter a whole number (0 if none).");
        else if (qty > ipo.appliedQty) bad(form.allotted, `You applied for ${ipo.appliedQty} shares — can't be more.`);
        else if (ipo.lotSize > 1 && qty % ipo.lotSize !== 0) bad(form.allotted, `Allotment comes in lots of ${ipo.lotSize}.`);
        if (!date) bad(form.allotDate, "Pick the allotment date.");
        if (qty > 0 && !symbol) bad(form.symbol, "Enter the stock symbol so the shares can join Holdings.");
        if (!ok) return;

        const next = {
            ...ipo,
            symbol: symbol || ipo.symbol,
            allotRecorded: true,
            allottedQty: qty,
            allotDate: date
        };

        const plan = planLedger(next);
        if (plan.error) { formError(plan.error); return; }
        if (plan.nextTxnId) next.txnId = plan.nextTxnId;
        else next.txnId = null;

        await commit(next, plan, ipo);
    }

    /* ----- Refund ----- */

    function openRefundForm(id) {
        const ipo = ipos.find((x) => x.id === id);
        if (!ipo) return;
        mode = "refund";
        activeId = id;

        const due = refundDue(ipo);
        const form = shell(
            "Refund",
            `<p class="br-muted ipo-modal-note">${esc(ipo.name)} · due ${fmtMoney(due)} · ${Math.max(0, ipo.appliedQty - ipo.allottedQty)} unallotted</p>
            <div class="inc-fields stk-txn-fields">
                ${field("Refund amount", `<span class="inc-money"><span class="inc-money-prefix" aria-hidden="true">₹</span><input name="amount" type="number" inputmode="decimal" step="0.01" min="0" required></span>`)}
                ${field("Refund date", `<input name="date" type="date" required>`)}
            </div>`,
            "Save refund"
        );

        form.amount.value = ipo.refund ? ipo.refund.amount : due;
        form.date.value = ipo.refund ? ipo.refund.date : todayStr();
        setTimeout(() => form.amount.focus(), 30);
    }

    async function saveRefundForm(form) {
        const ipo = ipos.find((x) => x.id === activeId);
        if (!ipo) return;

        const amount = Number(form.amount.value);
        const date = form.date.value;
        let ok = true;
        const bad = (el, msg) => { showError(el, msg); if (ok) el.focus(); ok = false; };
        [form.amount, form.date].forEach((el) => showError(el, ""));

        if (form.amount.value === "" || isNaN(amount) || amount < 0) bad(form.amount, "Enter the refund amount.");
        if (!date) bad(form.date, "Pick the refund date.");
        if (!ok) return;

        await commit({ ...ipo, refund: { amount: round2(amount), date } }, null, ipo);
    }

    /* ----- Delete ----- */

    function openDeleteForm(id) {
        const ipo = ipos.find((x) => x.id === id);
        if (!ipo) return;
        mode = "delete";
        activeId = id;

        const hasBuy = !!linkedTxn(ipo);
        shell(
            "Delete IPO?",
            `<p class="br-muted">${esc(ipo.name)} will be removed.${
                hasBuy
                    ? " The buy entry created from its allotment is removed from Transactions too."
                    : ""
            } This cannot be undone.</p>`,
            "Delete",
            true
        );
    }

    async function confirmDelete() {
        const ipo = ipos.find((x) => x.id === activeId);
        if (!ipo) return;

        let plan = null;
        if (linkedTxn(ipo)) {
            plan = planLedger({ ...ipo, allottedQty: 0, symbol: ipo.symbol });
            if (plan.error) { formError(plan.error); return; }
        }
        await commit(null, plan, ipo);
    }

    /* =========================================
       COMMIT — ledger + IPO list, with rollback
    ========================================= */

    async function commit(next, plan, previous) {
        if (saving) return;
        saving = true;

        const before = ipos.slice();
        const submit = modal.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;

        try {
            if (plan) plan.apply();

            if (next && previous) ipos = ipos.map((x) => (x.id === previous.id ? next : x));
            else if (next) ipos = [...ipos, next];
            else ipos = ipos.filter((x) => x.id !== previous.id);

            if (plan) await ctx.persist();
            await ctx.store.saveIpos(ipos);

            closeModal();
            ctx.rerender();
        } catch (err) {
            ipos = before;
            if (plan) plan.undo();
            formError(err?.message || "Could not save. Please try again.");
        } finally {
            saving = false;
            if (submit) submit.disabled = false;
        }
    }

    async function undoRefund(id) {
        const ipo = ipos.find((x) => x.id === id);
        if (!ipo || !ipo.refund) return;
        const before = ipos.slice();
        try {
            ipos = ipos.map((x) => (x.id === id ? { ...x, refund: null } : x));
            await ctx.store.saveIpos(ipos);
            render();
        } catch (err) {
            ipos = before;
            render();
        }
    }

    /* =========================================
       EVENTS
    ========================================= */

    page.addEventListener("click", (event) => {
        const el = event.target.closest("[data-ipo-act]");
        if (!el || !page.contains(el)) return;

        const act = el.dataset.ipoAct;
        const id = el.dataset.id;

        if (act === "add") openIpoForm();
        else if (act === "edit") openIpoForm(id);
        else if (act === "allot") openAllotForm(id);
        else if (act === "refund") openRefundForm(id);
        else if (act === "undo-refund") undoRefund(id);
        else if (act === "delete") openDeleteForm(id);
        else if (act === "close") closeModal();
        else if (act === "filter") { filter = el.dataset.filter; render(); }
        else if (act === "buy" || act === "sell") {
            const ipo = ipos.find((x) => x.id === id);
            if (ipo && ipo.symbol) {
                ctx.openTxn({
                    type: act === "buy" ? "BUY" : "SELL",
                    symbol: ipo.symbol,
                    name: ipo.name
                });
            }
        }
    });

    page.addEventListener("submit", async (event) => {
        if (!event.target.matches("[data-ipo-form]")) return;
        event.preventDefault();
        formError("");
        if (mode === "ipo") await saveIpoForm(event.target);
        else if (mode === "allot") await saveAllotForm(event.target);
        else if (mode === "refund") await saveRefundForm(event.target);
        else if (mode === "delete") await confirmDelete();
    });

    page.addEventListener("input", (event) => {
        const form = event.target.closest?.("[data-ipo-form]");
        if (!form) return;
        showError(event.target, "");
        if (mode === "ipo") updateIpoPreview(form);
        else if (mode === "allot") {
            const ipo = ipos.find((x) => x.id === activeId);
            if (ipo) updateAllotPreview(form, ipo);
        }
    });

    const onKey = (event) => {
        if (!page.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
        }
        if (event.key === "Escape" && !modal.hidden) closeModal();
    };
    document.addEventListener("keydown", onKey);

    return { load, render, reset };
}
