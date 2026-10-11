import { formatINR } from "../dashboard/dashboard-service.js";
import { visualsFor, selectBlocks } from "./rover-queries.js";

/*
 * Rover, more questions (pure logic, no DOM, no storage).
 *
 *   MORE_INTENTS         extra questions about BlackRoad: income statement, reminders / dues,
 *                        single stocks, how-to's, backup, calculators, insights ...
 *   lookupReply()        "how is Reliance doing?" / "how much did I spend on food?"
 *   moreVisualsFor()     the stock cards, statement rows and reminder rows that go with an answer
 *   MORE_SUGGESTIONS     example questions the suggestion box can match while typing
 *
 * Same shape as rover-engine.js / rover-queries.js: add an entry to MORE_INTENTS to teach Rover
 * a new question. `reply(snapshot, text)` gets the snapshot and the normalized question.
 *
 * Visual blocks used here are plain data (drawn by rover-visuals.js):
 *   { kind: "stocklist",  title, items: [{ symbol, name, qty, avg, ltp, value, pnl, pnlPct }], hero }
 *   { kind: "statement",  title, sections: [{ title, rows: [{ icon, label, value, fmt, tone, sub, bar, total }] }] }
 *   { kind: "reminders",  title, items: [{ title, amount, date, type }] }
 */

const money = formatINR;
const signed = (n) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const pct = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(1)}%`;
const GO = (label, path) => ({ label, path });

const PAGE = {
    income: GO("Open Income Statement", "/income"),
    dashboard: GO("Open Dashboard", "/dashboard"),
    stocks: GO("Open Stocks", "/stocks"),
    deposits: GO("Open Fixed Deposits", "/deposits"),
    lending: GO("Open Lending", "/lending"),
    mutualfund: GO("Open Mutual Fund", "/mutualfund"),
    notifications: GO("Open Notifications", "/notifications"),
    calculators: GO("Open Calculators", "/calculators"),
    data: GO("Open Data Management", "/data"),
    account: GO("Open Account", "/account"),
    accounting: GO("Open Accounting", "/accounting")
};

const empty = (what, action) => ({
    text: `I can't see any ${what} yet. Add some and I'll be able to show you more.`,
    actions: action ? [action] : []
});

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- emoji for expense / income categories ---------- */

const CATEGORY_ICONS = [
    [/swiggy|zomato|zepto|blinkit|bigbasket/i, "🛵"],
    [/food|snack|samosa|tiffin|lunch|bakery|biscuit|egg|milk|bread|curd|drink|juice/i, "🍽️"],
    [/travel|tour|transport|vehicle|car\b|fuel/i, "🚗"],
    [/health|medic/i, "🏥"],
    [/educat|school|course/i, "🎓"],
    [/shop|apparel|cloth|fashion|style|electronic/i, "🛍️"],
    [/entertain|movie|party|sport|friends|social/i, "🎬"],
    [/hous|home|rent|repair/i, "🏠"],
    [/bank|tax|penalty|official/i, "🏦"],
    [/mobile|recharge|telephone|phone/i, "📱"],
    [/gift|donate|help/i, "🎁"],
    [/family|mother|dad|brother|sister|baby|heart/i, "👨‍👩‍👧"],
    [/pet/i, "🐾"],
    [/beauty|personal/i, "💄"],
    [/salary|bonus|business|freelance/i, "💼"],
    [/dividend|interest|profit|return/i, "💹"],
    [/stock/i, "📈"],
    [/sip|mutual/i, "🪙"],
    [/fd|deposit/i, "🏛️"],
    [/wine|cigarette/i, "🍷"]
];

const catIcon = (label) => (CATEGORY_ICONS.find(([re]) => re.test(String(label))) || [null, "📦"])[1];

/* ---------- months ---------- */

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthName = (key, style = "long") => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString("en", { month: style });

/* This month and last month; the current month uses the Dashboard's own figures. */
function twoMonths(d) {
    const have = new Map((d.monthly || []).map((m) => [m.key, m]));
    const now = new Date();
    const mk = (offset) => {
        const key = monthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1));
        const m = have.get(key) || { income: 0, expense: 0, investment: 0 };
        return { key, label: monthName(key), income: m.income || 0, expense: m.expense || 0, investment: m.investment || 0 };
    };
    const cur = mk(0), prev = mk(-1);
    const live = d.income?.month;
    if (live) Object.assign(cur, { income: live.income || 0, expense: live.expense || 0, investment: live.investment || 0 });
    return { cur, prev };
}

function sixMonths(d) {
    const have = new Map((d.monthly || []).map((m) => [m.key, m]));
    const now = new Date();
    const out = [];
    for (let i = 5; i >= 0; i--) {
        const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
        const m = have.get(key) || { income: 0, expense: 0, investment: 0 };
        out.push({ key, label: monthName(key, "short"), income: m.income || 0, expense: m.expense || 0, investment: m.investment || 0 });
    }
    const live = d.income?.month;
    if (live) Object.assign(out[5], { income: live.income || 0, expense: live.expense || 0, investment: live.investment || 0 });
    return out;
}

/* ---------- statement rows (income statement with emoji) ---------- */

const rate = (m) => (m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null);

function monthSection(m, title) {
    const left = m.income - m.expense;
    const r = rate(m);
    return {
        title: title || m.label,
        rows: [
            { icon: "💰", label: "Income", value: m.income },
            { icon: "🧾", label: "Expenses", value: m.expense },
            { icon: "📈", label: "Invested", value: m.investment },
            { icon: left >= 0 ? "✅" : "⚠️", label: "Left over", value: left, fmt: "signed", tone: "auto", total: true },
            ...(r === null ? [] : [{ icon: "🎯", label: "Savings rate", value: r, fmt: "pct", tone: r >= 20 ? "success" : r >= 10 ? "" : "danger" }])
        ]
    };
}

function allTimeSection(d) {
    const l = d.ledger;
    const income = l ? l.income : d.income?.income || 0;
    const expense = l ? l.expense : d.income?.expense || 0;
    return {
        title: "All time",
        rows: [
            { icon: "💰", label: "Total income", value: income },
            { icon: "🧾", label: "Total expenses", value: expense },
            ...(l && l.contributions ? [{ icon: "📈", label: "Invested", value: l.contributions }] : []),
            ...(l && l.assetSales ? [{ icon: "🔄", label: "Investments sold", value: l.assetSales }] : []),
            ...(l && l.realizedGainLoss ? [{ icon: "🏦", label: "Realised gain / loss", value: l.realizedGainLoss, fmt: "signed", tone: "auto" }] : []),
            { icon: "💵", label: "Cash & bank", value: d.income?.cash || 0, total: true }
        ]
    };
}

const trendBlock = (d) => {
    const m = sixMonths(d);
    return m.some((x) => x.income || x.expense) ? {
        kind: "chart", type: "columns", title: "Last 6 months", labels: m.map((x) => x.label),
        series: [{ name: "Income", values: m.map((x) => x.income), color: "success" }, { name: "Expenses", values: m.map((x) => x.expense), color: "danger" }]
    } : null;
};

const monthCompare = (cur, prev) => ({
    kind: "compare", title: "This month vs last month", aLabel: cur.label, bLabel: prev.label,
    rows: [
        { label: "Income", a: cur.income, b: prev.income, better: "high" },
        { label: "Expenses", a: cur.expense, b: prev.expense, better: "low" },
        { label: "Left over", a: cur.income - cur.expense, b: prev.income - prev.expense, better: "high" }
    ]
});

/* ---------- stock cards ---------- */

const stockItem = (h) => ({ symbol: h.symbol, name: h.name || h.symbol, qty: h.quantity, avg: h.avg ?? (h.quantity ? h.invested / h.quantity : 0), ltp: h.ltp ?? (h.quantity ? h.value / h.quantity : 0), value: h.value, pnl: h.pnl, pnlPct: h.pnlPct });
const stockBlock = (list, title, extra = {}) => ({ kind: "stocklist", title, items: list.map(stockItem), ...extra });
const byPnl = (d) => [...(d.holdings || [])].sort((a, b) => b.pnl - a.pnl);

/* ---------- reminders / dues ---------- */

const dueType = (title) => (/EMI due/i.test(title) ? "emi" : /matures/i.test(title) ? "fd" : /expected back/i.test(title) ? "back" : "owe");
const DUE_ICON = { emi: "💳", fd: "🏛️", back: "📥", owe: "📤" };
const STATUS_ICON = { overdue: "🔴", "due-soon": "🟠", upcoming: "🟢" };

const cap = (t) => String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
const dues = (d) => (d.dues || []).map((x) => ({ ...x, title: cap(x.title), type: dueType(x.title) }));
const dueBlock = (list, title = "Upcoming dues") => (list.length ? { kind: "reminders", title, items: list.slice(0, 8).map((x) => ({ title: x.title, amount: x.amount, date: x.date, type: x.type })) } : null);

const whenText = (days) => (days < 0 ? `${plural(-days, "day")} overdue` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const prettyDate = (iso) => { const t = new Date(`${iso}T00:00:00`); return Number.isNaN(t.getTime()) ? iso : t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

const nextLine = (x) => `Next up: ${DUE_ICON[x.type]} **${x.title}**, ${money(x.amount)} on ${prettyDate(x.date)} (${whenText(x.days)}).`;

function dueReply(list, { none, lead, what }) {
    if (!list.length) return { text: none, actions: [PAGE.notifications] };
    const over = list.filter((x) => x.status === "overdue").length;
    const soon = list.filter((x) => x.status === "due-soon").length;
    const later = list.length - over - soon;
    return {
        text:
            `${lead(list.length)}\n` +
            (over ? `• 🔴 Overdue: ${over}\n` : "") +
            (soon ? `• 🟠 Due within 7 days: ${soon}\n` : "") +
            (later ? `• 🟢 Later: ${later}\n` : "") +
            nextLine(list[0]),
        actions: [PAGE.notifications],
        blocks: [dueBlock(list, what)]
    };
}

/* ---------- how to ---------- */

const HOWTO = [
    { re: /stock|share|buy|sell|equity|demat/, text: "📈 **Add a stock trade**", steps: ["Open **Stocks** from the menu.", "Tap **Add transaction** (the + button).", "Type the symbol (you'll see its logo and live price), then choose buy or sell, quantity and price.", "Save. Your holding, profit and loss update by themselves."], go: PAGE.stocks },
    { re: /\bfd\b|fixed|deposit/, text: "🏛️ **Add a fixed deposit**", steps: ["Open **Fixed Deposits**.", "Tap **Add deposit**.", "Enter the bank, amount, interest rate and start / maturity dates.", "Save. Its maturity shows up in your reminders."], go: PAGE.deposits },
    { re: /loan|emi|borrow/, text: "💳 **Add a loan**", steps: ["Open **Lending** and go to the loans tab.", "Tap **Add loan** and enter the lender, amount, EMI and dates.", "Use **Pay EMI** each month so the outstanding amount stays right."], go: PAGE.lending },
    { re: /lend|person|friend|owe|gave|given|people/, text: "🤝 **Track money you lent or owe**", steps: ["Open **Lending**.", "Tap **Add person**, then **Add entry** for each amount given or taken.", "Set a due date and it appears in your reminders."], go: PAGE.lending },
    { re: /sip|mutual|\bmf\b|fund/, text: "🪙 **Add a mutual fund / SIP**", steps: ["Open **Mutual Fund**.", "Fill in the fund and tap **Add entry**.", "Your invested amount and gain show up on the Dashboard."], go: PAGE.mutualfund },
    { re: /./, text: "🧾 **Add income or an expense**", steps: ["Open **Income Statement**.", "Tap **Add income** (the + button) for money coming in.", "Add your expenses inside the entry.", "Savings rate and cash balance update right away."], go: PAGE.income }
];

function howTo(text) {
    const hit = HOWTO.find((h) => h.re.test(text));
    return {
        text: `${hit.text}\n${hit.steps.map((s, i) => `• ${i + 1}. ${s}`).join("\n")}\nTip: I can also tell you how to add stocks, FDs, loans, SIPs or income.`,
        actions: [hit.go]
    };
}

/* ---------- the extra intents ---------- */

export const MORE_INTENTS = [
    /* ===== income statement ===== */
    {
        name: "statement",
        keys: ["income statement", "income statements", "income and expense", "income expense statement", "profit and loss statement", "ledger summary", "my ledger", "cash flow", "cashflow", "net cash flow", "money in and out", "statement summary", "my statement"],
        reply: (d) => {
            if (!d.income?.hasData) return empty("income or expense entries", PAGE.income);
            const { cur } = twoMonths(d);
            const left = cur.income - cur.expense;
            const r = rate(cur);
            return {
                text:
                    `🧾 **Income statement, ${cur.label}:** you earned **${money(cur.income)}**, spent **${money(cur.expense)}** ` +
                    (left >= 0 ? `and kept **${money(left)}**${r === null ? "" : ` (${r.toFixed(0)}% saved)`} ✅` : `and overspent by **${money(-left)}** ⚠️`) + `.`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "lastmonth",
        keys: ["last month", "previous month", "prior month", "last months expenses", "last month income", "how much did i spend last month", "spent last month"],
        reply: (d) => {
            if (!d.income?.hasData) return empty("income or expense entries", PAGE.income);
            const { cur, prev } = twoMonths(d);
            if (!prev.income && !prev.expense) return { text: `📭 I don't see any entries for **${prev.label}**.`, actions: [PAGE.income] };
            const left = prev.income - prev.expense;
            const dx = cur.expense - prev.expense;
            return {
                text:
                    `📅 **${prev.label}** (last month): you earned ${money(prev.income)}, spent ${money(prev.expense)} and ${left >= 0 ? "kept" : "overspent by"} **${money(Math.abs(left))}**.\n` +
                    `This month you've spent **${money(cur.expense)}** so far, ${dx <= 0 ? "📉 " + money(Math.abs(dx)) + " less" : "📈 " + money(dx) + " more"} than ${prev.label}.`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "earned",
        keys: ["how much did i earn", "how much have i earned", "how much i earned", "my earnings", "total income", "income this month", "earned this month", "salary this month", "how much salary"],
        reply: (d) => {
            if (!d.income?.hasData) return empty("income entries", PAGE.income);
            const { cur, prev } = twoMonths(d);
            const top = d.incomeSources?.[0];
            return {
                text:
                    `💰 This month you've earned **${money(cur.income)}**` + (prev.income ? ` (${prev.label}: ${money(prev.income)}).` : ".") + `\n` +
                    `All time you've earned ${money(d.income.income)}.` + (top ? `\n💼 Biggest source: **${top.label}** at ${money(top.amount)}.` : ""),
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "spentnow",
        keys: ["how much did i spend", "how much have i spent", "how much i spent", "total expenses", "total spending", "expenses this month", "spent this month", "spending so far"],
        reply: (d) => {
            if (!d.income?.hasData) return empty("expense entries", PAGE.income);
            const { cur, prev } = twoMonths(d);
            const list = d.categoriesMonth?.length ? d.categoriesMonth : [];
            const top = list[0];
            return {
                text:
                    `🧾 This month you've spent **${money(cur.expense)}**` + (prev.expense ? ` (${prev.label}: ${money(prev.expense)}).` : ".") +
                    (top ? `\n${catIcon(top.label)} Biggest category: **${top.label}** at ${money(top.amount)}.` : "") +
                    `\nAll time you've spent ${money(d.income.expense)}.`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "recent",
        keys: ["today", "todays", "today s expenses", "this week", "weekly", "past week", "last 7 days", "last seven days", "recent expenses", "latest expenses", "recent transactions", "latest transactions", "recent spending", "last transactions", "what did i spend"],
        reply: (d) => {
            const s = d.spanTotals;
            if (!d.income?.hasData || !s) return empty("income or expense entries", PAGE.income);
            return {
                text: s.week.expense === 0 && d.recentExpenses?.length
                    ? `🗓️ Nothing spent in the last 7 days. Your most recent expense was **${d.recentExpenses[0].desc}** (${money(d.recentExpenses[0].amount)}) on ${prettyDate(d.recentExpenses[0].date)}.`
                    : `🗓️ Today you've spent **${money(s.today.expense)}**. In the last 7 days you spent **${money(s.week.expense)}**` + (s.week.income ? ` and earned ${money(s.week.income)}.` : "."),
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "averages",
        keys: ["average expense", "average expenses", "average spending", "average monthly", "monthly average", "avg expense", "avg spending", "average income", "average saving", "average savings", "per month", "monthly spend"],
        reply: (d) => {
            const m = sixMonths(d).filter((x) => x.income || x.expense);
            if (!m.length) return empty("income or expense entries", PAGE.income);
            const avg = (k) => m.reduce((s, x) => s + x[k], 0) / m.length;
            const left = avg("income") - avg("expense");
            return {
                text: `📊 Over the last ${plural(m.length, "month")} you earned about **${money(avg("income"))}** and spent about **${money(avg("expense"))}** a month, ${left >= 0 ? "leaving" : "falling short by"} **${money(Math.abs(left))}**.`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "extremes",
        keys: ["highest spending month", "most expensive month", "best month", "worst month", "which month", "highest income month", "lowest spending month", "biggest month", "costliest month"],
        reply: (d) => {
            const m = sixMonths(d).filter((x) => x.income || x.expense);
            if (!m.length) return empty("income or expense entries", PAGE.income);
            const hi = [...m].sort((a, b) => b.expense - a.expense)[0];
            const lo = [...m].sort((a, b) => a.expense - b.expense)[0];
            const best = [...m].sort((a, b) => (b.income - b.expense) - (a.income - a.expense))[0];
            return {
                text:
                    `🏆 Across the last ${plural(m.length, "month")}:\n` +
                    `• 🔺 Highest spending: ${monthName(hi.key)} (${money(hi.expense)})\n` +
                    `• 🔻 Lowest spending: ${monthName(lo.key)} (${money(lo.expense)})\n` +
                    `• ⭐ Best month for saving: ${monthName(best.key)} (${signed(best.income - best.expense)})`,
                actions: [PAGE.income]
            };
        }
    },
    {
        name: "realized",
        keys: ["realised", "realized", "realised profit", "realized profit", "realised gain", "realized gain", "booked profit", "profit booked", "capital gain", "capital gains", "gain on sale"],
        reply: (d) => {
            const gain = d.ledger?.realizedGainLoss || 0;
            const open = d.stocks?.pnl || 0;
            if (!d.ledger && !d.stocks?.holdings) return empty("investment sales", PAGE.income);
            return {
                text: `🏦 You've booked **${signed(gain)}** from investments you sold. Still unrealised: ${signed(open)} in stocks and ${signed(d.mutualFunds?.pnl || 0)} in mutual funds.`,
                actions: [PAGE.income]
            };
        }
    },

    /* ===== reminders ===== */
    {
        name: "reminders",
        keys: ["reminder", "reminders", "what is due", "what s due", "whats due", "due soon", "due this week", "due", "dues", "payments due", "upcoming payments", "upcoming", "pending payments", "pending dues", "notifications", "alerts"],
        reply: (d) => dueReply(dues(d), {
            none: "✅ **All clear.** I don't see any EMIs, dues or FD maturities coming up.\nAdd a due date to a loan, a lending entry or an FD and it will show here.",
            lead: (n) => `🔔 You have **${plural(n, "upcoming reminder")}**.`,
            what: "Upcoming dues"
        })
    },
    {
        name: "setreminder",
        keys: ["remind me", "set reminder", "set a reminder", "add reminder", "add a reminder", "create reminder", "create a reminder", "new reminder", "set an alert"],
        reply: (d) => {
            const list = dues(d);
            const note = "🔔 I can't create custom reminders. BlackRoad builds them for you from dates you already enter:\n• 💳 Loan EMIs\n• 🤝 Money you lent or owe (set a due date)\n• 🏛️ Fixed deposit maturities";
            return {
                text: list.length ? `${note}\nHere's what's coming up:` : `${note}\nNothing is due right now.`,
                actions: [PAGE.notifications],
                blocks: list.length ? [dueBlock(list)] : undefined
            };
        }
    },
    {
        name: "overdue",
        keys: ["overdue", "over due", "missed payment", "missed payments", "late payment", "late payments", "past due", "missed emi", "missed any payments"],
        reply: (d) => {
            const list = dues(d).filter((x) => x.status === "overdue");
            if (!list.length) return { text: "✅ **Nothing is overdue.** You're on track with every EMI, due date and maturity.", actions: [PAGE.notifications] };
            const total = list.reduce((s, x) => s + (x.amount || 0), 0);
            return {
                text: `🔴 **${plural(list.length, "payment")} overdue**, ${money(total)} in total.\n${nextLine(list[0])}`,
                actions: [PAGE.notifications],
                blocks: [dueBlock(list, "Overdue")]
            };
        }
    },
    {
        name: "nextemi",
        keys: ["next emi", "emi due", "emi date", "emi due date", "when is my emi", "when is my next emi", "upcoming emi", "upcoming emis", "installment due", "pay emi"],
        reply: (d) => {
            const list = dues(d).filter((x) => x.type === "emi");
            return dueReply(list, {
                none: "✅ No EMI is due right now. You have no active loans with an upcoming instalment.",
                lead: (n) => `💳 You have **${plural(n, "EMI")}** coming up.`,
                what: "Upcoming EMIs"
            });
        }
    },
    {
        name: "fdmaturing",
        keys: ["fd maturing", "fds maturing", "upcoming maturities", "upcoming maturity", "maturing soon", "matures this month", "fd maturity", "fd maturity dates", "maturity dates", "fd due", "deposit maturing"],
        reply: (d) => {
            const list = dues(d).filter((x) => x.type === "fd");
            return dueReply(list, {
                none: "🏛️ None of your fixed deposits are maturing soon.",
                lead: (n) => `🏛️ **${plural(n, "fixed deposit")}** ${n === 1 ? "is" : "are"} maturing.`,
                what: "FD maturities"
            });
        }
    },
    {
        name: "collect",
        keys: ["expected back", "money to collect", "who should pay me", "who will pay me", "payments to receive", "due from people", "to collect", "owed soon", "who owes me soon", "money coming back"],
        reply: (d) => {
            const list = dues(d).filter((x) => x.type === "back");
            const total = list.reduce((s, x) => s + (x.amount || 0), 0);
            if (!list.length) return { text: "📥 Nobody has a due date set to pay you back right now.", actions: [PAGE.lending] };
            return {
                text: `📥 **${money(total)}** is expected back from ${plural(list.length, "entry")}.\n${nextLine(list[0])}`,
                actions: [PAGE.lending],
                blocks: [dueBlock(list, "Expected back")]
            };
        }
    },
    {
        name: "topay",
        keys: ["what do i have to pay", "what do i need to pay", "what should i pay", "payments to make", "bills to pay", "to pay", "pay this week", "due to pay", "i owe soon", "what i owe soon"],
        reply: (d) => {
            const list = dues(d).filter((x) => x.type === "emi" || x.type === "owe");
            const total = list.reduce((s, x) => s + (x.amount || 0), 0);
            if (!list.length) return { text: "✅ You have no payments coming up.", actions: [PAGE.notifications] };
            return {
                text: `📤 You have **${money(total)}** to pay across ${plural(list.length, "item")}.\n${nextLine(list[0])}`,
                actions: [PAGE.notifications],
                blocks: [dueBlock(list, "Payments to make")]
            };
        }
    },

    /* ===== stocks ===== */
    {
        name: "stocklist",
        keys: ["my stock list", "stock list", "list my stocks", "all my stocks", "stocks i own", "which stocks", "what stocks do i own", "what stocks do i have", "stock holdings", "my holdings", "holdings list", "stocks with logos"],
        reply: (d) => {
            if (!d.holdings?.length) return empty("stock holdings", PAGE.stocks);
            return {
                text: `📊 You hold **${plural(d.holdings.length, "stock")}** worth **${money(d.stocks?.currentValue || 0)}**.\nTap a card to see the logo, price and profit at a glance.`,
                actions: [PAGE.stocks]
            };
        }
    },
    {
        name: "stockloss",
        keys: ["stocks in loss", "stocks are in loss", "which stocks are in loss", "stock in loss", "losing stocks", "loss making stocks", "red stocks", "stocks in red", "stocks down", "stocks losing", "which stocks are down", "underwater stocks"],
        reply: (d) => {
            if (!d.holdings?.length) return empty("stock holdings", PAGE.stocks);
            const list = byPnl(d).filter((h) => h.pnl < 0).reverse();
            if (!list.length) return { text: "🟢 None of your stocks is in loss right now.", actions: [PAGE.stocks] };
            const total = list.reduce((s, h) => s + h.pnl, 0);
            return { text: `🔻 **${plural(list.length, "stock")}** ${list.length === 1 ? "is" : "are"} in loss, ${signed(total)} in total.\nWeakest: **${list[0].symbol}** (${pct(list[0].pnlPct)}).`, actions: [PAGE.stocks] };
        }
    },
    {
        name: "stockprofit",
        keys: ["stocks in profit", "stocks are in profit", "which stocks are in profit", "stock in profit", "profitable stocks", "green stocks", "stocks in green", "stocks making profit", "stocks up", "winning stocks", "which stocks are up", "stocks gaining"],
        reply: (d) => {
            if (!d.holdings?.length) return empty("stock holdings", PAGE.stocks);
            const list = byPnl(d).filter((h) => h.pnl > 0);
            if (!list.length) return { text: "🔴 None of your stocks is in profit right now.", actions: [PAGE.stocks] };
            const total = list.reduce((s, h) => s + h.pnl, 0);
            return { text: `🟢 **${plural(list.length, "stock")}** ${list.length === 1 ? "is" : "are"} in profit, ${signed(total)} in total.\nBest: **${list[0].symbol}** (${pct(list[0].pnlPct)}).`, actions: [PAGE.stocks] };
        }
    },
    {
        name: "sipbest",
        keys: ["best sip", "worst sip", "best mutual fund", "best fund", "worst fund", "top sip", "top fund", "which sip", "which mutual fund", "sip returns", "fund returns"],
        reply: (d) => {
            const sips = d.mutualFunds?.sips || [];
            if (!sips.length) return empty("mutual fund or SIP entries", PAGE.mutualfund);
            const sorted = [...sips].sort((a, b) => b.pnlPct - a.pnlPct);
            const best = sorted[0], worst = sorted[sorted.length - 1];
            return {
                text: `🪙 Your SIPs, best to weakest:\n• 🥇 Best: ${best.name} (${pct(best.pnlPct)})\n` + (worst !== best ? `• 🔻 Weakest: ${worst.name} (${pct(worst.pnlPct)})` : ""),
                actions: [PAGE.mutualfund]
            };
        }
    },

    /* ===== ideas ===== */
    {
        name: "tips",
        keys: ["how can i save", "save more", "tips", "advice", "suggestion", "suggestions", "reduce expenses", "reduce spending", "cut expenses", "cut spending", "improve my finances", "what should i do", "financial advice", "ideas to save"],
        reply: (d) => {
            const { cur, prev } = twoMonths(d);
            const lines = [];
            const r = rate(cur);
            const top = (d.categoriesMonth?.length ? d.categoriesMonth : d.categories || [])[0];

            if (r !== null && r < 20) lines.push(`• 🎯 Savings rate: you're keeping ${Math.max(r, 0).toFixed(0)}% of income. 20% or more is a common target.`);
            if (top) lines.push(`• ${catIcon(top.label)} Biggest spend: **${top.label}** (${money(top.amount)}). Start there if you want to trim.`);
            if (prev.expense && cur.expense > prev.expense) lines.push(`• 📈 Spending is ${money(cur.expense - prev.expense)} higher than ${prev.label}.`);
            if (d.totalLiabilities > 0 && d.totalAssets > 0 && d.totalLiabilities / d.totalAssets > 0.4) lines.push("• 💳 Debt is a large share of your assets. Paying it down early lowers interest.");
            if (!lines.length) lines.push("• ✅ Nothing stands out. Your savings, spending and debt all look steady.");

            return { text: `💡 A few ideas from your own numbers:\n${lines.join("\n")}\nThese are simple pointers, not financial advice.`, actions: [PAGE.dashboard] };
        }
    },

    /* ===== about BlackRoad (no data needed) ===== */
    {
        name: "about",
        keys: ["what is blackroad", "about blackroad", "who made blackroad", "who built blackroad", "who developed", "who created you", "who made you", "what is rover", "who are you", "about rover", "about you", "microintel", "what are you", "tell me about yourself"],
        reply: () => ({
            text:
                "🛣️ **BlackRoad** is a personal finance app: income and expenses, stocks, fixed deposits, lending, mutual funds and net worth, all in one place.\n" +
                "🤖 **Rover** is its assistant, developed by **Microintel**. I answer from your own data on this device.\n" +
                "Ask me anything, like \"What's my net worth?\" or \"What's due soon?\"",
            actions: [PAGE.dashboard]
        })
    },
    {
        name: "features",
        keys: ["features", "what features", "pages", "sections", "modules", "menu", "what is in blackroad", "what all can blackroad do", "tour", "guide me", "get started", "getting started", "where do i start", "start here"],
        reply: () => ({
            text:
                "🧭 Here's what's in BlackRoad:\n" +
                "• 📊 Dashboard: Your overview, health and insights\n" +
                "• 💰 Income Statement: Income, expenses, savings\n" +
                "• 📈 Stocks: Holdings with live prices and logos\n" +
                "• 🏛️ Fixed Deposits: Rates and maturity dates\n" +
                "• 🤝 Lending: Loans, EMIs and money lent or owed\n" +
                "• 🪙 Mutual Fund: SIPs and returns\n" +
                "• 🧮 Calculators: SIP, step-up, lumpsum, goal, SWP\n" +
                "• 🔔 Notifications: Dues and reminders\n" +
                "• 💾 Data Management: Backup and restore\n" +
                "Say \"open stocks\" and I'll take you there.",
            actions: [PAGE.dashboard, PAGE.income, PAGE.stocks]
        })
    },
    {
        name: "howto",
        keys: ["how to add", "how do i add", "how can i add", "add income", "add expense", "add an expense", "add a stock", "add stock", "add transaction", "add fd", "add a deposit", "add loan", "add a loan", "add sip", "add a sip", "add person", "log an expense", "log expense", "new expense", "new entry", "where do i add", "how to record", "how to enter", "how do i record", "how do i enter"],
        reply: (d, text) => howTo(String(text || ""))
    },
    {
        name: "backup",
        keys: ["backup", "back up", "restore", "restore backup", "export data", "export all data", "import data", "is my data safe", "data safe", "privacy", "where is my data", "where is my data stored", "data stored", "offline", "does it work offline", "sync", "cloud", "delete my data", "reset data", "lose my data", "new phone", "new device", "switch phone"],
        reply: () => ({
            text:
                "🔒 **Your data stays on your device.** BlackRoad keeps it in your browser's storage, and I read it right here.\n" +
                "• 💾 Backup: Data Management, then **Export all data**\n" +
                "• ♻️ Restore: Data Management, then **Restore backup**\n" +
                "• 📱 New phone or browser? Export first, then restore there.\n" +
                "Only live prices and NAVs come from the internet.",
            actions: [PAGE.data]
        })
    },
    {
        name: "calculators",
        keys: ["calculator", "calculators", "sip calculator", "step up sip calculator", "lumpsum", "swp", "goal planner", "goal calculator", "withdrawal planner", "planner"],
        reply: () => ({
            text:
                "🧮 BlackRoad has five calculators:\n" +
                "• 🪙 SIP: What a monthly investment grows to\n" +
                "• 📈 Step-up SIP: A SIP that rises every year\n" +
                "• 💎 Lumpsum: One-time investment growth\n" +
                "• 🎯 Goal planner: The monthly SIP a goal needs\n" +
                "• 🏖️ SWP: How long a corpus lasts with withdrawals",
            actions: [PAGE.calculators]
        })
    },
    {
        name: "appearance",
        keys: ["dark mode", "light mode", "theme", "change theme", "appearance", "switch theme", "dark theme", "light theme", "currency", "change currency", "usd", "dollars", "dollar", "switch to usd", "inr", "rupees"],
        reply: () => ({
            text:
                "🎨 Use the buttons at the top of the page:\n" +
                "• 🌗 Theme: Switch between light and dark\n" +
                "• 💱 Currency: Switch between ₹ and $ (every amount, including mine, follows it)\n" +
                "More options live in your Account page.",
            actions: [PAGE.account]
        })
    },
    {
        name: "insights",
        keys: ["insights", "insight", "what changed", "what if", "goals", "goal", "subscriptions", "subscription", "timeline", "smart insights", "intelligence", "financial intelligence"],
        reply: () => ({
            text:
                "🧠 The Dashboard has a **Financial Intelligence** area that turns your data into insights:\n" +
                "• ❤️ Health: A score for your money habits\n" +
                "• 🎯 Goals: Progress toward what you're saving for\n" +
                "• 🔁 Subscriptions: Recurring payments it spots\n" +
                "• 🔀 What changed, what if: How things moved, and what a change would do\n" +
                "• 🛟 Emergency fund, risk and cash flow\n" +
                "I can also give you a quick **money health score** or a **forecast** right here.",
            actions: [PAGE.dashboard]
        })
    }
];

/* ---------- visuals per intent ---------- */

const MORE_VISUALS = {
    statement: (d) => {
        if (!d.income?.hasData) return [];
        const { cur } = twoMonths(d);
        return [{ kind: "statement", title: "Income statement", sections: [monthSection(cur, `${cur.label} (this month)`), allTimeSection(d)] }, trendBlock(d)];
    },

    lastmonth: (d) => {
        const { cur, prev } = twoMonths(d);
        if (!prev.income && !prev.expense) return [];
        return [{ kind: "statement", title: "Last month", sections: [monthSection(prev)] }, monthCompare(cur, prev)];
    },

    earned: (d) => {
        if (!d.income?.hasData) return [];
        const { cur, prev } = twoMonths(d);
        const rows = [{ icon: "💰", label: `${cur.label} (this month)`, value: cur.income }, ...(prev.income ? [{ icon: "📅", label: `${prev.label} (last month)`, value: prev.income }] : []), { icon: "🏆", label: "All time", value: d.income.income, total: true }];
        return [{ kind: "statement", title: "Income", sections: [{ title: "", rows }] }, ...visualsFor("sources", d)];
    },

    spentnow: (d) => {
        if (!d.income?.hasData) return [];
        const { cur, prev } = twoMonths(d);
        const rows = [{ icon: "🧾", label: `${cur.label} (this month)`, value: cur.expense }, ...(prev.expense ? [{ icon: "📅", label: `${prev.label} (last month)`, value: prev.expense }] : []), { icon: "🏆", label: "All time", value: d.income.expense, total: true }];
        const cats = d.categoriesMonth?.length ? d.categoriesMonth : [];
        const total = cats.reduce((s, c) => s + c.amount, 0) || 1;
        const catSection = cats.length ? [{ kind: "statement", title: "Where it went this month", sections: [{ title: "", rows: cats.slice(0, 6).map((c) => ({ icon: catIcon(c.label), label: c.label, value: c.amount, sub: `${((c.amount / total) * 100).toFixed(0)}%`, bar: (c.amount / total) * 100 })) }] }] : [];
        return [{ kind: "statement", title: "Expenses", sections: [{ title: "", rows }] }, ...catSection];
    },

    recent: (d) => {
        const s = d.spanTotals;
        if (!s) return [];
        const rows = (d.recentExpenses || []).map((e) => [`${catIcon(e.category)} ${e.desc}`, e.amount, e.date]);
        const quiet = !s.week.expense && !s.week.income && rows.length;
        return [
            quiet ? null : { kind: "statement", title: "Cash in and out", sections: [{ title: "", rows: [
                { icon: "📅", label: "Spent today", value: s.today.expense },
                { icon: "💰", label: "Earned today", value: s.today.income },
                { icon: "🗓️", label: "Spent, last 7 days", value: s.week.expense },
                { icon: "💵", label: "Earned, last 7 days", value: s.week.income }
            ] }] },
            rows.length ? { kind: "table", title: "Latest expenses", columns: [{ label: "Expense", fmt: "text" }, { label: "Amount", fmt: "money" }, { label: "Date", fmt: "text" }], rows } : null
        ];
    },

    averages: (d) => {
        const m = sixMonths(d).filter((x) => x.income || x.expense);
        if (!m.length) return [];
        const avg = (k) => m.reduce((s, x) => s + x[k], 0) / m.length;
        return [{ kind: "statement", title: "Monthly average", sections: [{ title: "", rows: [{ icon: "💰", label: "Income", value: avg("income") }, { icon: "🧾", label: "Expenses", value: avg("expense") }, { icon: "✨", label: "Left over", value: avg("income") - avg("expense"), fmt: "signed", tone: "auto", total: true }] }] }, trendBlock(d)];
    },

    extremes: (d) => [trendBlock(d)],

    realized: (d) => [{ kind: "statement", title: "Investment gains", sections: [{ title: "", rows: [
        { icon: "✅", label: "Realised (sold)", value: d.ledger?.realizedGainLoss || 0, fmt: "signed", tone: "auto" },
        { icon: "📈", label: "Stocks, unrealised", value: d.stocks?.pnl || 0, fmt: "signed", tone: "auto" },
        { icon: "🪙", label: "Mutual funds, unrealised", value: d.mutualFunds?.pnl || 0, fmt: "signed", tone: "auto" }
    ] }] }],

    reminders: (d) => [dueBlock(dues(d))],
    setreminder: () => [],
    overdue: () => [],
    nextemi: () => [],
    fdmaturing: () => [],
    collect: () => [],
    topay: () => [],

    stocklist: (d) => d.holdings?.length ? [
        { kind: "kpi", items: [{ label: "Value", value: d.stocks?.currentValue || 0 }, { label: "Invested", value: d.stocks?.invested || 0 }, { label: "Profit / loss", value: d.stocks?.pnl || 0, tone: "auto" }] },
        stockBlock(d.holdings, "Your stocks", { limit: 12 })
    ] : [],

    stockloss: (d) => { const l = byPnl(d).filter((h) => h.pnl < 0).reverse(); return l.length ? [stockBlock(l, "Stocks in loss")] : []; },
    stockprofit: (d) => { const l = byPnl(d).filter((h) => h.pnl > 0); return l.length ? [stockBlock(l, "Stocks in profit")] : []; },

    sipbest: (d) => {
        const sips = [...(d.mutualFunds?.sips || [])].sort((a, b) => b.pnlPct - a.pnlPct);
        return sips.length ? [{ kind: "table", title: "SIPs by return", columns: [{ label: "SIP", fmt: "text" }, { label: "Value", fmt: "money" }, { label: "Gain", fmt: "signed" }, { label: "Return", fmt: "spct" }], rows: sips.map((s) => [s.name, s.currentValue, s.pnl, s.pnlPct]) }] : [];
    },

    tips: (d) => {
        const { cur } = twoMonths(d);
        return d.income?.hasData ? [{ kind: "statement", title: "Where you stand", sections: [monthSection(cur, `${cur.label} (this month)`)] }] : [];
    }
};

export function moreVisualsFor(name, d, view = null, type = null) {
    const make = MORE_VISUALS[name];
    if (!make) return null;

    let blocks = [];
    try { blocks = make(d).filter(Boolean); } catch (error) { console.error("Rover visuals:", error); }

    return selectBlocks(blocks, view, type);
}

/* ---------- "how is Reliance doing?" and "how much did I spend on food?" ---------- */

/* Words that are in many company names, so they never pick a stock on their own. */
const COMMON = new Set(["limited", "ltd", "industries", "india", "indian", "bank", "finance", "financial", "corporation", "company", "group", "services", "technologies", "systems", "holdings", "global", "power", "motors", "energy", "idea", "the", "and", "stock", "stocks", "share", "shares", "fund", "funds"]);

function findHoldings(text, d) {
    const tokens = new Set(String(text).split(" ").filter(Boolean));
    if (!tokens.size || !d.holdings?.length) return [];

    return d.holdings.filter((h) => {
        const sym = String(h.symbol || "").toLowerCase().replace(/[^a-z0-9&]/g, "");
        if (sym.length >= 3 && (tokens.has(sym) || tokens.has(sym + "s"))) return true;
        const words = String(h.name || "").toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length >= 4 && !COMMON.has(w));
        return words.some((w) => tokens.has(w));
    });
}

function stockReply(found, d) {
    const total = d.stocks?.currentValue || 0;

    if (found.length === 1) {
        const h = found[0];
        const up = h.pnl >= 0;
        return {
            text:
                `${up ? "🟢" : "🔴"} **${h.name}** (${h.symbol}) is ${up ? "up" : "down"} **${signed(h.pnl)}** (${pct(h.pnlPct)}).\n` +
                `• 🏷️ Average price: ${money(h.avg)}\n` +
                `• 💼 Invested: ${money(h.invested)}` + (total > 0 ? `\n• 🥧 Share of your stocks: ${((h.value / total) * 100).toFixed(1)}%` : ""),
            actions: [PAGE.stocks],
            blocks: [stockBlock(found, "", { hero: true })]
        };
    }

    const sum = found.reduce((s, h) => s + h.pnl, 0);
    return {
        text: `📊 I found **${found.length}** matching holdings, ${signed(sum)} in total.`,
        actions: [PAGE.stocks],
        blocks: [stockBlock(found, "Matching stocks")]
    };
}

const SPEND_WORDS = /\b(spend|spent|spending|expense|expenses|cost|costs|paid|much)\b/;
const SKIP_CATEGORY_WORDS = new Set(["others", "other", "self", "service", "help"]);

function categoryReply(text, d) {
    if (!SPEND_WORDS.test(text) || !d.categories?.length) return null;

    const tokens = new Set(text.split(" ").filter(Boolean));
    const words = (label) => String(label).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !SKIP_CATEGORY_WORDS.has(w));
    const sameLabel = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    let hits = d.categories.filter((c) => sameLabel(c.label).length >= 3 && text.includes(` ${sameLabel(c.label)} `));
    if (!hits.length) hits = d.categories.filter((c) => words(c.label).some((w) => tokens.has(w) || tokens.has(w + "s")));
    if (!hits.length) return null;

    const month = new Map((d.categoriesMonth || []).map((c) => [c.label, c.amount]));
    const all = d.categories.reduce((s, c) => s + c.amount, 0) || 1;
    const top = hits.slice(0, 4);
    const sum = top.reduce((s, c) => s + c.amount, 0);

    return {
        text:
            top.length === 1
                ? `${catIcon(top[0].label)} On **${top[0].label}** you've spent **${money(top[0].amount)}** in total, ${money(month.get(top[0].label) || 0)} of it this month (${((top[0].amount / all) * 100).toFixed(0)}% of all spending).`
                : `🧾 I found ${top.length} matching categories, **${money(sum)}** in total.`,
        actions: [PAGE.income],
        blocks: [{
            kind: "statement", title: "Spending on this", sections: [{ title: "", rows: top.map((c) => ({ icon: catIcon(c.label), label: c.label, value: c.amount, sub: `${money(month.get(c.label) || 0)} this month`, bar: (c.amount / all) * 100 })) }]
        }]
    };
}

/* Tried before the keyword intents. Returns a reply, or null to carry on as usual. */
export function lookupReply(raw, text, d) {
    try {
        // "how much did I spend on Zomato" is about spending, even if a stock has the same name.
        const spent = categoryReply(text, d || {});
        if (spent) return spent;
        const found = findHoldings(text, d || {});
        return found.length ? stockReply(found, d) : null;
    } catch (error) {
        console.error("Rover lookup:", error);
        return null;
    }
}

/* Intents that need no data, so Rover answers them instantly. */
export const NO_DATA_INTENTS = ["about", "features", "howto", "backup", "calculators", "appearance", "insights"];

/* ---------- suggestions (matched while typing; the Ask Rover panel shows only the top few) ---------- */

export const MORE_SUGGESTIONS = [
    "Income statement summary",
    "What's due soon?",
    "Any payments overdue?",
    "When is my next EMI due?",
    "Which FDs are maturing soon?",
    "Who will pay me back soon?",
    "How much did I earn this month?",
    "How much did I spend last month?",
    "Today's expenses and this week",
    "Show my latest expenses",
    "Average monthly spending",
    "Which month did I spend the most?",
    "Realised profit on investments",
    "Which stocks are in loss?",
    "Which stocks are in profit?",
    "List all my stocks",
    "Which SIP is performing best?",
    "How can I save more?",
    "How do I add an expense?",
    "How do I add a stock?",
    "How do I back up my data?",
    "What calculators are there?",
    "What is BlackRoad?",
    "What features does BlackRoad have?"
];
