/*
 * Shared helpers for the Income sub-views
 * (Search, Compare, Expand, Jump-to).
 * Calculations reuse income-service.js so every view agrees
 * with the Ledger, Statement and Statistics.
 */
import {
    entryIncomeAmount,
    entryInvestmentSaleDisplayAmount,
    entryGenuineIncomeAmount,
    entryInvestmentReturnAmount,
    isInvestmentCategory,
    formatMoney
} from "./income-service.js";

export { formatMoney };

export function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function monthKeyOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function yearKeyOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;
    return String(d.getFullYear());
}

export function monthLabelOf(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });
}

/*
 * Totals per category / source, same rules as the old
 * expand.js and compare.js.
 */
export function computeBreakdownTotals(entries) {
    const catTotals = new Map();
    const sourceTotals = new Map();
    const incomeCatTotals = new Map();
    const invReturnTotals = new Map();

    entries.forEach((e) => {
        const genuine = entryGenuineIncomeAmount(e);
        if (genuine > 0) {
            const src = e.from || "Other";
            sourceTotals.set(src, (sourceTotals.get(src) || 0) + genuine);
            const cat = e.category || "Uncategorized";
            incomeCatTotals.set(cat, (incomeCatTotals.get(cat) || 0) + genuine);
        }

        const ret = entryInvestmentReturnAmount(e);
        if (ret > 0) {
            const key = e.category || "Investment return";
            invReturnTotals.set(key, (invReturnTotals.get(key) || 0) + ret);
        }

        (e.transactions || []).forEach((t) => {
            if (isInvestmentCategory(t.category)) return;
            const cat = t.category || "uncategorized";
            catTotals.set(cat, (catTotals.get(cat) || 0) + (Number(t.amount) || 0));
        });
    });

    return { catTotals, sourceTotals, incomeCatTotals, invReturnTotals };
}

export function periodTotals(entries, key, mode) {
    const keyOf = mode === "year" ? yearKeyOf : monthKeyOf;
    const subset = entries.filter((e) => keyOf(e.date) === key);

    let income = 0, expense = 0, investment = 0, investmentSale = 0, txnCount = 0;

    subset.forEach((e) => {
        income += entryIncomeAmount(e);
        expense += Number(e.expense) || 0;
        investment += Number(e.investment) || 0;
        investmentSale += entryInvestmentSaleDisplayAmount(e);
        (e.transactions || []).forEach((t) => {
            if (!isInvestmentCategory(t.category)) txnCount++;
        });
    });

    const b = computeBreakdownTotals(subset);
    const net = income - expense - investment + investmentSale;
    const rate = income > 0 ? (net / income) * 100 : (expense > 0 ? -100 : 0);
    const top = (m) => [...m.entries()].sort((a, c) => c[1] - a[1])[0] || null;

    return {
        income, expense, investment, investmentSale, net, rate, txnCount,
        categoryTotals: b.catTotals,
        sourceTotals: b.sourceTotals,
        incomeCategoryTotals: b.incomeCatTotals,
        topCategory: top(b.catTotals),
        topSource: top(b.sourceTotals)
    };
}

/* Horizontal bar list used by Expand and Compare */
export function barList(map, palette, emptyText) {
    if (!map.size) {
        return `<div class="br-empty-state">${esc(emptyText)}</div>`;
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return `<div class="br-bars">${rows.map(([name, val], i) => `
        <div class="br-bar-row">
            <div class="br-bar-name">${esc(name)}</div>
            <div class="br-bar-track">
                <span class="br-bar-fill" style="width:${(val / max) * 100}%;background:${palette[i % palette.length]}"></span>
            </div>
            <div class="br-bar-value">${formatMoney(val)}</div>
        </div>`).join("")}</div>`;
}
