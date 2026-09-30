/* =========================================================
   LIVE DATA ADAPTER
   Builds the object engine.js expects (same shape as
   EXAMPLE_DATA) from your real stores. Read-only.
   Returns null when there is not yet a full month of income
   to work from, so the caller can fall back to example data.
   ========================================================= */

import { dataService } from "../../../data/data-service.js";
import {
    recalcEntry,
    entryGenuineIncomeAmount,
    isInvestmentCategory,
    calculateLedgerSummary
} from "../../income/income-service.js";
import { outstanding, nextDue } from "../../lending/lending-service.js";
import { getActiveHoldings } from "../../stocks/stocks-service.js";
import { getDepositsSummary } from "../dashboard-service.js";

const sum = (list) => list.reduce((a, b) => a + b, 0);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/* Newest first: [last full month, the month before, ...] */
function fullMonths(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) =>
        ym(new Date(now.getFullYear(), now.getMonth() - (i + 1), 1))
    );
}

/* Sector lookup for common NSE symbols. Anything unknown is "Other". */
const SECTORS = {
    Technology: ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM", "LTIM"],
    Finance: ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "BAJFINANCE", "BAJAJFINSV"],
    Healthcare: ["SUNPHARMA", "CIPLA", "DRREDDY", "DIVISLAB", "APOLLOHOSP"],
    Energy: ["RELIANCE", "ONGC", "NTPC", "POWERGRID", "COALINDIA"],
    Consumer: ["ITC", "HINDUNILVR", "NESTLEIND", "TITAN", "BRITANNIA"],
    Auto: ["MARUTI", "TATAMOTORS", "M&M", "BAJAJ-AUTO", "EICHERMOT"]
};

function sectorOf(symbol) {
    const s = String(symbol || "").toUpperCase().replace(/\.(NS|BO)$|-EQ$/g, "");
    return Object.keys(SECTORS).find((k) => SECTORS[k].includes(s)) || "Other";
}

const normMerchant = (text) =>
    String(text || "").toLowerCase().replace(/[\d\W_]+/g, " ").trim();

export async function loadLiveData() {
    const [incomeStore, lendingStore, stocksStore] = await Promise.all([
        dataService.getIncomeStore(),
        dataService.getLendingStore(),
        dataService.getStocksStore()
    ]);

    const [entries, allLoans, stockTxns, prices, deposits] = await Promise.all([
        incomeStore.getEntries(),
        lendingStore.getLoans(),
        stocksStore.getState("transactions").then((v) => v || []),
        stocksStore.getState("prices").then((v) => v || {}),
        getDepositsSummary().catch(() => ({ totalCurrentValue: 0 }))
    ]);

    const months = fullMonths(3);
    const window12 = new Set(fullMonths(12));
    const monthly = {};
    const merchants = new Map();
    const transactions = [];
    let rentDay = 5;
    let sipDay = 10;

    for (const entry of entries) {
        if (!entry.date) continue;

        const key = entry.date.slice(0, 7);
        const day = Number(entry.date.slice(8, 10)) || 1;

        const calc = recalcEntry({
            ...entry,
            transactions: (entry.transactions || []).map((t) => ({ ...t }))
        });

        const m = (monthly[key] = monthly[key] || { income: 0, rent: 0, sip: 0, cats: {} });
        m.income += entryGenuineIncomeAmount(calc);

        for (const t of calc.transactions || []) {
            const amount = Math.max(0, Number(t.amount) || 0);
            const category = String(t.category || "Other").trim() || "Other";

            if (isInvestmentCategory(category)) {
                if (category === "SIP" && t.type === "investment") {
                    m.sip += amount;
                    sipDay = day;
                }
                continue;
            }

            if (/\brent\b/i.test(category)) {
                m.rent += amount;
                rentDay = day;
            } else if (!/emi|loan/i.test(category)) {
                m.cats[category] = (m.cats[category] || 0) + amount;
            }

            if (window12.has(key) && amount > 0) {
                const raw = t.description || entry.source || category;
                const id = normMerchant(raw);

                if (id) {
                    if (!merchants.has(id)) merchants.set(id, String(raw).trim());
                    transactions.push({ merchant: merchants.get(id), date: entry.date, amount });
                }
            }
        }
    }

    const average = (pick) => {
        const values = months.map((k) => pick(monthly[k] || {})).filter((v) => v > 0);
        return values.length ? sum(values) / values.length : 0;
    };

    const monthlyIncome = Math.round(average((m) => m.income));

    /* Need at least one full month of income, else numbers would be guesses. */
    if (!monthlyIncome) return null;

    const [recent, prior] = months;
    const catsNow = monthly[recent]?.cats || {};
    const catsBefore = monthly[prior]?.cats || {};

    /* Both months must list the same categories so comparisons line up. */
    const names = [...new Set([...Object.keys(catsNow), ...Object.keys(catsBefore)])];
    const spending = { previous: {}, current: {} };

    names.forEach((name) => {
        spending.previous[name] = Math.round(catsBefore[name] || 0);
        spending.current[name] = Math.round(catsNow[name] || 0);
    });

    if (!names.length) {
        spending.previous.Spending = 0;
        spending.current.Spending = 0;
    }

    const loans = allLoans.filter((l) => outstanding(l) > 0);
    const loanOutstanding = sum(loans.map(outstanding));
    const emi = sum(loans.map((l) => Number(l.emiAmount) || 0));

    const rated = loans.filter((l) => Number(l.interestRate) > 0);
    const ratedBase = sum(rated.map(outstanding));
    const annualRate = ratedBase
        ? sum(rated.map((l) => outstanding(l) * Number(l.interestRate))) / ratedBase
        : 0;

    const due = loans.map(nextDue).filter(Boolean).sort()[0];
    const emiDay = due ? Number(due.slice(8, 10)) || 5 : 5;

    const rent = Math.round(average((m) => m.rent));
    const sip = Math.round(average((m) => m.sip));

    const fixed = [];
    if (emi > 0) fixed.push({ key: "emi", label: "EMI", amount: Math.round(emi), day: emiDay });
    if (sip > 0) fixed.push({ key: "sip", label: "SIP", amount: sip, day: sipDay });
    if (rent > 0) fixed.push({ key: "rent", label: "Rent", amount: rent, day: rentDay });

    const cash = calculateLedgerSummary(entries).cash;

    const holdings = getActiveHoldings(stockTxns, prices).map((h) => ({
        name: h.name || h.symbol,
        sector: sectorOf(h.symbol),
        value: h.currentValue
    }));

    return {
        profile: {
            monthlyIncome,
            openingBalance: Math.round(cash),
            savings: Math.max(0, Math.round(cash + (deposits.totalCurrentValue || 0)))
        },
        fixed,
        spending,
        loan: {
            outstanding: Math.round(loanOutstanding),
            annualRate: Math.round(annualRate * 100) / 100,
            emi: Math.round(emi)
        },
        debtExtraPayment: emi ? Math.max(1000, Math.round((emi * 0.1) / 500) * 500) : 0,
        goals: [],
        holdings,
        transactions
    };
}
