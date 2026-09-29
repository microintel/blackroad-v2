/* Income → Expand : full view of one breakdown panel (old expand.js) */
import { computeBreakdownTotals, barList, esc, formatMoney } from "./income-shared.js";

const PANELS = {
    expense: {
        title: "Expense by category",
        pick: (t) => t.catTotals,
        palette: ["#b5583f", "#6f7bb3", "#4f8f6b", "#c99a4f", "#8a6bb0", "#5c9bc9", "#c96c8c"],
        empty: "No expenses logged yet"
    },
    "income-source": {
        title: "Income by source",
        pick: (t) => t.sourceTotals,
        palette: ["#3ecf8e"],
        empty: "No income logged yet"
    },
    "income-category": {
        title: "Income by category",
        pick: (t) => t.incomeCatTotals,
        palette: ["#3ecf8e", "#5b9dff", "#e3ac54", "#7fd0d9", "#c07fe0", "#8fbf5e", "#e08fa8"],
        empty: "No income logged yet"
    },
    "investment-returns": {
        title: "Investment returns",
        sub: "Dividends, interest and other portfolio earnings — kept separate from salary/genuine income.",
        pick: (t) => t.invReturnTotals,
        palette: ["#5b9dff"],
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
            class="br-chip ${key === panelKey ? "active" : ""}"
            data-expand-panel="${key}">${esc(p.title)}</button>`).join("");

    return `
        <div class="br-chip-row">${chips}</div>
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
