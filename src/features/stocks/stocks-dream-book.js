/*
 * stocks-dream-book.js
 *
 * Pure logic for Dream "paper trading" — buy and sell stocks with pretend
 * money, tracked exactly like a real portfolio.
 *
 * It reuses the real Stocks engine (replaySymbol / calculateStockHolding),
 * so average cost, realized P&L and unrealized P&L follow the same rules
 * as the real portfolio. Nothing here touches real transactions, prices,
 * holdings, totals or net worth.
 *
 * A paper trade has the same shape as a real transaction:
 *   { id, symbol, name, type: "BUY" | "SELL", quantity, price,
 *     date: "YYYY-MM-DD", time: "HH:MM[:SS]" | "", notes, seq, createdAt }
 *
 * The saved "book" is { trades: [], funds: number | null }.
 * funds = optional pretend capital. null means no limit on buys.
 */

import {
    replaySymbol,
    calculateStockHolding,
    cmpTxn,
    round2,
    round6,
    fmtMoney,
    fmtDate
} from "./stocks-service.js";

export const emptyBook = () => ({ trades: [], funds: null });

export function normalizeBook(raw) {
    const trades = Array.isArray(raw?.trades)
        ? raw.trades.filter(
              (t) =>
                  t &&
                  t.symbol &&
                  (t.type === "BUY" || t.type === "SELL") &&
                  Number(t.quantity) > 0 &&
                  Number(t.price) > 0 &&
                  t.date
          )
        : [];
    const f = raw?.funds;
    const funds = f === null || f === undefined || f === "" || isNaN(Number(f)) || Number(f) < 0 ? null : round2(f);
    return { trades, funds };
}

export const nextSeq = (trades) => trades.reduce((m, t) => Math.max(m, t.seq || 0), 0) + 1;

export const sortTrades = (trades) => trades.slice().sort(cmpTxn);

const fmtQtyShort = (q) => String(Math.round(q * 1e4) / 1e4);

/*
 * Checks a whole book. Returns null when it is valid, otherwise
 * { message } for the first problem found:
 *   - selling more shares than were held at that moment
 *   - spending more virtual funds than were available at that moment
 */
export function validateBook(trades, funds) {
    const symbols = [...new Set(trades.map((t) => t.symbol))];
    for (const sym of symbols) {
        const r = replaySymbol(sym, trades);
        if (r.error) {
            return {
                message: `Not enough ${sym} shares on ${fmtDate(r.error.date)} — only ${fmtQtyShort(r.error.available)} held then.`
            };
        }
    }

    if (funds !== null && funds !== undefined) {
        let cash = funds;
        for (const t of sortTrades(trades)) {
            const amount = round2(t.quantity * t.price);
            if (t.type === "BUY") {
                if (round2(amount - cash) > 0.005) {
                    return {
                        message: `Not enough virtual funds for ${t.symbol} on ${fmtDate(t.date)} — needs ${fmtMoney(amount)}, ${fmtMoney(Math.max(0, cash))} available.`
                    };
                }
                cash = round2(cash - amount);
            } else {
                cash = round2(cash + amount);
            }
        }
    }
    return null;
}

/*
 * Everything the screens need, derived fresh (nothing calculated is stored).
 * prices = { SYMBOL: livePrice } — symbols without a price fall back to
 * their last trade price, same as the real portfolio.
 */
export function computeBook(trades, prices, funds) {
    const symbols = [...new Set(trades.map((t) => t.symbol))].sort();
    const holdings = [];
    const closed = [];
    const sells = [];
    let realized = 0;
    let bought = 0;
    let sold = 0;
    let closedCost = 0;

    const sorted = sortTrades(trades);
    sorted.forEach((t) => {
        const amt = round2(t.quantity * t.price);
        if (t.type === "BUY") bought = round2(bought + amt);
        else sold = round2(sold + amt);
    });

    symbols.forEach((sym) => {
        const r = replaySymbol(sym, trades);
        if (r.error) return;
        const priced = prices[sym] > 0;
        const h = calculateStockHolding(sym, trades, priced ? { [sym]: prices[sym] } : {});
        h.priced = priced;
        realized = round2(realized + r.realizedPnL);

        sorted
            .filter((t) => t.symbol === sym && t.type === "SELL")
            .forEach((t) => {
                const pnl = r.txnPnL[t.id] ?? 0;
                const amt = round2(t.quantity * t.price);
                const cost = round2(amt - pnl);
                closedCost = round2(closedCost + cost);
                sells.push({
                    trade: t,
                    symbol: sym,
                    name: h.name,
                    amount: amt,
                    costBasis: cost,
                    pnl,
                    pct: r.txnReturnPct[t.id] ?? null
                });
            });

        if (h.quantity > 0) holdings.push(h);
        else closed.push(h);
    });

    const invested = round2(holdings.reduce((s, h) => s + h.investedValue, 0));
    const value = round2(holdings.reduce((s, h) => s + h.currentValue, 0));
    const unrealized = round2(value - invested);
    const total = round2(unrealized + realized);
    const costAll = round2(invested + closedCost);
    const returnPct = costAll > 0 ? (total / costAll) * 100 : 0;

    holdings.forEach((h) => {
        h.weight = value > 0 ? (h.currentValue / value) * 100 : 0;
    });
    holdings.sort((a, b) => b.currentValue - a.currentValue);

    const wins = sells.filter((s) => s.pnl > 0).length;
    const losses = sells.filter((s) => s.pnl < 0).length;
    const byPnl = sells.slice().sort((a, b) => b.pnl - a.pnl);

    const monthly = {};
    sells.forEach((s) => {
        const m = s.trade.date.slice(0, 7);
        monthly[m] = round2((monthly[m] || 0) + s.pnl);
    });

    const cash = funds === null || funds === undefined ? null : round2(funds - bought + sold);

    return {
        holdings,
        closed,
        sells,
        invested,
        value,
        unrealized,
        unrealizedPct: invested > 0 ? (unrealized / invested) * 100 : 0,
        realized,
        total,
        returnPct,
        bought,
        sold,
        cash,
        equity: cash === null ? null : round2(cash + value),
        trades: trades.length,
        buys: trades.filter((t) => t.type === "BUY").length,
        sellCount: sells.length,
        wins,
        losses,
        winRate: sells.length ? (wins / sells.length) * 100 : null,
        best: byPnl.length ? byPnl[0] : null,
        worst: byPnl.length > 1 ? byPnl[byPnl.length - 1] : null,
        monthly: Object.entries(monthly).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        firstDate: sorted.length ? sorted[0].date : null,
        lastDate: sorted.length ? sorted[sorted.length - 1].date : null
    };
}

export { round2, round6 };
