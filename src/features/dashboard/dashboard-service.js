import { isUSD, usd } from "../../services/currency.js";
import { dataService } from "../../data/data-service.js";

import {
    calculateLedgerSummary,
    calculateCurrentMonth,
    investmentBreakdownByCategory,
    totalNetInvested
} from "../income/income-service.js";

/*
 * Dashboard data service (read-only).
 *
 * Every calculation below is ported from the OLD
 * blackroad-dashboard.html readers (StocksStore, LendingStore,
 * DepositsStore, MutualFundStore) so the numbers stay identical.
 * Cash & Bank uses the Income module's calculateLedgerSummary(),
 * the same function the Income ledger uses.
 *
 * Phases 7-10 will move the stocks / deposits / lending / stepup
 * calculations into their own feature services.
 */

/* ---------------- formatting ---------------- */

export function formatINR(value) {
    const number = Number(value) || 0;
    if (isUSD()) return usd(number, { whole: true });
    const sign = number < 0 ? "-" : "";
    const abs = Math.abs(Math.round(number));

    return sign + "₹" + abs.toLocaleString("en-IN");
}

/* ---------------- Stocks ---------------- */

function symbolTransactions(symbol, transactions) {
    return transactions
        .filter((t) => t.symbol === symbol)
        .sort((a, b) =>
            a.date === b.date
                ? a.seq - b.seq
                : a.date < b.date
                  ? -1
                  : 1
        );
}

export function replaySymbol(symbol, transactions) {
    const list = symbolTransactions(symbol, transactions);

    let quantity = 0;
    let totalCost = 0;

    for (const t of list) {
        if (t.type === "BUY") {
            totalCost += t.quantity * t.price;
            quantity += t.quantity;
        } else {
            if (t.quantity > quantity) {
                continue;
            }

            const averageCost =
                quantity > 0 ? totalCost / quantity : 0;

            totalCost -= averageCost * t.quantity;
            quantity -= t.quantity;
        }
    }

    return {
        quantity,
        investedValue: quantity > 0 ? totalCost : 0
    };
}

export function currentPrice(symbol, transactions, prices) {
    if (
        prices[symbol] !== undefined &&
        prices[symbol] !== null
    ) {
        return prices[symbol];
    }

    const list = symbolTransactions(symbol, transactions);

    return list.length ? list[list.length - 1].price : 0;
}

export async function getStocksSummary() {
    const store = await dataService.getStocksStore();

    const transactions =
        (await store.getState("transactions")) || [];

    const prices = (await store.getState("prices")) || {};

    const symbols = [
        ...new Set(transactions.map((t) => t.symbol))
    ];

    const rows = symbols
        .map((symbol) => {
            const result = replaySymbol(symbol, transactions);

            const price = currentPrice(
                symbol,
                transactions,
                prices
            );

            return {
                symbol,
                quantity: result.quantity,
                investedValue: result.investedValue,
                currentValue: result.quantity * price
            };
        })
        .filter((row) => row.quantity > 0);

    const invested = rows.reduce(
        (sum, row) => sum + row.investedValue,
        0
    );

    const currentValue = rows.reduce(
        (sum, row) => sum + row.currentValue,
        0
    );

    const pnl = currentValue - invested;

    return {
        holdings: rows.length,
        invested,
        currentValue,
        pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : 0
    };
}

/* ---------------- Lending ---------------- */

function loanOutstanding(loan) {
    const paid = (loan.payments || []).reduce(
        (sum, payment) => sum + (Number(payment.amount) || 0),
        0
    );

    return Math.max(0, (Number(loan.principal) || 0) - paid);
}

export async function getLendingSummary() {
    const store = await dataService.getLendingStore();

    const [entries, loans] = await Promise.all([
        store.getEntries(),
        store.getLoans()
    ]);

    let peopleReceivable = 0;
    let peoplePayable = 0;

    const byParty = {};

    entries.forEach((entry) => {
        const amount = Number(entry.amount) || 0;

        byParty[entry.partyId] = byParty[entry.partyId] || {
            gave: 0,
            got: 0
        };

        if (entry.type === "gave") {
            byParty[entry.partyId].gave += amount;
        } else {
            byParty[entry.partyId].got += amount;
        }
    });

    Object.values(byParty).forEach(({ gave, got }) => {
        const balance = gave - got;

        if (balance > 0) {
            peopleReceivable += balance;
        } else {
            peoplePayable += -balance;
        }
    });

    let loansOutstanding = 0;
    let monthlyEmi = 0;
    let activeLoanCount = 0;

    loans.forEach((loan) => {
        const outstanding = loanOutstanding(loan);

        loansOutstanding += outstanding;

        if (outstanding > 0) {
            monthlyEmi += Number(loan.emiAmount) || 0;
            activeLoanCount += 1;
        }
    });

    return {
        peopleReceivable,
        peoplePayable,
        loansOutstanding,
        monthlyEmi,
        activeLoanCount,
        liabilities: peoplePayable + loansOutstanding
    };
}

/* ---------------- Fixed Deposits ---------------- */

const COMPOUNDS_PER_YEAR = {
    quarterly: 4,
    monthly: 12,
    yearly: 1,
    simple: 0
};

function addMonthsISO(dateString, months) {
    const date = new Date(dateString + "T00:00:00");

    if (isNaN(date)) {
        return null;
    }

    date.setMonth(date.getMonth() + Number(months || 0));

    return date.toISOString().slice(0, 10);
}

function yearsBetween(fromISO, toISO) {
    const a = new Date(fromISO + "T00:00:00");
    const b = new Date(toISO + "T00:00:00");

    if (isNaN(a) || isNaN(b)) {
        return 0;
    }

    return Math.max(0, (b - a) / (365.25 * 86400000));
}

function growAmount(principal, ratePct, years, compounding) {
    const P = Number(principal) || 0;
    const r = Number(ratePct) || 0;

    if (P <= 0 || years <= 0) {
        return P;
    }

    const n = COMPOUNDS_PER_YEAR[compounding] ?? 4;

    if (n === 0) {
        return P * (1 + (r * years) / 100);
    }

    return P * Math.pow(1 + r / (100 * n), n * years);
}

export function depositMetrics(row, asOfISO) {
    const asOf =
        asOfISO || new Date().toISOString().slice(0, 10);

    const principal = Number(row.principal) || 0;
    const tenureMonths = Number(row.tenureMonths) || 0;
    const compounding = row.compounding || "quarterly";

    const maturityDate = row.startDate
        ? addMonthsISO(row.startDate, tenureMonths)
        : null;

    const tenureYears = tenureMonths / 12;

    const maturityAmount = maturityDate
        ? growAmount(
              principal,
              row.interestRate,
              tenureYears,
              compounding
          )
        : principal;

    let currentValue;

    if (row.status === "closed") {
        currentValue = Number(row.closedAmount) || principal;
    } else if (maturityDate && asOf >= maturityDate) {
        currentValue = maturityAmount;
    } else {
        const elapsedYears = row.startDate
            ? yearsBetween(row.startDate, asOf)
            : 0;

        currentValue = growAmount(
            principal,
            row.interestRate,
            Math.min(elapsedYears, tenureYears),
            compounding
        );
    }

    return { maturityDate, currentValue };
}

export async function getDepositsSummary() {
    const store = await dataService.getDepositStore();

    const rows = await store.getDeposits();

    let totalCurrentValue = 0;
    let activeCount = 0;
    let nextMaturity = null;

    rows.forEach((row) => {
        if (row.status === "closed") {
            return;
        }

        const metrics = depositMetrics(row);

        totalCurrentValue += metrics.currentValue;
        activeCount += 1;

        if (
            metrics.maturityDate &&
            (!nextMaturity ||
                metrics.maturityDate < nextMaturity.date)
        ) {
            nextMaturity = {
                date: metrics.maturityDate,
                bankName: row.bankName || "Fixed Deposit"
            };
        }
    });

    return { activeCount, totalCurrentValue, nextMaturity };
}

/* ---------------- Mutual Funds (StepUp) ---------------- */

async function loadStepUp() {
    const store = await dataService.getStepUpStore();

    const [profiles, entries, settings] = await Promise.all([
        store.getProfiles(),
        store.getEntries(),
        store.getSettings()
    ]);

    return { profiles, entries, settings };
}

export async function getMutualFundSummary() {
    const { profiles, entries, settings } = await loadStepUp();

    const sips = [];

    for (const profile of profiles) {
        const profileEntries = entries
            .filter((entry) => entry.profileId === profile.id)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (!profileEntries.length) {
            continue;
        }

        const latest = profileEntries[profileEntries.length - 1];

        const profileSettings =
            settings.find((item) => item.id === profile.id) ||
            null;

        const invested = latest.investedAmount || 0;
        const currentValue = latest.portfolioValue || 0;
        const pnl = currentValue - invested;

        sips.push({
            id: profile.id,
            name:
                profileSettings?.linkedFund?.schemeName ||
                profile.name ||
                "SIP",
            invested,
            currentValue,
            pnl,
            pnlPct: invested ? (pnl / invested) * 100 : 0
        });
    }

    const invested = sips.reduce((s, x) => s + x.invested, 0);

    const currentValue = sips.reduce(
        (s, x) => s + x.currentValue,
        0
    );

    const pnl = currentValue - invested;

    return {
        hasData: sips.length > 0,
        invested,
        currentValue,
        pnl,
        pnlPct: invested ? (pnl / invested) * 100 : 0,
        sips
    };
}

export async function getMutualFundSeries() {
    const { profiles, entries } = await loadStepUp();

    const lists = profiles.map((profile) =>
        entries
            .filter((entry) => entry.profileId === profile.id)
            .sort((a, b) => a.date.localeCompare(b.date))
    );

    const dates = Array.from(
        new Set(lists.flatMap((list) => list.map((e) => e.date)))
    ).sort();

    return dates.map((date) => {
        let invested = 0;
        let value = 0;

        lists.forEach((list) => {
            let latest = null;

            for (const entry of list) {
                if (entry.date <= date) {
                    latest = entry;
                } else {
                    break;
                }
            }

            if (latest) {
                invested += latest.investedAmount || 0;
                value += latest.portfolioValue || 0;
            }
        });

        return {
            date,
            pnl: +(value - invested).toFixed(2)
        };
    });
}

/* ---------------- Income & Expenses ---------------- */

export async function getIncomeSummary() {
    const store = await dataService.getIncomeStore();

    const entries = await store.getEntries();

    const ledger = calculateLedgerSummary(entries);

    return {
        hasData: entries.length > 0,
        cash: ledger.cash,
        income: ledger.income,
        expense: ledger.expense,
        netInvested: totalNetInvested(entries),
        month: calculateCurrentMonth(entries),
        breakdown: investmentBreakdownByCategory(entries)
    };
}

/* ---------------- Whole dashboard ---------------- */

async function safe(loader, fallback) {
    try {
        return await loader();
    } catch (error) {
        console.error("BlackRoad dashboard:", error);

        return fallback;
    }
}

export async function getDashboardData() {
    const [income, mutualFunds, stocks, lending, deposits, series] =
        await Promise.all([
            safe(getIncomeSummary, {
                hasData: false,
                cash: 0,
                income: 0,
                expense: 0,
                netInvested: 0,
                month: { net: 0 },
                breakdown: []
            }),
            safe(getMutualFundSummary, {
                hasData: false,
                invested: 0,
                currentValue: 0,
                pnl: 0,
                pnlPct: 0,
                sips: []
            }),
            safe(getStocksSummary, {
                holdings: 0,
                invested: 0,
                currentValue: 0,
                pnl: 0,
                pnlPct: 0
            }),
            safe(getLendingSummary, {
                peopleReceivable: 0,
                peoplePayable: 0,
                loansOutstanding: 0,
                monthlyEmi: 0,
                activeLoanCount: 0,
                liabilities: 0
            }),
            safe(getDepositsSummary, {
                activeCount: 0,
                totalCurrentValue: 0,
                nextMaturity: null
            }),
            safe(getMutualFundSeries, [])
        ]);

    /*
     * Same item list as the old dashboard. Total assets minus
     * liabilities always equals net worth.
     */
    const items = [
        { key: "cash", label: "Cash & Bank", amount: income.cash },
        { key: "mf", label: "Mutual Funds", amount: mutualFunds.currentValue },
        { key: "stocks", label: "Stocks", amount: stocks.currentValue },
        { key: "fd", label: "Fixed Deposits", amount: deposits.totalCurrentValue },
        { key: "lending", label: "Lending Receivables", amount: lending.peopleReceivable }
    ];

    const totalAssets = items.reduce((s, i) => s + i.amount, 0);

    /*
     * Allocation chart: only these four, and only amounts above 0
     * (same rule as the old dashboard).
     */
    const chartKeys = ["lending", "mf", "fd", "stocks"];

    const chartItems = items.filter(
        (i) => chartKeys.includes(i.key) && i.amount > 0
    );

    const chartTotal = chartItems.reduce((s, i) => s + i.amount, 0);

    return {
        income,
        mutualFunds,
        stocks,
        lending,
        deposits,
        series,
        totalAssets,
        totalLiabilities: lending.liabilities,
        netWorth: totalAssets - lending.liabilities,
        chartItems: chartItems.map((i) => ({
            ...i,
            pct: +((i.amount / (chartTotal || 1)) * 100).toFixed(1)
        })),
        chartTotal
    };
}
