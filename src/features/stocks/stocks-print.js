import {
    getTxnPnLMap, mtfSplit, calculateMonthlySummary, calculateAllTimeSummary,
    fmtMoney, fmtSigned, pnlClass, fmtDate
} from "./stocks-service.js";

/* Print / Save-as-PDF report (same approach as the old app):
   build a hidden #br-print-report, hand it to window.print().
   Uses the same summary functions as the on-screen Reports tab,
   so the numbers are identical. */

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function printStocksReport(ym, transactions, prices) {
    const isAll = ym === "all";
    const s = isAll
        ? calculateAllTimeSummary(transactions, prices)
        : calculateMonthlySummary(ym, transactions, prices);

    let label = "All Time";
    if (!isAll) {
        const [y, m] = ym.split("-");
        label = new Date(Number(y), Number(m) - 1, 1)
            .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }

    const generated = new Date().toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const scoped = (isAll ? transactions : transactions.filter((t) => t.date && t.date.slice(0, 7) === ym))
        .slice()
        .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));

    const pnl = getTxnPnLMap(transactions);

    const rows = scoped.length
        ? scoped.map((t) => {
            const hasPnl = t.type === "SELL" && pnl[t.id] !== undefined;
            return `<tr>
                <td>${fmtDate(t.date)}</td>
                <td><span class="pr-pill ${t.type === "BUY" ? "buy" : "sell"}">${esc(t.type)}</span></td>
                <td>${esc(t.name)} (${esc(t.symbol)})</td>
                <td class="num">${t.quantity}</td>
                <td class="num">${fmtMoney(t.price)}</td>
                <td class="num">${fmtMoney(t.quantity * t.price, true)}${t.type === "BUY" && t.isMTF && t.mtfOwn != null ? `<div style="font-size:9.5px;color:#6b7078;">Mine ${fmtMoney(mtfSplit(t).own, true)} · MTF ${fmtMoney(mtfSplit(t).funded, true)}</div>` : ""}</td>
                <td class="num ${hasPnl ? "pr-" + pnlClass(pnl[t.id]) : ""}">${hasPnl ? fmtSigned(pnl[t.id], true) : "—"}</td>
                <td>${t.isMTF ? "MTF" : ""}</td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="8" class="pr-empty">No transactions ${isAll ? "yet" : "this month"}.</td></tr>`;

    const cls = (n) => (n >= 0 ? "pr-pos" : "pr-neg");

    let host = document.getElementById("br-print-report");
    if (!host) {
        host = document.createElement("div");
        host.id = "br-print-report";
        document.body.appendChild(host);
    }

    host.innerHTML = `
        <div class="pr-header">
            <div class="pr-brand">BlackRoad's Equity Report</div>
            <div class="pr-title">${label}</div>
            <div class="pr-sub">Generated ${generated}</div>
        </div>
        <div class="pr-grid">
            <div><span>Invested</span><b>${fmtMoney(s.invested, true)}</b></div>
            <div><span>Withdrawn</span><b>${fmtMoney(s.withdrawn, true)}</b></div>
            <div><span>Transactions</span><b>${s.transactionCount}</b></div>
            <div><span>Realized P&amp;L (${isAll ? "all time" : "month"})</span><b class="${cls(s.realizedPnLThisMonth)}">${fmtSigned(s.realizedPnLThisMonth, true)}</b></div>
            <div><span>Current portfolio</span><b>${fmtMoney(s.currentPortfolioValue, true)}</b></div>
            <div><span>Unrealized P&amp;L (now)</span><b class="${cls(s.unrealizedPnL)}">${fmtSigned(s.unrealizedPnL, true)}</b></div>
            ${s.investedFunded > 0 ? `<div><span>Invested · my amount</span><b>${fmtMoney(s.investedOwn, true)}</b></div><div><span>Invested · MTF funded</span><b>${fmtMoney(s.investedFunded, true)}</b></div>` : ""}
        </div>
        <div class="pr-section">Transaction ledger</div>
        <table class="pr-table">
            <thead><tr><th>Date</th><th>Type</th><th>Stock</th><th>Qty</th><th>Price</th><th>Amount</th><th>Realized P&amp;L</th><th>MTF</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="pr-footer"><span>Informational only, not investment advice.</span><span>BlackRoad</span></div>`;

    document.body.classList.add("br-printing");
    const done = () => {
        document.body.classList.remove("br-printing");
        window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    // let the DOM paint before the print dialog opens
    setTimeout(() => window.print(), 60);
}
