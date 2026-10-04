/* =========================================================
   ACCOUNTING — CALCULATIONS
   Ported unchanged from the old manual-accounting.html so
   net worth matches the old app exactly.
   Live values (Mutual Funds, Lending) come from the existing
   dashboard services; nothing is copied or written back.
   ========================================================= */

import { isUSD, usd } from "../../services/currency.js";
import { dataService } from "../../data/data-service.js";
import { loadLogoDataURL } from "../../services/bank-logos.js";
import { iconSvg } from "../../components/icons.js";

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
        { label: "Banks", value: banks, icon: "landmark" },
        { label: "Cash", value: n("cash"), icon: "banknote" },
        { label: "Mutual Funds", value: live.mf, live: true, icon: "chart-pie" },
        { label: "Fixed Deposit", value: n("fd"), icon: "piggy-bank" },
        { label: "Stocks", value: n("stock"), icon: "chart-candlestick" },
        { label: "Demat Account", value: n("demat"), icon: "briefcase-business" },
        { label: "Pending", value: n("pending"), icon: "clock" },
        { label: "Other Assets", value: n("other"), icon: "layers" },
        ...customs.map((c) => ({ label: c.name, value: c.amt, icon: "gem" })),
        {
            label: "Lending Receivable",
            value: live.peopleReceivable,
            live: true,
            icon: "hand-coins"
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

/* Draws an app icon to a PNG data URL (jsPDF cannot draw SVG). */
const iconCache = new Map();

function iconPng(name, color) {
    const key = name + color;

    if (!iconCache.has(key)) {
        iconCache.set(
            key,
            new Promise((resolve) => {
                const img = new Image();

                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");

                        canvas.width = 96;
                        canvas.height = 96;
                        canvas.getContext("2d").drawImage(img, 0, 0, 96, 96);
                        resolve(canvas.toDataURL("image/png"));
                    } catch (e) {
                        resolve(null);
                    }
                };
                img.onerror = () => resolve(null);
                img.src =
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(iconSvg(name, { color, size: 96 }));
            })
        );
    }

    return iconCache.get(key);
}

/*
 * Professional net-worth statement.
 * result : output of calculate()
 * extras : { userName, banks: [{ name, amount, slug }] }  (optional)
 */
export async function exportPDF(result, extras = {}) {
    const JsPDF = await loadJsPDF();

    const banks = (extras.banks || []).filter((b) => b.name || b.amount);

    /* Fetch every bank symbol up front (in parallel); a miss just means no symbol. */
    const symbols = await Promise.all(
        banks.map((b) => loadLogoDataURL(b.slug).catch(() => null))
    );

    /* One small gold icon per asset category. */
    const iconNames = [...new Set(result.rows.map((r) => r.icon).filter(Boolean))];
    const iconImgs = {};

    await Promise.all(
        iconNames.map(async (n) => { iconImgs[n] = await iconPng(n, "#9a7425"); })
    );

    const userName = String(extras.userName || "").trim();

    const now = new Date();
    const dateText = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timeText = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    const doc = new JsPDF({ unit: "mm", format: "a4" });

    const PAGE_W = 210;
    const PAGE_H = 297;
    const L = 15;
    const R = PAGE_W - 15;
    const W = R - L;
    const FOOTER_Y = PAGE_H - 12;

    const INK = [24, 24, 27];
    const MUTED = [113, 113, 122];
    const LINE = [228, 228, 231];
    const SOFT = [248, 248, 249];
    const GOLD = [191, 148, 58];
    const DARK = [17, 17, 19];
    const GREEN = [22, 130, 74];
    const RED = [185, 40, 40];

    const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const stroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);

    const fit = (text, maxW) => {
        let t = String(text);
        if (doc.getTextWidth(t) <= maxW) return t;
        while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
        return t + "...";
    };

    const pct = (v) => (result.assets ? ((Number(v) / result.assets) * 100).toFixed(1) : "0.0") + "%";

    /* ---------- header band (first page) ---------- */
    fill(DARK);
    doc.rect(0, 0, PAGE_W, 38, "F");
    fill(GOLD);
    doc.rect(0, 38, PAGE_W, 1.4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(23);
    doc.setTextColor(255, 255, 255);
    doc.text("BlackRoad Accounting", L, 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text("NET WORTH STATEMENT", L, 27);

    if (userName) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
        doc.text("PREPARED FOR", R, 12.5, { align: "right" });

        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text(fit(userName, 72), R, 19, { align: "right" });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(190, 190, 195);
    doc.text("Generated on " + dateText + ", " + timeText, R, userName ? 26 : 19, { align: "right" });

    let y = 52;

    /* ---------- summary cards ---------- */
    const gap = 5;
    const cw = (W - gap * 2) / 3;
    const cards = [
        { label: "TOTAL ASSETS", value: formatPDF(result.assets), tone: INK },
        { label: "LIABILITIES", value: formatPDF(result.liabilities), tone: RED },
        { label: "NET WORTH", value: formatPDF(result.net), tone: result.net >= 0 ? GREEN : RED, hero: true }
    ];

    cards.forEach((c, i) => {
        const x = L + i * (cw + gap);

        if (c.hero) {
            fill(DARK);
            doc.roundedRect(x, y, cw, 26, 2.5, 2.5, "F");
            fill(GOLD);
            doc.rect(x + 4, y + 4, 1.2, 18, "F");
        } else {
            fill(SOFT);
            stroke(LINE);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, y, cw, 26, 2.5, 2.5, "FD");
        }

        const tx = c.hero ? x + 9 : x + 6;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        if (c.hero) doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]); else color(MUTED);
        doc.text(c.label, tx, y + 9);

        doc.setFontSize(c.hero ? 14 : 13);
        if (c.hero) doc.setTextColor(255, 255, 255); else color(c.tone);
        doc.text(fit(c.value, cw - (c.hero ? 12 : 10)), tx, y + 19);
    });

    y += 26 + 12;

    /* ---------- helpers: page break, section title, footer ---------- */
    const ensure = (needed) => {
        if (y + needed <= FOOTER_Y - 6) return;
        doc.addPage();
        y = 20;
    };

    const section = (title, note) => {
        ensure(24);
        fill(GOLD);
        doc.rect(L, y - 4.2, 1.4, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        color(INK);
        doc.text(title, L + 4, y);

        if (note) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            color(MUTED);
            doc.text(note, R, y, { align: "right" });
        }

        y += 5;
    };

    const tableHead = (cols) => {
        fill(DARK);
        doc.rect(L, y, W, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        cols.forEach(([text, x, align]) => doc.text(text, x, y + 5.3, { align }));
        y += 8;
    };

    /* ---------- banks ---------- */
    if (banks.length) {
        const total = banks.reduce((a, b) => a + (Number(b.amount) || 0), 0);

        section("Bank accounts", banks.length + (banks.length === 1 ? " account" : " accounts"));
        tableHead([
            ["BANK", L + 22, "left"],
            ["BALANCE", R - 34, "right"],
            ["% OF ASSETS", R - 3, "right"]
        ]);

        const rowH = 16;

        banks.forEach((b, i) => {
            ensure(rowH + 2);

            if (i % 2 === 0) {
                fill(SOFT);
                doc.rect(L, y, W, rowH, "F");
            }

            /* symbol tile */
            const tile = 11;
            const tx = L + 5;
            const ty = y + (rowH - tile) / 2;

            fill([255, 255, 255]);
            stroke(LINE);
            doc.setLineWidth(0.3);
            doc.roundedRect(tx, ty, tile, tile, 1.6, 1.6, "FD");

            const sym = symbols[i];

            if (sym) {
                const box = tile - 2.4;
                const ratio = sym.w / sym.h;
                const w = ratio >= 1 ? box : box * ratio;
                const h = ratio >= 1 ? box / ratio : box;

                try {
                    doc.addImage(sym.data, "PNG", tx + (tile - w) / 2, ty + (tile - h) / 2, w, h);
                } catch (e) { /* skip a bad image */ }
            } else {
                const initial = (b.name || "?").trim().charAt(0).toUpperCase();

                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                color(MUTED);
                doc.text(initial, tx + tile / 2, ty + tile / 2 + 1.6, { align: "center" });
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            color(INK);
            doc.text(fit(b.name || "Unnamed bank", 88), L + 22, y + rowH / 2 + 1.4);

            doc.setFont("helvetica", "normal");
            doc.text(formatPDF(b.amount), R - 34, y + rowH / 2 + 1.4, { align: "right" });

            doc.setFontSize(9);
            color(MUTED);
            doc.text(pct(b.amount), R - 3, y + rowH / 2 + 1.4, { align: "right" });

            y += rowH;
        });

        stroke(LINE);
        doc.setLineWidth(0.3);
        doc.line(L, y, R, y);

        ensure(12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        color(INK);
        doc.text("Total in banks", L + 22, y + 7);
        doc.text(formatPDF(total), R - 34, y + 7, { align: "right" });

        y += 18;
    }

    /* ---------- asset breakdown ---------- */
    section("Asset breakdown", "Share of total assets");
    tableHead([
        ["CATEGORY", L + 15, "left"],
        ["AMOUNT", R - 62, "right"],
        ["SHARE", R - 3, "right"]
    ]);

    result.rows.forEach((row, i) => {
        ensure(10);

        if (i % 2 === 0) {
            fill(SOFT);
            doc.rect(L, y, W, 9, "F");
        }

        /* category icon tile */
        fill([250, 243, 226]);
        doc.roundedRect(L + 5, y + 1.3, 6.4, 6.4, 1.4, 1.4, "F");

        if (iconImgs[row.icon]) {
            try {
                doc.addImage(iconImgs[row.icon], "PNG", L + 6.4, y + 2.7, 3.6, 3.6);
            } catch (e) { /* skip a bad icon */ }
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        color(INK);
        doc.text(fit(row.label, 62), L + 15, y + 6);

        if (row.live) {
            const lx = L + 15 + doc.getTextWidth(fit(row.label, 62)) + 2.5;

            fill([228, 244, 235]);
            doc.roundedRect(lx, y + 2.2, 9, 4.4, 1.2, 1.2, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            color(GREEN);
            doc.text("LIVE", lx + 4.5, y + 5.4, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.5);
        }

        color(INK);
        doc.text(formatPDF(row.value), R - 62, y + 6, { align: "right" });

        /* share bar */
        const barX = R - 56;
        const barW = 36;
        const share = result.assets ? Math.max(0, Math.min(1, Number(row.value) / result.assets)) : 0;

        fill(LINE);
        doc.roundedRect(barX, y + 3.2, barW, 2.6, 1.3, 1.3, "F");

        if (share > 0.004) {
            fill(GOLD);
            doc.roundedRect(barX, y + 3.2, Math.max(2.6, barW * share), 2.6, 1.3, 1.3, "F");
        }

        doc.setFontSize(9);
        color(MUTED);
        doc.text(pct(row.value), R - 3, y + 6, { align: "right" });

        y += 9;
    });

    stroke(LINE);
    doc.line(L, y, R, y);
    y += 12;

    /* ---------- totals ---------- */
    ensure(48);

    const line = (label, value, opts = {}) => {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal");
        doc.setFontSize(opts.size || 10.5);
        color(opts.labelColor || MUTED);
        doc.text(label, R - 80, y);
        color(opts.valueColor || INK);
        doc.text(value, R, y, { align: "right" });
        y += opts.gap || 8;
    };

    line("Total assets", formatPDF(result.assets), { bold: true, labelColor: INK });
    line("Loans & liabilities", "- " + formatPDF(result.liabilities), { valueColor: RED, gap: 5 });

    stroke(GOLD);
    doc.setLineWidth(0.6);
    doc.line(R - 80, y, R, y);
    y += 9;

    line("NET WORTH", formatPDF(result.net), {
        bold: true,
        size: 14,
        labelColor: INK,
        valueColor: result.net >= 0 ? GREEN : RED
    });

    /* ---------- footer on every page ---------- */
    const pages = doc.getNumberOfPages();

    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        stroke(LINE);
        doc.setLineWidth(0.3);
        doc.line(L, FOOTER_Y - 4, R, FOOTER_Y - 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        color(MUTED);
        doc.text("BlackRoad Accounting" + (userName ? "  ·  " + userName : "") + "  ·  Confidential, for personal use", L, FOOTER_Y);
        doc.text("Page " + p + " of " + pages, R, FOOTER_Y, { align: "right" });
    }

    if (extras.beforeSave) await extras.beforeSave();   /* progress UI: wait for 100% before downloading */

    doc.save("blackroad-accounting-" + now.toISOString().slice(0, 10) + ".pdf");
}
