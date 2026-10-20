import { isUSD, usd } from "../../services/currency.js";
import {
    entryIncomeAmount,
    entryInvestmentSaleDisplayAmount,
    entryGenuineIncomeAmount,
    entryInvestmentReturnAmount,
    isInvestmentCategory
} from "./income-service.js";
import { SERIES, COLORS } from "../../components/chart-colors.js";
import { tipAttr } from "../../components/chart-tooltip.js";

function formatMoney(value) {
    const amount = Number(value) || 0;

    if (isUSD()) return usd(amount);

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* Colour classes shared with the Statement view (income.css: .inc-c-*) */
function signClass(value) {
    const number = Number(value) || 0;

    if (number > 0) return "inc-c-income";
    if (number < 0) return "inc-c-expense";

    return "";
}

function balanceClass(value) {
    return (Number(value) || 0) < 0 ? "inc-c-expense" : "inc-c-balance";
}

function monthKey(date) {
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
    const [year, month] = key.split("-");

    return new Date(
        Number(year),
        Number(month) - 1,
        1
    ).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric"
    });
}

function getEntryAmount(entry, field) {
    return Number(entry?.[field]) || 0;
}

function calculateStatistics(entries) {
    const monthly = {};
    const categories = {};

    let income = 0;
    let expense = 0;
    let investment = 0;
    let investmentSales = 0;
    let realizedGainLoss = 0;

    entries.forEach((entry) => {
        const date =
            entry.date ||
            entry.createdAt ||
            entry.timestamp;

        const month = monthKey(date);

        if (!month) {
            return;
        }

        if (!monthly[month]) {
            monthly[month] = {
                income: 0,
                expense: 0,
                investment: 0,
                investmentSales: 0,
                realizedGainLoss: 0
            };
        }

        const calculated = entry.calculated || entry;

        const entryIncome =
            getEntryAmount(calculated, "income");

        const entryExpense =
            getEntryAmount(calculated, "expense");

        const entryInvestment =
            getEntryAmount(calculated, "investment");

        const entryInvestmentSale =
            getEntryAmount(calculated, "investmentSale");

        const entryGainLoss =
            getEntryAmount(calculated, "realizedGainLoss");

        income += entryIncome;
        expense += entryExpense;
        investment += entryInvestment;
        investmentSales += entryInvestmentSale;
        realizedGainLoss += entryGainLoss;

        monthly[month].income += entryIncome;
        monthly[month].expense += entryExpense;
        monthly[month].investment += entryInvestment;
        monthly[month].investmentSales += entryInvestmentSale;
        monthly[month].realizedGainLoss += entryGainLoss;

        const category =
            entry.category ||
            entry.type ||
            "Other";

        if (!categories[category]) {
            categories[category] = 0;
        }

        categories[category] += entryExpense;
    });

    return {
        income,
        expense,
        investment,
        investmentSales,
        realizedGainLoss,
        monthly,
        categories
    };
}

function renderMonthlyTable(monthly) {
    const months = Object.keys(monthly).sort().reverse();

    if (!months.length) {
        return `
            <div class="br-empty-state">
                <strong>No monthly data</strong>
                <p>Monthly statistics will appear when transactions are added.</p>
            </div>
        `;
    }

    return `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Income</th>
                        <th>Expenses</th>
                        <th>Investments</th>
                        <th>Net</th>
                    </tr>
                </thead>

                <tbody>
                    ${months.map((month) => {
                        const item = monthly[month];

                        const net =
                            item.income -
                            item.expense -
                            item.investment +
                            item.investmentSales +
                            item.realizedGainLoss;

                        return `
                            <tr>
                                <td>${escapeHtml(monthLabel(month))}</td>
                                <td class="inc-c-income">${formatMoney(item.income)}</td>
                                <td class="inc-c-expense">${formatMoney(item.expense)}</td>
                                <td class="inc-c-invested">${formatMoney(item.investment)}</td>
                                <td class="${balanceClass(net)}">${formatMoney(net)}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderCategoryTable(categories) {
    const items = Object.entries(categories)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    if (!items.length) {
        return `
            <div class="br-empty-state">
                <strong>No expense categories</strong>
                <p>Category statistics will appear when expenses are recorded.</p>
            </div>
        `;
    }

    return `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Expenses</th>
                    </tr>
                </thead>

                <tbody>
                    ${items.map(([category, amount]) => `
                        <tr>
                            <td>${escapeHtml(category)}</td>
                            <td>${formatMoney(amount)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}


/* ------------------------------------------------------------------
 * Restored from the old Statistics page: ratio cards, expense / income /
 * investment-return breakdowns (tap a category to see its items) and a
 * monthly chart. All figures use the same income-service helpers as the
 * Ledger, so they agree with every other Income view.
 * ------------------------------------------------------------------ */

function computeExtras(entries) {
    const expCats = new Map();
    const incCats = new Map();
    const retCats = new Map();
    const monthly = new Map();
    const txnDates = [];
    let income = 0, expense = 0, investment = 0, sale = 0, txnCount = 0;

    const push = (map, key, note, amount, date) => {
        if (!map.has(key)) map.set(key, { total: 0, items: [] });
        const c = map.get(key);
        c.total += amount;
        c.items.push({ note, amount, date });
    };

    entries.forEach((e) => {
        const inc = entryIncomeAmount(e);
        const exp = Number(e.expense) || 0;
        const inv = Number(e.investment) || 0;
        const sl = entryInvestmentSaleDisplayAmount(e);
        income += inc; expense += exp; investment += inv; sale += sl;

        const cat = e.category || "Uncategorized";
        const genuine = entryGenuineIncomeAmount(e);
        if (genuine > 0) push(incCats, cat, e.from || cat, genuine, e.date);
        const ret = entryInvestmentReturnAmount(e);
        if (ret > 0) push(retCats, cat, e.from || cat, ret, e.date);

        const mk = monthKey(e.date);
        if (mk) {
            if (!monthly.has(mk)) monthly.set(mk, { income: 0, expense: 0, investment: 0, sale: 0 });
            const m = monthly.get(mk);
            m.income += inc; m.expense += exp; m.investment += inv; m.sale += sl;
        }

        (e.transactions || []).forEach((t) => {
            if (isInvestmentCategory(t.category)) return;
            const amt = Number(t.amount) || 0;
            txnCount++;
            const tc = t.category || "Uncategorized";
            push(expCats, tc, t.description || tc, amt, t.date || e.date);
            if (t.date) txnDates.push(t.date);
        });
    });

    const balance = income - expense - investment + sale;
    const months = Math.max(monthly.size, 1);
    let daySpan = months * 30;
    const dates = txnDates.map((d) => new Date(d + "T00:00:00")).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
    if (dates.length > 1) {
        daySpan = Math.max(1, Math.round((dates[dates.length - 1] - dates[0]) / 86400000) + 1);
    }
    const top = (m) => [...m.entries()].sort((a, b) => b[1].total - a[1].total)[0] || null;

    return {
        expCats, incCats, retCats, monthly, income, expense, balance, txnCount, months,
        savingsRate: income > 0 ? (balance / income) * 100 : 0,
        expenseRatio: income > 0 ? (expense / income) * 100 : (expense > 0 ? 100 : 0),
        avgTxn: txnCount > 0 ? expense / txnCount : 0,
        avgMonthlyIncome: income / months,
        avgMonthlyExpense: expense / months,
        avgMonthlySavings: balance / months,
        avgDailySpend: expense / daySpan,
        topExpense: top(expCats),
        topIncome: top(incCats)
    };
}

function ratioCards(x) {
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const card = (label, value, sub, tone = "") => `
        <div class="br-card br-stat">
            <span class="br-stat-label">${label}</span>
            <strong class="br-stat-value ${tone}">${value}</strong>
            <span class="br-muted">${sub}</span>
        </div>`;
    return `
        <div class="br-grid br-grid-4">
            ${card("Savings rate", x.savingsRate.toFixed(1) + "%", "of income kept", x.savingsRate >= 0 ? "br-pos" : "br-neg")}
            ${card("Expense ratio", x.expenseRatio.toFixed(1) + "%", "of income spent", x.expenseRatio > 100 ? "br-neg" : "")}
            ${card("Avg. monthly income", formatMoney(x.avgMonthlyIncome), "over " + plural(x.months, "month"))}
            ${card("Avg. monthly expense", formatMoney(x.avgMonthlyExpense), "over " + plural(x.months, "month"))}
            ${card("Avg. monthly savings", formatMoney(x.avgMonthlySavings), "net cash change", x.avgMonthlySavings >= 0 ? "br-pos" : "br-neg")}
            ${card("Avg. daily spend", formatMoney(x.avgDailySpend), "across logged days")}
            ${card("Avg. per transaction", formatMoney(x.avgTxn), plural(x.txnCount, "transaction"))}
            ${card("Top category",
                x.topExpense ? escapeHtml(x.topExpense[0]) : "—",
                x.topExpense ? formatMoney(x.topExpense[1].total) + " spent" : "No expenses yet")}
        </div>`;
}

/* One breakdown card; each category opens to list its items (largest first) */
function breakdownCard(title, sub, map, total, emptyText, palette = SERIES) {
    const rows = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
    if (!rows.length || total <= 0) {
        return `
            <div class="br-card">
                <div class="br-card-heading"><div><h3>${title}</h3></div></div>
                <div class="br-empty-state"><p class="br-muted">${emptyText}</p></div>
            </div>`;
    }
    const max = rows[0][1].total || 1;
    return `
        <div class="br-card">
            <div class="br-card-heading"><div><h3>${title}</h3></div></div>
            <div class="br-bars">
                ${rows.map(([name, c], i) => {
                    const color = palette[i % palette.length];
                    const items = c.items.slice().sort((a, b) => b.amount - a.amount);
                    return `
                    <details class="br-stat-cat">
                        <summary style="cursor:pointer;list-style:none;">
                            <div class="br-bar-row">
                                <div class="br-bar-name">${escapeHtml(name)} <span class="br-muted">${((c.total / total) * 100).toFixed(1)}%</span></div>
                                <div class="br-bar-track"><span class="br-bar-fill" style="width:${(c.total / max) * 100}%;background:${color}"></span></div>
                                <div class="br-bar-value">${formatMoney(c.total)}</div>
                            </div>
                        </summary>
                        <div class="br-list" style="margin:6px 0 12px;">
                            ${items.map((it, n) => `
                                <div class="br-list-item">
                                    <span>${n + 1}. ${escapeHtml(it.note)} <span class="br-muted">${escapeHtml(it.date || "")}</span></span>
                                    <strong>${formatMoney(it.amount)} <span class="br-muted">${c.total > 0 ? ((it.amount / c.total) * 100).toFixed(1) : "0.0"}%</span></strong>
                                </div>`).join("")}
                        </div>
                    </details>`;
                }).join("")}
            </div>
        </div>`;
}

/* Income / expense / balance by month, inline SVG (no chart library).
   The card carries its own data and a range picker (presets + From / To
   month), so it keeps working when the Statistics view is served from cache. */
const RANGE_PRESETS = [["6M", 6], ["1Y", 12], ["3Y", 36], ["5Y", 60], ["All", 0]];
const DEFAULT_RANGE = 12;

function chartSVG(series) {
    if (!series.length) return `<p class="br-muted" style="padding:24px 0">No months in this range.</p>`;

    const vals = series.flatMap((d) => [d.income, d.expense, d.balance]);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const W = Math.max(640, series.length * 26), H = 240, pad = 28;
    const step = series.length > 1 ? (W - pad * 2) / (series.length - 1) : 0;
    const every = Math.max(1, Math.ceil(56 / (step || 56)));
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const pts = (f) => series.map((d, i) => `${pad + i * step},${y(f(d))}`).join(" ");
    const dots = (f, c) => series.map((d, i) => `<circle cx="${pad + i * step}" cy="${y(f(d))}" r="3" fill="${c}"/>`).join("");
    const line = (f, c) => `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts(f)}"/>${dots(f, c)}`;

    return `
        <svg viewBox="0 0 ${W} ${H}" style="min-width:100%;width:${W}px;max-width:none;height:auto" role="img" aria-label="Monthly income, expense and balance">
            <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".2"/>
            ${line((d) => d.income, COLORS.success)}
            ${line((d) => d.expense, COLORS.danger)}
            ${line((d) => d.balance, COLORS.info)}
            ${series.map((d, i) => i % every ? "" : `<text x="${pad + i * step}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".6">${escapeHtml(monthLabel(d.key))}</text>`).join("")}
            ${series.map((d, i) => {
                const bandW = series.length > 1 ? step : W - pad * 2;
                const bandX = series.length > 1 ? pad + i * step - step / 2 : pad;
                return `<rect class="br-tip-hit" x="${bandX}" y="0" width="${bandW}" height="${H}" ${tipAttr(monthLabel(d.key), [
                    ["Income", formatMoney(d.income), COLORS.success],
                    ["Expense", formatMoney(d.expense), COLORS.danger],
                    ["Balance", formatMoney(d.balance), COLORS.info]
                ])}></rect>`;
            }).join("")}
        </svg>`;
}

function monthlyChart(monthly) {
    const keys = [...monthly.keys()].sort();
    if (!keys.length) return "";

    const data = keys.map((k) => {
        const m = monthly.get(k);
        return { key: k, income: m.income, expense: m.expense, balance: m.income - m.expense - m.investment + m.sale };
    });

    const last = data.length - 1;
    const from = Math.max(0, data.length - DEFAULT_RANGE);
    const opts = (sel) => data.map((d, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${escapeHtml(monthLabel(d.key))}</option>`).join("");

    return `
        <div class="br-card stat-range-card" data-stat-chart data-series="${escapeHtml(JSON.stringify(data))}" data-from="${from}" data-to="${last}">
            <div class="br-card-heading"><div>
                <h3>Monthly chart</h3>
                <p class="br-muted"><span style="color:${COLORS.success}">●</span> Income &nbsp; <span style="color:${COLORS.danger}">●</span> Expense &nbsp; <span style="color:${COLORS.info}">●</span> Balance</p>
            </div></div>

            <div class="stat-range">
                <div class="stat-range-pills" role="group" aria-label="Chart range">
                    ${RANGE_PRESETS.map(([label, n]) => `<button type="button" data-range-preset="${n}" aria-pressed="${(n === 0 ? from === 0 : n === DEFAULT_RANGE && from === Math.max(0, data.length - n)) ? "true" : "false"}">${label}</button>`).join("")}
                </div>
                <div class="stat-range-pick">
                    <label><span>From</span><select data-range-from aria-label="From month">${opts(from)}</select></label>
                    <label><span>To</span><select data-range-to aria-label="To month">${opts(last)}</select></label>
                </div>
            </div>

            <div class="br-table-wrap" data-chart-body>${chartSVG(data.slice(from, last + 1))}</div>
        </div>`;
}

/* One delegated listener (installed once) redraws the chart for a new range. */
function paintRange(card, from, to) {
    let data = [];

    try { data = JSON.parse(card.dataset.series || "[]"); } catch { data = []; }

    const n = data.length;

    from = Math.max(0, Math.min(from, n - 1));
    to = Math.max(0, Math.min(to, n - 1));
    if (from > to) [from, to] = [to, from];

    card.dataset.from = String(from);
    card.dataset.to = String(to);
    card.querySelector("[data-range-from]").value = String(from);
    card.querySelector("[data-range-to]").value = String(to);
    card.querySelector("[data-chart-body]").innerHTML = chartSVG(data.slice(from, to + 1));

    card.querySelectorAll("[data-range-preset]").forEach((btn) => {
        const k = Number(btn.dataset.rangePreset);
        const on = to === n - 1 && (k === 0 ? from === 0 : from === Math.max(0, n - k));

        btn.setAttribute("aria-pressed", String(on));
    });
}

if (typeof document !== "undefined" && !window.__brStatRange) {
    window.__brStatRange = true;

    document.addEventListener("click", (event) => {
        const btn = event.target.closest?.("[data-range-preset]");
        const card = btn && btn.closest("[data-stat-chart]");

        if (!card) return;

        const n = JSON.parse(card.dataset.series || "[]").length;
        const k = Number(btn.dataset.rangePreset);

        paintRange(card, k === 0 ? 0 : Math.max(0, n - k), n - 1);
    });

    document.addEventListener("change", (event) => {
        const sel = event.target.closest?.("[data-range-from], [data-range-to]");
        const card = sel && sel.closest("[data-stat-chart]");

        if (!card) return;

        paintRange(
            card,
            Number(card.querySelector("[data-range-from]").value),
            Number(card.querySelector("[data-range-to]").value)
        );
    });
}

function renderExtraStatistics(entries) {
    if (!entries.length) return "";
    const x = computeExtras(entries);
    const sum = (m) => [...m.values()].reduce((a, c) => a + c.total, 0);
    return `
        ${breakdownCard("Investment returns", "Dividends, interest and other portfolio earnings.", x.retCats, sum(x.retCats), "No investment returns logged yet", [COLORS.info, ...SERIES])}
    `;
}

export function renderIncomeStatistics(entries = []) {
    const statistics = calculateStatistics(entries);

    const netCashFlow =
        statistics.income -
        statistics.expense;

    const investmentFlow =
        statistics.investment -
        statistics.investmentSales;

    return `
        <section class="br-statistics-view">

            <div class="br-page-heading">
                <div>
                    <h2>Statistics</h2>
                </div>
            </div>

            <div class="br-grid br-grid-4">

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Total Income
                    </span>

                    <strong class="br-stat-value inc-c-income">
                        ${formatMoney(statistics.income)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Total Expenses
                    </span>

                    <strong class="br-stat-value inc-c-expense">
                        ${formatMoney(statistics.expense)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Net Cash Flow
                    </span>

                    <strong class="br-stat-value ${balanceClass(netCashFlow)}">
                        ${formatMoney(netCashFlow)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Investment Flow
                    </span>

                    <strong class="br-stat-value inc-c-invested">
                        ${formatMoney(investmentFlow)}
                    </strong>
                </div>

            </div>

            <div class="br-card">

                <div class="br-card-heading">
                    <div>
                        <h3>Investment Activity</h3>
                    </div>
                </div>

                <div class="br-grid br-grid-3">

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Investments
                        </span>

                        <strong class="br-stat-value inc-c-invested">
                            ${formatMoney(statistics.investment)}
                        </strong>
                    </div>

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Investment Sales
                        </span>

                        <strong class="br-stat-value inc-c-sales">
                            ${formatMoney(statistics.investmentSales)}
                        </strong>
                    </div>

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Realized Gain / Loss
                        </span>

                        <strong class="br-stat-value ${signClass(statistics.realizedGainLoss)}">
                            ${formatMoney(statistics.realizedGainLoss)}
                        </strong>
                    </div>

                </div>

            </div>

            ${entries.length ? (() => { const x = computeExtras(entries); return monthlyChart(x.monthly) + ratioCards(x); })() : ""}

            <div class="br-grid">

                <div class="br-card">

                    <div class="br-card-heading">
                        <div>
                            <h3>Monthly Overview</h3>
                        </div>
                    </div>

                    ${renderMonthlyTable(statistics.monthly)}

                </div>

                

            </div>

            ${renderExtraStatistics(entries)}
        </section>
    `;
}