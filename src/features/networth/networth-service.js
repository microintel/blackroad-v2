import { dataService } from "../../data/data-service.js";

import {
    calculateLedgerSummary
} from "../income/income-service.js";

import {
    replaySymbol,
    currentPrice,
    depositMetrics
} from "../dashboard/dashboard-service.js";

/*
 * Net Worth Evolution service (read-only).
 *
 * Nothing is stored. Every figure is derived, on demand, from the
 * dated records the other modules already keep:
 *
 *   Cash & Bank          Income ledger  (entry date + each transaction's date)
 *   Stocks               Stock transactions (BUY / SELL dates)
 *   Mutual Funds         SIP entries (latest entry on or before the date)
 *   Fixed Deposits       startDate / closedDate
 *   Lending receivable   Lending entries (date)          -> asset
 *   Lending payable      Lending entries (date)          -> liability
 *   Loans outstanding    loan.date and payment dates     -> liability
 *
 * Net Worth = Total Assets - Total Liabilities, with the same item list
 * and rules as the Dashboard, so the current period matches it exactly.
 *
 * Valuation rule (conservative): the app stores prices only as "today's
 * price". For past dates, stocks are valued at the last traded price on
 * or before that date, never at today's price. Only the current period
 * uses live/current prices.
 */

const ISO = /^\d{4}-\d{2}-\d{2}/;

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/* ---------------- date helpers (local calendar, string based) ---------------- */

function pad(n) {
    return String(n).padStart(2, "0");
}

export function localTodayISO() {
    const d = new Date();

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* "YYYY-MM-DD" from a record field, or "" when missing / malformed. */
function dateOf(value) {
    const text = String(value ?? "");

    return ISO.test(text) ? text.slice(0, 10) : "";
}

/* The day before an ISO date. */
function previousDay(iso) {
    const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) - 1);

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

/* ---------------- loading ---------------- */

async function safeLoad(loader, fallback) {
    try {
        return await loader();
    } catch (error) {
        console.error("BlackRoad net worth:", error);

        return fallback;
    }
}

/* Reads the raw records once. The calculation below is pure over this. */
export async function loadNetWorthSource() {
    const [income, stocks, deposits, lending, stepup] = await Promise.all([
        safeLoad(async () => {
            const store = await dataService.getIncomeStore();
            return store.getEntries();
        }, []),

        safeLoad(async () => {
            const store = await dataService.getStocksStore();
            const [transactions, prices] = await Promise.all([
                store.getState("transactions"),
                store.getState("prices")
            ]);
            return { transactions: transactions || [], prices: prices || {} };
        }, { transactions: [], prices: {} }),

        safeLoad(async () => {
            const store = await dataService.getDepositStore();
            return store.getDeposits();
        }, []),

        safeLoad(async () => {
            const store = await dataService.getLendingStore();
            const [entries, loans] = await Promise.all([
                store.getEntries(),
                store.getLoans()
            ]);
            return { entries, loans };
        }, { entries: [], loans: [] }),

        safeLoad(async () => {
            const store = await dataService.getStepUpStore();
            const [profiles, entries] = await Promise.all([
                store.getProfiles(),
                store.getEntries()
            ]);
            return { profiles, entries };
        }, { profiles: [], entries: [] })
    ]);

    return {
        incomeEntries: income,
        stockTransactions: stocks.transactions,
        stockPrices: stocks.prices,
        deposits,
        lendingEntries: lending.entries,
        loans: lending.loans,
        sipProfiles: stepup.profiles,
        sipEntries: stepup.entries
    };
}

/* ---------------- history bounds ---------------- */

/* Earliest dated record across every module, or "" when none exists. */
export function earliestRecordDate(source) {
    const dates = [];

    (source.incomeEntries || []).forEach((entry) => {
        dates.push(dateOf(entry.date));

        (entry.transactions || []).forEach((t) => dates.push(dateOf(t.date)));
    });

    (source.stockTransactions || []).forEach((t) => dates.push(dateOf(t.date)));
    (source.deposits || []).forEach((d) => dates.push(dateOf(d.startDate)));
    (source.lendingEntries || []).forEach((e) => dates.push(dateOf(e.date)));
    (source.loans || []).forEach((l) => dates.push(dateOf(l.date)));
    (source.sipEntries || []).forEach((e) => dates.push(dateOf(e.date)));

    const valid = dates.filter(Boolean).sort();

    return valid[0] || "";
}

/* Years from the first dated record to the current year (ascending). */
export function getAvailableYears(source, today = localTodayISO()) {
    const first = earliestRecordDate(source);
    const thisYear = Number(today.slice(0, 4));

    if (!first) return [];

    const years = [];

    for (let y = Number(first.slice(0, 4)); y <= thisYear; y += 1) {
        years.push(y);
    }

    return years;
}

/* ---------------- point-in-time calculation ---------------- */

/* Ledger summary for records dated from `from` (exclusive; "" = the start) to `asOf` (inclusive). */
function ledgerBetween(entries, from, asOf) {
    const inWindow = (d) => d <= asOf && (!from || d > from);

    const included = [];

    entries.forEach((entry) => {
        const entryDate = dateOf(entry.date);

        if (!entryDate) return;

        const incomeCounts = inWindow(entryDate);

        const transactions = (entry.transactions || []).filter((t) =>
            inWindow(dateOf(t.date) || entryDate)
        );

        if (!incomeCounts && !transactions.length) return;

        included.push({
            ...entry,
            income: incomeCounts ? entry.income : 0,
            investmentSale: incomeCounts ? entry.investmentSale : 0,
            transactions
        });
    });

    return calculateLedgerSummary(included);
}

function cashAt(entries, asOf) {
    return ledgerBetween(entries, "", asOf).cash;
}

function stocksAt(source, asOf, isCurrent) {
    const transactions = (source.stockTransactions || []).filter(
        (t) => dateOf(t.date) && dateOf(t.date) <= asOf
    );

    /* Past dates: last traded price only. Current period: today's prices. */
    const prices = isCurrent ? source.stockPrices || {} : {};

    const symbols = [...new Set(transactions.map((t) => t.symbol))];

    return symbols.reduce((sum, symbol) => {
        const { quantity } = replaySymbol(symbol, transactions);

        if (quantity <= 0) return sum;

        return sum + quantity * currentPrice(symbol, transactions, prices);
    }, 0);
}

function mutualFundsAt(source, asOf) {
    let total = 0;

    (source.sipProfiles || []).forEach((profile) => {
        let latest = null;

        (source.sipEntries || []).forEach((entry) => {
            const d = dateOf(entry.date);

            if (
                entry.profileId === profile.id &&
                d &&
                d <= asOf &&
                (!latest || d >= dateOf(latest.date))
            ) {
                latest = entry;
            }
        });

        if (latest) total += latest.portfolioValue || 0;
    });

    return total;
}

function depositsAt(source, asOf, isCurrent) {
    return (source.deposits || []).reduce((sum, row) => {
        const start = dateOf(row.startDate);

        if (!start || start > asOf) return sum;

        if (row.status === "closed") {
            const maturity = depositMetrics(
                { ...row, status: "active" },
                "9999-12-31"
            ).maturityDate;

            const closedOn = dateOf(row.closedDate) || maturity || start;

            if (isCurrent || closedOn <= asOf) return sum;
        }

        return sum + depositMetrics({ ...row, status: "active" }, asOf).currentValue;
    }, 0);
}

function lendingAt(source, asOf) {
    const byParty = {};

    (source.lendingEntries || []).forEach((entry) => {
        const d = dateOf(entry.date);

        if (!d || d > asOf) return;

        const amount = Number(entry.amount) || 0;
        const bucket = (byParty[entry.partyId] = byParty[entry.partyId] || {
            gave: 0,
            got: 0
        });

        if (entry.type === "gave") bucket.gave += amount;
        else bucket.got += amount;
    });

    let receivable = 0;
    let payable = 0;

    Object.values(byParty).forEach(({ gave, got }) => {
        const balance = gave - got;

        if (balance > 0) receivable += balance;
        else payable += -balance;
    });

    return { receivable, payable };
}

function loansAt(source, asOf, isCurrent) {
    return (source.loans || []).reduce((sum, loan) => {
        const start = dateOf(loan.date);

        if (!start || start > asOf) return sum;

        const paid = (loan.payments || []).reduce((total, payment) => {
            const d = dateOf(payment.date);

            /* An undated payment can't be placed in time: current period only. */
            if (d ? d > asOf : !isCurrent) return total;

            return total + (Number(payment.amount) || 0);
        }, 0);

        return sum + Math.max(0, (Number(loan.principal) || 0) - paid);
    }, 0);
}

/*
 * Net worth on one date, from the records that existed on that date.
 * `source` is optional: pass one from loadNetWorthSource() when
 * calculating many dates, otherwise it is loaded for you.
 */
export async function calculateNetWorthAtDate(date, source = null) {
    const data = source || (await loadNetWorthSource());

    return computeNetWorthAtDate(date, data);
}

export function computeNetWorthAtDate(date, source, today = localTodayISO()) {
    const asOf = dateOf(date);
    const isCurrent = asOf >= today;

    const lending = lendingAt(source, asOf);

    const assetItems = {
        cash: cashAt(source.incomeEntries || [], asOf),
        mutualFunds: mutualFundsAt(source, asOf),
        stocks: stocksAt(source, asOf, isCurrent),
        deposits: depositsAt(source, asOf, isCurrent),
        lendingReceivable: lending.receivable
    };

    const liabilityItems = {
        lendingPayable: lending.payable,
        loans: loansAt(source, asOf, isCurrent)
    };

    const assets = Object.values(assetItems).reduce((s, v) => s + v, 0);
    const liabilities = Object.values(liabilityItems).reduce((s, v) => s + v, 0);

    return {
        date: asOf,
        assets,
        liabilities,
        netWorth: assets - liabilities,
        assetItems,
        liabilityItems
    };
}

/* ---------------- series ---------------- */

/*
 * One point per month or year between startDate and endDate (ISO).
 * A period that ends before the first dated record is returned with
 * available: false and no numbers (never an invented value).
 * The period containing today is measured at today, not at its end.
 */
export function computeNetWorthEvolution(
    startDate,
    endDate,
    granularity,
    source,
    today = localTodayISO()
) {
    const first = earliestRecordDate(source);

    const start = dateOf(startDate);
    const end = dateOf(endDate) < today ? dateOf(endDate) : today;

    const points = [];

    const push = (periodStart, periodEnd, key, label, longLabel) => {
        if (periodStart > today) return;

        const asOf = periodEnd > today ? today : periodEnd;
        const available = Boolean(first) && first <= asOf;

        const prevEnd = previousDay(periodStart);

        const flows = ledgerBetween(source.incomeEntries || [], prevEnd, asOf);

        points.push({
            key,
            flows: {
                income: flows.income,
                expenses: flows.expense,
                invested: flows.contributions,
                sold: flows.assetSales,
                net: flows.cash
            },
            label,
            longLabel,
            date: asOf,
            isCurrent: asOf === today,
            available,
            ...(available
                ? computeNetWorthAtDate(asOf, source, today)
                : { assets: null, liabilities: null, netWorth: null })
        });
    };

    if (granularity === "yearly") {
        for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y += 1) {
            push(`${y}-01-01`, `${y}-12-31`, String(y), String(y), String(y));
        }
    } else {
        let y = Number(start.slice(0, 4));
        let m = Number(start.slice(5, 7)) - 1;

        const endY = Number(end.slice(0, 4));
        const endM = Number(end.slice(5, 7)) - 1;

        while (y < endY || (y === endY && m <= endM)) {
            push(
                `${y}-${pad(m + 1)}-01`,
                `${y}-${pad(m + 1)}-${pad(lastDayOfMonth(y, m))}`,
                `${y}-${pad(m + 1)}`,
                MONTHS[m],
                `${MONTHS_LONG[m]} ${y}`
            );

            m += 1;

            if (m > 11) {
                m = 0;
                y += 1;
            }
        }
    }

    return points;
}

export async function getNetWorthEvolution(startDate, endDate, granularity = "monthly", source = null) {
    const data = source || (await loadNetWorthSource());

    return computeNetWorthEvolution(startDate, endDate, granularity, data);
}

/* ---------------- summary (derived from the same series) ---------------- */

export function summarizeSeries(series) {
    const known = series.filter((p) => p.available);

    if (!known.length) return null;

    const firstPoint = known[0];
    const lastPoint = known[known.length - 1];

    const highest = known.reduce((a, b) => (b.netWorth > a.netWorth ? b : a));

    const change = lastPoint.netWorth - firstPoint.netWorth;

    /* Growth is only meaningful from a positive starting point. */
    const growth =
        known.length > 1 && firstPoint.netWorth > 0
            ? (change / firstPoint.netWorth) * 100
            : null;

    return {
        first: firstPoint,
        current: lastPoint,
        change,
        growth,
        highest,
        hasChange: known.length > 1
    };
}

/* ---------------- formatting ---------------- */

/* ₹8.20L, ₹1.25Cr, ₹45.0K — for the summary and chart axis. */
export function formatCompactINR(value, digits = 2) {
    const n = Number(value) || 0;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);

    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(digits)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(digits)}L`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(digits === 0 ? 0 : 1)}K`;

    return `${sign}₹${Math.round(abs)}`;
}
