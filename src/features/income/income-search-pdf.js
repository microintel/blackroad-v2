/*
 * Income -> Search -> PDF export.
 *
 * Lays the search results out the way an accountant would:
 *   - letterhead with a double rule and period
 *   - "Statement of Account" ledger: Date | Particulars | Type |
 *     Debit | Credit | running Balance, oldest entry first
 *   - opening balance, column totals (single rule above, double rule
 *     below) and closing balance, with the amount in words
 *   - summary by account head (category)
 *   - "Page X of Y" on every page
 *
 * Money in = Credit (income, investment sales).
 * Money out = Debit (expenses, investment purchases).
 * jsPDF loads on demand, same as the Accounting PDF.
 */
import { isUSD, usd } from "../../services/currency.js";

const JSPDF_LOCAL = new URL("../../../assets/vendor/jspdf.umd.min.js", import.meta.url).href;
const JSPDF_CDN = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");

        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { s.remove(); reject(new Error("Failed to load " + src)); };
        document.head.appendChild(s);
    });
}

async function loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;

    for (const src of [JSPDF_LOCAL, JSPDF_CDN]) {
        try {
            await loadScript(src);
            if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
        } catch { /* try next */ }
    }

    throw new Error("jsPDF failed to load");
}

/* ---------------- formatting ---------------- */

const num = (n) =>
    isUSD()
        ? usd(Math.abs(n), { sign: false })
        : Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dash = "-";

function dateText(iso) {
    const d = new Date(String(iso) + "T00:00:00");

    return isNaN(d)
        ? String(iso || "")
        : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n) {
    let out = "";

    if (n >= 100) { out += ONES[Math.floor(n / 100)] + " Hundred "; n %= 100; }
    if (n >= 20) { out += TENS[Math.floor(n / 10)] + " "; n %= 10; }
    if (n > 0) out += ONES[n] + " ";

    return out;
}

/* Indian numbering: crore, lakh, thousand */
function rupeesInWords(value) {
    const total = Math.round(Math.abs(value) * 100);
    let rupees = Math.floor(total / 100);
    const paise = total % 100;

    if (rupees === 0 && paise === 0) return "Rupees Zero Only";

    let words = "";
    const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
    const lakh = Math.floor(rupees / 100000); rupees %= 100000;
    const thousand = Math.floor(rupees / 1000); rupees %= 1000;

    if (crore) words += below1000(crore) + "Crore ";
    if (lakh) words += below1000(lakh) + "Lakh ";
    if (thousand) words += below1000(thousand) + "Thousand ";
    if (rupees) words += below1000(rupees);

    words = words.trim();

    let text = "Rupees " + (words || "Zero");

    if (paise) text += " and " + below1000(paise).trim() + " Paise";

    return text + " Only";
}

/* ---------------- main ---------------- */

const KIND_LABEL = {
    income: "Income",
    "investment-sale": "Inv. Sale",
    expense: "Expense",
    investment: "Investment"
};

const isCredit = (k) => k === "income" || k === "investment-sale";

export function describeFilters(f) {
    const parts = [];
    const list = (set) => [...set].join(", ");

    if (f.term && f.term.trim()) parts.push(`Search: "${f.term.trim()}"`);
    if (f.type && f.type !== "all") parts.push("Type: " + f.type[0].toUpperCase() + f.type.slice(1));
    if (f.sources && f.sources.size) parts.push("Source: " + list(f.sources));
    if (f.expenseCategories && f.expenseCategories.size) parts.push("Expense head: " + list(f.expenseCategories));
    if (f.incomeCategories && f.incomeCategories.size) parts.push("Income head: " + list(f.incomeCategories));

    return parts;
}

export async function exportSearchPDF(items, filters = {}, { userName = "", beforeSave } = {}) {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: "mm", format: "a4" });

    const PAGE_W = 210;
    const PAGE_H = 297;
    const L = 14;
    const R = PAGE_W - 14;
    const W = R - L;
    const BOTTOM = PAGE_H - 20;

    const INK = [22, 22, 26];
    const MUTED = [108, 108, 116];
    const LINE = [196, 196, 202];
    const SHADE = [244, 244, 246];
    const HEAD = [228, 228, 232];
    const DR = [150, 34, 34];
    const CR = [20, 104, 62];
    const GOLD = [154, 116, 37];

    const ink = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const fillc = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
    const font = (style = "normal", size = 9) => { doc.setFont("helvetica", style); doc.setFontSize(size); };

    const fit = (text, maxW) => {
        let t = String(text ?? "");

        if (doc.getTextWidth(t) <= maxW) return t;
        while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);

        return t + "...";
    };

    const unit = isUSD() ? "USD" : "Rs.";
    const now = new Date();

    /* chronological, oldest first; ties keep the on-screen order */
    const rows = items
        .map((it, i) => ({ ...it, _i: i }))
        .sort((a, b) => {
            const da = new Date(a.date || 0) - new Date(b.date || 0);

            return da || a._i - b._i;
        });

    let totalDr = 0;
    let totalCr = 0;
    const heads = new Map();

    rows.forEach((r) => {
        const credit = isCredit(r.kind);

        if (credit) totalCr += r.amount; else totalDr += r.amount;

        const key = (r.category || "Uncategorised") + "|" + (credit ? "c" : "d");
        const h = heads.get(key) || { name: r.category || "Uncategorised", dr: 0, cr: 0, n: 0 };

        if (credit) h.cr += r.amount; else h.dr += r.amount;
        h.n += 1;
        heads.set(key, h);
    });

    const closing = totalCr - totalDr;

    const dates = rows.map((r) => r.date).filter(Boolean);
    const first = filters.from || dates[0] || "";
    const last = filters.to || dates[dates.length - 1] || "";
    const period = first || last
        ? `${first ? dateText(first) : "Beginning"}  to  ${last ? dateText(last) : "Date"}`
        : "All dates";

    /* ---------- letterhead ---------- */
    function letterhead() {
        font("bold", 17);
        ink(INK);
        doc.text("BLACKROAD", L, 18);

        font("normal", 8.5);
        ink(MUTED);
        doc.text("Personal Finance Ledger", L, 23);

        font("bold", 13);
        ink(INK);
        doc.text("STATEMENT OF ACCOUNT", R, 17, { align: "right" });

        font("normal", 8.5);
        ink(MUTED);
        doc.text("Search results report", R, 22.5, { align: "right" });

        draw(INK);
        doc.setLineWidth(0.9);
        doc.line(L, 28, R, 28);
        doc.setLineWidth(0.25);
        doc.line(L, 29.6, R, 29.6);
    }

    function contHeader() {
        font("bold", 9);
        ink(INK);
        doc.text("BLACKROAD  -  Statement of Account (continued)", L, 14);
        font("normal", 8);
        ink(MUTED);
        draw(INK);
        doc.setLineWidth(0.5);
        doc.line(L, 17, R, 17);
    }

    /* ---------- column layout ---------- */
    const COL = { sr: 10, date: 23, part: 60, type: 20, dr: 22, cr: 22, bal: 25 };
    const X = {};
    let cursor = L;

    ["sr", "date", "part", "type", "dr", "cr", "bal"].forEach((k) => { X[k] = cursor; cursor += COL[k]; });

    const right = (k) => X[k] + COL[k] - 2;

    function tableHead(y) {
        fillc(HEAD);
        doc.rect(L, y, W, 8, "F");
        draw(INK);
        doc.setLineWidth(0.4);
        doc.line(L, y, R, y);
        doc.line(L, y + 8, R, y + 8);

        font("bold", 7.8);
        ink(INK);
        doc.text("SR", X.sr + 2, y + 5.3);
        doc.text("DATE", X.date + 1, y + 5.3);
        doc.text("PARTICULARS", X.part + 1, y + 5.3);
        doc.text("TYPE", X.type + 1, y + 5.3);
        doc.text(`DEBIT (${unit})`, right("dr"), y + 5.3, { align: "right" });
        doc.text(`CREDIT (${unit})`, right("cr"), y + 5.3, { align: "right" });
        doc.text("BALANCE", right("bal"), y + 5.3, { align: "right" });

        return y + 8;
    }

    function balanceText(v) {
        if (Math.abs(v) < 0.005) return num(0);

        return (v < 0 ? "-" : "") + num(v);
    }

    /* ================= PAGE 1 ================= */
    letterhead();

    /* meta block */
    let y = 36;
    const half = W / 2;

    const meta = (x, label, value, yy) => {
        font("bold", 7.5);
        ink(MUTED);
        doc.text(label, x, yy);
        font("normal", 9.5);
        ink(INK);
        doc.text(fit(value, half - 36), x + 30, yy);
    };

    meta(L, "ACCOUNT HOLDER", userName || "-", y);
    meta(L, "PERIOD", period, y + 6);
    meta(L, "ENTRIES", String(rows.length), y + 12);
    meta(L + half + 6, "GENERATED ON", now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " +
        now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), y);
    meta(L + half + 6, "CURRENCY", isUSD() ? "US Dollar (USD)" : "Indian Rupee (INR)", y + 6);

    y += 18;

    /* filters line */
    const fparts = describeFilters(filters);
    const ftext = fparts.length ? fparts.join("   |   ") : "None (all transactions)";

    font("bold", 7.5);
    ink(MUTED);
    doc.text("FILTERS APPLIED", L, y);
    font("normal", 8.5);
    ink(INK);

    const flines = doc.splitTextToSize(ftext, W - 32);

    doc.text(flines, L + 30, y);
    y += Math.max(1, flines.length) * 4 + 3;

    /* summary of account */
    draw(LINE);
    doc.setLineWidth(0.25);
    doc.line(L, y, R, y);
    y += 6;

    font("bold", 9);
    ink(INK);
    doc.text("SUMMARY OF ACCOUNT", L, y);
    y += 4;

    let incomeT = 0, saleT = 0, expenseT = 0, investT = 0;

    rows.forEach((r) => {
        if (r.kind === "income") incomeT += r.amount;
        else if (r.kind === "investment-sale") saleT += r.amount;
        else if (r.kind === "investment") investT += r.amount;
        else expenseT += r.amount;
    });

    const sumRows = [
        ["Income received", incomeT, "cr"],
        ["Investment sales", saleT, "cr"],
        ["Expenses paid", expenseT, "dr"],
        ["Investments made", investT, "dr"]
    ].filter((r) => r[1] > 0);

    const sx = L + 4;

    sumRows.forEach(([label, value, side], i) => {
        if (i % 2 === 0) { fillc(SHADE); doc.rect(L, y, W, 6.5, "F"); }
        font("normal", 9);
        ink(INK);
        doc.text(label, sx, y + 4.5);
        font("normal", 9);
        doc.text(side === "cr" ? "Credit" : "Debit", L + 78, y + 4.5);
        ink(side === "cr" ? CR : DR);
        doc.text(num(value), R - 2, y + 4.5, { align: "right" });
        y += 6.5;
    });

    /* net line, double underlined */
    draw(INK);
    doc.setLineWidth(0.4);
    doc.line(L, y + 1, R, y + 1);
    font("bold", 10);
    ink(INK);
    doc.text("NET MOVEMENT (Credits - Debits)", sx, y + 6.5);
    ink(closing >= 0 ? CR : DR);
    doc.text(balanceText(closing), R - 2, y + 6.5, { align: "right" });
    doc.setLineWidth(0.25);
    draw(INK);
    doc.line(L, y + 9, R, y + 9);
    doc.line(L, y + 10.1, R, y + 10.1);
    y += 17;

    /* ================= SUMMARY BY ACCOUNT HEAD ================= */
    const headRows = [...heads.values()].sort((a, b) => (b.dr + b.cr) - (a.dr + a.cr));

    if (headRows.length) {
        if (y + 26 > BOTTOM) { doc.addPage(); contHeader(); y = 21; }

        font("bold", 9);
        ink(INK);
        doc.text("SUMMARY BY ACCOUNT HEAD", L, y + 2);
        y += 5;

        const hx = { name: L + 2, n: L + 96, dr: L + 136, cr: R - 2 };

        const headLine = (yy) => {
            fillc(HEAD);
            doc.rect(L, yy, W, 7, "F");
            draw(INK);
            doc.setLineWidth(0.4);
            doc.line(L, yy, R, yy);
            doc.line(L, yy + 7, R, yy + 7);
            font("bold", 7.8);
            ink(INK);
            doc.text("ACCOUNT HEAD", hx.name, yy + 4.8);
            doc.text("ENTRIES", hx.n, yy + 4.8, { align: "right" });
            doc.text(`DEBIT (${unit})`, hx.dr, yy + 4.8, { align: "right" });
            doc.text(`CREDIT (${unit})`, hx.cr, yy + 4.8, { align: "right" });

            return yy + 7;
        };

        y = headLine(y);

        headRows.forEach((h, i) => {
            if (y + 7 > BOTTOM) {
                doc.addPage();
                contHeader();
                y = headLine(21);
            }

            if (i % 2 === 1) { fillc(SHADE); doc.rect(L, y, W, 7, "F"); }

            font("normal", 8.8);
            ink(INK);
            doc.text(fit(h.name, 86), hx.name, y + 4.8);
            ink(MUTED);
            doc.text(String(h.n), hx.n, y + 4.8, { align: "right" });
            ink(DR);
            doc.text(h.dr ? num(h.dr) : dash, hx.dr, y + 4.8, { align: "right" });
            ink(CR);
            doc.text(h.cr ? num(h.cr) : dash, hx.cr, y + 4.8, { align: "right" });

            draw(LINE);
            doc.setLineWidth(0.15);
            doc.line(L, y + 7, R, y + 7);
            y += 7;
        });

        draw(INK);
        doc.setLineWidth(0.5);
        doc.line(L, y + 0.6, R, y + 0.6);
        font("bold", 9);
        ink(INK);
        doc.text("TOTAL", hx.name, y + 6);
        doc.text(String(rows.length), hx.n, y + 6, { align: "right" });
        ink(DR);
        doc.text(num(totalDr), hx.dr, y + 6, { align: "right" });
        ink(CR);
        doc.text(num(totalCr), hx.cr, y + 6, { align: "right" });
        doc.setLineWidth(0.3);
        draw(INK);
        doc.line(L + 100, y + 8.4, R, y + 8.4);
        doc.line(L + 100, y + 9.5, R, y + 9.5);
        y += 12;
    }


    /* ================= LEDGER ================= */
    if (y + 30 > BOTTOM) { doc.addPage(); contHeader(); y = 21; }

    font("bold", 9);
    ink(INK);
    doc.text("LEDGER", L, y);
    y += 3;

    y = tableHead(y);

    const ROW_H = 9.4;

    function newPage() {
        doc.addPage();
        contHeader();
        y = tableHead(21);
    }

    function ensure(h) {
        if (y + h > BOTTOM) newPage();
    }

    /* opening balance */
    font("bold", 8.6);
    ink(INK);
    doc.text("Opening balance", X.part + 1, y + 5.4);
    font("normal", 8.6);
    doc.text(num(0), right("bal"), y + 5.4, { align: "right" });
    draw(LINE);
    doc.setLineWidth(0.2);
    doc.line(L, y + 7.6, R, y + 7.6);
    y += 7.6;

    let running = 0;

    rows.forEach((r, i) => {
        ensure(ROW_H);

        const credit = isCredit(r.kind);

        running += credit ? r.amount : -r.amount;

        if (i % 2 === 1) { fillc(SHADE); doc.rect(L, y, W, ROW_H, "F"); }

        font("normal", 8);
        ink(MUTED);
        doc.text(String(i + 1), X.sr + 2, y + 5.6);

        font("normal", 8.4);
        ink(INK);
        doc.text(dateText(r.date), X.date + 1, y + 5.6);

        font("normal", 8.8);
        ink(INK);
        doc.text(fit(r.desc || "-", COL.part - 3), X.part + 1, y + (r.category ? 4.2 : 5.6));

        if (r.category) {
            font("normal", 7);
            ink(MUTED);
            doc.text(fit(r.category, COL.part - 3), X.part + 1, y + 7.6);
        }

        font("normal", 7.6);
        ink(MUTED);
        doc.text(KIND_LABEL[r.kind] || "", X.type + 1, y + 5.6);

        font("normal", 8.6);
        ink(DR);
        doc.text(credit ? dash : num(r.amount), right("dr"), y + 5.6, { align: "right" });
        ink(CR);
        doc.text(credit ? num(r.amount) : dash, right("cr"), y + 5.6, { align: "right" });

        ink(running >= 0 ? INK : DR);
        font("normal", 8.4);
        doc.text(balanceText(running), right("bal"), y + 5.6, { align: "right" });

        draw(LINE);
        doc.setLineWidth(0.15);
        doc.line(L, y + ROW_H, R, y + ROW_H);
        y += ROW_H;
    });

    /* totals: single rule above, double rule below */
    ensure(30);

    draw(INK);
    doc.setLineWidth(0.5);
    doc.line(L, y + 0.6, R, y + 0.6);

    font("bold", 9);
    ink(INK);
    doc.text("TOTAL", X.part + 1, y + 6);
    ink(DR);
    doc.text(num(totalDr), right("dr"), y + 6, { align: "right" });
    ink(CR);
    doc.text(num(totalCr), right("cr"), y + 6, { align: "right" });

    doc.setLineWidth(0.3);
    draw(INK);
    doc.line(X.dr, y + 8.4, R - 25, y + 8.4);
    doc.line(X.dr, y + 9.5, R - 25, y + 9.5);
    y += 13;

    font("bold", 9.5);
    ink(INK);
    doc.text("CLOSING BALANCE", X.part + 1, y + 3);
    ink(closing >= 0 ? CR : DR);
    doc.text(balanceText(closing), R - 2, y + 3, { align: "right" });
    y += 9;

    if (!isUSD()) {
        font("bold", 7.5);
        ink(MUTED);
        doc.text("AMOUNT IN WORDS", L, y);
        font("italic", 9);
        ink(INK);

        const words = doc.splitTextToSize(
            rupeesInWords(closing),
            W - 34
        );

        doc.text(words, L + 32, y);
        y += words.length * 4.4 + 4;
    } else {
        y += 3;
    }

    /* ---------- footer on every page ---------- */
    const pages = doc.getNumberOfPages();

    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        draw(LINE);
        doc.setLineWidth(0.25);
        doc.line(L, PAGE_H - 13, R, PAGE_H - 13);
        font("normal", 7.5);
        ink(MUTED);
        doc.text("BlackRoad  |  Statement of Account", L, PAGE_H - 8.5);
        doc.text(`Page ${p} of ${pages}`, R, PAGE_H - 8.5, { align: "right" });

        if (p === 1) {
            fillc(GOLD);
            doc.rect(L, 30.8, 24, 0.9, "F");
        }
    }

    if (beforeSave) await beforeSave();

    doc.save("blackroad-statement-of-account-" + now.toISOString().slice(0, 10) + ".pdf");
}
