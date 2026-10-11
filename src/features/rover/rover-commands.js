import { formatINR } from "../dashboard/dashboard-service.js";
import { isListRequest } from "./rover-lists.js";

/*
 * Rover commands (pure logic, no DOM, no storage).
 *
 *   commandKind(raw, text)          which kind of command this is, or null
 *   commandReply(raw, text, d)      the answer, or null to carry on with the normal Rover engine
 *   COMMAND_SUGGESTIONS             example questions for the suggestion box
 *
 * Covers:
 *   - highest / lowest:  who owes you, who you owe, loans, stocks, FDs, expenses, income
 *   - account details:   name, email, plan, member since
 *   - last data entry:   when you last added or updated data
 *   - "list commands":   everything Rover understands, grouped
 *
 * `text` is the normalised question (lower case, padded with spaces) that rover-engine.js already makes.
 */

const money = formatINR;
const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;
const GO = (label, path) => ({ label, path });
const PAGE = {
    lending: GO("Open Lending", "/lending"),
    stocks: GO("Open Stocks", "/stocks"),
    deposits: GO("Open Fixed Deposits", "/deposits"),
    income: GO("Open Income Statement", "/income"),
    account: GO("Open Account", "/account"),
    accounting: GO("Open Accounting", "/accounting")
};

const col = (label, fmt) => ({ label, fmt });
const table = (title, columns, rows) => ({ kind: "table", title, columns, rows });

/* ---------- dates ---------- */

const parseDay = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const pretty = (s) => {
    const d = parseDay(s);
    return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–";
};
const ago = (s) => {
    const d = parseDay(s);
    if (!d) return "";
    const n = Math.round((new Date().setHours(0, 0, 0, 0) - d.getTime()) / 86400000);
    return n === 0 ? "today" : n === 1 ? "yesterday" : n > 1 ? `${n} days ago` : n === -1 ? "tomorrow" : `in ${-n} days`;
};
const dayWithAgo = (s) => (parseDay(s) ? `${pretty(s)} (${ago(s)})` : "–");

/* ---------- recognising a command ---------- */

const EXPORT_WORDS = /\b(export|download|downloads|csv|pdf|excel|xlsx|spreadsheet)\b/;
const OPEN_WORDS = /\b(open|go to|goto|take me|navigate|visit)\b/;

const COMMANDS_ASK = /\bcommands?\b|\bwhat (can|could) i (ask|say|type)\b|\b(all|every|possible|available|sample|example) (questions|queries)\b|\bwhat questions\b/;
const ACCOUNT_ASK = /\b(account (details?|info|information|summary)|my account|my profile|profile (details?|info)|who am i|my name|my e ?mail|my plan|which plan|what plan|member since|membership|signed in as|logged in as|am i (a )?(premium|guest|free))\b/;
const ACCOUNT_NOT = /\b(statement|balance|bank|download|export)\b/;
const LAST_ASK = /\b(last|latest|recent|most recent) (data )?(entry|entries|update|updated|data)\b|\bdata (was )?(last )?updated\b|\bwhen did i (last )?(add|enter|update|record|log|save)\b|\blast (time )?(i )?(added|updated|entered)\b|\bup to date\b|\bdata (till|until|upto|up to)\b/;
const ACCOUNTING_ASK = /\b(accounting|balance sheet)\b/;
const COUNT_ASK = /\bhow many (people|persons|borrowers|debtors|parties)\b/;

const HIGH = /\b(highest|biggest|largest|greatest|maximum|max|most|top|best)\b/;
const LOW = /\b(lowest|smallest|least|minimum|min|fewest|worst|cheapest)\b/;
const FUNDS = /\b(sips?|mutual|funds?|mfs?)\b/;

/* What a highest / lowest question is about (null when it is not one). */
function parseExtreme(t) {
    if (!HIGH.test(t) && !LOW.test(t)) return null;
    const dir = LOW.test(t) ? "low" : "high";
    const month = /\b(month|monthly|months)\b/.test(t);

    if (/\b(loans?|emis?)\b/.test(t) && !/\b(i owe|owes?|owed|people|person)\b/.test(t)) return { subject: "loans", dir };
    if (/\b(stocks?|shares?|holdings?|equity)\b/.test(t) && !FUNDS.test(t)) return { subject: "stocks", dir, listy: isListRequest(t) };
    if (/\b(fds?|fixed deposits?|deposits?)\b/.test(t)) return { subject: "fds", dir };
    if (/\b(i owe|payables?|owed by me|i borrowed|borrowed|my debts?|owe to)\b/.test(t)) return { subject: "payable", dir };
    if (/\b(owed|owes?|owe|lent|lend|lending|receivables?|borrowers?|debtors?|money given|people|person|persons|party|parties)\b/.test(t)) return { subject: "receivable", dir };
    if (/\b(expenses?|spent|spend|spending|costliest|purchases?)\b/.test(t) && !month) return { subject: "expense", dir, listy: isListRequest(t) };
    if (/\b(income|earning|earnings|earned|salary)\b/.test(t) && !month) return { subject: "income", dir, listy: isListRequest(t) };
    return null;
}

export function commandKind(raw, text) {
    const t = String(text || "");
    if (EXPORT_WORDS.test(t) || OPEN_WORDS.test(t)) return null;
    if (COMMANDS_ASK.test(t)) return "list";
    if (ACCOUNTING_ASK.test(t)) return "accounting";
    if (ACCOUNT_ASK.test(t) && !ACCOUNT_NOT.test(t)) return "account";
    if (LAST_ASK.test(t)) return "last";
    if (COUNT_ASK.test(t)) return "count";
    const x = parseExtreme(t);
    // Stocks, expenses and income already have sorted lists ("list my biggest stocks"): leave those to the list answer.
    if (x && !x.listy) return "extreme";
    return null;
}

/* ---------- highest / lowest ---------- */

const pick = (list, dir, get) => [...list].sort((a, b) => (dir === "high" ? get(b) - get(a) : get(a) - get(b)));
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function peopleExtreme(d, dir, side) {
    const people = (d.people || []).filter((p) => (side === "get" ? p.balance > 0 : p.balance < 0));
    const amt = (p) => Math.abs(p.balance);
    const who = side === "get" ? "owes you" : "you owe";
    if (!people.length) {
        return { text: side === "get" ? "🤝 Nobody owes you anything right now." : "✅ You don't owe anyone right now.", actions: [PAGE.lending] };
    }
    const sorted = pick(people, dir, amt);
    const top = sorted[0];
    const total = people.reduce((s, p) => s + amt(p), 0);
    const word = dir === "high" ? "most" : "least";
    const lead = side === "get"
        ? `🤝 **${top.name}** owes you the ${word}: **${money(amt(top))}**.`
        : `💸 You owe **${top.name}** the ${word}: **${money(amt(top))}**.`;
    return {
        text: lead + (people.length > 1 ? `\nThat's ${share(amt(top), total)}% of the ${money(total)} ${side === "get" ? "people owe you" : "you owe people"}.` : ""),
        actions: [PAGE.lending],
        blocks: [table(dir === "high" ? `Highest ${side === "get" ? "owed to you" : "payable"}` : `Lowest ${side === "get" ? "owed to you" : "payable"}`,
            [col("Person", "text"), col(side === "get" ? "Owes you" : "You owe", "money")],
            sorted.slice(0, 5).map((p) => [p.name, amt(p)]))].filter(() => people.length > 1)
    };
}

function loansExtreme(d, dir) {
    const loans = (d.loans || []).filter((l) => l.outstanding > 0.005);
    if (!loans.length) return { text: "✅ You have no loans outstanding.", actions: [PAGE.lending] };
    const sorted = pick(loans, dir, (l) => l.outstanding);
    const top = sorted[0];
    return {
        text: `🏦 Your ${dir === "high" ? "highest" : "lowest"} loan outstanding is **${top.lender}**: **${money(top.outstanding)}** (EMI ${money(top.emi)}${top.nextDue ? `, next due ${pretty(top.nextDue)}` : ""}).`,
        actions: [PAGE.lending],
        blocks: loans.length > 1 ? [table(dir === "high" ? "Highest loans" : "Lowest loans",
            [col("Lender", "text"), col("Outstanding", "money"), col("EMI", "money")],
            sorted.slice(0, 5).map((l) => [l.lender, l.outstanding, l.emi]))] : []
    };
}

function stocksExtreme(d, t, dir) {
    const list = d.holdings || [];
    if (!list.length) return { text: "I can't see any stock holdings yet. Add some and I'll be able to tell you more.", actions: [PAGE.stocks] };
    const byReturn = /\b(gain|gainer|gainers|profit|profitable|winner|winners|return|returns|performing|performer|loss|loser|losers|worst|best)\b/.test(t);
    const wantsLoss = /\b(loss|loser|losers|worst)\b/.test(t);
    const useDir = wantsLoss ? "low" : dir;
    const get = byReturn ? (h) => h.pnlPct : (h) => h.value;
    const sorted = pick(list, useDir, get);
    const top = sorted[0];
    const lead = byReturn
        ? `${useDir === "high" ? "📈" : "📉"} Your ${useDir === "high" ? "best" : "weakest"} stock is **${top.symbol}**: ${top.pnl >= 0 ? "+" : "-"}${money(Math.abs(top.pnl))} (${top.pnlPct >= 0 ? "+" : ""}${top.pnlPct.toFixed(1)}%).`
        : `📊 Your ${useDir === "high" ? "biggest" : "smallest"} holding is **${top.symbol}**: **${money(top.value)}** (${top.quantity} shares).`;
    return {
        text: lead,
        actions: [PAGE.stocks],
        blocks: list.length > 1 ? [table(byReturn ? (useDir === "high" ? "Best stocks" : "Weakest stocks") : (useDir === "high" ? "Biggest holdings" : "Smallest holdings"),
            [col("Stock", "text"), col("Value", "money"), col("P&L", "signed"), col("Return", "spct")],
            sorted.slice(0, 5).map((h) => [h.symbol, h.value, h.pnl, h.pnlPct]))] : []
    };
}

function fdsExtreme(d, t, dir) {
    const fds = d.fds || [];
    if (!fds.length) return { text: "I can't see any active fixed deposits yet. Add some and I'll be able to tell you more.", actions: [PAGE.deposits] };
    const byRate = /\b(rate|rates|interest)\b/.test(t);
    const sorted = pick(fds, dir, byRate ? (f) => f.rate : (f) => f.principal);
    const top = sorted[0];
    const lead = byRate
        ? `🏛️ ${dir === "high" ? "Highest" : "Lowest"} FD interest rate: **${top.name}** at **${top.rate}%**.`
        : `🏛️ Your ${dir === "high" ? "biggest" : "smallest"} FD is **${top.name}**: **${money(top.principal)}**${top.rate ? ` at ${top.rate}%` : ""}${top.maturityDate ? `, maturing ${pretty(top.maturityDate)}` : ""}.`;
    return {
        text: lead,
        actions: [PAGE.deposits],
        blocks: fds.length > 1 ? [table(byRate ? "FDs by interest rate" : "FDs by amount",
            [col("Bank", "text"), col("Amount", "money"), col("Rate", "pct"), col("Matures", "text")],
            sorted.slice(0, 5).map((f) => [f.name, f.principal, f.rate, pretty(f.maturityDate)]))] : []
    };
}

function expenseExtreme(d, t, dir) {
    if (/\bcategor/.test(t)) {
        const cats = d.categories || [];
        if (!cats.length) return { text: "I can't see any expense entries yet. Add some and I'll be able to tell you more.", actions: [PAGE.income] };
        const sorted = pick(cats, dir, (c) => c.amount);
        return {
            text: `🧾 ${dir === "high" ? "Highest" : "Lowest"} spending category: **${sorted[0].label}** with **${money(sorted[0].amount)}**.`,
            actions: [PAGE.income],
            blocks: cats.length > 1 ? [table("Spending by category", [col("Category", "text"), col("Spent", "money")], sorted.slice(0, 5).map((c) => [c.label, c.amount]))] : []
        };
    }
    const all = d.allExpenses || [];
    if (!all.length) return { text: "I can't see any expense entries yet. Add some and I'll be able to tell you more.", actions: [PAGE.income] };
    const sorted = pick(all, dir, (e) => e.amount);
    return {
        text: `🧾 Your ${dir === "high" ? "biggest" : "smallest"} single expense is **${sorted[0].desc}**: **${money(sorted[0].amount)}** on ${pretty(sorted[0].date)}.`,
        actions: [PAGE.income],
        blocks: all.length > 1 ? [table(dir === "high" ? "Biggest expenses" : "Smallest expenses",
            [col("Expense", "text"), col("Amount", "money"), col("Date", "text")],
            sorted.slice(0, 5).map((e) => [e.desc, e.amount, pretty(e.date)]))] : []
    };
}

function incomeExtreme(d, t, dir) {
    if (/\bsources?\b/.test(t)) {
        const src = d.incomeSources || [];
        if (!src.length) return { text: "I can't see any income entries yet. Add some and I'll be able to tell you more.", actions: [PAGE.income] };
        const sorted = pick(src, dir, (s) => s.amount);
        return {
            text: `💰 ${dir === "high" ? "Top" : "Smallest"} income source: **${sorted[0].label}** with **${money(sorted[0].amount)}**.`,
            actions: [PAGE.income],
            blocks: src.length > 1 ? [table("Income sources", [col("Source", "text"), col("Earned", "money")], sorted.slice(0, 5).map((s) => [s.label, s.amount]))] : []
        };
    }
    const all = d.allIncome || [];
    if (!all.length) return { text: "I can't see any income entries yet. Add some and I'll be able to tell you more.", actions: [PAGE.income] };
    const sorted = pick(all, dir, (e) => e.amount);
    return {
        text: `💰 Your ${dir === "high" ? "biggest" : "smallest"} income entry is **${money(sorted[0].amount)}** from **${sorted[0].source}** on ${pretty(sorted[0].date)}.`,
        actions: [PAGE.income],
        blocks: all.length > 1 ? [table(dir === "high" ? "Biggest income" : "Smallest income",
            [col("From", "text"), col("Amount", "money"), col("Date", "text")],
            sorted.slice(0, 5).map((e) => [e.source, e.amount, pretty(e.date)]))] : []
    };
}

function extremeReply(t, d) {
    const x = parseExtreme(t);
    if (!x) return null;
    switch (x.subject) {
        case "loans": return loansExtreme(d, x.dir);
        case "stocks": return stocksExtreme(d, t, x.dir);
        case "fds": return fdsExtreme(d, t, x.dir);
        case "payable": return peopleExtreme(d, x.dir, "owe");
        case "receivable": return peopleExtreme(d, x.dir, "get");
        case "expense": return expenseExtreme(d, t, x.dir);
        case "income": return incomeExtreme(d, t, x.dir);
        default: return null;
    }
}

/* ---------- how many people ---------- */

function countReply(d) {
    const people = d.people || [];
    if (!people.length) return { text: "🤝 I can't see any lending records yet.", actions: [PAGE.lending] };
    const get = people.filter((p) => p.balance > 0);
    const owe = people.filter((p) => p.balance < 0);
    return {
        text:
            `🤝 **${plural(get.length, "person", "people")}** ${get.length === 1 ? "owes" : "owe"} you **${money(get.reduce((s, p) => s + p.balance, 0))}**.\n` +
            (owe.length ? `You owe **${plural(owe.length, "person", "people")}** a total of ${money(owe.reduce((s, p) => s - p.balance, 0))}.` : "You don't owe anyone."),
        actions: [PAGE.lending]
    };
}

/* ---------- account details ---------- */

function accountReply(t, d) {
    const a = d.account;
    if (!a) return { text: "I couldn't read your account just now. Try again in a moment.", actions: [PAGE.account] };
    if (a.guest) {
        return {
            text: "👤 You're browsing as a **guest** with demo data, so there's no personal account yet.\nSign in or register to have your own name, email and plan.",
            actions: [PAGE.account]
        };
    }

    let lead = "👤 Here are your account details:";
    if (/\bname\b/.test(t) && a.name) lead = `👤 Your name is **${a.name}**.`;
    else if (/\be ?mail\b/.test(t) && a.email) lead = `👤 Your email is **${a.email}**.`;
    else if (/\b(plan|premium|free|membership)\b/.test(t) && a.plan) lead = `👤 You're on the **${a.plan}** plan.`;
    else if (/\bmember since\b/.test(t) && a.createdAt) lead = `👤 You've been a member since **${pretty(a.createdAt)}**.`;

    const rows = [
        a.name ? `• Name: **${a.name}**` : "",
        a.email ? `• Email: ${a.email}` : "",
        a.plan ? `• Plan: ${a.plan}` : "",
        a.createdAt ? `• Member since: ${pretty(a.createdAt)}` : "",
        d.dataUpdated ? `• Data last updated: ${pretty(d.dataUpdated)}` : ""
    ].filter(Boolean);

    return { text: [lead, ...rows].join("\n"), actions: [PAGE.account] };
}

/* ---------- last data entry date ---------- */

function lastReply(d) {
    const last = d.lastEntries || {};
    const items = [
        ["Income or expense entry", last.income],
        ["Stock trade", last.stock],
        ["Lending entry", last.lending]
    ].filter(([, date]) => date);

    if (!items.length && !d.dataUpdated) {
        return { text: "I can't see any entries yet. Add some and I'll be able to tell you when you last updated.", actions: [PAGE.income] };
    }

    const newest = items.map(([, date]) => date).sort().pop();
    const rows = [
        d.dataUpdated ? `• Data last updated: ${dayWithAgo(d.dataUpdated)}` : "",
        ...items.map(([label, date]) => `• Last ${label.toLowerCase()}: ${dayWithAgo(date)}`)
    ].filter(Boolean);

    return {
        text: (newest ? `🗓️ Your most recent entry is dated **${pretty(newest)}** (${ago(newest)}).\n` : "🗓️ ") + rows.join("\n"),
        actions: [PAGE.income]
    };
}

/* ---------- accounting ---------- */

/* Which line of the Accounting page a question is about (null = the whole page). */
const ACCOUNTING_FIELDS = [
    [/\b(banks?)\b/, /^banks$/i], [/\bcash\b/, /^cash$/i], [/\b(mutual|mf|funds?)\b/, /^mutual/i],
    [/\b(fds?|fixed|deposits?)\b/, /^fixed/i], [/\bdemat\b/, /^demat/i], [/\bstocks?\b/, /^stocks$/i],
    [/\bpending\b/, /^pending/i], [/\bother\b/, /^other/i], [/\b(lending|receivables?|lent)\b/, /^lending/i]
];

function accountingReply(t, d) {
    const a = d.accounting;
    if (!a || (!a.saved && !a.assets && !a.liabilities)) {
        return { text: "📒 I can't see any accounting entries yet. Fill in the Accounting page and save, and I'll be able to tell you more.", actions: [PAGE.accounting] };
    }

    const rows = (a.rows || []).filter((r) => Math.abs(r.value) > 0.005);
    const pct = (v) => `${share(v, a.assets)}%`;

    // When was it last saved?
    if (/\b(updated|saved|last|when)\b/.test(t)) {
        return {
            text: a.updatedAt ? `📒 Your accounting was last saved on **${pretty(a.updatedAt)}** (${ago(a.updatedAt)}).` : "📒 You haven't saved the Accounting page yet; the figures come from your live Mutual Funds and Lending.",
            actions: [PAGE.accounting]
        };
    }

    // Liabilities.
    if (/\b(liabilit(y|ies)|owe|debt|payable)\b/.test(t)) {
        return {
            text: a.liabilities ? `📒 Your accounting liabilities are **${money(a.liabilities)}**.` : "📒 You have **no liabilities** in your accounting.",
            actions: [PAGE.accounting]
        };
    }

    // Highest / lowest line.
    if ((HIGH.test(t) || LOW.test(t)) && rows.length) {
        const dir = LOW.test(t) ? "low" : "high";
        const sorted = pick(rows, dir, (r) => r.value);
        return {
            text: `📒 Your ${dir === "high" ? "biggest" : "smallest"} accounting asset is **${sorted[0].label}**: **${money(sorted[0].value)}** (${pct(sorted[0].value)} of assets).`,
            actions: [PAGE.accounting],
            blocks: rows.length > 1 ? [table(dir === "high" ? "Biggest assets" : "Smallest assets", [col("Asset", "text"), col("Amount", "money"), col("Share", "text")], sorted.slice(0, 5).map((r) => [r.label, r.value, pct(r.value)]))] : []
        };
    }

    // One line: banks, cash, FD, demat, a custom row ...
    const field = ACCOUNTING_FIELDS.find(([ask]) => ask.test(t));
    const line = field
        ? (a.rows || []).find((r) => field[1].test(r.label))
        : (a.rows || []).find((r) => !ACCOUNTING_FIELDS.some(([, re]) => re.test(r.label)) && r.label && t.includes(` ${r.label.toLowerCase()} `));
    if (line) {
        return {
            text: `📒 ${line.label} in your accounting: **${money(line.value)}**${a.assets ? ` (${pct(line.value)} of assets)` : ""}.`,
            actions: [PAGE.accounting]
        };
    }

    // Whole page.
    return {
        text:
            `📒 Your accounting:\n` +
            `• Net worth: **${money(a.net)}**\n` +
            `• Total assets: ${money(a.assets)}\n` +
            `• Total liabilities: ${money(a.liabilities)}` +
            (a.updatedAt ? `\n• Last saved: ${pretty(a.updatedAt)}` : ""),
        actions: [PAGE.accounting],
        blocks: rows.length ? [table("Accounting assets", [col("Asset", "text"), col("Amount", "money"), col("Share", "text")], pick(rows, "high", (r) => r.value).map((r) => [r.label, r.value, pct(r.value)]))] : []
    };
}

/* ---------- list of commands ---------- */

export const COMMAND_GROUPS = [
    ["Overview", ["What's my net worth?", "Show my summary", "How is my money split?", "What are my liabilities?", "What can you do?"]],
    ["Cash, income and spending", [
        "What's my cash balance?", "Spending this month", "How much did I earn this month?", "How much did I spend last month?",
        "Today's expenses and this week", "Show my latest expenses", "Average monthly spending", "Which month did I spend the most?",
        "How much did I spend on food?", "Spending by category", "Savings rate", "Income statement summary"
    ]],
    ["Highest and lowest", [
        "Highest owed amount", "Lowest lending", "Who owes me the most?", "Who owes me the least?", "Who do I owe the most?", "Highest payable", "Lowest payable",
        "Highest loan outstanding", "Lowest loan", "Biggest stock holding", "Smallest holding", "Best performing stock", "Worst stock",
        "Biggest FD", "Smallest FD", "Highest FD interest rate", "Biggest expense", "Smallest expense", "Highest spending category", "Biggest income", "Top income source"
    ]],
    ["Lending, loans and dues", [
        "Who owes me money?", "How many people owe me?", "Any loans or EMI?", "What's due soon?", "Any payments overdue?",
        "When is my next EMI due?", "Who will pay me back soon?"
    ]],
    ["Stocks, funds and FDs", [
        "How are my stocks doing?", "Which stocks are in profit?", "Which stocks are in loss?", "How is Reliance doing?",
        "How are my mutual funds doing?", "Which SIP is performing best?", "When does my next FD mature?", "Which FDs are maturing soon?", "Realised profit on investments"
    ]],
    ["Lists", ["List all my stocks", "List all mutual funds", "List my FDs", "List all loans", "All expenses this month", "List my investments"]],
    ["Charts and comparisons", ["Spending by category as a treemap", "Compare stocks vs mutual funds", "Stocks as a table", "Show all chart types for my stocks"]],
    ["Account and data", [
        "My account details", "What is my name?", "What is my email?", "Which plan am I on?", "Member since?",
        "Last data entry date", "When was my data last updated?"
    ]],
    ["Accounting", [
        "Accounting summary", "Accounting net worth", "Accounting total assets", "Accounting liabilities", "Accounting bank balance",
        "Accounting cash", "Accounting fixed deposit", "Highest accounting asset", "Lowest accounting asset", "When was accounting last updated?"
    ]],
    ["Reports, help and pages", [
        "Show all reports", "Download my reports", "Download accounting report", "Download stocks CSV", "Download account statement PDF",
        "Read my brokerage report", "How do I add an expense?", "How do I back up my data?", "What calculators are there?", "What is BlackRoad?", "Open stocks"
    ]]
];

export const COMMAND_SUGGESTIONS = [
    "List all commands",
    ...COMMAND_GROUPS.filter(([name]) => ["Highest and lowest", "Account and data", "Accounting"].includes(name)).flatMap(([, items]) => items),
    "Show all reports",
    "How many people owe me?"
];

function commandListReply() {
    const total = COMMAND_GROUPS.reduce((n, [, items]) => n + items.length, 0);
    const lines = [`📋 Here are **${total}** things you can ask me. Type any of them, or put your own spin on it:`];
    COMMAND_GROUPS.forEach(([name, items]) => {
        lines.push(`**${name}**`);
        items.forEach((q) => lines.push(`• ${q}`));
    });
    lines.push("Tip: add \"as a table\", \"as a chart\" or a chart type to many of these, or say \"open stocks\" to jump to a page.");
    return { text: lines.join("\n") };
}

/* ---------- entry point ---------- */

export function commandReply(raw, text, d = {}) {
    try {
        const kind = commandKind(raw, text);
        if (!kind) return null;
        const t = String(text || "");
        if (kind === "list") return commandListReply();
        if (kind === "account") return accountReply(t, d);
        if (kind === "last") return lastReply(d);
        if (kind === "count") return countReply(d);
        if (kind === "accounting") return accountingReply(t, d);
        return extremeReply(t, d);
    } catch (error) {
        console.error("Rover commands:", error);
        return null;
    }
}
