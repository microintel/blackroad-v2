import { loadReportSources, getSnapshot } from "./rover-data.js";
import {
    entryIncomeAmount,
    entryInvestmentSaleDisplayAmount,
    isInvestmentCategory
} from "../income/income-service.js";
import { transactionsToCSV, getSymbolName } from "../stocks/stocks-service.js";
import { replaySymbol, currentPrice } from "../dashboard/dashboard-service.js";
import { computeMetrics, STATUS_LABEL } from "../deposits/deposits-service.js";
import {
    summarizePeople, computeBalance, paidSoFar, outstanding, nextDue, loanStatus, LOAN_STATUS_LABEL
} from "../lending/lending-service.js";
import { startReportProgress } from "../../components/report-progress.js";
import { currentUser, isGuestSync } from "../../services/auth.js";
import { EMPTY_MANUAL, loadManual, loadLive, calculate, exportPDF as exportAccountingPDF } from "../accounting/accounting-service.js";
import { loadBankIndex, findSlug } from "../../services/bank-logos.js";

/*
 * Rover reports: files Rover can hand you (CSV, and the PDF account statement).
 *
 * Rover only reads your data; nothing is written. Figures use the same
 * functions as the pages they come from, and amounts in CSV files are plain
 * numbers so they open cleanly in Excel / Google Sheets.
 *
 * To add a report: add one entry to REPORTS (id, label, topics, build).
 * `build()` returns { name, rows } for a CSV, or runs its own download.
 */

/* ---------------- download helpers ---------------- */

const today = () => new Date().toISOString().slice(0, 10);

const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function saveFile(name, text, type = "text/csv;charset=utf-8") {
    // BOM so Excel reads ₹ and other characters correctly.
    const blob = new Blob(["﻿", text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const toCSV = (rows) => rows.map((r) => r.map(cell).join(",")).join("\r\n");
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ---------------- income / account statement ---------------- */

/* Same flattening as Income -> Search: every income row and every expense/investment row. */
function ledgerItems(entries) {
    const items = [];

    entries.forEach((e) => {
        const from = e.from || "";
        const inc = entryIncomeAmount(e);
        const sale = entryInvestmentSaleDisplayAmount(e);

        if (inc > 0) items.push({ kind: "income", desc: from || "Income", category: e.category || "", amount: inc, date: e.date || "" });
        if (sale > 0) items.push({ kind: "investment-sale", desc: from || "Investment sale", category: e.category || "", amount: sale, date: e.date || "" });

        (e.transactions || []).forEach((t) => {
            const inv = isInvestmentCategory(t.category);

            items.push({
                kind: inv ? "investment" : "expense",
                desc: t.description || (inv ? "Investment" : "Expense"),
                category: t.category || "",
                amount: Number(t.amount) || 0,
                date: t.date || e.date || ""
            });
        });
    });

    return items;
}

const isCredit = (k) => k === "income" || k === "investment-sale";

const byDateOldest = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

async function userName() {
    try {
        return isGuestSync() ? "Guest User" : ((await currentUser()) || {}).name || "";
    } catch {
        return "";
    }
}

/* ---------------- builders ---------------- */

const incomeCSV = async () => {
    const { entries } = await loadReportSources();
    const items = ledgerItems(entries).sort((a, b) => byDateOldest(b, a));

    if (!items.length) return null;

    return {
        name: "income-expenses",
        rows: [["Date", "Type", "Description", "Category", "Amount"],
            ...items.map((i) => [i.date, i.kind, i.desc, i.category, round2(i.amount)])]
    };
};

const statementCSV = async () => {
    const { entries } = await loadReportSources();
    const items = ledgerItems(entries).sort(byDateOldest);

    if (!items.length) return null;

    let balance = 0;
    const rows = items.map((i) => {
        const credit = isCredit(i.kind);

        balance += credit ? i.amount : -i.amount;

        return [i.date, i.desc, i.category, i.kind, credit ? "" : round2(i.amount), credit ? round2(i.amount) : "", round2(balance)];
    });

    return {
        name: "account-statement",
        rows: [["Date", "Particulars", "Category", "Type", "Debit", "Credit", "Balance"], ...rows]
    };
};

async function statementPDF(ctx = {}) {
    const { entries } = await loadReportSources();
    const items = ledgerItems(entries).sort(byDateOldest);

    if (!items.length) return null;

    const progress = (ctx.progress || startReportProgress)({
        title: "Creating your statement of account",
        steps: ["Collecting entries", "Building the ledger", "Totalling debits and credits", "Finalizing PDF"],
        doneTitle: "PDF downloaded",
        doneText: "Your statement of account has been saved."
    });

    try {
        const { exportSearchPDF } = await import("../income/income-search-pdf.js");

        await exportSearchPDF(items, {}, { userName: await userName(), beforeSave: () => progress.ready() });
        progress.complete();
    } catch (error) {
        console.error(error);
        progress.fail("The PDF could not be created - check your connection and try again.");
        throw error;
    }

    return { done: true };
}

const stocksTransactionsCSV = async () => {
    const { stocks } = await loadReportSources();

    if (!stocks.transactions.length) return null;

    return { name: "stock-transactions", text: transactionsToCSV(stocks.transactions) };
};

const stocksHoldingsCSV = async () => {
    const { stocks } = await loadReportSources();
    const { transactions, prices } = stocks;

    const rows = [...new Set(transactions.map((t) => t.symbol))]
        .map((symbol) => {
            const { quantity, investedValue } = replaySymbol(symbol, transactions);
            const price = currentPrice(symbol, transactions, prices);
            const value = quantity * price;

            return {
                symbol, quantity, investedValue, price, value,
                name: getSymbolName(symbol, transactions)
            };
        })
        .filter((h) => h.quantity > 0)
        .sort((a, b) => b.value - a.value);

    if (!rows.length) return null;

    return {
        name: "stock-holdings",
        rows: [["Symbol", "Name", "Quantity", "Avg Cost", "Invested", "Current Price", "Current Value", "P&L", "P&L %"],
            ...rows.map((h) => [
                h.symbol, h.name, h.quantity, round2(h.investedValue / h.quantity), round2(h.investedValue),
                round2(h.price), round2(h.value), round2(h.value - h.investedValue),
                h.investedValue > 0 ? round2(((h.value - h.investedValue) / h.investedValue) * 100) : 0
            ])]
    };
};

const depositsCSV = async () => {
    const { deposits } = await loadReportSources();

    if (!deposits.length) return null;

    return {
        name: "fixed-deposits",
        rows: [["Bank / FD", "Principal", "Interest Rate %", "Start Date", "Tenure (months)", "Compounding", "Maturity Date", "Maturity Amount", "Current Value", "Interest Earned", "Status"],
            ...deposits.map((r) => {
                const m = computeMetrics(r);

                return [
                    r.bankName || "Fixed deposit", round2(r.principal), Number(r.interestRate) || 0, r.startDate || "",
                    r.tenureMonths || "", r.compounding || "", m.maturityDate || "", round2(m.maturityAmount),
                    round2(m.currentValue), round2(m.interestEarned), STATUS_LABEL[m.status] || m.status
                ];
            })]
    };
};

const lendingCSV = async () => {
    const { lending } = await loadReportSources();

    if (!lending.people.length) return null;

    const { rows } = summarizePeople(lending.people, lending.entries);

    return {
        name: "lending-people",
        rows: [["Person", "Phone / Note", "You Gave", "You Got", "Balance", "Position"],
            ...rows.map(({ party, balance }) => {
                const { totalGave, totalGot } = computeBalance(lending.entries.filter((e) => e.partyId === party.id));

                return [
                    party.name || "Unnamed", party.phone || party.note || "", round2(totalGave), round2(totalGot), round2(Math.abs(balance)),
                    balance > 0 ? "They owe you" : balance < 0 ? "You owe them" : "Settled"
                ];
            })]
    };
};

const loansCSV = async () => {
    const { lending } = await loadReportSources();

    if (!lending.loans.length) return null;

    return {
        name: "loans",
        rows: [["Lender", "Principal", "EMI", "Tenure (months)", "Interest Rate %", "Start Date", "Paid So Far", "Outstanding", "Next Due", "Status"],
            ...lending.loans.map((l) => [
                l.lender || "Loan", round2(l.principal), round2(l.emiAmount), l.tenureMonths || "", Number(l.interestRate) || 0, l.date || "",
                round2(paidSoFar(l)), round2(outstanding(l)), nextDue(l) || "", LOAN_STATUS_LABEL[loanStatus(l)] || loanStatus(l)
            ])]
    };
};

const netWorthCSV = async () => {
    const d = await getSnapshot();

    const rows = [
        ["Net worth", d.netWorth], ["Total assets", d.totalAssets], ["Total liabilities", d.totalLiabilities],
        ["Cash & bank", d.income?.cash], ["Stocks (current value)", d.stocks?.currentValue],
        ["Mutual funds (current value)", d.mutualFunds?.currentValue], ["Fixed deposits (current value)", d.deposits?.totalCurrentValue],
        ["Loans outstanding", d.lending?.loansOutstanding], ["Money owed to people", d.lending?.peoplePayable],
        ["Money people owe you", d.lending?.peopleReceivable]
    ].map(([k, v]) => [k, round2(v)]);

    return { name: "net-worth-summary", rows: [["Item", "Amount"], ...rows] };
};

/* ---------------- accounting ---------------- */

/* The Accounting page's saved balances plus the live Mutual Fund and Lending figures (same as that page). */
async function accountingSource() {
    const [saved, live] = await Promise.all([loadManual().catch(() => null), loadLive()]);
    const manual = saved || EMPTY_MANUAL;
    const result = calculate(manual, live);
    return { saved, manual, result, empty: !saved && !result.assets && !result.liabilities };
}

const accountingCSV = async () => {
    const { manual, result, empty } = await accountingSource();
    if (empty) return null;

    const banks = (manual.banks || [])
        .map((amount, i) => [`Bank: ${(manual.bankNames || [])[i] || "Bank " + (i + 1)}`, round2(amount)])
        .filter(([, amount]) => amount);

    return {
        name: "accounting-summary",
        rows: [
            ["Item", "Amount"],
            ...result.rows.map((r) => [r.label, round2(r.value)]),
            ...banks,
            ["Total assets", round2(result.assets)],
            ["Total liabilities", round2(result.liabilities)],
            ["Net worth", round2(result.net)]
        ]
    };
};

/* The same PDF as Accounting -> Export PDF. */
async function accountingPDF(ctx = {}) {
    const { manual, result, empty } = await accountingSource();
    if (empty) return null;

    const progress = (ctx.progress || startReportProgress)({
        title: "Creating your accounting report",
        steps: ["Collecting your balances", "Calculating net worth", "Laying out the report", "Finalizing PDF"],
        doneTitle: "PDF downloaded",
        doneText: "Your accounting report has been saved."
    });

    try {
        let index = {};
        try { index = await loadBankIndex(); } catch { /* logos are optional */ }

        await exportAccountingPDF(result, {
            beforeSave: () => progress.ready(),
            userName: await userName(),
            banks: (manual.banks || []).map((amount, i) => {
                const name = (manual.bankNames || [])[i] || "";
                return { amount, name, slug: findSlug(name, index) };
            })
        });
        progress.complete();
    } catch (error) {
        console.error(error);
        progress.fail("The PDF could not be created - check your connection and try again.");
        throw error;
    }

    return { done: true };
}

/* ---------------- catalogue ---------------- */

/* topics: the words that point at this report (matched by Rover's engine). */
export const REPORTS = [
    { id: "statement-pdf", label: "Account statement (PDF)", about: "Every income and expense entry as a ledger", topics: ["statement", "account", "ledger", "passbook"], run: statementPDF },
    { id: "statement-csv", label: "Account statement (CSV)", about: "The same ledger, opens in Excel", topics: ["statement", "account", "ledger", "passbook"], build: statementCSV },
    { id: "income-csv", label: "Income & expenses (CSV)", about: "Income and spending, month by month", topics: ["income", "expense", "spending", "cash"], build: incomeCSV },
    { id: "stocks-txn-csv", label: "Stock transactions (CSV)", about: "Every buy and sell you have entered", topics: ["stock", "share", "equity", "trade", "holding", "pnl"], build: stocksTransactionsCSV },
    { id: "stocks-holdings-csv", label: "Stock holdings (CSV)", about: "What you hold now, with profit or loss", topics: ["stock", "share", "equity", "trade", "holding", "pnl"], build: stocksHoldingsCSV },
    { id: "deposits-csv", label: "Fixed deposits (CSV)", about: "Each deposit, rate and maturity date", topics: ["fd", "deposit"], build: depositsCSV },
    { id: "lending-csv", label: "Lending, people (CSV)", about: "Who owes you and who you owe", topics: ["lend", "lent", "loan", "owe", "borrow"], build: lendingCSV },
    { id: "loans-csv", label: "Loans & EMI (CSV)", about: "Each loan, EMI and what is left to pay", topics: ["loan", "emi", "lend", "borrow"], build: loansCSV },
    { id: "networth-csv", label: "Net worth summary (CSV)", about: "Net worth, assets and liabilities in one file", topics: ["net worth", "networth", "summary", "overview", "wealth"], build: netWorthCSV },
    { id: "accounting-pdf", label: "Accounting report (PDF)", about: "Your Accounting page as a printable statement", topics: ["accounting", "balance sheet"], run: accountingPDF },
    { id: "accounting-csv", label: "Accounting summary (CSV)", about: "Your Accounting balances, opens in Excel", topics: ["accounting", "balance sheet"], build: accountingCSV }
];

const REPORT_BY_ID = new Map(REPORTS.map((r) => [r.id, r]));

/*
 * Runs one report and downloads it.
 * Resolves to "ok", or "empty" when there is nothing to put in the file.
 */
export async function runReport(id, ctx = {}) {
    const report = REPORT_BY_ID.get(id);

    if (!report) throw new Error("Unknown report: " + id);

    // The PDF runs its own progress; CSV files get a short one here (only when Rover supplies the card).
    const progress = ctx.progress && !report.run
        ? ctx.progress({
            title: `Preparing ${report.label}`,
            steps: ["Reading your records", "Putting the rows together", "Creating the file"],
            doneTitle: "Downloaded",
            doneText: `${report.label} has been saved.`,
            minDuration: 2000
        })
        : null;

    try {
        const result = report.run ? await report.run(ctx) : await report.build();

        if (!result) { progress?.close(); return "empty"; }
        if (result.done) return "ok";

        const text = result.text ?? toCSV(result.rows);

        await progress?.ready();
        saveFile(`blackroad-${result.name}-${today()}.csv`, text);
        progress?.complete();

        return "ok";
    } catch (error) {
        progress?.fail("The file could not be created. Try again.");
        throw error;
    }
}
