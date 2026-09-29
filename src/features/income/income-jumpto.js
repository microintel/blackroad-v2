/* Income → Jump to : year / month index (old jumpto.js) */
import { yearKeyOf, monthKeyOf, monthLabelOf, esc } from "./income-shared.js";

export function renderIncomeJumpTo(entries) {
    const years = new Map();

    entries.forEach((e) => {
        const y = yearKeyOf(e.date);
        const m = monthKeyOf(e.date);
        if (!y || !m) return;
        if (!years.has(y)) years.set(y, new Map());
        const months = years.get(y);
        months.set(m, (months.get(m) || 0) + 1);
    });

    if (!years.size) {
        return `<div class="br-card"><div class="br-empty-state">
            <h3>Nothing to jump to yet</h3>
            <p class="br-muted">Add an income entry and it will show up here.</p>
        </div></div>`;
    }

    return [...years.keys()].sort((a, b) => b.localeCompare(a)).map((year) => {
        const months = [...years.get(year).entries()].sort((a, b) => b[0].localeCompare(a[0]));
        return `
            <section class="br-card" style="margin-bottom:16px;">
                <div class="br-card-header"><h3>${esc(year)}</h3></div>
                <div class="br-jump-grid">${months.map(([key, count]) => `
                    <button type="button" class="br-jump-link" data-jump-month="${key}">
                        <span>${esc(monthLabelOf(key))}</span>
                        <span class="br-muted">${count} entr${count === 1 ? "y" : "ies"} →</span>
                    </button>`).join("")}
                </div>
            </section>`;
    }).join("");
}
