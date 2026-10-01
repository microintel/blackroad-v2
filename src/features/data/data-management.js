import { hardNavigate } from "../../app/router.js";
import {
    getOverview,
    exportAll,
    downloadBackup,
    getLastBackup,
    readBackupFile,
    restoreBackup
} from "../../services/backup-service.js";

let toastTimer = null;
let pending = null;

export async function DataManagement() {
    const page = document.createElement("section");
    page.className = "br-page";
    pending = null;

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Data Management</h2>
                <p>One backup and one restore for all of BlackRoad.</p>
            </div>
        </div>

        <div class="br-grid br-grid-2">
            <section class="br-card">
                <div class="br-card-heading"><h3>Export backup</h3></div>
                <p class="br-muted">
                    Downloads everything — Income, Stocks, Fixed Deposits,
                    Lending, Mutual Fund and Accounting — as one file.
                </p>
                <p class="br-field-help" data-last-backup></p>
                <button type="button" class="br-button br-button-primary" data-action="export">Export all data</button>
            </section>

            <section class="br-card">
                <div class="br-card-heading"><h3>Restore backup</h3></div>
                <p class="br-muted">
                    Choose a BlackRoad backup file. Older single-module exports
                    (Income, Stocks, Lending, Fixed Deposits, Mutual Fund) work too.
                    You'll see what it contains before anything is changed.
                </p>
                <p class="br-field-help">Restoring replaces the current data of every module in the file.</p>
                <button type="button" class="br-button" data-action="choose">Choose backup file</button>
                <input type="file" accept="application/json,.json" data-file hidden>
            </section>
        </div>

        <div class="dm-progress" data-progress hidden>
            <div class="dm-progress-head">
                <p class="br-muted" data-progress-label></p>
                <strong data-progress-pct>0%</strong>
            </div>
            <progress max="100" value="0" data-progress-bar></progress>
        </div>

        <section class="br-card" style="margin-top:20px;">
            <div class="br-card-heading">
                <div>
                    <h3>Storage used on this device</h3>
                    <p class="br-muted">How much space BlackRoad takes on this device.</p>
                </div>
            </div>
            <div class="dm-storage" data-storage>
                <p class="br-muted">Calculating…</p>
            </div>
        </section>

        <section class="br-card" style="margin-top:20px;">
            <div class="br-card-heading"><h3>Stored on this device</h3></div>
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr><th>Module</th><th>Records</th><th>Size</th></tr></thead>
                <tbody data-overview><tr><td colspan="3" class="br-muted">Loading…</td></tr></tbody>
            </table></div>
        </section>

        <!-- RESTORE PREVIEW -->
        <div class="br-modal-layer" data-modal hidden>
            <div class="br-modal" role="dialog" aria-modal="true">
                <div class="br-modal-header">
                    <h3>Restore this backup?</h3>
                    <button type="button" class="br-button" data-action="cancel">×</button>
                </div>
                <div class="br-modal-body">
                    <p class="br-muted" data-preview-meta></p>
                    <p class="br-field-help ac-error" data-preview-warning hidden></p>
                    <div class="br-table-wrap"><table class="br-table">
                        <thead><tr><th>Module</th><th>Records in file</th><th>Action</th></tr></thead>
                        <tbody data-preview-rows></tbody>
                    </table></div>
                    <p class="br-field-help">Modules marked "Replaces" lose their current data. It cannot be undone — export a backup first if unsure.</p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-action="cancel">Cancel</button>
                    <button type="button" class="br-button br-button-danger" data-action="confirm">Restore</button>
                </div>
            </div>
        </div>

        <!-- SUCCESS -->
        <div class="br-modal-layer" data-success hidden>
            <div class="br-modal dm-success" role="alertdialog" aria-modal="true" aria-labelledby="dm-success-title">
                <div class="br-modal-body dm-success-body">
                    <div class="dm-success-icon" aria-hidden="true">✓</div>
                    <h3 id="dm-success-title" data-success-title></h3>
                    <p class="br-muted" data-success-text></p>
                </div>
                <div class="br-modal-footer">
                    <button type="button" class="br-button br-button-primary" data-success-ok>OK</button>
                </div>
            </div>
        </div>

        <div class="br-toast" data-toast></div>
    `;

    bindEvents(page);
    showLastBackup(page);
    loadOverview(page);
    loadStorage(page);

    return page;
}

/* ---------------- render ---------------- */

async function loadOverview(page) {
    const body = page.querySelector("[data-overview]");
    const rows = await getOverview();

    body.innerHTML = rows
        .map(
            (r) => `
            <tr>
                <td>${escapeHTML(r.label)}</td>
                <td>${r.error ? `<span class="br-badge br-badge-danger">error</span>` : r.records}</td>
                <td class="br-muted" data-size="${escapeHTML(r.database)}">…</td>
            </tr>`
        )
        .join("");

    return rows;
}

/* ---------------- storage usage ---------------- */

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    if (i === 0) return `${Math.round(n)} B`;
    return `${n >= 100 ? Math.round(n) : n.toFixed(n >= 10 ? 1 : 2)} ${units[i]}`;
}

function jsonSize(value) {
    try { return new Blob([JSON.stringify(value)]).size; } catch { return 0; }
}

async function loadStorage(page) {
    const box = page.querySelector("[data-storage]");

    let dataBytes = 0;
    let perDb = {};

    // Size of the records themselves (what a backup would contain).
    try {
        const payload = await exportAll();
        for (const [name, db] of Object.entries(payload.databases || {})) {
            perDb[name] = jsonSize(db.stores);
            dataBytes += perDb[name];
        }
    } catch (error) {
        console.error("Storage size failed", error);
    }

    page.querySelectorAll("[data-size]").forEach((cell) => {
        const n = perDb[cell.dataset.size];
        cell.textContent = n === undefined ? "—" : formatBytes(n);
    });

    // Browser-reported total for this site (data + app files + cache).
    let usage = null;
    let quota = null;
    let persisted = null;

    try {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            usage = est.usage ?? null;
            quota = est.quota ?? null;
        }
        if (navigator.storage && navigator.storage.persisted) {
            persisted = await navigator.storage.persisted();
        }
    } catch { /* not available */ }

    if (!page.isConnected && !box.isConnected) return;

    const total = usage !== null ? Math.max(usage, dataBytes) : dataBytes;
    const pct = quota ? Math.max(0.5, Math.min(100, (total / quota) * 100)) : 0;
    const appBytes = Math.max(0, total - dataBytes);

    box.innerHTML = `
        <div class="dm-storage-top">
            <div>
                <div class="dm-storage-value">${formatBytes(total)}</div>
                <div class="br-muted">used on this device${quota ? ` of ${formatBytes(quota)} available` : ""}</div>
            </div>
            ${quota ? `<strong>${pct < 1 ? "<1" : pct.toFixed(1)}%</strong>` : ""}
        </div>
        ${quota ? `<div class="dm-meter" role="img" aria-label="${pct.toFixed(1)} percent of available storage used"><span style="width:${pct}%"></span></div>` : ""}
        <div class="dm-storage-rows">
            <div><span class="dm-dot dm-dot-data"></span>Your records<strong>${formatBytes(dataBytes)}</strong></div>
            <div><span class="dm-dot dm-dot-app"></span>App files &amp; offline cache<strong>${usage !== null ? formatBytes(appBytes) : "—"}</strong></div>
        </div>
        ${persisted === null ? "" : `
        <p class="br-field-help">
            ${persisted
                ? "Protected: your device won't clear this data automatically."
                : "Not protected: your device may clear this data if it runs low on space."}
            ${persisted ? "" : ` <button type="button" class="br-button" data-action="persist">Protect my data</button>`}
        </p>`}
        <p class="br-field-help">Sizes are estimates reported by your device.</p>
    `;
}

function showLastBackup(page) {
    const iso = getLastBackup();

    page.querySelector("[data-last-backup]").textContent = iso
        ? "Last backup: " +
          new Date(iso).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
          })
        : "No backup yet.";
}

function setProgress(page, step, total, label) {
    const box = page.querySelector("[data-progress]");

    box.hidden = false;

    page.querySelector("[data-progress-label]").textContent = label;
    const pct = total ? Math.round((step / total) * 100) : 0;
    page.querySelector("[data-progress-bar]").value = pct;
    page.querySelector("[data-progress-pct]").textContent = `${pct}%`;

    // let the bar repaint between steps
    return new Promise((resolve) => setTimeout(resolve, 60));
}

function hideProgress(page) {
    page.querySelector("[data-progress]").hidden = true;
}

/* ---------------- slow, visible restore progress ---------------- */

const RESTORE_STEP_MS = 1600;   // time the bar takes to fill one module
const RESTORE_HOLD_MS = 900;    // pause on 100% so the finish is seen

let shownPct = 0;
let successDone = null;
let restoring = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function paintProgress(page, pct) {
    const value = Math.max(0, Math.min(100, pct));
    page.querySelector("[data-progress-bar]").value = value;
    page.querySelector("[data-progress-pct]").textContent = `${Math.floor(value)}%`;
}

function animateProgress(page, to, ms) {
    const from = shownPct;
    const start = performance.now();

    return new Promise((resolve) => {
        const tick = (now) => {
            const t = Math.min(1, (now - start) / ms);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            shownPct = from + (to - from) * eased;
            paintProgress(page, shownPct);
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
        };
        requestAnimationFrame(tick);
    });
}

async function restoreStep(page, step, total, label) {
    const box = page.querySelector("[data-progress]");
    const first = box.hidden;

    box.hidden = false;
    page.querySelector("[data-progress-label]").textContent = `${label} (${step} of ${total})`;

    if (first) {
        shownPct = 0;
        paintProgress(page, 0);
        box.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(700);
    }

    await animateProgress(page, (step / total) * 100, RESTORE_STEP_MS);
}

async function exportStep(page, step, total, label) {
    const box = page.querySelector("[data-progress]");
    const first = box.hidden;

    // Show the module name only (labels arrive as "Module / store").
    const moduleName = String(label).split(" / ")[0];

    box.hidden = false;
    page.querySelector("[data-progress-label]").textContent = `Exporting ${moduleName}…`;

    if (first) {
        shownPct = 0;
        paintProgress(page, 0);
        box.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(600);
    }

    // About 8 seconds in total, however many steps there are.
    const ms = Math.max(250, Math.min(1400, 8000 / total));
    await animateProgress(page, (step / total) * 100, ms);
}

function showSuccess(page, title, text, onDone) {
    page.querySelector("[data-success-title]").textContent = title;
    page.querySelector("[data-success-text]").textContent = text;
    successDone = onDone || null;

    const layer = page.querySelector("[data-success]");
    layer.hidden = false;
    layer.querySelector("[data-success-ok]").focus();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function lockButtons(page, locked) {
    page.querySelectorAll("button[data-action]").forEach((b) => { b.disabled = locked; });
}

/* ---------------- events ---------------- */

function bindEvents(page) {
    page.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        switch (button.dataset.action) {
            case "export":
                await doExport(page);
                break;

            case "choose":
                if (window.BRAuth && window.BRAuth.isGuestSync()) {
                    toast(page, "Sign in to restore a backup — guest mode is view-only.");
                    return;
                }
                page.querySelector("[data-file]").click();
                break;

            case "persist":
                try {
                    const ok = await navigator.storage.persist();
                    toast(page, ok ? "Your data is now protected" : "Your device declined. Installing the app may help.");
                } catch {
                    toast(page, "Not supported on this device");
                }
                loadStorage(page);
                break;

            case "cancel":
                closePreview(page);
                break;

            case "confirm":
                await doRestore(page);
                break;
        }
    });

    page.querySelector("[data-success-ok]").addEventListener("click", () => {
        page.querySelector("[data-success]").hidden = true;
        const done = successDone;
        successDone = null;
        if (done) done();
    });

    page.querySelector("[data-file]").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        event.target.value = "";

        if (!file) return;

        try {
            pending = await readBackupFile(file);
            openPreview(page, pending);
        } catch (error) {
            pending = null;
            toast(page, error.message);
        }
    });
}

async function doExport(page) {
    if (restoring) return;

    restoring = true;
    lockButtons(page, true);

    try {
        const payload = await exportAll((step, total, label) =>
            exportStep(page, step, total, label)
        );

        page.querySelector("[data-progress-label]").textContent = "Preparing your backup file…";
        await animateProgress(page, 100, 400);
        await wait(RESTORE_HOLD_MS);

        downloadBackup(payload);
        showLastBackup(page);

        const dbs = Object.values(payload.databases || {});
        const records = dbs.reduce(
            (n, db) => n + Object.values(db.stores || {}).reduce((m, list) => m + list.length, 0),
            0
        );

        hideProgress(page);
        showSuccess(
            page,
            "Export successful",
            `Your backup file has been downloaded (${plural(records, "record")} from ${plural(dbs.length, "module")}). Keep it somewhere safe.`
        );
    } catch (error) {
        console.error("Export failed", error);
        toast(page, "Export failed — see console");
    } finally {
        restoring = false;
        lockButtons(page, false);
        hideProgress(page);
    }
}

/* ---------------- restore preview ---------------- */

function openPreview(page, parsed) {
    const by = parsed.exportedBy;

    const when = parsed.exportedAt
        ? new Date(parsed.exportedAt).toLocaleString("en-IN")
        : "unknown date";

    page.querySelector("[data-preview-meta]").textContent =
        `${parsed.format}. Exported ${when}` +
        (by ? ` by ${by.name || by.email}` : "") +
        ".";

    // Warn when the file came from a different account.
    const warning = page.querySelector("[data-preview-warning]");
    const scope = readScope();

    if (by && by.email && scope && scope !== "guest" && scope !== by.email.toLowerCase()) {
        warning.textContent = `This backup belongs to ${by.email}, but you are signed in as ${scope}. Restoring will put that data into your account.`;
        warning.hidden = false;
    } else {
        warning.hidden = true;
    }

    page.querySelector("[data-preview-rows]").innerHTML = parsed.modules
        .map(
            (m) => `<tr>
                <td>${escapeHTML(m.label)}</td>
                <td>${m.records}</td>
                <td>${m.mode === "add" ? "Adds to existing data" : "Replaces existing data"}</td>
            </tr>`
        )
        .join("");

    page.querySelector("[data-modal]").hidden = false;
}

function readScope() {
    try {
        return localStorage.getItem("br_active_scope");
    } catch {
        return null;
    }
}

function closePreview(page) {
    page.querySelector("[data-modal]").hidden = true;
    pending = null;
}

async function doRestore(page) {
    if (!pending || restoring) return;

    const parsed = pending;
    let failed = false;

    restoring = true;
    page.querySelector("[data-modal]").hidden = true;
    lockButtons(page, true);

    try {
        const result = await restoreBackup(parsed, (step, total, label) =>
            restoreStep(page, step, total, label)
        );

        page.querySelector("[data-progress-label]").textContent =
            `Restored ${result.restored} record${result.restored === 1 ? "" : "s"}. Reloading…`;
        await animateProgress(page, 100, 300);
        await wait(RESTORE_HOLD_MS);

        hideProgress(page);

        // Modules keep in-memory copies of their data; reload (on OK) so
        // every page reads the freshly restored databases.
        showSuccess(
            page,
            "Restore successful",
            `${plural(result.restored, "record")} restored across ${plural(parsed.modules.length, "module")}. The app will reload to show your data.`,
            () => hardNavigate()
        );
    } catch (error) {
        failed = true;
        console.error("Restore failed", error);
        toast(page, error.message || "Restore failed — see console");
    } finally {
        pending = null;
        restoring = false;

        if (failed) {
            hideProgress(page);
            lockButtons(page, false);
        }
    }
}

/* ---------------- helpers ---------------- */

function toast(page, message) {
    const el = page.querySelector("[data-toast]");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
