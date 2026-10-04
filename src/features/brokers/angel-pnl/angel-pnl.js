/* =========================================================
   ANGEL ONE - PROFIT & LOSS READER
   Mounted by brokers.js when Angel One -> Profit & Loss is
   opened. Upload the Equity P&L Excel file(s) from Angel One
   (one per financial year), read them as a BlackRoad report
   and download the PDF.

   Files are read in the browser only; nothing is uploaded
   and nothing is stored.
   ========================================================= */

import { icon } from "../../../components/icons.js";
import { startReportProgress } from "../../../components/report-progress.js";
import { loadXlsx } from "./angel-libs.js";
import { readAngelWorkbook, esc } from "./angel-parser.js";
import { renderAngelReport, angelYearChips } from "./angel-render.js";

const readBuffer = (file) =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        r.readAsArrayBuffer(file);
    });

export function AngelPnl() {
    const root = document.createElement("div");
    root.className = "ap-root";

    const state = { years: [], busy: false, error: "" };

    function html() {
        const loaded = state.years.length > 0;
        const n = state.years.length;

        return `
            <div class="ap-toolbar">
                <div>
                    <h3>Equity Profit &amp; Loss</h3>
                    <p class="br-muted">${
                        loaded
                            ? `${n} financial year${n > 1 ? "s" : ""} loaded`
                            : "Upload your Angel One P&amp;L file to see the report."
                    }</p>
                </div>
                ${
                    loaded
                        ? `<div class="ap-actions">
                            <button type="button" class="br-button" data-ap="reset">${icon("refresh-cw", { size: 16 })} Start over</button>
                            <button type="button" class="br-button br-button-primary" data-ap="pdf" ${state.busy ? "disabled" : ""}>${icon("download", { size: 16 })} <span data-ap-label>Download PDF</span></button>
                        </div>`
                        : ""
                }
            </div>

            ${state.error ? `<div class="ap-error" role="alert">${esc(state.error)}</div>` : ""}

            <section class="br-card ap-drop ${loaded ? "is-compact" : ""}" data-ap-drop>
                <span class="ap-drop-icon">${icon("upload", { size: 24 })}</span>
                <h3>${loaded ? "Add another year" : "Upload Angel One P&amp;L file(s)"}</h3>
                <p class="br-muted">Drop the broker P&amp;L export (.xlsx). Only the <b>Equity P&amp;L</b> sheet is read — any F&amp;O sheet in the same file is ignored. Add one file per financial year to get a combined summary.</p>
                <button type="button" class="br-button br-button-primary" data-ap="pick" ${state.busy ? "disabled" : ""}>${state.busy ? "Reading…" : "Choose Excel file(s)"}</button>
                <input type="file" data-ap-file multiple hidden
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel">
            </section>

            ${loaded ? `<div class="ap-chips">${angelYearChips(state.years)}</div>` : ""}
            ${loaded ? `<div class="ap-report">${renderAngelReport(state.years)}</div>` : ""}
        `;
    }

    function render() {
        const y = window.scrollY;
        root.innerHTML = html();
        window.scrollTo(0, y);
        wire();
    }

    function wire() {
        const input = root.querySelector("[data-ap-file]");

        root.querySelector('[data-ap="pick"]')?.addEventListener("click", () => input.click());

        input.addEventListener("change", () => {
            handleFiles([...input.files]);
            input.value = "";
        });

        const drop = root.querySelector("[data-ap-drop]");
        ["dragover", "dragenter"].forEach((t) =>
            drop.addEventListener(t, (e) => {
                e.preventDefault();
                drop.classList.add("is-drag");
            })
        );
        ["dragleave", "drop"].forEach((t) =>
            drop.addEventListener(t, (e) => {
                e.preventDefault();
                drop.classList.remove("is-drag");
            })
        );
        drop.addEventListener("drop", (e) => handleFiles([...e.dataTransfer.files]));

        root.querySelector('[data-ap="reset"]')?.addEventListener("click", () => {
            state.years = [];
            state.error = "";
            render();
        });

        root.querySelector('[data-ap="pdf"]')?.addEventListener("click", downloadPdf);

        root.querySelectorAll("[data-remove]").forEach((b) =>
            b.addEventListener("click", () => {
                state.years.splice(Number(b.dataset.remove), 1);
                state.error = "";
                render();
            })
        );
    }

    async function handleFiles(files) {
        if (!files.length || state.busy) return;

        state.busy = true;
        state.error = "";
        render();

        const errors = [];

        try {
            const XLSX = await loadXlsx();

            for (const file of files) {
                try {
                    const buffer = await readBuffer(file);
                    state.years.push(readAngelWorkbook(XLSX, buffer, file.name, state.years.length + 1));
                } catch (err) {
                    errors.push(err.message || `Couldn't read ${file.name} as an Angel One P&L export.`);
                }
            }
        } catch (err) {
            errors.push(err.message);
        }

        state.busy = false;
        state.error = errors.join(" ");
        render();
    }

    async function downloadPdf() {
        const btn = root.querySelector('[data-ap="pdf"]');
        const label = root.querySelector("[data-ap-label]");
        if (!btn || !state.years.length) return;

        btn.disabled = true;
        label.textContent = "Generating PDF…";
        state.error = "";

        const progress = startReportProgress({
            title: "Creating your P&L report",
            steps: ["Reading your P&L data", "Verifying totals & charges", "Designing report pages", "Finalizing PDF"],
            doneTitle: "PDF downloaded",
            doneText: "Your Equity P&L report has been saved."
        });

        try {
            const { downloadAngelPdf } = await import("./angel-pdf.js");
            await downloadAngelPdf(state.years, { beforeSave: () => progress.ready() });
            progress.complete();
        } catch (err) {
            console.error("Angel One PDF failed:", err);
            progress.fail(err.message || String(err));
            state.error = "Could not generate the PDF: " + (err.message || err);
            render();
            return;
        }

        btn.disabled = false;
        label.textContent = "Download PDF";
    }

    render();
    return root;
}
