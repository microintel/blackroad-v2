import { COLORS } from "../../components/chart-colors.js";
/* Income → Compare : two months or two years side by side (old compare.js) */
import {
    periodTotals, monthKeyOf, yearKeyOf, monthLabelOf, formatMoney, esc
} from "./income-shared.js";

const state = { mode: "month", a: "", b: "", range: "1y" };

const RANGE_MONTHS = { "1m": 1, "6m": 6, "1y": 12, "3y": 36, "5y": 60, "10y": 120, max: Infinity };

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
                        <div class="br-bar-track"><span class="br-bar-fill" style="width:${(r.a / max) * 100}%;background:${COLORS.info}"></span></div>
                        <span class="br-bar-value">${formatMoney(r.a)}</span>
                        <div class="br-bar-track"><span class="br-bar-fill" style="width:${(r.b / max) * 100}%;background:${COLORS.gold}"></span></div>
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

/* Income vs expense for the two chosen periods (old compare chart) */
function periodChart(la, lb, a, b) {
    if (!a.income && !a.expense && !b.income && !b.expense) return "";
    const max = Math.max(a.income, a.expense, b.income, b.expense, 1);
    const W = 420, H = 180, pad = 28, bw = 34;
    const groups = [[la, a], [lb, b]];
    const gx = (i) => pad + 40 + i * ((W - pad * 2 - 80) / 1);
    const bar = (x, v, c) => {
        const h = (v / max) * (H - pad * 2);
        return `<rect x="${x}" y="${H - pad - h}" width="${bw}" height="${h}" rx="4" fill="${c}"/>`;
    };
    return `
        <section class="br-card" style="margin-bottom:16px;">
            <h3>Income vs expense</h3>
            <p class="br-muted"><span style="color:${COLORS.success}">●</span> Income &nbsp; <span style="color:${COLORS.danger}">●</span> Expense</p>
            <div class="br-table-wrap">
                <svg viewBox="0 0 ${W} ${H}" style="min-width:320px;width:100%;height:auto" role="img" aria-label="Income and expense for both periods">
                    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="currentColor" opacity=".2"/>
                    ${groups.map(([l, t], i) => `
                        ${bar(gx(i) - bw - 2, t.income, COLORS.success)}
                        ${bar(gx(i) + 2, t.expense, COLORS.danger)}
                        <text x="${gx(i)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${esc(l)}</text>`).join("")}
                </svg>
            </div>
        </section>`;
}

/* Monthly income / expense / balance trend, drawn as inline SVG (no chart library) */
function trend(entries) {
    const all = availableKeys(entries, "month").reverse();
    if (!all.length) return "";
    const n = RANGE_MONTHS[state.range] ?? 12;
    const months = Number.isFinite(n) ? all.slice(-n) : all;
    const data = months.map((k) => periodTotals(entries, k, "month"));
    const rows = data.map((d) => ({
        income: d.income,
        expense: d.expense,
        balance: d.income - d.expense - d.investment + d.investmentSale
    }));
    const vals = rows.flatMap((d) => [d.income, d.expense, d.balance]);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const W = Math.max(640, months.length * 48), H = 200, pad = 24;
    const step = months.length > 1 ? (W - pad * 2) / (months.length - 1) : 0;
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const line = (f, c) => {
        const pts = rows.map((d, i) => `${pad + i * step},${y(f(d))}`).join(" ");
        const dots = rows.map((d, i) => `<circle cx="${pad + i * step}" cy="${y(f(d))}" r="3" fill="${c}"/>`).join("");
        return `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts}"/>${dots}`;
    };
    const ranges = [["1m", "1M"], ["6m", "6M"], ["1y", "1Y"], ["3y", "3Y"], ["5y", "5Y"], ["10y", "10Y"], ["max", "MAX"]];

    return `
        <section class="br-card">
            <h3>Monthly trend</h3>
            <div class="br-income-tabs" style="margin:8px 0;">
                ${ranges.map(([k, t]) => `<button type="button" class="br-income-tab ${state.range === k ? "active" : ""}" data-compare-range="${k}">${t}</button>`).join("")}
            </div>
            <p class="br-muted"><span style="color:${COLORS.success}">●</span> Income &nbsp; <span style="color:${COLORS.danger}">●</span> Expenses &nbsp; <span style="color:${COLORS.info}">●</span> Balance</p>
            <div class="br-table-wrap">
                <svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 420)}px;width:100%;height:auto" role="img" aria-label="Monthly trend">
                    <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".2"/>
                    ${line((d) => d.income, COLORS.success)}
                    ${line((d) => d.expense, COLORS.danger)}
                    ${line((d) => d.balance, COLORS.info)}
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
            <button type="button" class="br-button" data-compare-swap title="Swap periods" aria-label="Swap periods">⇄</button>
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

        ${periodChart(la, lb, a, b)}

        <p class="br-muted"><span style="color:${COLORS.info}">●</span> ${esc(la)} &nbsp; <span style="color:${COLORS.gold}">●</span> ${esc(lb)}</p>
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
    if (target.closest?.("[data-compare-swap]")) {
        [state.a, state.b] = [state.b, state.a];
        return true;
    }
    const range = target.closest?.("[data-compare-range]");
    if (range) {
        state.range = range.dataset.compareRange;
        return true;
    }
    const sel = target.closest?.("[data-compare-select]");
    if (sel) {
        state[sel.dataset.compareSelect] = sel.value;
        return true;
    }
    return false;
}
