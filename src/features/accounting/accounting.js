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
import { loadBankIndex, findSlug, logoUrl } from "../../services/bank-logos.js";
import { icon } from "../../components/icons.js";
import { currentUser, isGuestSync } from "../../services/auth.js";

let bankIndex = {};

let live = { mf: 0, peopleReceivable: 0, liabilities: 0 };
let toastTimer = null;

const NUMBER_FIELDS = [
    ["cash", "Cash", "banknote"],
    ["fd", "Fixed Deposit", "piggy-bank"],
    ["stock", "Stocks", "chart-candlestick"],
    ["demat", "Demat Account", "briefcase-business"],
    ["pending", "Pending Amount", "clock"],
    ["other", "Other Assets", "layers"]
];

/* Small icon tile used next to asset names. */
const ico = (name) => `<span class="ac-ico">${icon(name, { size: 16 })}</span>`;

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
                    <div class="ac-live-row"><span class="ac-label-ico">${ico("chart-pie")}Mutual Funds</span><strong data-live="mf">₹0</strong></div>
                    <div class="ac-live-row"><span class="ac-label-ico">${ico("coins")}Loans &amp; Liabilities</span><strong data-live="liab">₹0</strong></div>
                    <div class="ac-live-row"><span class="ac-label-ico">${ico("hand-coins")}Lending Receivable</span><strong data-live="recv">₹0</strong></div>
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
                            ([id, label, ic]) => `
                            <label>
                                <span class="ac-label-ico">${ico(ic)}${label}</span>
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

        <div class="ac-savebar">
            <div class="ac-savebar-net">
                <span>Net worth</span>
                <strong data-net-bar>₹0</strong>
            </div>
            <button type="button" class="br-button br-button-primary" data-action="save">Calculate &amp; Save</button>
        </div>

        <div class="br-toast" data-ac-toast></div>
    `;

    const saved = await loadManual().catch(() => null);
    live = await loadLive();

    fillForm(page, saved || EMPTY_MANUAL);
    bindEvents(page);
    render(page);
    prepareBankNames(page);

    return page;
}

/* ---------------- form <-> data ---------------- */

function fillForm(page, data) {
    const banks = page.querySelector("[data-banks]");
    const customs = page.querySelector("[data-customs]");

    banks.innerHTML = "";
    customs.innerHTML = "";

    (data.banks || []).forEach((b, i) => {
        const name = (data.bankNames || [])[i] || "";
        const amount = Number(b) || 0;

        /* Skip the old empty placeholder row; keep any row that has a name or money. */
        if (!name && !amount) return;

        addBank(page, amount, name);
    });

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
        bankNames: [...page.querySelectorAll("[data-bank-name]")].map(
            (i) => i.value.trim()
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

function addBank(page, value = "", name = "") {
    const row = document.createElement("div");
    row.className = "ac-row ac-bank-row";

    row.innerHTML = `
        <div class="ac-bank-name">
            <span>Bank</span>
            <span class="ac-bank-field">
                <span class="ac-bank-logo" hidden></span>
                <strong class="ac-bank-title" data-bank-title></strong>
                <input type="hidden" data-bank-name>
            </span>
        </div>
        <label>
            <span>Balance</span>
            <input type="number" class="br-input" data-bank placeholder="0" inputmode="decimal">
        </label>
        <button type="button" class="br-button" data-edit-bank title="Edit bank">Edit</button>
        <button type="button" class="br-button" data-remove title="Remove">×</button>
    `;

    row.querySelector("[data-bank]").value = value || "";
    page.querySelector("[data-banks]").appendChild(row);
    setBankName(row, name);

    return row;
}

function setBankName(row, name) {
    row.querySelector("[data-bank-name]").value = name;
    row.querySelector("[data-bank-title]").textContent = name || "Unnamed bank";
    showBankLogo(row);
}

/* Popup for adding / editing a bank. Resolves { name, balance } or null. */
function bankDialog(initial = {}) {
    return new Promise((resolve) => {
        const previous = document.activeElement;
        const editing = Boolean(initial.name || initial.balance);

        const layer = document.createElement("div");
        layer.className = "br-modal-layer";

        layer.innerHTML = `
            <div class="br-modal" role="dialog" aria-modal="true" aria-labelledby="ac-bank-dlg-title">
                <div class="br-modal-header">
                    <h3 id="ac-bank-dlg-title">${editing ? "Edit bank" : "Add bank"}</h3>
                    <button type="button" class="br-modal-close" data-dlg-close aria-label="Close">×</button>
                </div>
                <div class="br-modal-body">
                    <label>
                        <span>Bank name</span>
                        <input type="text" class="br-input" data-dlg-name list="ac-bank-list"
                            placeholder="e.g. HDFC Bank" autocomplete="off" autocapitalize="words">
                    </label>
                    <div class="ac-dlg-preview"><span class="ac-bank-logo" hidden></span><span class="br-muted" data-dlg-hint>Pick or type a bank name</span></div>
                    <label>
                        <span>Balance</span>
                        <input type="number" class="br-input" data-dlg-balance placeholder="0" inputmode="decimal">
                    </label>
                    <p class="br-field-help" data-dlg-error hidden></p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-dlg-close>Cancel</button>
                    <button type="button" class="br-button br-button-primary" data-dlg-save>Save</button>
                </div>
            </div>
        `;

        const nameInput = layer.querySelector("[data-dlg-name]");
        const balInput = layer.querySelector("[data-dlg-balance]");
        const errorEl = layer.querySelector("[data-dlg-error]");
        const hint = layer.querySelector("[data-dlg-hint]");
        const previewRow = layer.querySelector(".ac-dlg-preview");

        nameInput.value = initial.name || "";
        balInput.value = initial.balance || "";

        /* Live logo preview inside the popup, using the same row logic. */
        const preview = () => {
            const slug = findSlug(nameInput.value, bankIndex);

            hint.textContent = nameInput.value.trim()
                ? slug ? "Logo found" : "No logo for this name — it will be saved without one"
                : "Pick or type a bank name";

            const holder = { querySelector: (sel) => (sel === ".ac-bank-logo" ? previewRow.querySelector(".ac-bank-logo") : nameInput) };

            showBankLogo(holder);
        };

        let done = false;

        const close = (result) => {
            if (done) return;
            done = true;
            document.removeEventListener("keydown", onKey, true);
            layer.remove();

            if (previous && previous.isConnected && previous.focus) previous.focus();

            resolve(result);
        };

        const submit = () => {
            const name = nameInput.value.trim();

            if (!name) {
                errorEl.textContent = "Enter a bank name.";
                errorEl.hidden = false;
                nameInput.focus();
                return;
            }

            close({ name, balance: Number(balInput.value) || 0 });
        };

        const onKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(null);
            } else if (event.key === "Enter" && event.target.matches("input")) {
                event.preventDefault();
                submit();
            }
        };

        layer.addEventListener("click", (event) => {
            if (event.target === layer || event.target.closest("[data-dlg-close]")) close(null);
        });

        layer.querySelector("[data-dlg-save]").addEventListener("click", submit);
        nameInput.addEventListener("input", () => { errorEl.hidden = true; preview(); });
        nameInput.addEventListener("change", preview);

        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(layer);

        /* Make sure suggestions exist even if the page list is not ready yet. */
        ensureBankList(layer);
        preview();
        nameInput.focus();
    });
}

/* Bank name -> slug -> raw GitHub logo. No match, or the image fails to load
   (offline), and only the name is shown. */
function showBankLogo(row) {
    const box = row.querySelector(".ac-bank-logo");
    const slug = findSlug(row.querySelector("[data-bank-name]").value, bankIndex);

    if (!slug) {
        box.hidden = true;
        box.textContent = "";
        return;
    }

    if (box.dataset.slug === slug && !box.hidden) return;

    const img = new Image();

    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
        box.dataset.slug = slug;
        box.replaceChildren(img);
        box.hidden = false;
    };
    img.onerror = () => {
        /* SVG failed (blocked or wrong content type) -> try the PNG next to it. */
        if (!img.dataset.png) {
            img.dataset.png = "1";
            img.src = logoUrl(slug, "png");
            return;
        }

        console.warn("BlackRoad bank logos: could not load", img.src);
        box.hidden = true;
        box.textContent = "";
    };
    img.src = logoUrl(slug);
}

/* Datalist of bank names, appended once to <body> so the popup can use it too. */
function ensureBankList(root) {
    let list = document.getElementById("ac-bank-list");

    if (!list) {
        list = document.createElement("datalist");
        list.id = "ac-bank-list";
        (root || document.body).appendChild(list);
    }

    if (!list.children.length) {
        list.innerHTML = Object.values(bankIndex)
            .sort((a, b) => a.localeCompare(b))
            .map((n) => `<option value="${escapeHTML(n)}"></option>`)
            .join("");
    }
}

/* Fill the bank-name suggestions and logos once the dataset index is in. */
async function prepareBankNames(page) {
    bankIndex = await loadBankIndex();

    const old = document.getElementById("ac-bank-list");
    if (old) old.remove();

    ensureBankList(page);

    page.querySelectorAll(".ac-bank-row").forEach(showBankLogo);
}

function addCustom(page, name = "", amt = "") {
    const row = document.createElement("div");
    row.className = "ac-row";
    row.setAttribute("data-custom-row", "");

    row.innerHTML = `
        <label>
            <span class="ac-label-ico">${ico("gem")}Asset name</span>
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
                    <span class="ac-label-ico">${r.icon ? ico(r.icon) : ""}${escapeHTML(r.label)}${r.live ? ' <span class="br-badge br-badge-success">Live</span>' : ""}</span>
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

    const netBar = page.querySelector("[data-net-bar]");
    if (netBar) netBar.textContent = formatINR(result.net);

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

        const editBtn = event.target.closest("[data-edit-bank]");

        if (editBtn) {
            const row = editBtn.closest(".ac-bank-row");
            const result = await bankDialog({
                name: row.querySelector("[data-bank-name]").value,
                balance: Number(row.querySelector("[data-bank]").value) || ""
            });

            if (result) {
                row.querySelector("[data-bank]").value = result.balance || "";
                setBankName(row, result.name);
                render(page);
            }

            return;
        }

        const button = event.target.closest("[data-action]");
        if (!button) return;

        switch (button.dataset.action) {
            case "add-bank": {
                const result = await bankDialog();

                if (result) {
                    addBank(page, result.balance, result.name);
                    render(page);
                }
                break;
            }

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
                    const data = gather(page);

                    let userName = "";

                    try {
                        userName = isGuestSync()
                            ? "Guest User"
                            : ((await currentUser()) || {}).name || "";
                    } catch { /* export without a name */ }

                    await exportPDF(page.__result, {
                        userName,
                        banks: data.banks.map((amount, i) => ({
                            amount,
                            name: data.bankNames[i] || "",
                            slug: findSlug(data.bankNames[i] || "", bankIndex)
                        }))
                    });
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
