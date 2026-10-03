/* =========================================================
   FIXED DEPOSITS — CALCULATIONS
   Ported unchanged from the old deposits-store.js so maturity
   and interest figures match the old app exactly.
   ========================================================= */

import { isUSD, usd } from "../../services/currency.js";

const COMPOUNDS_PER_YEAR = {
    quarterly: 4,
    monthly: 12,
    yearly: 1,
    simple: 0
};

export const STATUS_LABEL = {
    active: "Active",
    "maturing-soon": "Maturing soon",
    matured: "Matured",
    closed: "Closed"
};

export const STATUS_RANK = {
    matured: 0,
    "maturing-soon": 1,
    active: 2,
    closed: 3
};

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function addMonthsISO(dateStr, months) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;
    d.setMonth(d.getMonth() + Number(months || 0));
    return d.toISOString().slice(0, 10);
}

function yearsBetween(fromISO, toISO) {
    const a = new Date(fromISO + "T00:00:00");
    const b = new Date(toISO + "T00:00:00");
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, (b - a) / (365.25 * 86400000));
}

/*
 * Compound (or simple) interest growth of `principal` over `years`
 * at `ratePct` % p.a., per the record's compounding frequency.
 */
export function growAmount(principal, ratePct, years, compounding) {
    const P = Number(principal) || 0;
    const r = Number(ratePct) || 0;

    if (P <= 0 || years <= 0) return P;

    const n = COMPOUNDS_PER_YEAR[compounding] ?? 4;

    if (n === 0) return P * (1 + (r * years) / 100);

    return P * Math.pow(1 + r / (100 * n), n * years);
}

/*
 * Derived figures for one FD, as of today (or a given ISO date).
 */
export function computeMetrics(row, asOfISO) {
    const asOf = asOfISO || todayISO();
    const principal = Number(row.principal) || 0;
    const tenureMonths = Number(row.tenureMonths) || 0;
    const compounding = row.compounding || "quarterly";

    const maturityDate = row.startDate
        ? addMonthsISO(row.startDate, tenureMonths)
        : null;

    const tenureYears = tenureMonths / 12;

    const maturityAmount = maturityDate
        ? growAmount(principal, row.interestRate, tenureYears, compounding)
        : principal;

    let currentValue;
    let daysToMaturity = null;
    let derivedStatus;

    if (row.status === "closed") {
        currentValue = Number(row.closedAmount) || principal;
        derivedStatus = "closed";
    } else if (maturityDate && asOf >= maturityDate) {
        currentValue = maturityAmount;
        derivedStatus = "matured";
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

        if (maturityDate) {
            const a = new Date(asOf + "T00:00:00");
            const b = new Date(maturityDate + "T00:00:00");
            daysToMaturity = Math.round((b - a) / 86400000);
        }

        derivedStatus =
            daysToMaturity !== null && daysToMaturity <= 30
                ? "maturing-soon"
                : "active";
    }

    return {
        maturityDate,
        maturityAmount,
        currentValue,
        interestEarned: currentValue - principal,
        daysToMaturity,
        status: derivedStatus
    };
}

export function summarize(rows, asOfISO) {
    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalMaturityValue = 0;
    let activeCount = 0;
    let nextMaturity = null;

    rows.forEach((r) => {
        if (r.status === "closed") return;

        const m = computeMetrics(r, asOfISO);

        totalInvested += Number(r.principal) || 0;
        totalCurrentValue += m.currentValue;
        totalMaturityValue += m.maturityAmount;
        activeCount += 1;

        if (
            m.maturityDate &&
            (!nextMaturity || m.maturityDate < nextMaturity.date)
        ) {
            nextMaturity = {
                date: m.maturityDate,
                bankName: r.bankName || "Fixed Deposit"
            };
        }
    });

    return {
        count: rows.length,
        activeCount,
        totalInvested,
        totalCurrentValue,
        totalMaturityValue,
        nextMaturity
    };
}

export function daysUntil(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
}

export function formatINR(n) {
    if (isUSD()) return usd(n, { whole: true });
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(Math.round(n));
    return sign + "₹" + abs.toLocaleString("en-IN");
}
