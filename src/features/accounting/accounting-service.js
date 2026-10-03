/* =========================================================
   ACCOUNTING — CALCULATIONS
   Ported unchanged from the old manual-accounting.html so
   net worth matches the old app exactly.
   Live values (Mutual Funds, Lending) come from the existing
   dashboard services; nothing is copied or written back.
   ========================================================= */

import { isUSD, usd } from "../../services/currency.js";
import { dataService } from "../../data/data-service.js";

import {
    getMutualFundSummary,
    getLendingSummary
} from "../dashboard/dashboard-service.js";

export { formatINR } from "../dashboard/dashboard-service.js";

export const EMPTY_MANUAL = {
    banks: [0],
    customs: [],
    cash: 0,
    fd: 0,
    stock: 0,
    demat: 0,
    pending: 0,
    other: 0
};

export async function loadManual() {
    const store = await dataService.getAccountingStore();
    return await store.getAccountingData();
}

export async function saveManual(manual) {
    const store = await dataService.getAccountingStore();

    await store.saveAccountingData({
        ...manual,
        updatedAt: new Date().toISOString()
    });
}

export async function loadLive() {
    let mf = 0;
    let lending = { peopleReceivable: 0, liabilities: 0 };

    try {
        mf = (await getMutualFundSummary()).currentValue || 0;
    } catch (error) {
        console.error("Accounting: could not read StepUp", error);
    }

    try {
        lending = await getLendingSummary();
    } catch (error) {
        console.error("Accounting: could not read Lending", error);
    }

    return {
        mf,
        peopleReceivable: Number(lending.peopleReceivable) || 0,
        liabilities: Number(lending.liabilities) || 0
    };
}

/*
 * Same rules as the old calculate():
 * assets = banks + cash + fd + stock + demat + pending + other
 *        + custom rows + live MF + lending receivable
 * net    = assets - liabilities
 */
export function calculate(manual, live) {
    const banks = (manual.banks || []).reduce(
        (a, b) => a + (Number(b) || 0),
        0
    );

    const customs = (manual.customs || []).map((c) => ({
        name: c.name || "Additional",
        amt: Number(c.amt) || 0
    }));

    const customTotal = customs.reduce((a, c) => a + c.amt, 0);

    const n = (key) => Number(manual[key]) || 0;

    const assets =
        banks +
        n("cash") +
        n("fd") +
        n("stock") +
        n("demat") +
        n("pending") +
        n("other") +
        customTotal +
        live.mf +
        live.peopleReceivable;

    const rows = [
        { label: "Banks", value: banks },
        { label: "Cash", value: n("cash") },
        { label: "Mutual Funds", value: live.mf, live: true },
        { label: "Fixed Deposit", value: n("fd") },
        { label: "Stocks", value: n("stock") },
        { label: "Demat Account", value: n("demat") },
        { label: "Pending", value: n("pending") },
        { label: "Other Assets", value: n("other") },
        ...customs.map((c) => ({ label: c.name, value: c.amt })),
        {
            label: "Lending Receivable",
            value: live.peopleReceivable,
            live: true
        }
    ];

    return {
        rows,
        assets,
        liabilities: live.liabilities,
        net: assets - live.liabilities
    };
}

export function percent(value, total) {
    return total ? ((value / total) * 100).toFixed(1) : "0.0";
}

/* ---------------- PDF (jsPDF, loaded on demand) ---------------- */

const JSPDF_LOCAL = new URL(
    "../../../assets/vendor/jspdf.umd.min.js",
    import.meta.url
).href;

const JSPDF_CDN =
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error("Failed to load " + src));
        };

        document.head.appendChild(script);
    });
}

/* Prefers the bundled copy (works offline); falls back to the CDN. */
async function loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;

    for (const src of [JSPDF_LOCAL, JSPDF_CDN]) {
        try {
            await loadScript(src);

            if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
        } catch { /* try next source */ }
    }

    throw new Error("jsPDF failed to load");
}

function formatPDF(value) {
    const n = Number(value) || 0;
    if (isUSD()) return usd(n, { whole: true });
    const sign = n < 0 ? "-" : "";

    return sign + "Rs. " + Math.abs(Math.round(n)).toLocaleString("en-IN");
}

export async function exportPDF(result) {
    const JsPDF = await loadJsPDF();

    const now = new Date();

    const stamp =
        now.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }) +
        "  ·  " +
        now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit"
        });

    const doc = new JsPDF();
    const left = 14;
    const right = 196;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text("BlackRoad — Manual Accounting", left, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("Downloaded on " + stamp, left, y);

    y += 6;
    doc.setDrawColor(210);
    doc.line(left, y, right, y);
    y += 10;

    doc.setFontSize(11);

    result.rows.forEach((row) => {
        doc.setTextColor(90);
        doc.text(String(row.label), left, y);
        doc.setTextColor(20);
        doc.text(formatPDF(row.value), right, y, { align: "right" });
        y += 8;
    });

    doc.setDrawColor(210);
    doc.line(left, y, right, y);
    y += 9;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text("Total Assets", left, y);
    doc.text(formatPDF(result.assets), right, y, { align: "right" });

    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text("Loans & Liabilities", left, y);
    doc.text("- " + formatPDF(result.liabilities), right, y, {
        align: "right"
    });

    y += 5;
    doc.setDrawColor(160);
    doc.line(left, y, right, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text("Net Worth", left, y);
    doc.text(formatPDF(result.net), right, y, { align: "right" });

    doc.save(
        "blackroad-accounting-" + now.toISOString().slice(0, 10) + ".pdf"
    );
}
