import { formatINR } from "../dashboard/dashboard-service.js";

/*
 * Rover queries (pure logic, no DOM, no storage).
 *
 *   EXTRA_INTENTS    more questions Rover understands (trend, categories, gauges, forecast ...)
 *   visualsFor()     the charts / tables / gauges / comparisons attached to an intent's answer
 *   compareReply()   "stocks vs mutual funds", "this month vs last month" ...
 *   pickView()       "as a table", "show a chart", "gauge" -> keep only that kind of visual
 *
 * Visual blocks are plain data (see rover-visuals.js). To add a visual to an intent, add an
 * entry to VISUALS. To teach Rover a new question, add an entry to EXTRA_INTENTS.
 */

const money = formatINR;
const signed = (n) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const pct = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(1)}%`;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const GO = (label, path) => ({ label, path });

const PAGE = {
    income: GO("Open Income Statement", "/income"),
    dashboard: GO("Open Dashboard", "/dashboard"),
    intelligence: GO("Open Dashboard", "/dashboard"),
    stocks: GO("Open Stocks", "/stocks"),
    networth: GO("Open Net Worth", "/networth"),
    lending: GO("Open Lending", "/lending")
};

const empty = (what, action) => ({
    text: `I can't see any ${what} yet. Add some and I'll be able to show you more.`,
    actions: action ? [action] : []
});

/* ---------- shared numbers ---------- */

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString("en", { month: "short" });

/* The last `n` months (oldest first). The current month uses the Dashboard's own figures. */
function lastMonths(d, n = 6) {
    const have = new Map((d.monthly || []).map((m) => [m.key, m]));
    const now = new Date();
    const out = [];

    for (let i = n - 1; i >= 0; i--) {
        const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
        const m = have.get(key) || { key, income: 0, expense: 0, investment: 0 };
        out.push({ ...m, label: monthLabel(key) });
    }

    const cur = d.income?.month;
    if (cur) Object.assign(out[out.length - 1], { income: cur.income || 0, expense: cur.expense || 0, investment: cur.investment || 0 });

    return out;
}

function metrics(d) {
    const m = d.income?.month || { income: 0, expense: 0, investment: 0 };
    const months = lastMonths(d, 6);
    const done = months.slice(0, -1).filter((x) => x.expense > 0);
    const spendBase = done.length ? done : months.filter((x) => x.expense > 0);
    const avgExpense = spendBase.length ? spendBase.reduce((s, x) => s + x.expense, 0) / spendBase.length : 0;
    const cash = d.income?.cash || 0;
    const top = [...(d.chartItems || [])].sort((a, b) => b.amount - a.amount)[0];

    return {
        month: m,
        months,
        saveRate: m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null,
        avgExpense,
        runway: avgExpense > 0 ? cash / avgExpense : null,
        debtRatio: d.totalAssets > 0 ? (d.totalLiabilities / d.totalAssets) * 100 : d.totalLiabilities > 0 ? 100 : 0,
        emiRatio: m.income > 0 && d.lending?.monthlyEmi > 0 ? (d.lending.monthlyEmi / m.income) * 100 : null,
        topShare: top ? top.pct : null,
        topLabel: top ? top.label : ""
    };
}

const components = (d) => [
    { label: "Cash & Bank", value: d.income?.cash || 0 },
    { label: "Mutual Funds", value: d.mutualFunds?.currentValue || 0 },
    { label: "Stocks", value: d.stocks?.currentValue || 0 },
    { label: "Fixed Deposits", value: d.deposits?.totalCurrentValue || 0 },
    { label: "Lending Receivables", value: d.lending?.peopleReceivable || 0 }
].filter((i) => i.value > 0);

/* Radar charts want 0 to 100: each item as a share of the biggest one. */
const radarShares = (list) => {
    const max = Math.max(...list.map((i) => i.value), 0) || 1;
    return list.map((i) => ({ label: i.label, value: (i.value / max) * 100, display: money(i.value), note: "Amount" }));
};

/* ---------- gauges ---------- */

const gaugeSave = (m) => m.saveRate === null ? null : ({
    kind: "gauge", title: "Savings rate this month", value: Math.max(m.saveRate, 0), min: 0, max: 100, fmt: "pct",
    display: `${m.saveRate.toFixed(0)}%`,
    zones: [{ to: 10, tone: "danger", label: m.saveRate < 0 ? "Overspending" : "Low" }, { to: 20, tone: "warning", label: "Fair" }, { to: 100, tone: "success", label: "Healthy" }],
    caption: "Share of this month's income that you did not spend. 20% or more is a good habit."
});

const gaugeRunway = (m) => m.runway === null ? null : ({
    kind: "gauge", title: "Emergency cushion", value: Math.min(m.runway, 12), min: 0, max: 12, maxPlus: true, fmt: "months",
    display: `${m.runway.toFixed(1)} mo`,
    zones: [{ to: 3, tone: "danger", label: "Thin" }, { to: 6, tone: "warning", label: "Okay" }, { to: 12, tone: "success", label: "Strong" }],
    caption: `Your cash & bank would cover about ${m.runway.toFixed(1)} months at your usual spending of ${money(m.avgExpense)} a month. 6 months is a common target.`
});

const gaugeDebt = (d, m) => (d.totalAssets <= 0 && d.totalLiabilities <= 0) ? null : ({
    kind: "gauge", title: "Debt to assets", value: Math.min(m.debtRatio, 100), min: 0, max: 100, fmt: "pct",
    display: `${m.debtRatio.toFixed(0)}%`,
    zones: [{ to: 30, tone: "success", label: "Comfortable" }, { to: 50, tone: "warning", label: "Watch it" }, { to: 100, tone: "danger", label: "High" }],
    caption: `You owe ${money(d.totalLiabilities)} against ${money(d.totalAssets)} of assets. Lower is better.`
});

const gaugeEmi = (d, m) => m.emiRatio === null ? null : ({
    kind: "gauge", title: "EMI share of income", value: Math.min(m.emiRatio, 100), min: 0, max: 100, fmt: "pct",
    display: `${m.emiRatio.toFixed(0)}%`,
    zones: [{ to: 20, tone: "success", label: "Light" }, { to: 40, tone: "warning", label: "Moderate" }, { to: 100, tone: "danger", label: "Heavy" }],
    caption: `Your EMIs of ${money(d.lending.monthlyEmi)} take this much of this month's income. Below 40% is usually manageable.`
});

const gaugeSpread = (m) => m.topShare === null ? null : ({
    kind: "gauge", title: "Biggest single holding", value: m.topShare, min: 0, max: 100, fmt: "pct",
    display: `${m.topShare.toFixed(0)}%`,
    zones: [{ to: 40, tone: "success", label: "Well spread" }, { to: 60, tone: "warning", label: "Leaning" }, { to: 100, tone: "danger", label: "Concentrated" }],
    caption: `${m.topLabel} holds the largest share of your invested assets.`
});

/* Money health score: savings, cushion, debt and spread, each worth a share of 100. */
function health(d) {
    const m = metrics(d);
    const parts = [];

    if (m.saveRate !== null) parts.push({ name: "Savings rate", weight: 35, score: clamp((m.saveRate / 30) * 100, 0, 100), reading: `${m.saveRate.toFixed(0)}% of income` });
    if (m.runway !== null) parts.push({ name: "Emergency cushion", weight: 30, score: clamp((m.runway / 6) * 100, 0, 100), reading: `${m.runway.toFixed(1)} months` });
    if (d.totalAssets > 0 || d.totalLiabilities > 0) parts.push({ name: "Debt level", weight: 25, score: clamp(100 - m.debtRatio * (100 / 60), 0, 100), reading: `${m.debtRatio.toFixed(0)}% of assets` });
    if (m.topShare !== null) parts.push({ name: "Spread of investments", weight: 10, score: clamp(100 - ((m.topShare - 40) / 50) * 100, 0, 100), reading: `top holding ${m.topShare.toFixed(0)}%` });

    if (!parts.length) return null;

    const total = parts.reduce((s, p) => s + p.weight, 0);
    const score = Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / total);

    return { score, parts, label: score >= 70 ? "Strong" : score >= 40 ? "Fair" : "Needs work" };
}

/* ---------- visuals per intent ---------- */

const holdingsBars = (d) => d.holdings.map((h) => ({ label: h.symbol, value: h.pnl }));

/* Stock cards with the company logo, like the Stocks page. */
const stockCards = (list, title) => ({
    kind: "stocklist", title,
    items: list.map((h) => ({ symbol: h.symbol, name: h.name || h.symbol, qty: h.quantity, avg: h.avg ?? (h.quantity ? h.invested / h.quantity : 0), ltp: h.ltp ?? (h.quantity ? h.value / h.quantity : 0), value: h.value, pnl: h.pnl, pnlPct: h.pnlPct }))
});

const VISUALS = {
    summary: (d) => [
        { kind: "kpi", items: [{ label: "Net worth", value: d.netWorth }, { label: "Assets", value: d.totalAssets }, { label: "Liabilities", value: d.totalLiabilities, tone: d.totalLiabilities > 0 ? "danger" : "" }] },
        d.chartItems?.length ? { kind: "chart", type: "treemap", title: "Where your invested assets sit", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) } : null,
        d.chartItems?.length ? { kind: "chart", alt: true, type: "donut", title: "Where your invested assets sit", centerLabel: "Invested", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) } : null,
        d.chartItems?.length ? { kind: "chart", alt: true, type: "stacked", title: "Share of invested assets", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) } : null
    ],

    networth: (d) => (d.totalAssets || d.totalLiabilities) ? [
        { kind: "compare", title: "Assets vs liabilities", aLabel: "Assets", bLabel: "Liabilities", rows: [{ label: "Total", a: d.totalAssets, b: d.totalLiabilities, better: false }], note: `Net worth ${money(d.netWorth)}` },
        components(d).length ? { kind: "chart", type: "stacked", title: "What your net worth is made of", items: components(d) } : null,
        components(d).length ? { kind: "chart", alt: true, type: "donut", title: "What your net worth is made of", centerLabel: "Assets", items: components(d) } : null,
        components(d).length > 1 ? { kind: "chart", alt: true, type: "treemap", title: "What your net worth is made of", items: components(d) } : null,
        components(d).length > 2 ? { kind: "chart", alt: true, type: "radar", title: "Mix of your assets (share of the biggest)", items: radarShares(components(d)) } : null,
        gaugeDebt(d, metrics(d))
    ] : [],

    assets: (d) => d.chartItems?.length ? [
        { kind: "chart", type: "donut", title: "Allocation", centerLabel: "Invested", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) },
        { kind: "chart", alt: true, type: "treemap", title: "Allocation", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) },
        { kind: "chart", alt: true, type: "stacked", title: "Allocation", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) },
        { kind: "chart", alt: true, type: "lollipop", title: "Value of each asset", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) },
        { kind: "table", title: "Breakdown", columns: [{ label: "Asset", fmt: "text" }, { label: "Value", fmt: "money" }, { label: "Share", fmt: "pct" }], rows: d.chartItems.map((i) => [i.label, i.amount, i.pct]) },
        gaugeSpread(metrics(d))
    ] : [],

    liabilities: (d) => d.totalLiabilities > 0 ? [
        { kind: "chart", type: "stacked", title: "What you owe", items: [{ label: "Loans outstanding", value: d.lending.loansOutstanding }, { label: "Owed to people", value: d.lending.peoplePayable }] },
        { kind: "chart", alt: true, type: "donut", title: "What you owe", centerLabel: "Owed", items: [{ label: "Loans outstanding", value: d.lending.loansOutstanding }, { label: "Owed to people", value: d.lending.peoplePayable }] },
        gaugeDebt(d, metrics(d))
    ] : [],

    loans: (d) => d.lending?.activeLoanCount ? [
        { kind: "kpi", items: [{ label: "Outstanding", value: d.lending.loansOutstanding }, { label: "Monthly EMI", value: d.lending.monthlyEmi }, { label: "Active loans", value: d.lending.activeLoanCount, fmt: "num" }] },
        gaugeEmi(d, metrics(d))
    ] : [],

    lending: (d) => d.people?.length ? [
        { kind: "chart", type: "lollipop", signed: true, title: "Balance with each person (+ they owe you)", items: d.people.map((p) => ({ label: p.name, value: p.balance })) },
        { kind: "chart", alt: true, type: "bar", signed: true, title: "Balance with each person (+ they owe you)", items: d.people.map((p) => ({ label: p.name, value: p.balance })) },
        { kind: "table", title: "People", columns: [{ label: "Person", fmt: "text" }, { label: "Balance", fmt: "signed" }, { label: "Status", fmt: "text" }], rows: d.people.map((p) => [p.name, p.balance, p.balance > 0 ? "Owes you" : "You owe"]) }
    ] : [],

    cash: (d) => [
        { kind: "kpi", items: [{ label: "Cash & bank", value: d.income?.cash || 0 }, { label: "Spends / month", value: metrics(d).avgExpense }] },
        gaugeRunway(metrics(d))
    ],

    month: (d) => {
        const m = metrics(d);
        const trend = m.months.filter((x) => x.income || x.expense);
        return d.income?.hasData ? [
            gaugeSave(m),
            { kind: "compare", title: "This month: income vs expenses", aLabel: "Income", bLabel: "Expenses", rows: [{ label: "This month", a: m.month.income, b: m.month.expense, better: false }] },
            { kind: "chart", type: "waterfall", title: "Where this month's income went", items: [{ label: "Income", value: m.month.income, total: true }, { label: "Expenses", value: -m.month.expense }, { label: "Invested", value: -m.month.investment }, { label: "Left", value: m.month.income - m.month.expense - m.month.investment, total: true }] },
            trend.length > 1 ? { kind: "chart", type: "columns", title: "Last 6 months", labels: m.months.map((x) => x.label), series: [{ name: "Income", values: m.months.map((x) => x.income), color: "success" }, { name: "Expenses", values: m.months.map((x) => x.expense), color: "danger" }] } : null
        ] : [];
    },

    stocks: (d) => d.holdings?.length ? [
        stockCards(d.holdings, "Your stocks"),
        { kind: "chart", type: "lollipop", signed: true, title: "Profit / loss by stock", items: holdingsBars(d) },
        { kind: "chart", alt: true, type: "bar", signed: true, title: "Profit / loss by stock", items: holdingsBars(d) },
        d.holdings.length > 1 ? { kind: "chart", type: "bubble", title: "Money put in vs return (size = current value)", xLabel: "Invested", yLabel: "Return", xFmt: "money", yFmt: "spct", rLabel: "Value", points: d.holdings.slice(0, 12).map((h) => ({ label: h.symbol, x: h.invested, y: h.pnlPct, r: h.value })) } : null,
        { kind: "table", title: "Your holdings", columns: [{ label: "Stock", fmt: "text" }, { label: "Value", fmt: "money" }, { label: "P&L", fmt: "signed" }, { label: "Return", fmt: "spct" }], rows: d.holdings.map((h) => [h.symbol, h.value, h.pnl, h.pnlPct]) },
        { kind: "chart", type: "donut", alt: true, title: "Share of stock value", centerLabel: "Stocks", items: d.holdings.slice(0, 6).map((h) => ({ label: h.symbol, value: h.value })) },
        d.holdings.length > 1 ? { kind: "chart", type: "treemap", title: "Share of stock value", items: d.holdings.slice(0, 12).map((h) => ({ label: h.symbol, value: h.value })) } : null,
        d.holdings.length > 1 ? { kind: "chart", alt: true, type: "stacked", title: "Share of stock value", items: d.holdings.slice(0, 8).map((h) => ({ label: h.symbol, value: h.value })) } : null
    ] : [],

    mutualfunds: (d) => {
        const mf = d.mutualFunds;
        if (!mf?.hasData) return [];
        const series = (d.series || []).filter((s) => s.date);
        return [
            { kind: "chart", type: "columns", title: "Invested vs current value", labels: mf.sips.map((s) => s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name), series: [{ name: "Invested", values: mf.sips.map((s) => s.invested), color: "info" }, { name: "Value", values: mf.sips.map((s) => s.currentValue), color: "gold" }] },
            mf.sips.length > 1 ? { kind: "chart", alt: true, type: "lollipop", signed: true, title: "Gain by SIP", items: mf.sips.map((s) => ({ label: s.name, value: s.pnl })) } : null,
            mf.sips.length > 1 ? { kind: "chart", alt: true, type: "bubble", title: "Money put in vs return (size = value)", xLabel: "Invested", yLabel: "Return", xFmt: "money", yFmt: "spct", rLabel: "Value", points: mf.sips.map((s) => ({ label: s.name, x: s.invested, y: s.pnlPct, r: s.currentValue })) } : null,
            { kind: "table", title: "Your SIPs", columns: [{ label: "SIP", fmt: "text" }, { label: "Invested", fmt: "money" }, { label: "Value", fmt: "money" }, { label: "Gain", fmt: "signed" }, { label: "Return", fmt: "spct" }], rows: mf.sips.map((s) => [s.name, s.invested, s.currentValue, s.pnl, s.pnlPct]) },
            series.length > 1 ? { kind: "chart", type: "line", title: "Mutual fund profit over time", labels: series.map((s) => s.date.slice(2, 7)), series: [{ name: "Profit / loss", values: series.map((s) => s.pnl), color: "gold" }] } : null
        ];
    },

    deposits: (d) => d.fds?.length ? [
        { kind: "table", title: "Your fixed deposits", columns: [{ label: "Bank", fmt: "text" }, { label: "Value", fmt: "money" }, { label: "Rate", fmt: "pct" }, { label: "Matures", fmt: "text" }, { label: "Days", fmt: "num" }], rows: d.fds.map((f) => [f.name, f.value, f.rate, f.maturityDate || "–", f.days ?? "–"]) },
        { kind: "chart", type: "bar", title: "Value by deposit", items: d.fds.map((f) => ({ label: f.name, value: f.value })) },
        d.fds.length > 1 ? { kind: "chart", alt: true, type: "treemap", title: "Value by deposit", items: d.fds.map((f) => ({ label: f.name, value: f.value })) } : null,
        d.fds.length > 1 ? { kind: "chart", alt: true, type: "lollipop", title: "Interest rate by deposit", fmt: "pct", items: d.fds.map((f) => ({ label: f.name, value: f.rate })) } : null
    ] : [],

    /* ----- new questions ----- */

    trend: (d) => {
        const m = metrics(d);
        return m.months.some((x) => x.income || x.expense) ? [
            { kind: "chart", type: "columns", title: "Income, expenses and investing", labels: m.months.map((x) => x.label), series: [{ name: "Income", values: m.months.map((x) => x.income), color: "success" }, { name: "Expenses", values: m.months.map((x) => x.expense), color: "danger" }, { name: "Invested", values: m.months.map((x) => x.investment), color: "info" }] },
            { kind: "chart", alt: true, type: "stackcols", title: "Income, expenses and investing", labels: m.months.map((x) => x.label), series: [{ name: "Expenses", values: m.months.map((x) => x.expense), color: "danger" }, { name: "Invested", values: m.months.map((x) => x.investment), color: "info" }] },
            { kind: "chart", type: "line", area: true, title: "Income vs expenses over time", labels: m.months.map((x) => x.label), series: [{ name: "Income", values: m.months.map((x) => x.income), color: "success" }, { name: "Expenses", values: m.months.map((x) => x.expense), color: "danger" }] },
            { kind: "chart", type: "line", title: "Left over each month (income - expenses)", labels: m.months.map((x) => x.label), series: [{ name: "Saved", values: m.months.map((x) => x.income - x.expense), color: "gold" }] },
            { kind: "table", title: "Month by month", columns: [{ label: "Month", fmt: "text" }, { label: "Income", fmt: "money" }, { label: "Expenses", fmt: "money" }, { label: "Saved", fmt: "signed" }], rows: m.months.map((x) => [x.label, x.income, x.expense, x.income - x.expense]) }
        ] : [];
    },

    categories: (d) => {
        const list = d.categoriesMonth?.length ? d.categoriesMonth : d.categories || [];
        const title = d.categoriesMonth?.length ? "Spending by category this month" : "Spending by category";
        const total = list.reduce((s, c) => s + c.amount, 0);
        return list.length ? [
            { kind: "chart", type: "treemap", title, items: list.slice(0, 8).map((c) => ({ label: c.label, value: c.amount })).concat(list.length > 8 ? [{ label: "Other", value: list.slice(8).reduce((s, c) => s + c.amount, 0) }] : []) },
            { kind: "chart", alt: true, type: "donut", title, centerLabel: "Spent", items: list.slice(0, 6).map((c) => ({ label: c.label, value: c.amount })).concat(list.length > 6 ? [{ label: "Other", value: list.slice(6).reduce((s, c) => s + c.amount, 0) }] : []) },
            { kind: "chart", alt: true, type: "stacked", title, items: list.slice(0, 8).map((c) => ({ label: c.label, value: c.amount })) },
            { kind: "chart", alt: true, type: "lollipop", title, items: list.slice(0, 8).map((c) => ({ label: c.label, value: c.amount })) },
            { kind: "chart", alt: true, type: "bar", title, items: list.slice(0, 8).map((c) => ({ label: c.label, value: c.amount })) },
            list.length > 2 ? { kind: "chart", alt: true, type: "radar", title: `${title} (share of the biggest)`, items: radarShares(list.slice(0, 8).map((c) => ({ label: c.label, value: c.amount }))) } : null,
            { kind: "table", title: "Categories", columns: [{ label: "Category", fmt: "text" }, { label: "Spent", fmt: "money" }, { label: "Share", fmt: "pct" }], rows: list.slice(0, 8).map((c) => [c.label, c.amount, (c.amount / total) * 100]) }
        ] : [];
    },

    topexpenses: (d) => d.topExpenses?.length ? [
        { kind: "chart", type: "lollipop", title: "Largest single expenses", items: d.topExpenses.map((e) => ({ label: e.desc, value: e.amount })) },
        { kind: "chart", alt: true, type: "bar", title: "Largest single expenses", items: d.topExpenses.map((e) => ({ label: e.desc, value: e.amount })) },
        { kind: "table", title: "Details", columns: [{ label: "Expense", fmt: "text" }, { label: "Amount", fmt: "money" }, { label: "Date", fmt: "text" }, { label: "Category", fmt: "text" }], rows: d.topExpenses.map((e) => [e.desc, e.amount, e.date, e.category]) }
    ] : [],

    sources: (d) => d.incomeSources?.length ? [
        { kind: "chart", type: "stacked", title: "Where your income comes from", items: d.incomeSources.slice(0, 6).map((s) => ({ label: s.label, value: s.amount })) },
        { kind: "chart", alt: true, type: "donut", title: "Where your income comes from", centerLabel: "Income", items: d.incomeSources.slice(0, 6).map((s) => ({ label: s.label, value: s.amount })) },
        d.incomeSources.length > 1 ? { kind: "chart", alt: true, type: "treemap", title: "Where your income comes from", items: d.incomeSources.slice(0, 8).map((s) => ({ label: s.label, value: s.amount })) } : null,
        { kind: "table", title: "Income sources", columns: [{ label: "Source", fmt: "text" }, { label: "Total", fmt: "money" }], rows: d.incomeSources.slice(0, 8).map((s) => [s.label, s.amount]) }
    ] : [],

    savings: (d) => {
        const m = metrics(d);
        return m.saveRate === null ? [] : [
            gaugeSave(m),
            { kind: "kpi", items: [{ label: "Income", value: m.month.income }, { label: "Expenses", value: m.month.expense }, { label: "Left over", value: m.month.income - m.month.expense, tone: "auto" }] }
        ];
    },

    emergency: (d) => {
        const m = metrics(d);
        return m.runway === null ? [] : [gaugeRunway(m), { kind: "kpi", items: [{ label: "Cash & bank", value: d.income.cash }, { label: "Spends / month", value: m.avgExpense }] }];
    },

    health: (d) => {
        const h = health(d);
        return !h ? [] : [
            { kind: "gauge", title: "Money health score", value: h.score, min: 0, max: 100, fmt: "num", display: `${h.score}`, zones: [{ to: 40, tone: "danger", label: "Needs work" }, { to: 70, tone: "warning", label: "Fair" }, { to: 100, tone: "success", label: "Strong" }] },
            h.parts.length > 2 ? { kind: "chart", type: "radar", title: "Your money health at a glance", items: h.parts.map((p) => ({ label: p.name, value: p.score, display: p.reading, note: "Reading" })) } : null,
            { kind: "chart", alt: true, type: "rings", title: "Your money health, ring by ring", items: h.parts.slice(0, 5).map((p) => ({ label: p.name, value: p.score, display: `${Math.round(p.score)}`, tone: p.score >= 70 ? "success" : p.score >= 40 ? "warning" : "danger", note: p.reading })) },
            { kind: "table", title: "What makes up the score", columns: [{ label: "Factor", fmt: "text" }, { label: "Reading", fmt: "text" }, { label: "Score", fmt: "num" }], rows: h.parts.map((p) => [p.name, p.reading, Math.round(p.score)]) }
        ];
    },

    debt: (d) => {
        const m = metrics(d);
        return [gaugeDebt(d, m), gaugeEmi(d, m), d.totalAssets || d.totalLiabilities ? { kind: "compare", title: "Assets vs liabilities", aLabel: "Assets", bLabel: "Liabilities", rows: [{ label: "Total", a: d.totalAssets, b: d.totalLiabilities, better: false }] } : null];
    },

    spread: (d) => d.chartItems?.length ? [gaugeSpread(metrics(d)), { kind: "chart", type: "donut", title: "Allocation", centerLabel: "Invested", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) }, { kind: "chart", alt: true, type: "treemap", title: "Allocation", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) }, { kind: "chart", alt: true, type: "stacked", title: "Allocation", items: d.chartItems.map((i) => ({ label: i.label, value: i.amount })) }] : [],

    topstocks: (d) => d.holdings?.length ? [
        stockCards([...d.holdings].sort((a, b) => b.pnl - a.pnl), "Your stocks, best first"),
        { kind: "chart", type: "lollipop", signed: true, title: "Best to weakest", items: [...d.holdings].sort((a, b) => b.pnl - a.pnl).map((h) => ({ label: h.symbol, value: h.pnl })) },
        { kind: "chart", alt: true, type: "bar", signed: true, title: "Best to weakest", items: [...d.holdings].sort((a, b) => b.pnl - a.pnl).map((h) => ({ label: h.symbol, value: h.pnl })) },
        { kind: "table", title: "Ranked by profit", columns: [{ label: "Stock", fmt: "text" }, { label: "P&L", fmt: "signed" }, { label: "Return", fmt: "spct" }], rows: [...d.holdings].sort((a, b) => b.pnl - a.pnl).map((h) => [h.symbol, h.pnl, h.pnlPct]) }
    ] : [],

    investments: (d) => investmentVisuals(d),

    forecast: (d) => {
        const f = forecast(d);
        return !f ? [] : [
            { kind: "chart", type: "line", area: true, title: "Net worth, next 12 months (estimate)", labels: f.labels, series: [{ name: "Net worth", values: f.values, color: "gold" }] },
            { kind: "kpi", items: [{ label: "Saved / month", value: f.perMonth, tone: "auto" }, { label: "In 12 months", value: f.values[f.values.length - 1] }] }
        ];
    }
};

/* ---------- investments, compare, forecast ---------- */

function investRows(d) {
    const fdInvested = (d.fds || []).reduce((s, f) => s + f.principal, 0);
    const fdValue = d.deposits?.totalCurrentValue || 0;

    return [
        { id: "stocks", name: "Stocks", invested: d.stocks?.invested || 0, value: d.stocks?.currentValue || 0 },
        { id: "mf", name: "Mutual funds", invested: d.mutualFunds?.invested || 0, value: d.mutualFunds?.currentValue || 0 },
        { id: "fd", name: "Fixed deposits", invested: fdInvested || fdValue, value: fdValue }
    ].filter((r) => r.value > 0 || r.invested > 0).map((r) => ({ ...r, gain: r.value - r.invested, ret: r.invested > 0 ? ((r.value - r.invested) / r.invested) * 100 : 0 }));
}

function investmentVisuals(d) {
    const rows = investRows(d);
    if (!rows.length) return [];

    return [
        { kind: "chart", type: "columns", title: "Invested vs current value", labels: rows.map((r) => r.name), series: [{ name: "Invested", values: rows.map((r) => r.invested), color: "info" }, { name: "Value", values: rows.map((r) => r.value), color: "gold" }] },
        { kind: "chart", type: "lollipop", signed: true, title: "Gain / loss", items: rows.map((r) => ({ label: r.name, value: r.gain })) },
        { kind: "chart", alt: true, type: "bar", signed: true, title: "Gain / loss", items: rows.map((r) => ({ label: r.name, value: r.gain })) },
        rows.length > 1 ? { kind: "chart", alt: true, type: "bubble", title: "Money put in vs return (size = value)", xLabel: "Invested", yLabel: "Return", xFmt: "money", yFmt: "spct", rLabel: "Value", points: rows.map((r) => ({ label: r.name, x: r.invested, y: r.ret, r: r.value })) } : null,
        rows.length > 1 ? { kind: "chart", alt: true, type: "stacked", title: "Share of your investments", items: rows.map((r) => ({ label: r.name, value: r.value })) } : null,
        { kind: "table", title: "Investments side by side", columns: [{ label: "Type", fmt: "text" }, { label: "Invested", fmt: "money" }, { label: "Value", fmt: "money" }, { label: "Gain", fmt: "signed" }, { label: "Return", fmt: "spct" }], rows: rows.map((r) => [r.name, r.invested, r.value, r.gain, r.ret]) }
    ];
}

function forecast(d) {
    const done = lastMonths(d, 6).filter((x) => x.income > 0 || x.expense > 0);
    if (!done.length) return null;

    const perMonth = done.reduce((s, x) => s + (x.income - x.expense), 0) / done.length;
    const now = new Date();
    const labels = [], values = [];

    for (let i = 0; i <= 12; i++) {
        labels.push(i === 0 ? "Now" : monthLabel(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1))));
        values.push(d.netWorth + perMonth * i);
    }

    return { perMonth, labels, values };
}

/* ---------- compare ---------- */

const ENTITIES = [
    ["stocks", /\b(stocks?|shares?|equity|equities)\b/],
    ["mf", /\b(mutual funds?|mf|sips?)\b/],
    ["fd", /\b(fixed deposits?|fds?|deposits?)\b/],
    ["income", /\b(income|earnings?|earned|salary)\b/],
    ["expense", /\b(expenses?|spending|spend|spent)\b/],
    ["cash", /\b(cash|bank)\b/],
    ["lent", /\b(receivables?|lent|lending|owed to me)\b/],
    ["loans", /\b(loans?|emi|debts?|liabilit(y|ies))\b/],
    ["assets", /\bassets?\b/]
];

const COMPARE_WORDS = /\b(compare|compared|comparison|versus|vs|against|difference|better than)\b|\bor\b.*\b(better|more)\b/;

export const isCompare = (text) => COMPARE_WORDS.test(String(text).toLowerCase().replace(/vs\./g, "vs"));

function amountOf(id, d) {
    switch (id) {
        case "stocks": return { label: "Stocks", v: d.stocks?.currentValue || 0 };
        case "mf": return { label: "Mutual funds", v: d.mutualFunds?.currentValue || 0 };
        case "fd": return { label: "Fixed deposits", v: d.deposits?.totalCurrentValue || 0 };
        case "income": return { label: "Income", v: d.income?.income || 0 };
        case "expense": return { label: "Expenses", v: d.income?.expense || 0 };
        case "cash": return { label: "Cash & bank", v: d.income?.cash || 0 };
        case "lent": return { label: "Owed to you", v: d.lending?.peopleReceivable || 0 };
        case "loans": return { label: "Loans", v: d.lending?.loansOutstanding || 0 };
        default: return { label: "Assets", v: d.totalAssets || 0 };
    }
}

export function compareReply(text, d) {
    const t = ` ${String(text).toLowerCase().replace(/vs\./g, "vs")} `;
    const found = ENTITIES.map(([id, re]) => ({ id, at: t.search(re) })).filter((e) => e.at >= 0).sort((a, b) => a.at - b.at).map((e) => e.id);
    const months = lastMonths(d, 2);
    const [prev, cur] = months;

    const wantsMonth = /\b(last month|previous month|prior month|this month|month over month|month on month|mom)\b/.test(t) && found.length < 2;

    if (wantsMonth) {
        if (!d.income?.hasData) return empty("income or expense entries", PAGE.income);
        const rows = [
            { label: "Income", a: cur.income, b: prev.income, better: "high" },
            { label: "Expenses", a: cur.expense, b: prev.expense, better: "low" },
            { label: "Invested", a: cur.investment, b: prev.investment, better: "high" },
            { label: "Left over", a: cur.income - cur.expense, b: prev.income - prev.expense, better: "high" }
        ];
        const dx = cur.expense - prev.expense;
        return {
            text: `This month vs last month (${cur.label} vs ${prev.label}):\n• Expenses: ${dx <= 0 ? "down" : "up"} **${money(Math.abs(dx))}**\n• Left over: ${money(cur.income - cur.expense)} vs ${money(prev.income - prev.expense)}`,
            actions: [PAGE.income],
            blocks: [{ kind: "compare", title: "This month vs last month", aLabel: cur.label, bLabel: prev.label, rows }]
        };
    }

    if (found.includes("income") && found.includes("expense") && found.length <= 2) {
        const m = d.income?.month || { income: 0, expense: 0 };
        if (!d.income?.hasData) return empty("income or expense entries", PAGE.income);
        return {
            text: `Income vs expenses:\n• This month: ${money(m.income)} in, ${money(m.expense)} out\n• All time: ${money(d.income.income)} in, ${money(d.income.expense)} out`,
            actions: [PAGE.income],
            blocks: [{ kind: "compare", title: "Income vs expenses", aLabel: "Income", bLabel: "Expenses", rows: [{ label: "This month", a: m.income, b: m.expense, better: false }, { label: "All time", a: d.income.income, b: d.income.expense, better: false }] }, ...(VISUALS.trend(d).slice(0, 1))]
        };
    }

    const inv = investRows(d);
    const pair = found.slice(0, 2);

    if (pair.length === 2 && pair.every((id) => ["stocks", "mf", "fd"].includes(id))) {
        const [a, b] = pair.map((id) => inv.find((r) => r.id === id) || { name: amountOf(id, d).label, invested: 0, value: 0, gain: 0, ret: 0 });
        if (!a.value && !b.value) return empty("investments to compare", PAGE.dashboard);
        const better = a.ret === b.ret ? "They're level on returns." : `**${(a.ret > b.ret ? a : b).name}** is ahead on returns (${pct(Math.max(a.ret, b.ret))} vs ${pct(Math.min(a.ret, b.ret))}).`;
        return {
            text: `${a.name} vs ${b.name}:\n• ${a.name}: ${money(a.value)} (${pct(a.ret)})\n• ${b.name}: ${money(b.value)} (${pct(b.ret)})\n${better}`,
            actions: [PAGE.dashboard],
            blocks: [{ kind: "compare", title: `${a.name} vs ${b.name}`, aLabel: a.name, bLabel: b.name, rows: [{ label: "Invested", a: a.invested, b: b.invested, better: false }, { label: "Current value", a: a.value, b: b.value, better: "high" }, { label: "Gain / loss", a: a.gain, b: b.gain, better: "high" }, { label: "Return", a: a.ret, b: b.ret, fmt: "spct", better: "high" }] }]
        };
    }

    if (pair.length === 2) {
        const [a, b] = pair.map((id) => amountOf(id, d));
        if (!a.v && !b.v) return empty("figures to compare", PAGE.dashboard);
        const diff = Math.abs(a.v - b.v);
        return {
            text: `${a.label} vs ${b.label}:\n• ${a.label}: ${money(a.v)}\n• ${b.label}: ${money(b.v)}\n**${(a.v >= b.v ? a : b).label}** is higher by ${money(diff)}.`,
            actions: [PAGE.dashboard],
            blocks: [{ kind: "compare", title: `${a.label} vs ${b.label}`, aLabel: a.label, bLabel: b.label, rows: [{ label: "Amount", a: a.v, b: b.v, better: false }] }]
        };
    }

    // Nothing specific named: line up all the investments.
    if (!inv.length) return empty("investments to compare", PAGE.dashboard);
    const best = [...inv].sort((x, y) => y.ret - x.ret)[0];
    return {
        text: `Here are your investments side by side:\n${inv.map((r) => `• ${r.name}: ${money(r.value)} (${pct(r.ret)})`).join("\n")}\nBest return so far: **${best.name}** (${pct(best.ret)}).`,
        actions: [PAGE.dashboard],
        blocks: selectBlocks(investmentVisuals(d))
    };
}

/* ---------- which visual the person asked for ---------- */

export function pickView(text) {
    const t = String(text).toLowerCase();
    if (/\b(table|tabular|rows)\b/.test(t)) return "table";
    if (/\b(gauge|meter|speedometer|dial)\b/.test(t)) return "gauge";
    if (/\b(chart|graph|plot|visual|visually|diagram|pie|donut)\b/.test(t)) return "chart";
    if (/\b(compare|comparison|versus|vs|side by side)\b/.test(t)) return "compare";
    return null;
}

/*
 * "as a treemap", "radar chart", "show it as a waterfall" ... -> which chart type was asked for.
 * "all charts" / "different charts" -> "all" (every chart Rover has for that answer).
 */
const CHART_TYPES = [
    ["all", /\b(all|every|different|various|other|more|more kinds of|many)\s+(types? of |kinds? of |sorts? of )?(charts?|graphs?|visuals?)\b|\b(charts?|graphs?) (types|kinds|options)\b/],
    ["treemap", /\b(tree ?map|treemaps?|tiles?|blocks?)\b/],
    ["radar", /\b(radar|spider|web chart|polar)\b/],
    ["waterfall", /\b(waterfall|bridge chart|step chart)\b/],
    ["bubble", /\b(bubbles?|scatter|dot plot)\b/],
    ["lollipop", /\b(lollipop|lollipops|dots?)\b/],
    ["rings", /\b(rings?|concentric|activity rings?)\b/],
    ["stackcols", /\b(stacked (columns?|bars?)|stacked column chart)\b/],
    ["stacked", /\b(stacked|share bar|strip|100 ?%)\b/],
    ["area", /\b(area|filled line)\b/],
    ["line", /\b(line|lines|trend line|curve)\b/],
    ["columns", /\b(columns?|vertical bars?)\b/],
    ["bar", /\b(bars?|horizontal bars?)\b/],
    ["donut", /\b(donut|doughnut|pie|ring chart)\b/]
];

export function pickChartType(text) {
    const t = String(text || "").toLowerCase();
    const hit = CHART_TYPES.find(([, re]) => re.test(t));
    return hit ? hit[0] : null;
}

const typeMatches = (b, type) => b.kind === "chart" && (type === "area" ? b.type === "line" && b.area : type === "line" ? b.type === "line" : b.type === type);

/* Applies the asked-for view / chart type to a list of blocks. Blocks flagged `alt` show only when asked for. */
export function selectBlocks(blocks, view = null, type = null) {
    if (type === "all") return blocks.filter((b) => b.kind === "chart" || b.kind === "kpi");

    if (type) {
        // "stacked bar" on something with no stacked columns gets the stacked strip instead (and the other way round).
        const tries = type === "stackcols" ? ["stackcols", "stacked"] : type === "stacked" ? ["stacked", "stackcols"] : [type];
        for (const t of tries) {
            const chosen = blocks.filter((b) => typeMatches(b, t));
            if (chosen.length) return chosen;
        }
    }

    const main = blocks.filter((b) => !b.alt);
    if (view) {
        const only = main.filter((b) => b.kind === view);
        if (only.length) return only;
    }

    return main;
}

export function visualsFor(name, d, view = null, type = null) {
    const make = VISUALS[name];
    if (!make) return [];

    let blocks = [];
    try { blocks = make(d).filter(Boolean); } catch (error) { console.error("Rover visuals:", error); }

    return selectBlocks(blocks, view, type);
}

/* ---------- extra intents (same shape as the ones in rover-engine.js) ---------- */

export const EXTRA_INTENTS = [
    {
        name: "trend",
        keys: ["trend", "trends", "monthly trend", "month by month", "over time", "last 6 months", "last six months", "last few months", "monthly history", "history"],
        reply: (d) => {
            const m = metrics(d);
            const active = m.months.filter((x) => x.income || x.expense);
            if (!active.length) return empty("income or expense entries", PAGE.income);
            const avgIn = active.reduce((s, x) => s + x.income, 0) / active.length;
            const avgOut = active.reduce((s, x) => s + x.expense, 0) / active.length;
            return {
                text: `Here are your last ${m.months.length} months:\n• Average income: ${money(avgIn)}\n• Average expenses: ${money(avgOut)}\n• Average left over: **${money(avgIn - avgOut)}**`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "categories",
        keys: ["category", "categories", "spending by category", "expense breakdown", "spending breakdown", "where is my money going", "where did my money go", "expense split", "what do i spend on"],
        reply: (d) => {
            const list = d.categoriesMonth?.length ? d.categoriesMonth : d.categories || [];
            if (!list.length) return empty("expense entries", PAGE.income);
            const total = list.reduce((s, c) => s + c.amount, 0);
            const top = list[0];
            return {
                text: `${d.categoriesMonth?.length ? "This month" : "Overall"} you spent **${money(total)}**.\nThe biggest category is **${top.label}** at ${money(top.amount)} (${((top.amount / total) * 100).toFixed(0)}%).`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "topexpenses",
        keys: ["biggest expense", "biggest expenses", "largest expense", "largest expenses", "top expenses", "top expense", "highest expense", "costliest"],
        reply: (d) => {
            if (!d.topExpenses?.length) return empty("expense entries", PAGE.income);
            const e = d.topExpenses[0];
            return { text: `Your largest expense is **${e.desc}** at ${money(e.amount)} on ${e.date}.`, actions: [PAGE.income] };
        }
    },
    {
        name: "sources",
        keys: ["income source", "income sources", "where does my income come from", "source of income", "sources of income", "who pays me"],
        reply: (d) => {
            if (!d.incomeSources?.length) return empty("income entries", PAGE.income);
            const s = d.incomeSources[0];
            return { text: `Most of your income, **${money(s.amount)}**, comes from **${s.label}**.`, actions: [PAGE.income] };
        }
    },
    {
        name: "savings",
        keys: ["savings rate", "my savings rate", "saving rate", "how much am i saving", "am i saving enough", "how much do i save", "save rate"],
        reply: (d) => {
            const m = metrics(d);
            if (m.saveRate === null) return empty("income entries this month", PAGE.income);
            return {
                text: m.saveRate >= 0
                    ? `You're saving **${m.saveRate.toFixed(0)}%** of this month's income (${money(m.month.income - m.month.expense)} left over).`
                    : `You've spent **${money(m.month.expense - m.month.income)} more** than you earned this month.`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "emergency",
        keys: ["emergency fund", "emergency", "runway", "how long will my cash last", "months of expenses", "cushion", "rainy day"],
        reply: (d) => {
            const m = metrics(d);
            if (m.runway === null) return empty("spending history to measure a cushion", PAGE.income);
            return { text: `Your cash & bank would last about **${m.runway.toFixed(1)} months** at your usual spending.`, actions: [PAGE.income] };
        }
    },
    {
        name: "health",
        keys: ["health score", "money health", "financial score", "financial fitness", "rate my finances", "score my finances", "money score", "my score"],
        reply: (d) => {
            const h = health(d);
            if (!h) return empty("income, spending or assets to score", PAGE.dashboard);
            return {
                text: `Your money health score is **${h.score}/100** (${h.label}).\n${h.parts.map((p) => `• ${p.name}: ${p.reading}`).join("\n")}`,
                actions: [PAGE.intelligence]
            };
        }
    },
    {
        name: "debt",
        keys: ["debt ratio", "debt to asset", "debt to assets", "debt to income", "emi to income", "leverage", "loan burden", "too much debt", "debt burden"],
        reply: (d) => {
            const m = metrics(d);
            if (!d.totalLiabilities) return { text: "You have **no debt** right now, so there's nothing to measure." };
            return {
                text: `Your debt is **${m.debtRatio.toFixed(0)}%** of your assets.` + (m.emiRatio !== null ? `\nEMIs take **${m.emiRatio.toFixed(0)}%** of this month's income.` : ""),
                actions: [PAGE.lending]
            };
        }
    },
    {
        name: "spread",
        keys: ["concentration", "concentrated", "too concentrated", "diversification score", "how diversified", "all my eggs", "one asset", "risk spread"],
        reply: (d) => {
            const m = metrics(d);
            if (m.topShare === null) return empty("investments", PAGE.dashboard);
            return { text: `**${m.topLabel}** holds **${m.topShare.toFixed(0)}%** of your invested assets.`, actions: [PAGE.dashboard] };
        }
    },
    {
        name: "topstocks",
        keys: ["best stock", "worst stock", "top stock", "top stocks", "top holding", "top holdings", "biggest holding", "top gainer", "top gainers", "top loser", "top losers", "best performing", "worst performing", "winners", "losers and gainers", "gainers and losers"],
        reply: (d) => {
            if (!d.holdings?.length) return empty("stock holdings", PAGE.stocks);
            const sorted = [...d.holdings].sort((a, b) => b.pnl - a.pnl);
            const best = sorted[0], worst = sorted[sorted.length - 1];
            return {
                text: `Best: **${best.symbol}** (${signed(best.pnl)}, ${pct(best.pnlPct)}).\n` + (worst !== best ? `Weakest: **${worst.symbol}** (${signed(worst.pnl)}, ${pct(worst.pnlPct)}).` : ""),
                actions: [PAGE.stocks]
            };
        }
    },
    {
        name: "investments",
        keys: ["investments", "my investments", "investment returns", "best investment", "which investment", "where have i invested", "returns on investments", "invested vs value"],
        reply: (d) => {
            const rows = investRows(d);
            if (!rows.length) return empty("investments", PAGE.dashboard);
            const best = [...rows].sort((a, b) => b.ret - a.ret)[0];
            const total = rows.reduce((s, r) => s + r.value, 0);
            const invested = rows.reduce((s, r) => s + r.invested, 0);
            return {
                text: `Your investments are worth **${money(total)}** on ${money(invested)} put in (${pct(invested ? ((total - invested) / invested) * 100 : 0)}).\nBest return so far: **${best.name}** (${pct(best.ret)}).`,
                actions: [PAGE.dashboard]
            };
        }
    },
    {
        name: "forecast",
        keys: ["forecast", "forecast my net worth", "net worth forecast", "projection", "project my", "predict", "in 12 months", "next year", "future net worth", "where will i be", "how much will i have"],
        reply: (d) => {
            const f = forecast(d);
            if (!f) return empty("income or expense history to project from", PAGE.income);
            const end = f.values[f.values.length - 1];
            return {
                text: f.perMonth > 0
                    ? `At your recent pace of saving **${money(f.perMonth)}** a month, your net worth could reach about **${money(end)}** in a year.\nThis is a simple estimate: it ignores market moves and interest.`
                    : `Right now you're spending about **${money(Math.abs(f.perMonth))}** a month more than you earn, so this estimate shows a drop to **${money(end)}** in a year.`,
                actions: [PAGE.networth]
            };
        }
    }
];

/* More suggested questions to show while typing (the engine appends these to SUGGESTIONS). */
export const EXTRA_SUGGESTIONS = [
    "Show my net worth as a gauge",
    "Chart my income vs expenses",
    "Monthly trend",
    "Spending by category",
    "Compare stocks vs mutual funds",
    "Compare this month vs last month",
    "How is my savings rate?",
    "Do I have enough emergency fund?",
    "Give me a money health score",
    "Top gainers and losers",
    "Show my FDs in a table",
    "Largest expenses",
    "Where does my income come from?",
    "Am I too concentrated in one asset?",
    "Show my debt to asset ratio",
    "Forecast my net worth",
    "Compare my investments",
    "Show my stocks as a chart",
    "Spending by category as a treemap",
    "Show my stocks as a bubble chart",
    "Show my money health as a radar chart",
    "Waterfall of my month",
    "Show my net worth as a stacked bar",
    "Show my money health as rings",
    "Show all chart types for my stocks",
    "Show my income sources as a treemap",
    "Show my investments as a bubble chart"
];
