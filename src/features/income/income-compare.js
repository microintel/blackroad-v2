/* Income → Compare : two months or two years side by side (old compare.js) */
import {
    periodTotals, monthKeyOf, yearKeyOf, monthLabelOf, formatMoney, esc
} from "./income-shared.js";

const state = { mode: "month", a: "", b: "" };

const label = (key, mode) => (mode === "year" ? key : monthLabelOf(key));

function delta(curr, prev, invert) {
    let text, cls;
    if (!prev) {
        text = curr > 0 ? "New" : "—";
        cls = "flat";
    } else {
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        if (Math.abs(pct) < 0.5) {
            text = "flat";
            cls = "flat";
        } else {
            text = (pct > 0 ? "+" : "") + Math.round(pct) + "%";
            cls = pct > 0 ? "up" : "down";
        }
    }
    if (invert && cls !== "flat") cls = cls === "up" ? "down" : "up";
    return `<span class="br-delta ${cls}">${text}</span>`;
}

function availableKeys(entries, mode) {
    const keyOf = mode === "year" ? yearKeyOf : monthKeyOf;
    const keys = new Set();
    entries.forEach((e) => {
        const k = keyOf(e.date);
        if (k) keys.add(k);
    });
    return [...keys].sort().reverse();
}

function periodCard(title, t) {
    const pair = (p) => (p ? `${esc(p[0])} (${formatMoney(p[1])})` : "—");
    return `
        <div class="br-card">
            <h3>${esc(title)}</h3>
            <div class="br-kv"><span>Income</span><strong>${formatMoney(t.income)}</strong></div>
            <div class="br-kv"><span>Expenses</span><strong>${formatMoney(t.expense)}</strong></div>
            <div class="br-kv"><span>Net</span>
                <strong class="${t.net >= 0 ? "br-pos" : "br-neg"}">${formatMoney(t.net)}</strong></div>
            <div class="br-kv"><span>Savings rate</span>
                <strong>${t.income > 0 || t.expense > 0 ? Math.round(t.rate) + "%" : "—"}</strong></div>
            <div class="br-kv"><span>Transactions</span><strong>${t.txnCount}</strong></div>
            <div class="br-kv"><span>Top category</span><strong>${pair(t.topCategory)}</strong></div>
            <div class="br-kv"><span>Top source</span><strong>${pair(t.topSource)}</strong></div>
        </div>`;
}

function categoryCompare(title, ma, mb, emptyText) {
    const cats = new Set([...ma.keys(), ...mb.keys()]);
    if (!cats.size) {
        return `<section class="br-card"><h3>${title}</h3><div class="br-empty-state">${emptyText}</div></section>`;
    }
    const rows = [...cats]
        .map((c) => ({ c, a: ma.get(c) || 0, b: mb.get(c) || 0 }))
        .sort((x, y) => y.a + y.b - (x.a + x.b))
        .slice(0, 8);
    const max = Math.max(...rows.map((r) => Math.max(r.a, r.b)), 1);
    return `
        <section class="br-card">
            <h3>${title}</h3>
            ${rows.map((r) => `
                <div class="br-cmp-cat">
                    <div class="br-bar-name">${esc(r.c)}</div>
                    <div class="br-cmp-lines">
                        <div class="br-bar-track"><span class="br-bar-fill" style="width:${(r.a / max) * 100}%;background:#5b9dff"></span></div>
                        <span class="br-bar-value">${formatMoney(r.a)}</span>
                        <div class="br-bar-track"><span class="br-bar-fill" style="width:${(r.b / max) * 100}%;background:#e3ac54"></span></div>
                        <span class="br-bar-value">${formatMoney(r.b)}</span>
                    </div>
                </div>`).join("")}
        </section>`;
}

function verdict(la, lb, a, b) {
    if (!a.income && !a.expense && !b.income && !b.expense) {
        return "No data logged for either period yet.";
    }
    const diff = a.net - b.net;
    if (Math.abs(diff) < 1) {
        return `<strong>${esc(la)}</strong> and <strong>${esc(lb)}</strong> netted about the same.`;
    }
    const better = diff > 0 ? la : lb;
    const worse = diff > 0 ? lb : la;
    return `<strong>${esc(better)}</strong> came out ${formatMoney(Math.abs(diff))} ahead of <strong>${esc(worse)}</strong> on net balance.`;
}

/* Monthly income / expense trend, drawn as inline SVG (no chart library) */
function trend(entries) {
    const months = availableKeys(entries, "month").reverse().slice(-12);
    if (!months.length) return "";
    const data = months.map((k) => periodTotals(entries, k, "month"));
    const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
    const W = 640, H = 180, pad = 24;
    const step = months.length > 1 ? (W - pad * 2) / (months.length - 1) : 0;
    const pts = (f) => data.map((d, i) =>
        `${pad + i * step},${H - pad - (f(d) / max) * (H - pad * 2)}`).join(" ");

    return `
        <section class="br-card">
            <h3>Last ${months.length} month${months.length === 1 ? "" : "s"}</h3>
            <p class="br-muted"><span style="color:#3ecf8e">●</span> Income &nbsp; <span style="color:#b5583f">●</span> Expenses</p>
            <div class="br-table-wrap">
                <svg viewBox="0 0 ${W} ${H}" style="min-width:420px;width:100%;height:auto" role="img" aria-label="Monthly trend">
                    <polyline fill="none" stroke="#3ecf8e" stroke-width="2.5" points="${pts((d) => d.income)}"/>
                    <polyline fill="none" stroke="#b5583f" stroke-width="2.5" points="${pts((d) => d.expense)}"/>
                    ${months.map((k, i) => `<text x="${pad + i * step}" y="${H - 6}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".6">${k.slice(2).replace("-", "/")}</text>`).join("")}
                </svg>
            </div>
        </section>`;
}

export function renderIncomeCompare(entries) {
    const keys = availableKeys(entries, state.mode);
    if (!keys.length) {
        return `<div class="br-card"><div class="br-empty-state">
            <h3>Nothing to compare yet</h3>
            <p class="br-muted">Add income entries in at least one period.</p></div></div>`;
    }
    if (!keys.includes(state.a)) state.a = keys[0];
    if (!keys.includes(state.b)) state.b = keys[1] || keys[0];

    const a = periodTotals(entries, state.a, state.mode);
    const b = periodTotals(entries, state.b, state.mode);
    const la = label(state.a, state.mode);
    const lb = label(state.b, state.mode);
    const opts = (sel) => keys.map((k) =>
        `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(label(k, state.mode))}</option>`).join("");

    return `
        <div class="br-toolbar" style="margin-bottom:16px;">
            <div class="br-income-tabs">
                <button type="button" class="br-income-tab ${state.mode === "month" ? "active" : ""}" data-compare-mode="month">Months</button>
                <button type="button" class="br-income-tab ${state.mode === "year" ? "active" : ""}" data-compare-mode="year">Years</button>
            </div>
            <select class="br-select" data-compare-select="a">${opts(state.a)}</select>
            <span class="br-muted">vs</span>
            <select class="br-select" data-compare-select="b">${opts(state.b)}</select>
        </div>

        <div class="br-verdict">${verdict(la, lb, a, b)}</div>

        <div class="br-grid br-grid-2" style="margin:16px 0;">
            ${periodCard(la, a)}
            ${periodCard(lb, b)}
        </div>

        <div class="br-grid br-grid-4" style="margin-bottom:16px;">
            <div class="br-stat"><div class="br-stat-label">Income</div>
                <div class="br-stat-value">${formatMoney(a.income - b.income)}</div>${delta(a.income, b.income)}</div>
            <div class="br-stat"><div class="br-stat-label">Expenses</div>
                <div class="br-stat-value">${formatMoney(a.expense - b.expense)}</div>${delta(a.expense, b.expense, true)}</div>
            <div class="br-stat"><div class="br-stat-label">Net</div>
                <div class="br-stat-value">${formatMoney(a.net - b.net)}</div>${delta(a.net, b.net)}</div>
            <div class="br-stat"><div class="br-stat-label">Savings rate</div>
                <div class="br-stat-value">${Math.round(a.rate - b.rate)} pts</div>${delta(a.rate, b.rate)}</div>
        </div>

        <p class="br-muted"><span style="color:#5b9dff">●</span> ${esc(la)} &nbsp; <span style="color:#e3ac54">●</span> ${esc(lb)}</p>
        <div class="br-grid br-grid-2" style="margin-bottom:16px;">
            ${categoryCompare("Expenses by category", a.categoryTotals, b.categoryTotals, "No expenses in either period")}
            ${categoryCompare("Income by category", a.incomeCategoryTotals, b.incomeCategoryTotals, "No income in either period")}
        </div>
        ${trend(entries)}`;
}

/* Called by income.js for clicks / changes inside the Compare view */
export function handleCompareEvent(target) {
    const mode = target.closest?.("[data-compare-mode]");
    if (mode) {
        state.mode = mode.dataset.compareMode;
        state.a = "";
        state.b = "";
        return true;
    }
    const sel = target.closest?.("[data-compare-select]");
    if (sel) {
        state[sel.dataset.compareSelect] = sel.value;
        return true;
    }
    return false;
}
