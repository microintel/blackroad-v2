/* Income → Expand : full view of one breakdown panel (old expand.js) */
import { computeBreakdownTotals, barList, esc, formatMoney } from "./income-shared.js";

const PANELS = {
    expense: {
        title: "Expense by category",
        tone: "expense",
        pick: (t) => t.catTotals,
        palette: ["var(--inc-c-expense)"],
        empty: "No expenses logged yet"
    },
    "income-source": {
        title: "Income by source",
        tone: "income",
        pick: (t) => t.sourceTotals,
        palette: ["var(--inc-c-income)"],
        empty: "No income logged yet"
    },
    "income-category": {
        title: "Income by category",
        tone: "income",
        pick: (t) => t.incomeCatTotals,
        palette: ["var(--inc-c-income)"],
        empty: "No income logged yet"
    },
    "investment-returns": {
        title: "Investment returns",
        sub: "Dividends, interest and other portfolio earnings — kept separate from salary/genuine income.",
        tone: "returns",
        pick: (t) => t.invReturnTotals,
        palette: ["var(--inc-c-income)"],
        empty: "No investment returns logged yet"
    }
};

export function renderIncomeExpand(entries, panelKey = "expense") {
    const totals = computeBreakdownTotals(entries);
    const cfg = PANELS[panelKey] || PANELS.expense;
    const map = cfg.pick(totals);
    const sum = [...map.values()].reduce((a, b) => a + b, 0);

    const chips = Object.entries(PANELS).map(([key, p]) => `
        <button type="button"
            class="inc-expand-btn inc-expand-${p.tone}${key === panelKey ? " active" : ""}"
            aria-pressed="${key === panelKey}"
            data-expand-panel="${key}">${esc(p.title)}</button>`).join("");

    return `
        <div class="inc-expand-grid">${chips}</div>
        <section class="br-card" style="margin-top:20px;">
            <div class="br-card-header">
                <div>
                    <h3>${esc(cfg.title)}</h3>
                    <p class="br-muted">${esc(cfg.sub || `${map.size} item${map.size === 1 ? "" : "s"} · total ${formatMoney(sum)}`)}</p>
                </div>
            </div>
            ${barList(map, cfg.palette, cfg.empty)}
        </section>`;
}
