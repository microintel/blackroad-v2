import { icon } from "../../components/icons.js";
import { dataService } from "../../data/data-service.js";

import {
    computeBalance,
    summarizePeople,
    summarizeLoans,
    fmtMoney,
    todayISO,
    monthLabel,
    yearOf,
    daysUntil,
    uid,
    paidSoFar,
    outstanding,
    installmentsCovered,
    nextDue,
    loanStatus,
    LOAN_STATUS_LABEL,
    LOAN_STATUS_RANK
} from "./lending-service.js";

/* =========================================
   STATE
========================================= */

let store = null;
let parties = [];
let entries = [];
let loans = [];

let tab = "overview";          // overview | people | loans
let personId = null;           // person detail open inside People tab
let searchTerm = "";
let balanceFilter = "";
let openYears = new Set();
let yearsSeen = new Set();
let openLoanIds = new Set();

let editingPersonId = null;
let editingEntryId = null;
let editingLoanId = null;
let paymentCtx = { loanId: null, paymentId: null };
let pendingDelete = null;      // { kind, id, loanId?, paymentId? }
let toastTimer = null;

const LOAN_BADGE = {
    open: "br-badge-info",
    "due-soon": "br-badge-warning",
    overdue: "br-badge-danger",
    settled: "br-badge-success"
};

/* =========================================
   PAGE
========================================= */

export async function Lending() {
    store = await dataService.getLendingStore();

    tab = "overview";
    personId = null;
    searchTerm = "";
    balanceFilter = "";
    openYears = new Set();
    yearsSeen = new Set();
    openLoanIds = new Set();

    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Lending</h2>
                <p>Track money you lend or borrow, and your bank loans / EMIs.</p>
            </div>

            <div data-ll-actions></div>
        </div>

        <div class="br-income-tabs">
            <button type="button" class="br-income-tab active" data-ll-tab="overview">Overview</button>
            <button type="button" class="br-income-tab" data-ll-tab="people">People</button>
            <button type="button" class="br-income-tab" data-ll-tab="loans">Loans</button>
        </div>

        <div data-ll-content></div>

        ${modalsHTML()}

        <div class="br-toast" data-ll-toast></div>
    `;

    attachEvents(page);
    await refresh(page);

    return page;
}

function modalsHTML() {
    return `
        <!-- PERSON -->
        <div class="br-modal-layer" data-modal="person" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-person-title>Add person</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="person">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label class="br-span-2"><span>Name</span>
                                <input name="name" type="text" class="br-input" required></label>
                            <label><span>Phone (optional)</span>
                                <input name="phone" type="text" class="br-input"></label>
                            <label><span>Note (optional)</span>
                                <input name="note" type="text" class="br-input"></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- ENTRY -->
        <div class="br-modal-layer" data-modal="entry" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-entry-title>Add entry</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="entry">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label><span>Type</span>
                                <select name="type" class="br-select">
                                    <option value="gave">You gave</option>
                                    <option value="got">You got</option>
                                </select></label>
                            <label><span>Amount</span>
                                <input name="amount" type="number" step="0.01" min="0" class="br-input" required></label>
                            <label><span>Date</span>
                                <input name="date" type="date" class="br-input" required></label>
                            <label><span>Due date (optional)</span>
                                <input name="dueDate" type="date" class="br-input"></label>
                            <label class="br-span-2"><span>Note (optional)</span>
                                <input name="note" type="text" class="br-input"></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- LOAN -->
        <div class="br-modal-layer" data-modal="loan" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-loan-title>Add loan</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="loan">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label class="br-span-2"><span>Lender</span>
                                <input name="lender" type="text" class="br-input" placeholder="e.g. HDFC Home Loan" required></label>
                            <label><span>Principal</span>
                                <input name="principal" type="number" step="0.01" min="0" class="br-input" required></label>
                            <label><span>EMI amount</span>
                                <input name="emiAmount" type="number" step="0.01" min="0" class="br-input" required></label>
                            <label><span>Tenure (months)</span>
                                <input name="tenureMonths" type="number" step="1" min="1" class="br-input" required></label>
                            <label><span>Interest rate % (optional)</span>
                                <input name="interestRate" type="number" step="0.01" min="0" class="br-input"></label>
                            <label><span>Start date</span>
                                <input name="date" type="date" class="br-input" required></label>
                            <label><span>Notes (optional)</span>
                                <input name="notes" type="text" class="br-input"></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- PAYMENT -->
        <div class="br-modal-layer" data-modal="payment" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-payment-title>Pay EMI</h3>
                    <button type="button" class="br-button" data-action="close-modal">×</button>
                </div>
                <form data-form="payment">
                    <div class="br-modal-body">
                        <p class="br-field-help" data-error style="display:none;color:var(--br-danger);"></p>
                        <div class="br-form-grid">
                            <label><span>Amount</span>
                                <input name="amount" type="number" step="0.01" min="0" class="br-input" required></label>
                            <label><span>Date</span>
                                <input name="date" type="date" class="br-input" required></label>
                            <label class="br-span-2"><span>Note (optional)</span>
                                <input name="note" type="text" class="br-input"></label>
                        </div>
                    </div>
                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- CONFIRM DELETE -->
        <div class="br-modal-layer" data-modal="confirm" hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header"><h3 data-confirm-title>Delete?</h3></div>
                <div class="br-modal-body">
                    <p class="br-muted" data-confirm-body></p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="close-modal">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm-delete">Delete</button>
                </div>
            </div>
        </div>
    `;
}

/* =========================================
   DATA + RENDER
========================================= */

async function refresh(page) {
    [parties, entries, loans] = await Promise.all([
        store.getPeople(),
        store.getEntries(),
        store.getLoans()
    ]);

    parties.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
    );

    render(page);
}

function render(page) {
    page.querySelectorAll("[data-ll-tab]").forEach((btn) => {
        btn.classList.toggle(
            "active",
            btn.dataset.llTab === tab
        );
    });

    const actions = page.querySelector("[data-ll-actions]");
    const content = page.querySelector("[data-ll-content]");

    if (tab === "overview") {
        actions.innerHTML = "";
        content.innerHTML = overviewHTML();
    } else if (tab === "people" && personId === null) {
        actions.innerHTML = `<button type="button" class="br-button br-button-primary" data-action="add-person"><span>+</span> Add person</button>`;
        content.innerHTML = peopleHTML();
    } else if (tab === "people") {
        const party = parties.find((p) => p.id === personId);

        if (!party) {
            personId = null;
            render(page);
            return;
        }

        actions.innerHTML = `<button type="button" class="br-button br-button-primary" data-action="add-entry"><span>+</span> Add entry</button>`;
        content.innerHTML = personHTML(party);
    } else {
        actions.innerHTML = `<button type="button" class="br-button br-button-primary" data-action="add-loan"><span>+</span> Add loan</button>`;
        content.innerHTML = loansHTML();
    }
}

function statCard(label, value, cls = "") {
    return `
        <div class="br-card br-stat">
            <div class="br-stat-label">${escapeHTML(label)}</div>
            <div class="br-stat-value ${cls}">${value}</div>
        </div>
    `;
}

/* ---------- Overview ---------- */

function overviewHTML() {
    const s = summarizePeople(parties, entries);
    const l = summarizeLoans(loans);

    const rows = s.rows
        .filter((r) => r.balance !== 0)
        .sort(
            (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
        );

    const max = rows.length
        ? Math.abs(rows[0].balance)
        : 1;

    const bars = rows.length
        ? rows
              .map((r) => {
                  const pct = Math.max(
                      3,
                      Math.round((Math.abs(r.balance) / max) * 100)
                  );
                  const get = r.balance > 0;

                  return `
                    <div class="ll-bar-row" data-action="open-person" data-id="${r.party.id}">
                        <span class="ll-bar-name">${escapeHTML(r.party.name || "Unnamed")}</span>
                        <span class="ll-bar-track">
                            <span class="ll-bar-fill ${get ? "get" : "give"}" style="width:${pct}%"></span>
                        </span>
                        <span class="ll-bar-val ${get ? "ll-get" : "ll-give"}">
                            ${get ? "You'll get" : "You'll give"} ${fmtMoney(Math.abs(r.balance))}
                        </span>
                    </div>`;
              })
              .join("")
        : `<div class="br-empty-state">No outstanding balances.</div>`;

    let nextLine = "—";
    if (l.next) {
        const d = daysUntil(l.next.date);
        const when =
            d < 0
                ? `${Math.abs(d)}d overdue`
                : d === 0
                ? "Today"
                : `in ${d}d`;
        nextLine = `${escapeHTML(l.next.label)} · ${when}`;
    }

    return `
        <div class="br-grid br-grid-4">
            ${statCard("You'll get", fmtMoney(s.totalReceivable), "ll-get")}
            ${statCard("You'll give", fmtMoney(s.totalPayable), "ll-give")}
            ${statCard("Net", fmtMoney(s.net))}
            ${statCard("People", parties.length)}
        </div>

        <div class="br-grid br-grid-4" style="margin-top:16px;">
            ${statCard("Loan balance", fmtMoney(l.totalOutstanding))}
            ${statCard("Monthly EMI", fmtMoney(l.monthlyEmi))}
            ${statCard("Active loans", l.activeCount)}
            ${statCard("Next EMI due", nextLine)}
        </div>

        <section class="br-card" style="margin-top:20px;">
            <h3 style="margin-bottom:12px;">Balance by person</h3>
            ${bars}
        </section>
    `;
}

/* ---------- People ---------- */

function peopleHTML() {
    const rows = parties.map((party) => {
        const own = entries.filter((e) => e.partyId === party.id);
        const { balance } = computeBalance(own);
        return { party, balance };
    });

    const term = searchTerm.toLowerCase();

    let visible = rows.filter((r) => {
        const nameMatch =
            !term ||
            (r.party.name || "").toLowerCase().includes(term);

        let balMatch = true;
        if (balanceFilter === "get") balMatch = r.balance > 0;
        else if (balanceFilter === "give") balMatch = r.balance < 0;
        else if (balanceFilter === "settled") balMatch = r.balance === 0;

        return nameMatch && balMatch;
    });

    visible.sort(
        (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
    );

    const toolbar = `
        <div class="br-toolbar" style="margin-bottom:16px;">
            <div class="br-toolbar-left">
                <input type="search" class="br-input" placeholder="Search people…"
                       value="${escapeHTML(searchTerm)}" data-ll-search style="max-width:280px;">
                <select class="br-select" data-ll-filter style="max-width:180px;">
                    <option value="" ${balanceFilter === "" ? "selected" : ""}>All balances</option>
                    <option value="get" ${balanceFilter === "get" ? "selected" : ""}>You'll get</option>
                    <option value="give" ${balanceFilter === "give" ? "selected" : ""}>You'll give</option>
                    <option value="settled" ${balanceFilter === "settled" ? "selected" : ""}>Settled</option>
                </select>
            </div>
        </div>
    `;

    if (parties.length === 0) {
        return `<section class="br-card"><div class="br-empty-state">
            <strong>No people yet</strong>
            <p>Add the first person you lend to or borrow from to start tracking your balance with them.</p>
        </div></section>`;
    }

    const body = visible.length
        ? `<div class="br-table-wrap"><table class="br-table">
            <thead><tr><th>Person</th><th>Contact</th><th>Status</th><th>Balance</th><th></th></tr></thead>
            <tbody>${visible.map(personRowHTML).join("")}</tbody>
        </table></div>`
        : `<div class="br-empty-state">Nobody matches this search or filter.</div>`;

    return `${toolbar}<section class="br-card">${body}</section>`;
}

function personRowHTML({ party, balance }) {
    const label =
        balance > 0 ? "You'll get" : balance < 0 ? "You'll give" : "Settled";
    const cls =
        balance > 0 ? "br-badge-success" : balance < 0 ? "br-badge-danger" : "br-badge-info";

    return `
        <tr data-action="open-person" data-id="${party.id}" style="cursor:pointer;">
            <td><strong>${escapeHTML(party.name || "Unnamed")}</strong></td>
            <td>${escapeHTML(party.phone || party.note || "")}</td>
            <td><span class="br-badge ${cls}">${label}</span></td>
            <td>${balance === 0 ? "—" : fmtMoney(Math.abs(balance))}</td>
            <td style="text-align:right;white-space:nowrap;">
                <button type="button" class="br-button" data-action="edit-person" data-id="${party.id}">Edit</button>
                <button type="button" class="br-button br-button-danger" data-action="delete-person" data-id="${party.id}">Delete</button>
            </td>
        </tr>
    `;
}

/* ---------- Person detail ---------- */

function personEntries(id) {
    return entries
        .filter((e) => e.partyId === id)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function personHTML(party) {
    const own = personEntries(party.id);
    const { totalGave, totalGot, balance } = computeBalance(own);

    const header = `
        <div class="ll-person-head">
            <button type="button" class="br-button" data-action="back-people">${icon("arrow-left", { size: 16 })}People</button>
            <div>
                <h3 style="margin:0;">${escapeHTML(party.name || "Unnamed")}</h3>
                <p class="br-muted" style="margin:2px 0 0;">${escapeHTML(party.phone || party.note || "")}</p>
            </div>
            <button type="button" class="br-button" data-action="edit-person" data-id="${party.id}">Edit person</button>
        </div>

        <div class="br-grid br-grid-4" style="margin:16px 0;">
            ${statCard("You gave", fmtMoney(totalGave), "ll-get")}
            ${statCard("You got", fmtMoney(totalGot), "ll-give")}
            ${statCard(
                balance > 0 ? "You'll get" : balance < 0 ? "You'll give" : "Settled",
                fmtMoney(Math.abs(balance))
            )}
            ${statCard("Entries", own.length)}
        </div>
    `;

    if (own.length === 0) {
        return `${header}<section class="br-card"><div class="br-empty-state">
            <strong>No entries yet</strong>
            <p>Log the first "You gave" or "You got" entry with ${escapeHTML(party.name || "this person")}.</p>
        </div></section>`;
    }

    // Group year -> month (same structure as the old person page)
    const years = new Map();

    own.forEach((e) => {
        const y = yearOf(e.date);
        const label = monthLabel(e.date);
        if (!years.has(y)) years.set(y, new Map());
        const months = years.get(y);
        if (!months.has(label)) months.set(label, []);
        months.get(label).push(e);
    });

    [...years.keys()].forEach((y, idx) => {
        if (!yearsSeen.has(y)) {
            yearsSeen.add(y);
            if (idx === 0) openYears.add(y);
        }
    });

    let html = "";

    for (const [year, months] of years) {
        let yGave = 0;
        let yGot = 0;
        let yCount = 0;

        months.forEach((list) =>
            list.forEach((e) => {
                if (e.type === "gave") yGave += Number(e.amount) || 0;
                else yGot += Number(e.amount) || 0;
                yCount++;
            })
        );

        const open = openYears.has(year);

        html += `
            <section class="br-card" style="margin-bottom:12px;">
                <div class="ll-year-head" data-action="toggle-year" data-year="${year}">
                    <span>${icon(open ? "chevron-down" : "chevron-right", { size: 16 })} <strong>${year}</strong></span>
                    <span class="br-muted">
                        <span class="ll-get">+${fmtMoney(yGave)}</span> ·
                        <span class="ll-give">-${fmtMoney(yGot)}</span> ·
                        ${yCount} entr${yCount === 1 ? "y" : "ies"}
                    </span>
                </div>
        `;

        if (open) {
            html += `<div class="br-table-wrap"><table class="br-table">
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Details</th><th></th></tr></thead><tbody>`;

            for (const [label, list] of months) {
                html += `<tr><td colspan="5" class="ll-month-row">${label}</td></tr>`;
                html += list.map(entryRowHTML).join("");
            }

            html += `</tbody></table></div>`;
        }

        html += `</section>`;
    }

    return header + html;
}

function entryRowHTML(e) {
    const gave = e.type === "gave";

    let due = "";
    if (e.dueDate) {
        const d = daysUntil(e.dueDate);
        const overdue = d !== null && d < 0;
        const soon = d !== null && d >= 0 && d <= 7;
        const cls = overdue ? "br-badge-danger" : soon ? "br-badge-warning" : "br-badge-info";
        const text = overdue
            ? `Overdue · was due ${e.dueDate}`
            : soon
            ? `Due soon · ${e.dueDate}`
            : `Due ${e.dueDate}`;
        due = `<span class="br-badge ${cls}">${text}</span>`;
    }

    return `
        <tr>
            <td>${escapeHTML(e.date || "")}</td>
            <td>${gave ? "You gave" : "You got"}</td>
            <td class="${gave ? "ll-get" : "ll-give"}">${gave ? "+" : "-"}${fmtMoney(e.amount)}</td>
            <td>${escapeHTML(e.note || "")} ${due}</td>
            <td style="text-align:right;white-space:nowrap;">
                <button type="button" class="br-button" data-action="edit-entry" data-id="${e.id}">Edit</button>
                <button type="button" class="br-button br-button-danger" data-action="delete-entry" data-id="${e.id}">Delete</button>
            </td>
        </tr>
    `;
}

/* ---------- Loans ---------- */

function loansHTML() {
    const l = summarizeLoans(loans);

    let nextLine = "—";
    if (l.next) {
        const d = daysUntil(l.next.date);
        const when =
            d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `in ${d}d`;
        nextLine = `${escapeHTML(l.next.label)} · ${when}`;
    }

    const stats = `
        <div class="br-grid br-grid-4">
            ${statCard("Loan balance", fmtMoney(l.totalOutstanding))}
            ${statCard("Monthly EMI", fmtMoney(l.monthlyEmi))}
            ${statCard("Active loans", l.activeCount)}
            ${statCard("Next EMI due", nextLine)}
        </div>
    `;

    if (loans.length === 0) {
        return `${stats}<section class="br-card" style="margin-top:20px;"><div class="br-empty-state">
            <strong>No loans set up</strong>
            <p>Add a bank loan or EMI to track the schedule and what's still outstanding.</p>
        </div></section>`;
    }

    const sorted = [...loans].sort((a, b) => {
        const sa = loanStatus(a);
        const sb = loanStatus(b);
        if (LOAN_STATUS_RANK[sa] !== LOAN_STATUS_RANK[sb]) {
            return LOAN_STATUS_RANK[sa] - LOAN_STATUS_RANK[sb];
        }
        const da = nextDue(a) || "9999-99-99";
        const db = nextDue(b) || "9999-99-99";
        return da < db ? -1 : da > db ? 1 : 0;
    });

    return `
        ${stats}
        <section class="br-card" style="margin-top:20px;">
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr>
                    <th>Loan</th><th>Status</th><th>Principal</th><th>Outstanding</th>
                    <th>Next due</th><th>Installments</th><th></th>
                </tr></thead>
                <tbody>${sorted.map(loanRowHTML).join("")}</tbody>
            </table></div>
        </section>
    `;
}

function loanRowHTML(r) {
    const status = loanStatus(r);
    const due = nextDue(r);
    const paid = paidSoFar(r);
    const pct = r.principal > 0 ? Math.min(100, Math.round((paid / r.principal) * 100)) : 0;
    const open = openLoanIds.has(r.id);
    const tenure = Number(r.tenureMonths) || 0;

    let detail = "";
    if (open) {
        const payments = [...(r.payments || [])].sort((a, b) =>
            a.date < b.date ? 1 : -1
        );

        const payRows = payments.length
            ? payments
                  .map(
                      (p) => `
                <tr>
                    <td>${escapeHTML(p.date || "")}</td>
                    <td>${fmtMoney(p.amount)}</td>
                    <td>${escapeHTML(p.note || "EMI payment")}</td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button type="button" class="br-button" data-action="edit-payment" data-loan="${r.id}" data-payment="${p.id}">Edit</button>
                        <button type="button" class="br-button br-button-danger" data-action="delete-payment" data-loan="${r.id}" data-payment="${p.id}">Delete</button>
                    </td>
                </tr>`
                  )
                  .join("")
            : `<tr><td colspan="4" class="br-muted">No payments recorded yet</td></tr>`;

        detail = `
            <tr>
                <td colspan="7">
                    <div class="ll-loan-detail">
                        <div class="ll-progress"><div class="ll-progress-fill ${status === "settled" ? "settled" : ""}" style="width:${pct}%"></div></div>
                        <p class="br-muted">
                            ${pct}% repaid · EMI ${fmtMoney(r.emiAmount)}
                            ${r.interestRate ? ` · ${escapeHTML(String(r.interestRate))}% p.a.` : ""}
                            · Started ${escapeHTML(r.date || "")}
                            ${r.notes ? ` · ${escapeHTML(r.notes)}` : ""}
                        </p>
                        <table class="br-table">
                            <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th></th></tr></thead>
                            <tbody>${payRows}</tbody>
                        </table>
                        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="button" class="br-button br-button-primary" data-action="add-payment" data-loan="${r.id}">Pay EMI</button>
                            <button type="button" class="br-button" data-action="edit-loan" data-id="${r.id}">Edit loan</button>
                            <button type="button" class="br-button br-button-danger" data-action="delete-loan" data-id="${r.id}">Delete loan</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    return `
        <tr data-action="toggle-loan" data-id="${r.id}" style="cursor:pointer;">
            <td><strong>${escapeHTML(r.lender || "Loan")}</strong></td>
            <td><span class="br-badge ${LOAN_BADGE[status]}">${LOAN_STATUS_LABEL[status]}</span></td>
            <td>${fmtMoney(r.principal)}</td>
            <td>${fmtMoney(outstanding(r))}</td>
            <td>${due || "—"}</td>
            <td>${Math.min(installmentsCovered(r), tenure)}/${tenure}</td>
            <td style="text-align:right;">
                <button type="button" class="br-button br-button-primary" data-action="add-payment" data-loan="${r.id}">Pay EMI</button>
            </td>
        </tr>
        ${detail}
    `;
}

/* =========================================
   MODALS
========================================= */

function modal(page, name) {
    return page.querySelector(`[data-modal="${name}"]`);
}

function openModal(page, name) {
    const layer = modal(page, name);
    const err = layer.querySelector("[data-error]");
    if (err) err.style.display = "none";
    layer.hidden = false;
}

function closeModals(page) {
    page.querySelectorAll("[data-modal]").forEach((l) => {
        l.hidden = true;
    });
}

function showError(page, name, err) {
    const el = modal(page, name).querySelector("[data-error]");
    if (!el) return;
    el.textContent =
        "Couldn't save — " + (err && err.message ? err.message : "database error");
    el.style.display = "block";
}

function toast(page, msg) {
    const el = page.querySelector("[data-ll-toast]");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---- person ---- */

function openPersonModal(page, id) {
    editingPersonId = id || null;

    const form = modal(page, "person").querySelector("form");
    form.reset();

    const p = id ? parties.find((x) => x.id === id) : null;

    modal(page, "person").querySelector("[data-person-title]").textContent =
        p ? "Edit person" : "Add person";

    if (p) {
        form.name.value = p.name || "";
        form.phone.value = p.phone || "";
        form.note.value = p.note || "";
    }

    openModal(page, "person");
}

async function savePerson(page) {
    const form = modal(page, "person").querySelector("form");

    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const note = form.note.value.trim();

    try {
        if (editingPersonId) {
            const p = parties.find((x) => x.id === editingPersonId);
            await store.savePerson({ ...p, name, phone, note });
            toast(page, "Person updated");
        } else {
            await store.savePerson({ name, phone, note });
            toast(page, "Person added");
        }

        editingPersonId = null;
        closeModals(page);
        await refresh(page);
    } catch (err) {
        showError(page, "person", err);
    }
}

/* ---- entry ---- */

function openEntryModal(page, id) {
    editingEntryId = id || null;

    const layer = modal(page, "entry");
    const form = layer.querySelector("form");
    form.reset();
    form.date.value = todayISO();

    const e = id ? entries.find((x) => x.id === id) : null;

    layer.querySelector("[data-entry-title]").textContent = e
        ? "Edit entry"
        : "Add entry";

    if (e) {
        form.type.value = e.type;
        form.amount.value = e.amount;
        form.date.value = e.date;
        form.dueDate.value = e.dueDate || "";
        form.note.value = e.note || "";
    }

    openModal(page, "entry");
}

async function saveEntry(page) {
    const form = modal(page, "entry").querySelector("form");

    const data = {
        type: form.type.value,
        amount: parseFloat(form.amount.value) || 0,
        date: form.date.value,
        dueDate: form.dueDate.value || "",
        note: form.note.value.trim()
    };

    try {
        if (editingEntryId) {
            const e = entries.find((x) => x.id === editingEntryId);
            await store.saveEntry({ ...e, ...data });
            toast(page, "Entry updated");
        } else {
            await store.saveEntry({ partyId: personId, ...data });
            toast(page, "Entry added");
        }

        editingEntryId = null;
        closeModals(page);
        await refresh(page);
    } catch (err) {
        showError(page, "entry", err);
    }
}

/* ---- loan ---- */

function openLoanModal(page, id) {
    editingLoanId = id || null;

    const layer = modal(page, "loan");
    const form = layer.querySelector("form");
    form.reset();
    form.date.value = todayISO();

    const r = id ? loans.find((x) => x.id === id) : null;

    layer.querySelector("[data-loan-title]").textContent = r
        ? "Edit loan"
        : "Add loan";

    if (r) {
        form.lender.value = r.lender || "";
        form.principal.value = r.principal;
        form.emiAmount.value = r.emiAmount;
        form.tenureMonths.value = r.tenureMonths;
        form.interestRate.value = r.interestRate || "";
        form.date.value = r.date;
        form.notes.value = r.notes || "";
    }

    openModal(page, "loan");
}

async function saveLoan(page) {
    const form = modal(page, "loan").querySelector("form");

    const record = {
        lender: form.lender.value.trim(),
        principal: parseFloat(form.principal.value) || 0,
        emiAmount: parseFloat(form.emiAmount.value) || 0,
        tenureMonths: parseInt(form.tenureMonths.value, 10) || 1,
        interestRate: parseFloat(form.interestRate.value) || 0,
        date: form.date.value,
        notes: form.notes.value.trim(),
        payments: []
    };

    try {
        if (editingLoanId) {
            const existing = loans.find((x) => x.id === editingLoanId);
            record.payments = existing.payments || [];
            record.id = editingLoanId;
            await store.saveLoan(record);
            toast(page, "Loan updated");
        } else {
            await store.saveLoan(record);
            toast(page, "Loan added");
        }

        editingLoanId = null;
        closeModals(page);
        await refresh(page);
    } catch (err) {
        showError(page, "loan", err);
    }
}

/* ---- payment ---- */

function openPaymentModal(page, loanId, paymentId) {
    paymentCtx = { loanId, paymentId: paymentId || null };

    const r = loans.find((x) => x.id === loanId);
    if (!r) return;

    const layer = modal(page, "payment");
    const form = layer.querySelector("form");
    form.reset();
    form.date.value = todayISO();

    const p = paymentId
        ? (r.payments || []).find((x) => x.id === paymentId)
        : null;

    layer.querySelector("[data-payment-title]").textContent = p
        ? "Edit payment"
        : "Pay EMI";

    if (p) {
        form.amount.value = p.amount;
        form.date.value = p.date;
        form.note.value = p.note || "";
    } else {
        form.amount.value = r.emiAmount;
    }

    openModal(page, "payment");
}

async function savePayment(page) {
    const form = modal(page, "payment").querySelector("form");

    const amount = parseFloat(form.amount.value) || 0;
    const date = form.date.value;
    const note = form.note.value.trim();

    const r = loans.find((x) => x.id === paymentCtx.loanId);
    if (!r) return;

    const payments = [...(r.payments || [])];

    if (paymentCtx.paymentId) {
        const i = payments.findIndex((x) => x.id === paymentCtx.paymentId);
        if (i >= 0) payments[i] = { ...payments[i], amount, date, note };
    } else {
        payments.push({ id: uid(), amount, date, note });
    }

    try {
        await store.saveLoan({ ...r, payments });
        toast(page, paymentCtx.paymentId ? "Payment updated" : "Payment recorded");
        closeModals(page);
        await refresh(page);
    } catch (err) {
        showError(page, "payment", err);
    }
}

/* ---- delete ---- */

function askDelete(page, ctx) {
    pendingDelete = ctx;

    const layer = modal(page, "confirm");
    const title = layer.querySelector("[data-confirm-title]");
    const body = layer.querySelector("[data-confirm-body]");

    if (ctx.kind === "person") {
        const p = parties.find((x) => x.id === ctx.id);
        const n = entries.filter((e) => e.partyId === ctx.id).length;
        title.textContent = "Delete this person?";
        body.textContent = `This removes "${p ? p.name : "this person"}" and all ${n} linked entr${n === 1 ? "y" : "ies"}. This can't be undone.`;
    } else if (ctx.kind === "entry") {
        title.textContent = "Delete this entry?";
        body.textContent = "This can't be undone.";
    } else if (ctx.kind === "loan") {
        const r = loans.find((x) => x.id === ctx.id);
        const n = r ? (r.payments || []).length : 0;
        title.textContent = "Delete this loan?";
        body.textContent = `This removes "${r ? r.lender || "this loan" : "this loan"}" and its ${n} linked payment(s). This can't be undone.`;
    } else {
        title.textContent = "Delete this payment?";
        body.textContent = "This can't be undone.";
    }

    openModal(page, "confirm");
}

async function confirmDelete(page) {
    if (!pendingDelete) return;

    const ctx = pendingDelete;
    pendingDelete = null;

    try {
        if (ctx.kind === "person") {
            await store.deletePerson(ctx.id);
            if (personId === ctx.id) personId = null;
            toast(page, "Person deleted");
        } else if (ctx.kind === "entry") {
            await store.deleteEntry(ctx.id);
            toast(page, "Entry deleted");
        } else if (ctx.kind === "loan") {
            await store.deleteLoan(ctx.id);
            toast(page, "Loan deleted");
        } else {
            const r = loans.find((x) => x.id === ctx.loanId);
            if (r) {
                await store.saveLoan({
                    ...r,
                    payments: (r.payments || []).filter(
                        (p) => p.id !== ctx.paymentId
                    )
                });
            }
            toast(page, "Payment deleted");
        }
    } catch (err) {
        toast(page, "Couldn't delete — " + (err && err.message ? err.message : "database error"));
    }

    closeModals(page);
    await refresh(page);
}

/* =========================================
   EVENTS
========================================= */

function attachEvents(page) {
    page.addEventListener("click", async (event) => {
        const tabBtn = event.target.closest("[data-ll-tab]");

        if (tabBtn) {
            tab = tabBtn.dataset.llTab;
            personId = null;
            render(page);
            return;
        }

        const el = event.target.closest("[data-action]");
        if (!el) return;

        const action = el.dataset.action;
        const id = el.dataset.id ? Number(el.dataset.id) : null;
        const loanId = el.dataset.loan ? Number(el.dataset.loan) : null;
        const paymentId = el.dataset.payment || null;

        // Buttons inside clickable rows must not also trigger the row
        if (el.tagName === "BUTTON") event.stopPropagation();

        switch (action) {
            case "close-modal":
                closeModals(page);
                break;

            case "add-person":
                openPersonModal(page, null);
                break;
            case "edit-person":
                openPersonModal(page, id);
                break;
            case "delete-person":
                askDelete(page, { kind: "person", id });
                break;
            case "open-person":
                tab = "people";
                personId = id;
                render(page);
                break;
            case "back-people":
                personId = null;
                render(page);
                break;
            case "toggle-year": {
                const y = el.dataset.year;
                if (openYears.has(y)) openYears.delete(y);
                else openYears.add(y);
                render(page);
                break;
            }

            case "add-entry":
                openEntryModal(page, null);
                break;
            case "edit-entry":
                openEntryModal(page, id);
                break;
            case "delete-entry":
                askDelete(page, { kind: "entry", id });
                break;

            case "add-loan":
                openLoanModal(page, null);
                break;
            case "edit-loan":
                openLoanModal(page, id);
                break;
            case "delete-loan":
                askDelete(page, { kind: "loan", id });
                break;
            case "toggle-loan":
                if (openLoanIds.has(id)) openLoanIds.delete(id);
                else openLoanIds.add(id);
                render(page);
                break;

            case "add-payment":
                openPaymentModal(page, loanId, null);
                break;
            case "edit-payment":
                openPaymentModal(page, loanId, paymentId);
                break;
            case "delete-payment":
                askDelete(page, { kind: "payment", loanId, paymentId });
                break;

            case "confirm-delete":
                await confirmDelete(page);
                break;
        }
    });

    page.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-form]");
        if (!form) return;

        event.preventDefault();

        const kind = form.dataset.form;

        if (kind === "person") await savePerson(page);
        else if (kind === "entry") await saveEntry(page);
        else if (kind === "loan") await saveLoan(page);
        else if (kind === "payment") await savePayment(page);
    });

    // Search / filter: re-render only the list so the input keeps focus
    page.addEventListener("input", (event) => {
        if (!event.target.matches("[data-ll-search]")) return;

        searchTerm = event.target.value.trim();

        const pos = event.target.selectionStart;
        render(page);

        const input = page.querySelector("[data-ll-search]");
        if (input) {
            input.focus();
            input.setSelectionRange(pos, pos);
        }
    });

    page.addEventListener("change", (event) => {
        if (!event.target.matches("[data-ll-filter]")) return;

        balanceFilter = event.target.value;
        render(page);
    });

    page.querySelectorAll("[data-modal]").forEach((layer) => {
        layer.addEventListener("click", (event) => {
            if (event.target === event.currentTarget) closeModals(page);
        });
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
