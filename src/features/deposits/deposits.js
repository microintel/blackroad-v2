import { icon } from "../../components/icons.js";
import { dataService } from "../../data/data-service.js";

import {
    STATUS_LABEL,
    STATUS_RANK,
    todayISO,
    computeMetrics,
    summarize,
    daysUntil,
    formatINR
} from "./deposits-service.js";

let store = null;
let deposits = [];
let editingId = null;
let closingId = null;
let deletingId = null;
let openIds = new Set();

const STATUS_BADGE = {
    active: "br-badge-info",
    "maturing-soon": "br-badge-warning",
    matured: "br-badge-danger",
    closed: "br-badge-success"
};

export async function Deposits() {
    store = await dataService.getDepositStore();
    openIds = new Set();

    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Fixed Deposits</h2>
                <p>Track bank FDs, maturity values and interest earned.</p>
            </div>

            <button type="button" class="br-button br-button-primary" data-action="add-fd">
                ${icon("plus", { size: 18 })}
                Add deposit
            </button>
        </div>

        <div class="br-grid br-grid-4" data-fd-summary></div>

        <section class="br-card" style="margin-top:20px;">
            <div data-fd-list></div>
        </section>

        <!-- ADD / EDIT -->
        <div class="br-modal-layer" data-fd-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3 data-fd-modal-title>Add deposit</h3>
                    <button type="button" class="br-button" data-action="close-fd-modal">×</button>
                </div>

                <form data-fd-form>
                    <div class="br-modal-body">
                        <p class="br-field-help" data-fd-error style="display:none;color:var(--br-danger);"></p>

                        <div class="br-form-grid">
                            <label>
                                <span>Bank / institution</span>
                                <input name="bankName" type="text" class="br-input" placeholder="e.g. HDFC Bank — Tax Saver FD" required>
                            </label>

                            <label>
                                <span>Principal amount</span>
                                <input name="principal" type="number" step="0.01" min="0" class="br-input" required>
                            </label>

                            <label>
                                <span>Interest rate % p.a.</span>
                                <input name="interestRate" type="number" step="0.01" min="0" class="br-input" required>
                            </label>

                            <label>
                                <span>Compounding</span>
                                <select name="compounding" class="br-select">
                                    <option value="quarterly">Quarterly (standard bank FD)</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                    <option value="simple">Simple interest</option>
                                </select>
                            </label>

                            <label>
                                <span>Tenure (months)</span>
                                <input name="tenureMonths" type="number" step="1" min="1" class="br-input" required>
                            </label>

                            <label>
                                <span>Start date</span>
                                <input name="startDate" type="date" class="br-input" required>
                            </label>

                            <label>
                                <span>Notes (optional)</span>
                                <input name="notes" type="text" class="br-input" placeholder="e.g. Account ending 4821">
                            </label>
                        </div>
                    </div>

                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="close-fd-modal">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- CLOSE -->
        <div class="br-modal-layer" data-close-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Close deposit</h3>
                    <button type="button" class="br-button" data-action="cancel-close">×</button>
                </div>

                <form data-close-form>
                    <div class="br-modal-body">
                        <div class="br-form-grid">
                            <label>
                                <span>Amount received</span>
                                <input name="closedAmount" type="number" step="0.01" min="0" class="br-input" required>
                            </label>

                            <label>
                                <span>Date closed</span>
                                <input name="closedDate" type="date" class="br-input" required>
                            </label>
                        </div>
                    </div>

                    <div class="br-modal-footer">
                        <button type="button" class="br-button" data-action="cancel-close">Cancel</button>
                        <button type="submit" class="br-button br-button-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- DELETE -->
        <div class="br-modal-layer" data-delete-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Delete this deposit?</h3>
                </div>
                <div class="br-modal-body">
                    <p class="br-muted" data-delete-body></p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="cancel-delete">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm-delete">Delete</button>
                </div>
            </div>
        </div>
    `;

    attachEvents(page);
    await refresh(page);

    return page;
}

/* =========================================
   DATA + RENDER
========================================= */

async function refresh(page) {
    deposits = await store.getDeposits();
    renderSummary(page);
    renderList(page);
}

function statCard(label, value) {
    return `
        <div class="br-card br-stat">
            <div class="br-stat-label">${escapeHTML(label)}</div>
            <div class="br-stat-value">${value}</div>
        </div>
    `;
}

function renderSummary(page) {
    const s = summarize(deposits);

    let next = "—";
    if (s.nextMaturity) {
        const days = daysUntil(s.nextMaturity.date);
        const when =
            days < 0
                ? `${Math.abs(days)}d overdue`
                : days === 0
                ? "Today"
                : `in ${days}d`;
        next = `${escapeHTML(s.nextMaturity.bankName)} · ${when}`;
    }

    page.querySelector("[data-fd-summary]").innerHTML =
        statCard("Invested", formatINR(s.totalInvested)) +
        statCard("Current value", formatINR(s.totalCurrentValue)) +
        statCard("Active FDs", s.activeCount) +
        statCard("Next maturity", next);
}

function renderList(page) {
    const box = page.querySelector("[data-fd-list]");

    if (deposits.length === 0) {
        box.innerHTML =
            '<div class="br-empty-state">No fixed deposits yet. Add a bank FD to track its maturity value and interest earned.</div>';
        return;
    }

    const rows = deposits
        .map((r) => ({ r, m: computeMetrics(r) }))
        .sort((a, b) => {
            if (STATUS_RANK[a.m.status] !== STATUS_RANK[b.m.status]) {
                return STATUS_RANK[a.m.status] - STATUS_RANK[b.m.status];
            }
            const da = a.m.maturityDate || "9999-99-99";
            const db = b.m.maturityDate || "9999-99-99";
            return da < db ? -1 : da > db ? 1 : 0;
        });

    box.innerHTML = `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Deposit</th>
                        <th>Status</th>
                        <th>Principal</th>
                        <th>Rate</th>
                        <th>Matures</th>
                        <th>Maturity value</th>
                        <th>Current value</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(({ r, m }) => rowHTML(r, m)).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function rowHTML(r, m) {
    const isOpen = openIds.has(r.id);
    const closed = m.status === "closed";

    const detail = isOpen
        ? `<tr>
            <td colspan="8">
                <div class="br-muted">
                    ${r.notes ? `<div>${escapeHTML(r.notes)}</div>` : ""}
                    <div>Compounding: ${escapeHTML(r.compounding || "quarterly")} · Tenure: ${Number(r.tenureMonths) || 0} months · Started ${escapeHTML(r.startDate || "—")}</div>
                    <div>Interest earned so far: ${formatINR(m.interestEarned)}</div>
                    ${closed ? `<div>Closed ${escapeHTML(r.closedDate || "")} · Received ${formatINR(r.closedAmount)}</div>` : ""}
                </div>
            </td>
        </tr>`
        : "";

    return `
        <tr data-action="toggle-fd" data-id="${r.id}" style="cursor:pointer;">
            <td>${escapeHTML(r.bankName || "Fixed deposit")}</td>
            <td><span class="br-badge ${STATUS_BADGE[m.status]}">${STATUS_LABEL[m.status]}</span></td>
            <td>${formatINR(r.principal)}</td>
            <td>${Number(r.interestRate) || 0}%</td>
            <td>${m.maturityDate ? escapeHTML(m.maturityDate) : "—"}</td>
            <td>${formatINR(m.maturityAmount)}</td>
            <td>${formatINR(m.currentValue)}</td>
            <td>
                ${closed ? "" : `<button type="button" class="br-button" data-action="close-fd" data-id="${r.id}">Close</button>`}
                <button type="button" class="br-button" data-action="edit-fd" data-id="${r.id}">${icon("pencil", { size: 16 })}Edit</button>
                <button type="button" class="br-button br-button-danger" data-action="delete-fd" data-id="${r.id}">${icon("trash-2", { size: 16 })}Delete</button>
            </td>
        </tr>
        ${detail}
    `;
}

/* =========================================
   ADD / EDIT
========================================= */

function openFdModal(page, id) {
    const form = page.querySelector("[data-fd-form]");
    page.querySelector("[data-fd-error]").style.display = "none";
    form.reset();
    editingId = id || null;

    form.startDate.value = todayISO();
    form.compounding.value = "quarterly";

    if (id) {
        const r = deposits.find((x) => x.id === id);
        if (!r) return;

        page.querySelector("[data-fd-modal-title]").textContent = "Edit deposit";
        form.bankName.value = r.bankName || "";
        form.principal.value = r.principal;
        form.interestRate.value = r.interestRate;
        form.compounding.value = r.compounding || "quarterly";
        form.tenureMonths.value = r.tenureMonths;
        form.startDate.value = r.startDate;
        form.notes.value = r.notes || "";
    } else {
        page.querySelector("[data-fd-modal-title]").textContent = "Add deposit";
    }

    page.querySelector("[data-fd-modal]").hidden = false;
}

function closeFdModal(page) {
    page.querySelector("[data-fd-modal]").hidden = true;
    editingId = null;
}

async function saveFd(page) {
    const form = page.querySelector("[data-fd-form]");
    const errorEl = page.querySelector("[data-fd-error]");

    const record = {
        bankName: form.bankName.value.trim(),
        principal: parseFloat(form.principal.value) || 0,
        interestRate: parseFloat(form.interestRate.value) || 0,
        compounding: form.compounding.value,
        tenureMonths: parseInt(form.tenureMonths.value, 10) || 1,
        startDate: form.startDate.value,
        notes: form.notes.value.trim()
    };

    try {
        if (editingId) {
            await store.update(editingId, record);
        } else {
            await store.add(record);
        }

        closeFdModal(page);
        await refresh(page);
    } catch (err) {
        errorEl.textContent =
            "Couldn't save — " + (err && err.message ? err.message : "database error");
        errorEl.style.display = "block";
    }
}

/* =========================================
   CLOSE / DELETE
========================================= */

function openCloseModal(page, id) {
    const r = deposits.find((x) => x.id === id);
    if (!r) return;

    closingId = id;

    const m = computeMetrics(r);
    const form = page.querySelector("[data-close-form]");
    form.reset();
    form.closedAmount.value = Math.round(m.maturityAmount * 100) / 100;
    form.closedDate.value = todayISO();

    page.querySelector("[data-close-modal]").hidden = false;
}

function cancelClose(page) {
    closingId = null;
    page.querySelector("[data-close-modal]").hidden = true;
}

async function saveClose(page) {
    const form = page.querySelector("[data-close-form]");

    await store.update(closingId, {
        status: "closed",
        closedAmount: parseFloat(form.closedAmount.value) || 0,
        closedDate: form.closedDate.value
    });

    cancelClose(page);
    await refresh(page);
}

function openDelete(page, id) {
    const r = deposits.find((x) => x.id === id);
    if (!r) return;

    deletingId = id;
    page.querySelector("[data-delete-body]").textContent =
        `This removes "${r.bankName || "this deposit"}" permanently. This can't be undone.`;
    page.querySelector("[data-delete-modal]").hidden = false;
}

function cancelDelete(page) {
    deletingId = null;
    page.querySelector("[data-delete-modal]").hidden = true;
}

async function confirmDelete(page) {
    if (deletingId == null) return;

    await store.remove(deletingId);
    openIds.delete(deletingId);
    cancelDelete(page);
    await refresh(page);
}

/* =========================================
   EVENTS
========================================= */

function attachEvents(page) {
    page.addEventListener("click", async (event) => {
        const el = event.target.closest("[data-action]");
        if (!el) return;

        const action = el.dataset.action;
        const id = el.dataset.id ? Number(el.dataset.id) : null;

        if (action === "add-fd") openFdModal(page);
        else if (action === "edit-fd") openFdModal(page, id);
        else if (action === "close-fd-modal") closeFdModal(page);
        else if (action === "close-fd") openCloseModal(page, id);
        else if (action === "cancel-close") cancelClose(page);
        else if (action === "delete-fd") openDelete(page, id);
        else if (action === "cancel-delete") cancelDelete(page);
        else if (action === "confirm-delete") await confirmDelete(page);
        else if (action === "toggle-fd") {
            if (openIds.has(id)) openIds.delete(id);
            else openIds.add(id);
            renderList(page);
        }
    });

    page.addEventListener("submit", async (event) => {
        if (event.target.matches("[data-fd-form]")) {
            event.preventDefault();
            await saveFd(page);
        } else if (event.target.matches("[data-close-form]")) {
            event.preventDefault();
            await saveClose(page);
        }
    });

    page.querySelectorAll(".br-modal-layer").forEach((layer) => {
        layer.addEventListener("click", (event) => {
            if (event.target !== event.currentTarget) return;
            if (layer.hasAttribute("data-fd-modal")) closeFdModal(page);
            else if (layer.hasAttribute("data-close-modal")) cancelClose(page);
            else cancelDelete(page);
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
