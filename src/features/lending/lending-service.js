/* =========================================================
   LENDING — CALCULATIONS
   Ported unchanged from the old LendLedger shared.js / loans.js
   so balances, EMI schedules and statuses match the old app.

   balance = totalGave - totalGot
     balance > 0  -> they owe you  ("You'll get")
     balance < 0  -> you owe them  ("You'll give")
   ========================================================= */

import { isUSD, usd } from "../../services/currency.js";

export function computeBalance(entries) {
    let totalGave = 0;
    let totalGot = 0;

    (entries || []).forEach((e) => {
        if (e.type === "gave") totalGave += Number(e.amount) || 0;
        else totalGot += Number(e.amount) || 0;
    });

    return { totalGave, totalGot, balance: totalGave - totalGot };
}

/* People with their computed balances + overall totals. */
export function summarizePeople(parties, entries) {
    let totalReceivable = 0;
    let totalPayable = 0;

    const rows = parties.map((party) => {
        const own = entries.filter((e) => e.partyId === party.id);
        const { balance } = computeBalance(own);

        if (balance > 0) totalReceivable += balance;
        else totalPayable += -balance;

        return { party, balance, entryCount: own.length };
    });

    return {
        rows,
        totalReceivable,
        totalPayable,
        net: totalReceivable - totalPayable
    };
}

export function fmtMoney(n) {
    const num = Number(n) || 0;

    if (isUSD()) return usd(num);

    return (
        "₹" +
        num.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    );
}

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function monthLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return "Undated";

    return d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });
}

export function yearOf(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return "Undated";

    return String(d.getFullYear());
}

export function addMonths(dateStr, months) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;

    d.setMonth(d.getMonth() + Number(months || 0));

    return d.toISOString().slice(0, 10);
}

/* Whole days from today until dateStr. Negative = in the past. */
export function daysUntil(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.round((d - today) / 86400000);
}

export function uid() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7)
    );
}

/* ---------------- Loans (bank loans / EMI) ---------------- */

export const LOAN_STATUS_LABEL = {
    open: "Open",
    "due-soon": "Due soon",
    overdue: "Overdue",
    settled: "Settled"
};

export const LOAN_STATUS_RANK = {
    overdue: 0,
    "due-soon": 1,
    open: 2,
    settled: 3
};

export function paidSoFar(loan) {
    return (loan.payments || []).reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
    );
}

export function outstanding(loan) {
    return Math.max(
        0,
        (Number(loan.principal) || 0) - paidSoFar(loan)
    );
}

/*
 * How many EMI installments the rupees paid so far cover.
 * Based on cumulative amount / EMI, not the number of payment
 * records (same rule as the old app).
 */
export function installmentsCovered(loan) {
    const emi = Number(loan.emiAmount) || 0;

    if (emi <= 0) return (loan.payments || []).length;

    return Math.floor(paidSoFar(loan) / emi + 1e-9);
}

export function nextDue(loan) {
    if (outstanding(loan) <= 0) return null;

    return addMonths(loan.date, installmentsCovered(loan));
}

export function loanStatus(loan) {
    if (outstanding(loan) <= 0) return "settled";

    const due = nextDue(loan);
    if (!due) return "open";

    const days = daysUntil(due);

    if (days < 0) return "overdue";
    if (days <= 7) return "due-soon";

    return "open";
}

export function summarizeLoans(loans) {
    let totalOutstanding = 0;
    let monthlyEmi = 0;
    let activeCount = 0;
    let next = null;

    loans.forEach((loan) => {
        const out = outstanding(loan);

        totalOutstanding += out;

        if (out <= 0) return;

        activeCount += 1;
        monthlyEmi += Number(loan.emiAmount) || 0;

        const due = nextDue(loan);

        if (due && (!next || due < next.date)) {
            next = { date: due, label: loan.lender || "EMI" };
        }
    });

    return { totalOutstanding, monthlyEmi, activeCount, next };
}
