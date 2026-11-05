import { fmtMoney, fmtSigned, fmtPct, fmtDate } from "./stocks-service.js";
import { startReportProgress } from "../../components/report-progress.js";
import { stockLogoUrl } from "./stocks-live.js";
import { brandLogoPNG, BRAND_LOGO_SRC } from "../../services/brand.js";
import { openPrint, waitForLogos } from "./stocks-print.js";

/* Print / Save-as-PDF summary of the Dream stocks wishlist.
   Same page, styles and print flow as the Stocks equity report
   (#br-print-report), so it looks like the Reports tab output.
   `rows` = [{ d, c }] where d is the wishlist entry and c the
   calculated values (qty, ltp, value, gain, pct). */

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtQty = (q) => String(Math.round(q * 100) / 100);

export async function printDreamReport(rows) {
    const progress = startReportProgress({
        title: "Preparing your dream stocks report",
        steps: ["Gathering wishlist", "Computing growth", "Preparing print layout", "Opening print dialog"],
        doneTitle: "Report ready",
        doneText: "Opening the print dialog…"
    });
    try {
        const logo = await brandLogoPNG({ size: 160, tile: true });
        buildReport(rows, logo ? logo.dataUrl : BRAND_LOGO_SRC);
        await Promise.all([progress.ready(), waitForLogos()]);
    } catch (err) {
        console.error("Dream report failed:", err);
        progress.fail(err.message || String(err));
        return;
    }
    progress.complete("Opening the print dialog…", { autoClose: 700 });
    setTimeout(openPrint, 800);
}

function buildReport(rows, logoSrc) {
    const generated = new Date().toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const cls = (n) => (n >= 0 ? "pr-pos" : "pr-neg");

    const priced = rows.filter((r) => r.c.ltp != null);
    const invested = priced.reduce((s, r) => s + r.d.amount, 0);
    const value = priced.reduce((s, r) => s + r.c.value, 0);
    const gain = value - invested;
    const pct = invested > 0 ? (gain / invested) * 100 : 0;
    const sorted = priced.slice().sort((a, b) => b.c.pct - a.c.pct);
    const best = sorted[0];
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

    const body = rows
        .slice()
        .sort((a, b) => (b.c.ltp != null ? b.c.pct : -Infinity) - (a.c.ltp != null ? a.c.pct : -Infinity))
        .map(({ d, c }) => {
            const has = c.ltp != null;
            return `<tr>
                <td><span class="pr-stock"><span class="pr-logo" data-initials="${esc(d.symbol.slice(0, 2).toUpperCase())}"><img src="${esc(stockLogoUrl(d.symbol))}" alt="" data-pr-logo></span><span>${esc(d.name)} (${esc(d.symbol)})</span></span></td>
                <td>${fmtDate(d.date)}</td>
                <td class="num">${fmtMoney(d.seenPrice)}</td>
                <td class="num">${has ? fmtMoney(c.ltp) : "—"}</td>
                <td class="num">${fmtMoney(d.amount, true)}</td>
                <td class="num">${fmtQty(c.qty)}</td>
                <td class="num">${has ? fmtMoney(c.value, true) : "—"}</td>
                <td class="num ${has ? cls(c.gain) : ""}">${has ? `${fmtSigned(c.gain, true)}<div style="font-size:9.5px;">${fmtPct(c.pct)}</div>` : "—"}</td>
            </tr>`;
        })
        .join("");

    let host = document.getElementById("br-print-report");
    if (!host) {
        host = document.createElement("div");
        host.id = "br-print-report";
        document.body.appendChild(host);
    }

    host.innerHTML = `
        <div class="pr-header">
            <img class="pr-logo-mark" src="${esc(logoSrc)}" alt="BlackRoad" data-pr-logo>
            <div class="pr-header-text">
                <div class="pr-brand">BlackRoad's Dream Stocks Report</div>
                <div class="pr-title">Wishlist summary</div>
                <div class="pr-sub">Generated ${generated}</div>
            </div>
        </div>
        <div class="pr-grid">
            <div><span>Stocks on wishlist</span><b>${rows.length}</b></div>
            <div><span>If bought</span><b>${priced.length ? fmtMoney(invested, true) : "—"}</b></div>
            <div><span>Value now</span><b>${priced.length ? fmtMoney(value, true) : "—"}</b></div>
            <div><span>Growth</span><b class="${cls(gain)}">${priced.length ? fmtSigned(gain, true) : "—"}</b></div>
            <div><span>Growth %</span><b class="${cls(gain)}">${priced.length ? fmtPct(pct) : "—"}</b></div>
            <div><span>Best · Weakest</span><b style="font-size:12.5px;">${best ? `${esc(best.d.symbol)} ${fmtPct(best.c.pct)}` : "—"}${worst ? `<br>${esc(worst.d.symbol)} ${fmtPct(worst.c.pct)}` : ""}</b></div>
        </div>
        <div class="pr-section">Dream stocks</div>
        <table class="pr-table">
            <thead><tr><th>Stock</th><th>Date seen</th><th>Saw at</th><th>Now</th><th>Amount</th><th>Shares</th><th>Worth now</th><th>Growth</th></tr></thead>
            <tbody>${body}</tbody>
        </table>
        <div class="pr-footer"><span>Hypothetical figures. Not part of your holdings or net worth. Informational only, not investment advice.</span><span>BlackRoad</span></div>`;
}
