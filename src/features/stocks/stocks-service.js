/*
 * stocks-service.js
 *
 * Calculation engine for the Stocks module, ported from the old
 * BlackRoad stocks/state.js. All figures (avg price, invested value,
 * current value, P&L, weight) are derived fresh from transactions +
 * prices — nothing calculated is ever persisted directly.
 *
 * Kept as pure functions (transactions/prices passed in explicitly)
 * so this file has no dependency on IndexedDB or the DOM, matching
 * the income-service.js pattern.
 */

import { isUSD, usd } from "../../services/currency.js";

export function genId() {
    return (
        "txn_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8)
    );
}

// Rounds a money figure to the nearest paisa, killing floating-point
// drift from repeated addition/subtraction during replay.
export function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Same idea for share quantities, to 6 decimal places.
export function round6(n) {
    return Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
}

/*
 * MTF split of one BUY. A normal buy is 100% the investor's own
 * money. An MTF buy is "my amount + MTF": mtfOwn is what the
 * investor paid (the margin), the rest of the trade value is funded
 * by the broker. Old MTF buys saved before margins were tracked have
 * no mtfOwn and keep behaving as fully own money (set: false).
 */
export function mtfSplit(t) {
    const total = round2(t.quantity * t.price);
    const hasMargin =
        !!t.isMTF &&
        t.type === "BUY" &&
        t.mtfOwn !== undefined &&
        t.mtfOwn !== null &&
        !isNaN(Number(t.mtfOwn));

    if (!hasMargin) {
        return { total, own: total, funded: 0, set: !t.isMTF };
    }

    const own = Math.min(total, Math.max(0, round2(Number(t.mtfOwn))));
    return { total, own, funded: round2(total - own), set: true };
}

/*
 * Chronological comparator: date, then time of day (optional field —
 * older transactions have none and sort first within their day), then
 * entry order. Keeps old data ordering exactly as before.
 */
export function cmpTxn(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ta = a.time || "";
    const tb = b.time || "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.seq || 0) - (b.seq || 0);
}

export function getSymbolTransactions(symbol, transactions) {
    return transactions
        .filter((t) => t.symbol === symbol)
        .sort(cmpTxn);
}

/*
 * Core replay: walks a symbol's transactions chronologically using the
 * average-cost method. Returns quantity, avgPrice, investedValue,
 * realizedPnL, totalBuyQty, totalSellQty, per-txn realized P&L map,
 * and an error if a SELL would exceed holdings at that point in time.
 */
export function replaySymbol(symbol, transactions) {
    const txns = getSymbolTransactions(symbol, transactions);

    let qty = 0;
    let totalCost = 0;
    let ownCost = 0;
    let fundedCost = 0;
    let realizedPnL = 0;
    let totalBuyQty = 0;
    let totalSellQty = 0;
    const txnPnL = {};

    for (const t of txns) {
        if (t.type === "BUY") {
            totalCost = round2(totalCost + t.quantity * t.price);
            const split = mtfSplit(t);
            ownCost = round2(ownCost + split.own);
            fundedCost = round2(fundedCost + split.funded);
            qty = round6(qty + t.quantity);
            totalBuyQty = round6(totalBuyQty + t.quantity);
        } else {
            // SELL — tiny tolerance so selling every last share never
            // gets wrongly rejected over float dust.
            if (round6(t.quantity - qty) > 1e-6) {
                return {
                    error: {
                        available: qty,
                        txnId: t.id,
                        date: t.date
                    }
                };
            }

            const avgCostAtSale = qty > 0 ? totalCost / qty : 0;
            const costBasis = round2(avgCostAtSale * t.quantity);
            const saleValue = round2(t.quantity * t.price);
            const txnRealized = round2(saleValue - costBasis);

            realizedPnL = round2(realizedPnL + txnRealized);
            txnPnL[t.id] = txnRealized;
            // Selling releases my amount and the MTF-funded part in the
            // same proportion as they sit in the position.
            const keep = qty > 0 ? 1 - t.quantity / qty : 0;
            ownCost = round2(ownCost * keep);
            fundedCost = round2(fundedCost * keep);
            totalCost = round2(totalCost - costBasis);
            qty = round6(qty - t.quantity);
            totalSellQty = round6(totalSellQty + t.quantity);
        }
    }

    return {
        quantity: qty,
        avgPrice: qty > 0 ? round2(totalCost / qty) : 0,
        investedValue: qty > 0 ? round2(totalCost) : 0,
        ownInvested: qty > 0 ? round2(ownCost) : 0,
        fundedInvested: qty > 0 ? round2(fundedCost) : 0,
        realizedPnL,
        totalBuyQty,
        totalSellQty,
        txnPnL,
        error: null
    };
}

/* =========================================
   HOLDING DURATION (buy -> sell)
========================================= */

function txnMs(t, withTime) {
    const hhmmss = withTime && t.time
        ? (t.time.length === 5 ? t.time + ":00" : t.time)
        : "00:00:00";
    return new Date(`${t.date}T${hhmmss}`).getTime();
}

/*
 * How long each SELL held the shares it sold. Shares are matched to
 * buys first-in-first-out (display only — P&L itself still uses the
 * average-cost method). A sell that spans several buys gets the
 * quantity-weighted average. If either side has no time recorded
 * (older data), both are compared by date only.
 * Returns { [sellId]: { start, end } } as millisecond timestamps.
 */
export function getTxnHoldMap(transactions) {
    const map = {};

    getAllSymbols(transactions).forEach((sym) => {
        const lots = [];

        getSymbolTransactions(sym, transactions).forEach((t) => {
            if (t.type === "BUY") {
                lots.push({ t, left: t.quantity });
                return;
            }

            let need = t.quantity;
            let weighted = 0;
            let matched = 0;
            let endMs = txnMs(t, true);

            while (need > 1e-9 && lots.length) {
                const lot = lots[0];
                const take = Math.min(lot.left, need);
                const both = !!(lot.t.time && t.time);
                const dur = txnMs(t, both) - txnMs(lot.t, both);

                if (Number.isFinite(dur)) {
                    weighted += Math.max(0, dur) * take;
                    matched += take;
                    if (!both) endMs = txnMs(t, false);
                }

                lot.left = round6(lot.left - take);
                need = round6(need - take);
                if (lot.left <= 1e-9) lots.shift();
            }

            if (matched > 0) {
                const avg = weighted / matched;
                map[t.id] = { start: endMs - avg, end: endMs };
            }
        });
    });

    return map;
}

/*
 * Compact duration: the two largest non-zero units out of
 * y (years), m (months), d, h, min, sec — e.g. "1y 2m", "10d 5min".
 */
export function fmtHold(h) {
    if (!h || !Number.isFinite(h.start) || !Number.isFinite(h.end)) return "—";

    const a = new Date(Math.min(h.start, h.end));
    const b = new Date(Math.max(h.start, h.end));

    let y = b.getFullYear() - a.getFullYear();
    let m = b.getMonth() - a.getMonth();
    let d = b.getDate() - a.getDate();
    let hr = b.getHours() - a.getHours();
    let mi = b.getMinutes() - a.getMinutes();
    let sec = b.getSeconds() - a.getSeconds();

    if (sec < 0) { sec += 60; mi--; }
    if (mi < 0) { mi += 60; hr--; }
    if (hr < 0) { hr += 24; d--; }
    if (d < 0) {
        d += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
        m--;
    }
    if (m < 0) { m += 12; y--; }

    const parts = [[y, "y"], [m, "m"], [d, "d"], [hr, "h"], [mi, "min"], [sec, "sec"]]
        .filter(([v]) => v > 0)
        .slice(0, 2)
        .map(([v, u]) => v + u);

    return parts.length ? parts.join(" ") : "0sec";
}

export function fmtTime(t) {
    if (!t) return "";
    const [hh, mm, ss] = String(t).split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) return t;
    const d = new Date(2000, 0, 1, hh, mm, ss || 0);
    return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

export function getTxnPnLMap(transactions) {
    const map = {};

    getAllSymbols(transactions).forEach((sym) => {
        const r = replaySymbol(sym, transactions);
        if (r.txnPnL) Object.assign(map, r.txnPnL);
    });

    return map;
}

export function getAllSymbols(transactions) {
    return [...new Set(transactions.map((t) => t.symbol))];
}

export function getSymbolName(symbol, transactions) {
    const txns = getSymbolTransactions(symbol, transactions);
    return txns.length ? txns[txns.length - 1].name : symbol;
}

export function getCurrentPrice(symbol, transactions, prices) {
    if (prices[symbol] !== undefined && prices[symbol] !== null) {
        return prices[symbol];
    }

    // Fall back to the most recent transaction price so a brand-new
    // holding doesn't show a zero valuation before a price is set.
    const txns = getSymbolTransactions(symbol, transactions);
    if (txns.length) return txns[txns.length - 1].price;
    return 0;
}

export function hasMTFBuy(symbol, transactions) {
    return getSymbolTransactions(symbol, transactions).some(
        (t) => t.type === "BUY" && t.isMTF
    );
}

// Full derived holding object for a symbol.
export function calculateStockHolding(symbol, transactions, prices) {
    const r = replaySymbol(symbol, transactions);
    const name = getSymbolName(symbol, transactions);
    const currentPrice = getCurrentPrice(symbol, transactions, prices);
    const currentValue = round2(r.quantity * currentPrice);
    const unrealizedPnL = round2(currentValue - r.investedValue);
    const unrealizedPnLPct =
        r.investedValue > 0
            ? round2((unrealizedPnL / r.investedValue) * 100)
            : 0;

    // "My amount" vs MTF-funded. Whatever the broker funded must be
    // repaid, so my equity today = current value - funded part.
    const fundedInvested = Math.min(r.fundedInvested, r.investedValue);
    const ownInvested = round2(r.investedValue - fundedInvested);
    const netEquity = round2(currentValue - fundedInvested);
    const hasMargin = fundedInvested > 0;

    return {
        symbol,
        name,
        quantity: r.quantity,
        avgPrice: r.avgPrice,
        currentPrice,
        investedValue: r.investedValue,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPct,
        realizedPnL: r.realizedPnL,
        totalBuyQty: r.totalBuyQty,
        totalSellQty: r.totalSellQty,
        isMTF: hasMTFBuy(symbol, transactions),
        ownInvested,
        fundedInvested,
        netEquity,
        hasMargin,
        leverage: hasMargin && ownInvested > 0
            ? round2(r.investedValue / ownInvested)
            : 1,
        // Gain/loss measured against the money I actually put in
        returnOnOwnPct: ownInvested > 0
            ? round2((unrealizedPnL / ownInvested) * 100)
            : 0
    };
}

// Active holdings = quantity > 0 only.
export function getActiveHoldings(transactions, prices) {
    return getAllSymbols(transactions)
        .map((sym) => calculateStockHolding(sym, transactions, prices))
        .filter((h) => h.quantity > 0);
}

export function calculatePortfolioTotals(transactions, prices) {
    const holdings = getActiveHoldings(transactions, prices);

    const investedValue = round2(
        holdings.reduce((s, h) => s + h.investedValue, 0)
    );
    const currentValue = round2(
        holdings.reduce((s, h) => s + h.currentValue, 0)
    );
    const unrealizedPnL = round2(currentValue - investedValue);
    const unrealizedPnLPct =
        investedValue > 0
            ? round2((unrealizedPnL / investedValue) * 100)
            : 0;

    // My amount vs MTF-funded split of the open positions
    const fundedInvested = round2(
        holdings.reduce((s, h) => s + h.fundedInvested, 0)
    );
    const ownInvested = round2(investedValue - fundedInvested);
    const netEquity = round2(currentValue - fundedInvested);

    // Realized P&L summed across every symbol ever traded, not just
    // active ones, so a fully-sold stock's profit is never dropped.
    const realizedPnL = round2(
        getAllSymbols(transactions).reduce(
            (s, sym) =>
                s + replaySymbol(sym, transactions).realizedPnL,
            0
        )
    );

    const totalPnL = round2(realizedPnL + unrealizedPnL);
    const totalPnLPct =
        investedValue > 0 ? round2((totalPnL / investedValue) * 100) : 0;

    return {
        investedValue,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPct,
        realizedPnL,
        totalPnL,
        totalPnLPct,
        holdingsCount: holdings.length,
        ownInvested,
        fundedInvested,
        netEquity,
        hasMTF: fundedInvested > 0,
        leverage:
            fundedInvested > 0 && ownInvested > 0
                ? round2(investedValue / ownInvested)
                : 1,
        returnOnOwnPct:
            ownInvested > 0
                ? round2((unrealizedPnL / ownInvested) * 100)
                : 0
    };
}

export function calculatePortfolioWeight(symbol, transactions, prices) {
    const totals = calculatePortfolioTotals(transactions, prices);
    if (totals.currentValue <= 0) return 0;

    const holding = calculateStockHolding(symbol, transactions, prices);
    return round2((holding.currentValue / totals.currentValue) * 100);
}

/*
 * Validates a prospective transaction (new or edited) against a
 * symbol's full chronological history, never allowing negative
 * holdings anywhere along the timeline.
 */
export function validateTransaction(
    candidate,
    excludeId,
    transactions
) {
    if (candidate.type !== "SELL") return { ok: true };

    const others = transactions.filter(
        (t) => t.id !== excludeId && t.symbol === candidate.symbol
    );
    const trial = others.concat([candidate]);
    const result = replaySymbol(candidate.symbol, trial);

    if (result.error) {
        return { ok: false, available: result.error.available };
    }

    return { ok: true };
}

/*
 * Tags are #hashtags parsed out of the free-text notes field on
 * demand — not a separate stored field, so old data is automatically
 * "tagged" and no migration is needed.
 */
export function extractTags(notes) {
    if (!notes) return [];
    const matches =
        String(notes).match(/#[a-zA-Z][a-zA-Z0-9_]*/g) || [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function getAllTags(transactions) {
    const set = new Set();
    transactions.forEach((t) =>
        extractTags(t.notes).forEach((tag) => set.add(tag))
    );
    return [...set].sort();
}

// Split of the BUY value in a set of transactions into my amount
// and MTF-funded.
function buySplit(list) {
    const buys = list.filter((t) => t.type === "BUY").map(mtfSplit);
    return {
        investedOwn: round2(buys.reduce((s, b) => s + b.own, 0)),
        investedFunded: round2(buys.reduce((s, b) => s + b.funded, 0))
    };
}

export function calculateMonthlySummary(yyyyMm, transactions, prices) {
    const inMonth = transactions.filter(
        (t) => t.date && t.date.slice(0, 7) === yyyyMm
    );
    const invested = round2(
        inMonth
            .filter((t) => t.type === "BUY")
            .reduce((s, t) => s + t.quantity * t.price, 0)
    );
    const withdrawn = round2(
        inMonth
            .filter((t) => t.type === "SELL")
            .reduce((s, t) => s + t.quantity * t.price, 0)
    );

    const pnlMap = getTxnPnLMap(transactions);
    const realizedThisMonth = round2(
        inMonth
            .filter((t) => t.type === "SELL")
            .reduce((s, t) => s + (pnlMap[t.id] || 0), 0)
    );

    const totals = calculatePortfolioTotals(transactions, prices);

    return {
        month: yyyyMm,
        ...buySplit(inMonth),
        invested,
        withdrawn,
        transactionCount: inMonth.length,
        realizedPnLThisMonth: realizedThisMonth,
        currentPortfolioValue: totals.currentValue,
        unrealizedPnL: totals.unrealizedPnL
    };
}

export function calculateAllTimeSummary(transactions, prices) {
    const invested = round2(
        transactions
            .filter((t) => t.type === "BUY")
            .reduce((s, t) => s + t.quantity * t.price, 0)
    );
    const withdrawn = round2(
        transactions
            .filter((t) => t.type === "SELL")
            .reduce((s, t) => s + t.quantity * t.price, 0)
    );
    const totals = calculatePortfolioTotals(transactions, prices);

    return {
        month: "all",
        ...buySplit(transactions),
        invested,
        withdrawn,
        transactionCount: transactions.length,
        realizedPnLThisMonth: totals.realizedPnL,
        currentPortfolioValue: totals.currentValue,
        unrealizedPnL: totals.unrealizedPnL
    };
}

export function getAvailableMonths(transactions) {
    return [
        ...new Set(
            transactions
                .map((t) => t.date && t.date.slice(0, 7))
                .filter(Boolean)
        )
    ]
        .sort()
        .reverse();
}

// Exports the full transaction ledger (the actual source of truth) as
// CSV, matching the old module's column layout.
export function transactionsToCSV(transactions) {
    const header = [
        "Date",
        "Type",
        "Symbol",
        "Name",
        "Quantity",
        "Price",
        "Amount",
        "MTF",
        "Notes",
        "My Amount",
        "MTF Funded",
        "Time"
    ];

    const rows = transactions
        .slice()
        .sort(cmpTxn)
        .map((t) => [
            t.date,
            t.type,
            t.symbol,
            t.name,
            t.quantity,
            t.price,
            round2(t.quantity * t.price),
            t.isMTF ? "Yes" : "No",
            (t.notes || "").replace(/"/g, '""'),
            t.type === "BUY" ? mtfSplit(t).own : "",
            t.type === "BUY" ? mtfSplit(t).funded : "",
            t.time || ""
        ]);

    const csvLines = [header, ...rows].map((r) =>
        r
            .map((cell) =>
                /[",\n]/.test(String(cell))
                    ? `"${String(cell).replace(/"/g, '""')}"`
                    : String(cell)
            )
            .join(",")
    );

    return csvLines.join("\r\n");
}

/* =========================================
   FORMATTING
========================================= */

const inrFull = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
});

const inrWhole = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
});

export function fmtMoney(n, whole) {
    const v = Number(n) || 0;
    if (isUSD()) return usd(v, { whole: !!whole });
    return (whole ? inrWhole : inrFull).format(v);
}

export function fmtSigned(n, whole) {
    const v = Number(n) || 0;
    const s = fmtMoney(Math.abs(v), whole);
    return (v < 0 ? "-" : "+") + s;
}

export function fmtPct(n) {
    const v = Number(n) || 0;
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

export function pnlClass(n) {
    return (Number(n) || 0) >= 0 ? "pos" : "neg";
}

export function fmtDate(d) {
    const dt = new Date(d + "T00:00:00");
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}
