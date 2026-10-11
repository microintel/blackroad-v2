import { formatINR } from "../dashboard/dashboard-service.js";

/*
 * Rover lists (pure logic, no DOM, no storage).
 *
 * General "list" questions that work for every part of BlackRoad:
 *   "list all my stocks", "stocks list", "list all mutual funds", "all expenses list",
 *   "list my FDs", "all loans", "list income this month", "list all my investments" ...
 *
 *   isListRequest(text)   true when the question is a list question (a list word + something to list)
 *   listReply(raw, text, snapshot, view)   the answer, or null when it isn't a list question
 *   LIST_SUGGESTIONS      example questions the suggestion box can match while typing
 *
 * A list word (list, all, every, each, complete, full, details ...) plus a topic word (stock, fund,
 * expense, loan ...) is enough, in any order, so "stocks list" and "list of stocks" both work.
 * Extras are understood too: "this month", "last month", "today", "this week", "biggest", "lowest",
 * "in loss", "in profit", and a category name ("all food expenses").
 */

const money = formatINR;
const signed = (n) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;
const GO = (label, path) => ({ label, path });

const PAGE = {
    stocks: GO("Open Stocks", "/stocks"),
    mutualfund: GO("Open Mutual Fund", "/mutualfund"),
    deposits: GO("Open Fixed Deposits", "/deposits"),
    income: GO("Open Income Statement", "/income"),
    lending: GO("Open Lending", "/lending"),
    notifications: GO("Open Notifications", "/notifications"),
    dashboard: GO("Open Dashboard", "/dashboard")
};

const MAX_ROWS = 40;

const LIST_WORD = /\b(list|lists|listing|listed|all|every|each|entire|complete|full|whole|details|detailed|detail)\b/;
const OPEN_WORD = /\b(open|go to|goto|take me|navigate|visit)\b/;
const AMOUNT_WORD = /\b(how much|how many|total|sum|average|avg|ratio|rate|score|trend|forecast|compare|versus|vs)\b/;

/* Topic words. Order matters only for the order of the answer when several are asked at once. */
const TOPICS = [
    ["stocks", /\b(stocks?|shares?|equity|equities|holdings?|demat|portfolio)\b/],
    ["funds", /\b(mutual funds?|mutual|mfs?|sips?|funds?|step ?ups?)\b/],
    ["fds", /\b(fds?|fixed deposits?|deposits?|maturit(y|ies))\b/],
    ["loans", /\b(loans?|emis?)\b/],
    ["people", /\b(lent|lending|owe[sd]?|receivables?|payables?|borrowers?|debtors?|people|persons?|parties|party)\b/],
    ["dues", /\b(dues?|reminders?|overdue|upcoming)\b/],
    ["income", /\b(income|incomes|earnings?|earned|salary|salaries|credits?)\b/],
    ["expenses", /\b(expenses?|expenditures?|spending|spends|spent|transactions?|bills?|debits?|purchases?)\b/],
    ["categories", /\b(categor(y|ies))\b/],
    ["assets", /\b(assets?|investments?|invested)\b/],
    ["liabilities", /\b(liabilit(y|ies)|debts?)\b/]
];

/* "income statement" / "expense statement" are statement questions, not lists of income. */
const NOT_LIST = /\b(income|expense|profit and loss)s? statement\b/;

function topicsOf(text) {
    let hits = TOPICS.filter(([, re]) => re.test(text)).map(([name]) => name);

    // "mutual funds" must not also count as "stocks" just because of "portfolio"; "emergency fund" isn't a fund list.
    if (/\bemergency fund\b/.test(text)) hits = hits.filter((h) => h !== "funds");
    // A generic investments / assets list already covers stocks, funds and deposits.
    if (hits.includes("assets")) hits = ["assets"];
    return hits;
}

export function isListRequest(text) {
    const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim()} `;
    if (OPEN_WORD.test(t) || NOT_LIST.test(t)) return false;
    if (!LIST_WORD.test(t)) return false;
    // "how much did I spend in all" asks for a number; only an explicit "list" keeps it a list.
    if (AMOUNT_WORD.test(t) && !/\b(list|lists|listing)\b/.test(t)) return false;
    return topicsOf(t).length > 0;
}

/* ---------- time filters (expenses / income) ---------- */

const iso = (d) => d.toISOString().slice(0, 10);

function periodOf(text) {
    const now = new Date();
    const thisMonth = iso(now).slice(0, 7);
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;

    if (/\btoday\b/.test(text)) return { label: "today", keep: (d) => d === iso(now) };
    if (/\byesterday\b/.test(text)) return { label: "yesterday", keep: (d) => d === iso(new Date(Date.now() - 86400000)) };
    if (/\b(this week|past week|last 7 days|last seven days)\b/.test(text)) {
        const from = iso(new Date(Date.now() - 6 * 86400000));
        return { label: "this week", keep: (d) => d >= from && d <= iso(now) };
    }
    if (/\b(last month|previous month)\b/.test(text)) return { label: "last month", keep: (d) => String(d).slice(0, 7) === lastMonth };
    if (/\b(this month|current month|monthly)\b/.test(text)) return { label: "this month", keep: (d) => String(d).slice(0, 7) === thisMonth };
    if (/\b(this year|current year)\b/.test(text)) return { label: "this year", keep: (d) => String(d).slice(0, 4) === String(now.getFullYear()) };
    return { label: "", keep: () => true };
}

const wantsBiggest = (t) => /\b(biggest|largest|highest|top|costliest|most)\b/.test(t);
const wantsSmallest = (t) => /\b(smallest|lowest|least|cheapest)\b/.test(t);

/* ---------- small builders ---------- */

const col = (label, fmt, logo) => ({ label, fmt, ...(logo ? { logo } : {}) });

const table = (title, columns, rows, extra = {}) => {
    const shown = rows.slice(0, MAX_ROWS);
    const more = rows.length - shown.length;
    return { kind: "table", title, columns, rows: shown, ...(more > 0 ? { note: `Showing the first ${shown.length} of ${rows.length}. ${extra.more || "Open the page to see the rest."}` } : {}) };
};

const empty = (what, action) => ({
    text: `I can't see any ${what} yet. Add some and I'll be able to list them for you.`,
    actions: action ? [action] : []
});

/* ---------- one builder per topic: { text, blocks, actions } or null ---------- */

function stocksList(d, text, view) {
    let list = [...(d.holdings || [])];
    if (!list.length) return { empty: ["stock holdings", PAGE.stocks] };

    let label = "stocks";
    if (/\b(loss|losing|losers?|negative|red)\b/.test(text)) { list = list.filter((h) => h.pnl < 0); label = "stocks in loss"; }
    else if (/\b(profit|profitable|gainers?|winners?|positive|green)\b/.test(text)) { list = list.filter((h) => h.pnl > 0); label = "stocks in profit"; }
    if (!list.length) return { text: `📭 None of your holdings match **${label}** right now.`, actions: [PAGE.stocks], blocks: [] };

    if (wantsBiggest(text)) list.sort((a, b) => b.pnl - a.pnl);
    else if (wantsSmallest(text)) list.sort((a, b) => a.pnl - b.pnl);

    const value = list.reduce((s, h) => s + h.value, 0);
    const invested = list.reduce((s, h) => s + h.invested, 0);
    const pnl = value - invested;
    const items = list.map((h) => ({ symbol: h.symbol, name: h.name, qty: h.quantity, avg: h.avg, ltp: h.ltp, value: h.value, pnl: h.pnl, pnlPct: h.pnlPct }));

    const blocks = [
        { kind: "kpi", items: [{ label: "Value", value }, { label: "Invested", value: invested }, { label: "Profit / loss", value: pnl, tone: "auto" }] }
    ];
    if (view === "table") {
        blocks.push(table("Your stocks", [col("Stock", "text"), col("Qty", "num"), col("Avg", "money"), col("LTP", "money"), col("Value", "money"), col("P&L", "signed"), col("Return", "spct")],
            list.map((h) => [h.symbol, h.quantity, h.avg, h.ltp, h.value, h.pnl, h.pnlPct]), { more: "Open Stocks to see the rest." }));
    } else {
        blocks.push({ kind: "stocklist", title: `Your ${label}`, items, limit: 100 });
    }

    return {
        text: `📊 **${plural(list.length, "stock")}** · worth **${money(value)}** on ${money(invested)} invested (${signed(pnl)}).`,
        blocks, actions: [PAGE.stocks]
    };
}

function fundsList(d) {
    const m = d.mutualFunds;
    if (!m?.hasData) return { empty: ["mutual fund or SIP entries", PAGE.mutualfund] };
    return {
        text: `🌱 **${plural(m.sips.length, "mutual fund SIP")}** · worth **${money(m.currentValue)}** on ${money(m.invested)} invested (${signed(m.pnl)}).`,
        blocks: [
            { kind: "kpi", items: [{ label: "Value", value: m.currentValue }, { label: "Invested", value: m.invested }, { label: "Gain", value: m.pnl, tone: "auto" }] },
            table("Your mutual funds", [col("Fund / SIP", "text", "mf"), col("Invested", "money"), col("Value", "money"), col("Gain", "signed"), col("Return", "spct")],
                [...m.sips].sort((a, b) => b.currentValue - a.currentValue).map((s) => [s.name, s.invested, s.currentValue, s.pnl, s.pnlPct]), { more: "Open Mutual Fund to see the rest." })
        ],
        actions: [PAGE.mutualfund]
    };
}

function fdsList(d) {
    const fds = d.fds || [];
    if (!fds.length) return { empty: ["active fixed deposits", PAGE.deposits] };
    const value = fds.reduce((s, f) => s + f.value, 0);
    const principal = fds.reduce((s, f) => s + f.principal, 0);
    return {
        text: `🏦 **${plural(fds.length, "active fixed deposit")}** · worth **${money(value)}** on ${money(principal)} put in.`,
        blocks: [
            { kind: "kpi", items: [{ label: "Value", value }, { label: "Principal", value: principal }, { label: "Interest earned", value: value - principal, tone: "auto" }] },
            table("Your fixed deposits", [col("Bank", "text"), col("Principal", "money"), col("Value", "money"), col("Rate", "pct"), col("Matures", "text"), col("Days", "num")],
                fds.map((f) => [f.name, f.principal, f.value, f.rate, f.maturityDate || "–", f.days ?? "–"]), { more: "Open Fixed Deposits to see the rest." })
        ],
        actions: [PAGE.deposits]
    };
}

const STATUS = { overdue: "Overdue", "due-soon": "Due soon", open: "Open", settled: "Settled" };

function loansList(d) {
    const loans = d.loans || [];
    if (!loans.length) return { empty: ["loans", PAGE.lending] };
    const active = loans.filter((l) => l.outstanding > 0);
    const out = active.reduce((s, l) => s + l.outstanding, 0);
    const emi = active.reduce((s, l) => s + l.emi, 0);
    return {
        text: `🧾 **${plural(loans.length, "loan")}** (${active.length} active) · **${money(out)}** outstanding, **${money(emi)}** EMI a month.`,
        blocks: [
            { kind: "kpi", items: [{ label: "Outstanding", value: out }, { label: "Monthly EMI", value: emi }, { label: "Active", value: active.length, fmt: "num" }] },
            table("Your loans", [col("Lender", "text"), col("Loan", "money"), col("Outstanding", "money"), col("EMI", "money"), col("Next due", "text"), col("Status", "text")],
                loans.map((l) => [l.lender, l.principal, l.outstanding, l.emi, l.nextDue || "–", STATUS[l.status] || l.status]), { more: "Open Lending to see the rest." })
        ],
        actions: [PAGE.lending]
    };
}

function peopleList(d) {
    const people = d.people || [];
    if (!people.length) return { empty: ["lending records", PAGE.lending] };
    const get = people.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0);
    const owe = people.filter((p) => p.balance < 0).reduce((s, p) => s - p.balance, 0);
    return {
        text: `🤝 **${plural(people.length, "person", "people")}** with a balance · they owe you **${money(get)}**${owe ? `, you owe **${money(owe)}**` : ""}.`,
        blocks: [
            table("People", [col("Person", "text"), col("Balance", "signed"), col("Status", "text")],
                people.map((p) => [p.name, p.balance, p.balance > 0 ? "Owes you" : "You owe"]), { more: "Open Lending to see the rest." })
        ],
        actions: [PAGE.lending]
    };
}

function duesList(d) {
    const dues = d.dues || [];
    if (!dues.length) return { text: "✅ Nothing is due or upcoming right now.", actions: [PAGE.notifications], blocks: [] };
    const total = dues.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return {
        text: `🔔 **${plural(dues.length, "upcoming item")}** · ${money(total)} in total.`,
        blocks: [{ kind: "reminders", title: "What's due", items: dues.slice(0, MAX_ROWS).map((i) => ({ title: i.title, amount: i.amount, date: i.date, type: i.type })) }],
        actions: [PAGE.notifications]
    };
}

function expensesList(d, text) {
    const all = d.allExpenses || [];
    if (!all.length) return { empty: ["expense entries", PAGE.income] };

    const period = periodOf(text);
    // A category named in the question ("all food expenses") narrows the list.
    const cat = (d.categories || []).find((c) => new RegExp(`\\b${c.label.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "\\s+")}\\b`).test(text) && c.label.trim().length > 2);
    let list = all.filter((e) => period.keep(String(e.date)) && (!cat || e.category === cat.label));

    const what = [cat ? cat.label : "", "expenses", period.label].filter(Boolean).join(" ");
    if (!list.length) return { text: `📭 I don't see any **${what}**.`, actions: [PAGE.income], blocks: [] };

    if (wantsBiggest(text)) list = [...list].sort((a, b) => b.amount - a.amount);
    else if (wantsSmallest(text)) list = [...list].sort((a, b) => a.amount - b.amount);

    const total = list.reduce((s, e) => s + e.amount, 0);
    return {
        text: `🧾 **${plural(list.length, "expense")}**${period.label || cat ? ` (${[cat?.label, period.label].filter(Boolean).join(", ")})` : ""} · **${money(total)}** in total.`,
        blocks: [
            { kind: "kpi", items: [{ label: "Entries", value: list.length, fmt: "num" }, { label: "Total", value: total }, { label: "Average", value: total / list.length }] },
            table(`All ${what}`, [col("Date", "text"), col("Expense", "text"), col("Category", "text"), col("Amount", "money")],
                list.map((e) => [e.date, e.desc, e.category, e.amount]), { more: "Open Income Statement to see the rest." })
        ],
        actions: [PAGE.income]
    };
}

function incomeList(d, text) {
    const all = d.allIncome || [];
    if (!all.length) return { empty: ["income entries", PAGE.income] };

    const period = periodOf(text);
    let list = all.filter((e) => period.keep(String(e.date)));
    const what = ["income", period.label].filter(Boolean).join(" ");
    if (!list.length) return { text: `📭 I don't see any **${what}**.`, actions: [PAGE.income], blocks: [] };

    if (wantsBiggest(text)) list = [...list].sort((a, b) => b.amount - a.amount);
    else if (wantsSmallest(text)) list = [...list].sort((a, b) => a.amount - b.amount);

    const total = list.reduce((s, e) => s + e.amount, 0);
    return {
        text: `💰 **${plural(list.length, "income entry", "income entries")}**${period.label ? ` (${period.label})` : ""} · **${money(total)}** in total.`,
        blocks: [
            { kind: "kpi", items: [{ label: "Entries", value: list.length, fmt: "num" }, { label: "Total", value: total }, { label: "Average", value: total / list.length }] },
            table(`All ${what}`, [col("Date", "text"), col("Source", "text"), col("Category", "text"), col("Amount", "money")],
                list.map((e) => [e.date, e.source, e.category || "–", e.amount]), { more: "Open Income Statement to see the rest." })
        ],
        actions: [PAGE.income]
    };
}

function categoriesList(d, text) {
    const period = periodOf(text);
    const list = period.label === "this month" && d.categoriesMonth?.length ? d.categoriesMonth : d.categories || [];
    if (!list.length) return { empty: ["expense entries", PAGE.income] };
    const total = list.reduce((s, c) => s + c.amount, 0);
    return {
        text: `🗂️ **${plural(list.length, "expense category", "expense categories")}** · **${money(total)}** ${period.label === "this month" ? "this month" : "overall"}.`,
        blocks: [table("Spending by category", [col("Category", "text"), col("Spent", "money"), col("Share", "pct")], list.map((c) => [c.label, c.amount, (c.amount / total) * 100]), { more: "Open Income Statement to see the rest." })],
        actions: [PAGE.income]
    };
}

function assetsList(d) {
    const items = d.chartItems || [];
    if (!items.length) return { empty: ["investments or receivables", PAGE.dashboard] };
    const total = items.reduce((s, i) => s + i.amount, 0);
    return {
        text: `💼 **${plural(items.length, "asset class", "asset classes")}** · **${money(total)}** in total.`,
        blocks: [table("Your assets", [col("Asset", "text"), col("Value", "money"), col("Share", "pct")], [...items].sort((a, b) => b.amount - a.amount).map((i) => [i.label, i.amount, i.pct]))],
        actions: [PAGE.dashboard]
    };
}

function liabilitiesList(d) {
    const rows = [];
    (d.loans || []).filter((l) => l.outstanding > 0).forEach((l) => rows.push([`Loan: ${l.lender}`, l.outstanding]));
    (d.people || []).filter((p) => p.balance < 0).forEach((p) => rows.push([`Owed to ${p.name}`, -p.balance]));
    if (!rows.length) return { text: "✅ You have **no liabilities** right now.", actions: [PAGE.lending], blocks: [] };
    const total = rows.reduce((s, r) => s + r[1], 0);
    return {
        text: `📉 **${plural(rows.length, "liability", "liabilities")}** · **${money(total)}** in total.`,
        blocks: [table("Your liabilities", [col("What", "text"), col("Amount", "money")], rows.sort((a, b) => b[1] - a[1]))],
        actions: [PAGE.lending]
    };
}

const BUILDERS = {
    stocks: stocksList, funds: fundsList, fds: fdsList, loans: loansList, people: peopleList, dues: duesList,
    income: incomeList, expenses: expensesList, categories: categoriesList, assets: assetsList, liabilities: liabilitiesList
};

/* "list all my investments" = stocks + mutual funds + fixed deposits in one go. */
const ASSET_PARTS = ["stocks", "funds", "fds"];

export function listReply(raw, text, d, view = null) {
    const t = ` ${String(text || raw || "").toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim()} `;
    if (!isListRequest(t)) return null;

    let topics = topicsOf(t);
    if (topics.includes("assets")) topics = [...ASSET_PARTS];
    if (!topics.length) return null;

    const parts = topics.map((name) => {
        try { return BUILDERS[name](d || {}, t, view); } catch (error) { console.error("Rover list:", error); return null; }
    }).filter(Boolean);

    if (!parts.length) return null;

    // One topic with nothing to list -> the friendly "nothing yet" answer.
    const filled = parts.filter((p) => !p.empty);
    if (!filled.length) {
        const [what, action] = parts[0].empty;
        return empty(what, action);
    }

    const actions = [];
    filled.forEach((p) => (p.actions || []).forEach((a) => { if (!actions.some((x) => x.path === a.path)) actions.push(a); }));

    const out = {
        text: filled.map((p) => p.text).join("\n"),
        actions
    };
    const blocks = filled.flatMap((p) => p.blocks || []);
    if (blocks.length) out.blocks = blocks;
    return out;
}

export const LIST_SUGGESTIONS = [
    "List all my stocks",
    "Stocks list",
    "List all mutual funds",
    "List all expenses",
    "All expenses this month",
    "List my fixed deposits",
    "List all my loans",
    "List all my income",
    "List all my investments",
    "List all expense categories",
    "List who owes me money",
    "List everything due soon",
    "List stocks in loss",
    "List stocks in profit",
    "List biggest expenses",
    "List today's expenses"
];
