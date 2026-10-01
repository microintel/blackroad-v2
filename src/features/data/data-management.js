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
            <p class="br-muted" data-progress-label></p>
            <progress max="100" value="0" data-progress-bar></progress>
        </div>

        <section class="br-card" style="margin-top:20px;">
            <div class="br-card-heading"><h3>Stored on this device</h3></div>
            <div class="br-table-wrap"><table class="br-table">
                <thead><tr><th>Module</th><th>Database</th><th>Records</th></tr></thead>
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

        <div class="br-toast" data-toast></div>
    `;

    bindEvents(page);
    showLastBackup(page);
    loadOverview(page);

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
                <td class="br-muted">${escapeHTML(r.database)}</td>
                <td>${r.error ? `<span class="br-badge br-badge-danger">error</span>` : r.records}</td>
            </tr>`
        )
        .join("");
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
    page.querySelector("[data-progress-bar]").value = total
        ? Math.round((step / total) * 100)
        : 0;

    // let the bar repaint between steps
    return new Promise((resolve) => setTimeout(resolve, 60));
}

function hideProgress(page) {
    page.querySelector("[data-progress]").hidden = true;
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

            case "cancel":
                closePreview(page);
                break;

            case "confirm":
                await doRestore(page);
                break;
        }
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
    try {
        const payload = await exportAll((step, total, label) =>
            setProgress(page, step, total, `Exporting ${label}…`)
        );

        downloadBackup(payload);
        showLastBackup(page);
        toast(page, "Backup downloaded");
    } catch (error) {
        console.error("Export failed", error);
        toast(page, "Export failed — see console");
    } finally {
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
    if (!pending) return;

    const parsed = pending;

    page.querySelector("[data-modal]").hidden = true;

    try {
        const result = await restoreBackup(parsed, (step, total, label) =>
            setProgress(page, step, total, label)
        );

        toast(
            page,
            `Restored ${result.restored} record${result.restored === 1 ? "" : "s"}. Reloading…`
        );

        // Modules keep in-memory copies of their data; reload so every
        // page reads the freshly restored databases.
        setTimeout(() => hardNavigate(), 900);
    } catch (error) {
        console.error("Restore failed", error);
        toast(page, error.message || "Restore failed — see console");
    } finally {
        pending = null;
        hideProgress(page);
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
