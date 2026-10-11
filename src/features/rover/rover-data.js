import { getDashboardData, replaySymbol, currentPrice } from "../dashboard/dashboard-service.js";
import { dataService } from "../../data/data-service.js";
import { entryIncomeAmount, entryInvestmentSaleDisplayAmount, isInvestmentCategory, calculateLedgerSummary } from "../income/income-service.js";
import { getSymbolName } from "../stocks/stocks-service.js";
import { loadDues } from "../notifications/notifications-service.js";
import { computeMetrics } from "../deposits/deposits-service.js";
import { summarizePeople, outstanding as loanOutstanding, nextDue as loanNextDue, loanStatus } from "../lending/lending-service.js";

/*
 * Rover data adapter (read-only).
 *
 * The only file in the Rover module that touches the rest of the app.
 * It reuses the Dashboard service, so every figure Rover quotes is the
 * same number the Dashboard shows. Nothing is written anywhere.
 */

async function loadHoldings() {
    try {
        const store = await dataService.getStocksStore();
        const transactions = (await store.getState("transactions")) || [];
        const prices = (await store.getState("prices")) || {};

        return [...new Set(transactions.map((t) => t.symbol))]
            .map((symbol) => {
                const { quantity, investedValue } = replaySymbol(symbol, transactions);
                const value = quantity * currentPrice(symbol, transactions, prices);

                return {
                    symbol,
                    name: getSymbolName(symbol, transactions) || symbol,
                    quantity,
                    ltp: currentPrice(symbol, transactions, prices),
                    avg: quantity > 0 ? investedValue / quantity : 0,
                    invested: investedValue,
                    value,
                    pnl: value - investedValue,
                    pnlPct: investedValue > 0 ? ((value - investedValue) / investedValue) * 100 : 0
                };
            })
            .filter((h) => h.quantity > 0)
            .sort((a, b) => b.value - a.value);
    } catch (error) {
        console.error("Rover: holdings unavailable:", error);
        return [];
    }
}

/*
 * Extra detail for Rover's charts and tables (read-only): the last months of income / spending,
 * where the money went, income sources, the biggest expenses, each fixed deposit and each person.
 * Any failure just returns {} so the plain answers keep working.
 */
async function loadExtras() {
    try {
        const { entries, deposits, lending } = await loadReportSources();
        const incomeList = [];
        const byMonth = {};
        const cats = {};
        const catsMonth = {};
        const sources = {};
        const expenses = [];
        const thisMonth = new Date().toISOString().slice(0, 7);
        const todayKey = new Date().toISOString().slice(0, 10);
        const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
        const span = { today: { income: 0, expense: 0 }, week: { income: 0, expense: 0 } };
        const slot = (key) => (byMonth[key] ||= { key, income: 0, expense: 0, investment: 0 });

        entries.forEach((e) => {
            const date = e.date || "";
            const inc = entryIncomeAmount(e) + entryInvestmentSaleDisplayAmount(e);

            if (inc > 0 && date) {
                if (date === todayKey) span.today.income += inc;
                if (date >= weekStart && date <= todayKey) span.week.income += inc;
                slot(date.slice(0, 7)).income += inc;
                const name = (e.from || e.category || "Other").trim() || "Other";
                sources[name] = (sources[name] || 0) + inc;
                incomeList.push({ source: name, category: (e.category || "").trim(), amount: inc, date });
            }

            (e.transactions || []).forEach((t) => {
                const amount = Number(t.amount) || 0;
                const d = t.date || date;
                if (!amount || !d) return;

                if (isInvestmentCategory(t.category)) {
                    slot(d.slice(0, 7)).investment += amount;
                    return;
                }

                slot(d.slice(0, 7)).expense += amount;
                if (d === todayKey) span.today.expense += amount;
                if (d >= weekStart && d <= todayKey) span.week.expense += amount;
                const cat = (t.category || "Other").trim() || "Other";
                cats[cat] = (cats[cat] || 0) + amount;
                if (d.slice(0, 7) === thisMonth) catsMonth[cat] = (catsMonth[cat] || 0) + amount;
                expenses.push({ desc: t.description || cat, category: cat, amount, date: d });
            });
        });

        const list = (o) => Object.entries(o).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);

        const fds = deposits
            .filter((r) => r.status !== "closed")
            .map((r) => {
                const m = computeMetrics(r);
                return {
                    name: r.bankName || "Fixed deposit", principal: Number(r.principal) || 0, rate: Number(r.interestRate) || 0,
                    value: m.currentValue, maturityDate: m.maturityDate, days: m.daysToMaturity
                };
            })
            .sort((a, b) => (a.maturityDate || "9999").localeCompare(b.maturityDate || "9999"));

        const people = summarizePeople(lending.people, lending.entries).rows
            .filter((r) => Math.abs(r.balance) > 0.005)
            .map((r) => ({ name: r.party.name || r.party.fullName || "Person", balance: r.balance }))
            .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        let ledger = null;
        try { ledger = calculateLedgerSummary(entries); } catch (error) { console.error("Rover: ledger summary unavailable:", error); }

        return {
            ledger,
            spanTotals: span,
            recentExpenses: [...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount).slice(0, 6),
            monthly: Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key)),
            categories: list(cats),
            categoriesMonth: list(catsMonth),
            incomeSources: list(sources),
            allExpenses: [...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount),
            allIncome: incomeList.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount),
            loans: (lending.loans || []).map((l) => ({
                lender: l.lender || "Loan", principal: Number(l.principal) || 0, emi: Number(l.emiAmount) || 0,
                outstanding: loanOutstanding(l), nextDue: loanNextDue(l) || "", status: loanStatus(l), date: l.date || ""
            })).sort((a, b) => b.outstanding - a.outstanding),
            topExpenses: expenses.sort((a, b) => b.amount - a.amount).slice(0, 8),
            fds,
            people
        };
    } catch (error) {
        console.error("Rover: extra detail unavailable:", error);
        return {};
    }
}

/* One consistent picture of the user's money, taken at question time. */
export async function getSnapshot() {
    const [data, holdings, extras, dues] = await Promise.all([getDashboardData(), loadHoldings(), loadExtras(), loadReminders()]);

    return { ...data, holdings, ...extras, dues };
}

/* Upcoming EMIs, money due back, and FD maturities (the same list the Notifications page shows). */
async function loadReminders() {
    try { return await loadDues(); } catch (error) { console.error("Rover: reminders unavailable:", error); return []; }
}

/*
 * Raw records for Rover's report downloads (read-only). Each source is
 * loaded on its own, so one empty or broken module never blocks the rest.
 */
export async function loadReportSources() {
    const safe = async (fn, fallback) => {
        try { return (await fn()) ?? fallback; } catch (error) { console.error("Rover: report source unavailable:", error); return fallback; }
    };

    const [entries, stocks, deposits, lending] = await Promise.all([
        safe(async () => (await dataService.getIncomeStore()).getEntries(), []),
        safe(async () => {
            const store = await dataService.getStocksStore();
            return {
                transactions: (await store.getState("transactions")) || [],
                prices: (await store.getState("prices")) || {}
            };
        }, { transactions: [], prices: {} }),
        safe(async () => (await dataService.getDepositStore()).getDeposits(), []),
        safe(async () => {
            const store = await dataService.getLendingStore();
            const [people, lendEntries, loans] = await Promise.all([store.getPeople(), store.getEntries(), store.getLoans()]);
            return { people, entries: lendEntries, loans };
        }, { people: [], entries: [], loans: [] })
    ]);

    return { entries, stocks, deposits, lending };
}
