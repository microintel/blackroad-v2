import { tipAttr } from "../../components/chart-tooltip.js";
import {
    EMPTY_MANUAL,
    loadManual,
    saveManual,
    loadLive,
    calculate,
    percent,
    exportPDF,
    formatINR
} from "./accounting-service.js";

let live = { mf: 0, peopleReceivable: 0, liabilities: 0 };
let toastTimer = null;

const NUMBER_FIELDS = [
    ["cash", "Cash"],
    ["fd", "Fixed Deposit"],
    ["stock", "Stocks"],
    ["demat", "Demat Account"],
    ["pending", "Pending Amount"],
    ["other", "Other Assets"]
];

export async function Accounting() {
    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Accounting</h2>
                <p>Net worth from your manual entries plus live data.</p>
            </div>

            <div class="br-page-actions">
                <button type="button" class="br-button" data-action="pdf">Export PDF</button>
                <button type="button" class="br-button" data-action="reset">Reset entries</button>
                <button type="button" class="br-button br-button-primary" data-action="save">Calculate &amp; Save</button>
            </div>
        </div>

        <div class="ac-layout">
            <div class="ac-side">
                <section class="br-card">
                    <div class="br-stat-label">Net worth</div>
                    <div class="br-stat-value" data-net>₹0</div>
                    <p class="br-muted">Assets minus liabilities, calculated live</p>
                    <div data-donut></div>
                </section>

                <section class="br-card">
                    <div class="br-card-heading">
                        <h3>Live data</h3>
                        <button type="button" class="br-button" data-action="refresh">Refresh</button>
                    </div>
                    <div class="ac-live-row"><span>Mutual Funds</span><strong data-live="mf">₹0</strong></div>
                    <div class="ac-live-row"><span>Loans &amp; Liabilities</span><strong data-live="liab">₹0</strong></div>
                    <div class="ac-live-row"><span>Lending Receivable</span><strong data-live="recv">₹0</strong></div>
                    <p class="br-field-help">Pulled automatically from Mutual Fund and Lending. Everything else is entered manually.</p>
                </section>
            </div>

            <div class="ac-main">
                <section class="br-card">
                    <div class="br-card-heading"><h3>Banks</h3></div>
                    <div data-banks></div>
                    <button type="button" class="br-button" data-action="add-bank">+ Add bank</button>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Additional assets</h3></div>
                    <div data-customs></div>
                    <button type="button" class="br-button" data-action="add-custom">+ Add additional asset</button>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Cash, investments &amp; other</h3></div>
                    <div class="br-form-grid">
                        ${NUMBER_FIELDS.map(
                            ([id, label]) => `
                            <label>
                                <span>${label}</span>
                                <input type="number" class="br-input" data-field="${id}" placeholder="0" inputmode="decimal">
                            </label>`
                        ).join("")}
                    </div>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Breakdown</h3></div>
                    <div data-result></div>
                </section>
            </div>
        </div>

        <div class="br-toast" data-ac-toast></div>
    `;

    const saved = await loadManual().catch(() => null);
    live = await loadLive();

    fillForm(page, saved || EMPTY_MANUAL);
    bindEvents(page);
    render(page);

    return page;
}

/* ---------------- form <-> data ---------------- */

function fillForm(page, data) {
    const banks = page.querySelector("[data-banks]");
    const customs = page.querySelector("[data-customs]");

    banks.innerHTML = "";
    customs.innerHTML = "";

    (data.banks && data.banks.length ? data.banks : [0]).forEach((b) =>
        addBank(page, b)
    );

    (data.customs || []).forEach((c) => addCustom(page, c.name, c.amt));

    NUMBER_FIELDS.forEach(([id]) => {
        page.querySelector(`[data-field="${id}"]`).value = data[id] || "";
    });
}

function gather(page) {
    const value = (id) =>
        Number(page.querySelector(`[data-field="${id}"]`).value) || 0;

    return {
        banks: [...page.querySelectorAll("[data-bank]")].map(
            (i) => Number(i.value) || 0
        ),
        customs: [...page.querySelectorAll("[data-custom-row]")].map((r) => ({
            name: r.querySelector("[data-custom-name]").value || "Additional",
            amt: Number(r.querySelector("[data-custom-amt]").value) || 0
        })),
        cash: value("cash"),
        fd: value("fd"),
        stock: value("stock"),
        demat: value("demat"),
        pending: value("pending"),
        other: value("other")
    };
}

function addBank(page, value = "") {
    const row = document.createElement("div");
    row.className = "ac-row";

    row.innerHTML = `
        <label>
            <span>Bank balance</span>
            <input type="number" class="br-input" data-bank placeholder="0" inputmode="decimal">
        </label>
        <button type="button" class="br-button" data-remove title="Remove">×</button>
    `;

    row.querySelector("[data-bank]").value = value || "";
    page.querySelector("[data-banks]").appendChild(row);
}

function addCustom(page, name = "", amt = "") {
    const row = document.createElement("div");
    row.className = "ac-row";
    row.setAttribute("data-custom-row", "");

    row.innerHTML = `
        <label>
            <span>Asset name</span>
            <input type="text" class="br-input" data-custom-name placeholder="e.g. Provident Fund">
        </label>
        <label>
            <span>Amount</span>
            <input type="number" class="br-input" data-custom-amt placeholder="0" inputmode="decimal">
        </label>
        <button type="button" class="br-button" data-remove title="Remove">×</button>
    `;

    row.querySelector("[data-custom-name]").value = name;
    row.querySelector("[data-custom-amt]").value = amt || "";
    page.querySelector("[data-customs]").appendChild(row);
}

/* ---------------- render ---------------- */

function render(page) {
    const result = calculate(gather(page), live);

    const pct = (v) => percent(v, result.assets);

    page.querySelector("[data-result]").innerHTML = `
        <div class="ac-breakdown">
            ${result.rows
                .map(
                    (r) => `
                <div class="ac-line">
                    <span>${escapeHTML(r.label)}${r.live ? ' <span class="br-badge br-badge-success">Live</span>' : ""}</span>
                    <span>${formatINR(r.value)} (${pct(r.value)}%)</span>
                </div>`
                )
                .join("")}
            <div class="ac-line ac-total">
                <span>Total assets</span>
                <span>${formatINR(result.assets)}</span>
            </div>
            <div class="ac-line">
                <span>Loans &amp; liabilities <span class="br-badge br-badge-success">Live</span></span>
                <span>− ${formatINR(result.liabilities)}</span>
            </div>
            <div class="ac-line ac-net">
                <span>Net worth</span>
                <span class="${result.net >= 0 ? "ac-pos" : "ac-neg"}">${formatINR(result.net)}</span>
            </div>
        </div>
    `;

    const net = page.querySelector("[data-net]");
    net.textContent = formatINR(result.net);

    page.querySelector('[data-live="mf"]').textContent = formatINR(live.mf);
    page.querySelector('[data-live="liab"]').textContent =
        "− " + formatINR(result.liabilities);
    page.querySelector('[data-live="recv"]').textContent = formatINR(
        live.peopleReceivable
    );

    page.querySelector("[data-donut]").innerHTML = donut(
        result.assets,
        result.liabilities
    );

    page.__result = result;
}

/* Assets vs liabilities ring — plain SVG, no chart library. */
function donut(assets, liabilities) {
    const total = assets + liabilities;
    const r = 52;
    const c = 2 * Math.PI * r;
    const assetLen = total ? (assets / total) * c : c;

    return `
        <svg class="ac-donut" viewBox="0 0 140 140" role="img" aria-label="Assets versus liabilities">
            <circle class="br-tip-seg" ${tipAttr("Liabilities", [["Value", formatINR(liabilities)]])} cx="70" cy="70" r="${r}" fill="none" stroke="var(--br-border-strong)" stroke-width="16"></circle>
            <circle class="br-tip-seg" ${tipAttr("Assets", [["Value", formatINR(assets)]])} cx="70" cy="70" r="${r}" fill="none" stroke="var(--br-success)" stroke-width="16"
                stroke-dasharray="${assetLen} ${c}" transform="rotate(-90 70 70)"></circle>
        </svg>
        <div class="ac-legend">
            <span><i class="ac-dot ac-dot-assets"></i>Assets ${formatINR(assets)}</span>
            <span><i class="ac-dot ac-dot-liab"></i>Liabilities ${formatINR(liabilities)}</span>
        </div>
    `;
}

/* ---------------- events ---------------- */

function bindEvents(page) {
    page.addEventListener("input", (event) => {
        if (event.target.matches("input")) render(page);
    });

    page.addEventListener("click", async (event) => {
        const removeBtn = event.target.closest("[data-remove]");

        if (removeBtn) {
            removeBtn.closest(".ac-row").remove();
            render(page);
            return;
        }

        const button = event.target.closest("[data-action]");
        if (!button) return;

        switch (button.dataset.action) {
            case "add-bank":
                addBank(page);
                break;

            case "add-custom":
                addCustom(page);
                break;

            case "save":
                await save(page);
                break;

            case "refresh":
                live = await loadLive();
                render(page);
                toast(page, "Live data refreshed");
                break;

            case "reset":
                if (
                    confirm("Clear all manually entered fields on this page?")
                ) {
                    fillForm(page, EMPTY_MANUAL);
                    render(page);
                }
                break;

            case "pdf":
                try {
                    await exportPDF(page.__result);
                    toast(page, "PDF exported");
                } catch (error) {
                    console.error(error);
                    toast(page, "PDF library failed to load — check your connection");
                }
                break;
        }
    });
}

async function save(page) {
    try {
        await saveManual(gather(page));
        toast(page, "Saved to BlackRoad Accounting");
    } catch (error) {
        console.error("Accounting: save failed", error);
        toast(page, "Could not save — see console");
    }
}

function toast(page, message) {
    const el = page.querySelector("[data-ac-toast]");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}
