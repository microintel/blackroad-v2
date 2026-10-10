import { formatINR } from "../dashboard/dashboard-service.js";

/*
 * Rover engine (pure logic, no DOM, no storage).
 *
 * respond(text, snapshot) -> { text, actions?: [{ label, path }] }
 *
 * Rover answers from the user's own data on the device, so it works
 * offline and nothing leaves the browser. Each intent is a set of
 * keywords; the best-scoring intent answers. To teach Rover something
 * new, add one entry to INTENTS.
 */

const money = formatINR;
const pct = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(1)}%`;
const signed = (n) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;

const GO = {
    dashboard: { label: "Open Dashboard", path: "/dashboard" },
    networth: { label: "Open Net Worth", path: "/networth" },
    income: { label: "Open Income Statement", path: "/income" },
    stocks: { label: "Open Stocks", path: "/stocks" },
    deposits: { label: "Open Fixed Deposits", path: "/deposits" },
    lending: { label: "Open Lending", path: "/lending" },
    mutualfund: { label: "Open Mutual Fund", path: "/mutualfund" },
    intelligence: { label: "Open Financial Intelligence", path: "/intelligence" },
    calculators: { label: "Open Calculators", path: "/calculators" }
};

/* Words that mean "take me to a page". */
const PAGES = [
    [["net worth", "networth"], GO.networth],
    [["dashboard", "home"], GO.dashboard],
    [["income", "expense", "ledger", "statement"], GO.income],
    [["stock", "share", "equity"], GO.stocks],
    [["deposit", "fd"], GO.deposits],
    [["lending", "loan", "borrow"], GO.lending],
    [["mutual", "sip", "fund"], GO.mutualfund],
    [["intelligence", "insight"], GO.intelligence],
    [["calculator"], GO.calculators]
];

const empty = (what, action) => ({
    text: `I can't see any ${what} yet. Add some and I'll be able to tell you more.`,
    actions: action ? [action] : []
});

const INTENTS = [
    {
        name: "greeting",
        keys: ["hi", "hello", "hey", "namaste", "good morning", "good evening"],
        reply: () => ({
            text: "Hi, I'm **Rover**. Ask me about your net worth, spending, stocks, deposits, loans or mutual funds."
        })
    },
    {
        name: "thanks",
        keys: ["thanks", "thank you", "thx"],
        reply: () => ({ text: "Anytime. I'm here whenever you want to check on your money." })
    },
    {
        name: "help",
        keys: ["help", "what can you do", "how to use", "commands", "options"],
        reply: () => ({
            text:
                "I can answer from your own BlackRoad data:\n" +
                "• **Net worth** and a full summary\n" +
                "• **Cash**, income and expenses this month\n" +
                "• **Stocks**, **mutual funds** and **fixed deposits**\n" +
                "• **Loans**, EMI and money owed\n" +
                "• **Allocation** of your assets\n" +
                "Say \"open stocks\" and I'll take you there."
        })
    },
    {
        name: "summary",
        keys: ["summary", "overview", "snapshot", "how am i doing", "financial health", "everything", "report"],
        reply: (d) => ({
            text:
                `Here's where you stand:\n` +
                `• Net worth: **${money(d.netWorth)}**\n` +
                `• Assets: ${money(d.totalAssets)}\n` +
                `• Liabilities: ${money(d.totalLiabilities)}\n` +
                `• Cash & bank: ${money(d.income.cash)}\n` +
                `• Stocks: ${money(d.stocks.currentValue)} (${pct(d.stocks.pnlPct)})\n` +
                `• Mutual funds: ${money(d.mutualFunds.currentValue)} (${pct(d.mutualFunds.pnlPct)})\n` +
                `• Fixed deposits: ${money(d.deposits.totalCurrentValue)}`,
            actions: [GO.dashboard]
        })
    },
    {
        name: "networth",
        keys: ["net worth", "networth", "net", "worth", "wealth", "how much do i have", "total money"],
        reply: (d) => ({
            text:
                `Your net worth is **${money(d.netWorth)}**.\n` +
                `That's ${money(d.totalAssets)} in assets minus ${money(d.totalLiabilities)} in liabilities.`,
            actions: [GO.networth]
        })
    },
    {
        name: "assets",
        keys: ["asset", "assets", "own", "allocation", "split", "breakdown", "distribution", "diversif", "portfolio"],
        reply: (d) => {
            if (!d.chartItems.length) return empty("investments or receivables", GO.dashboard);
            const top = [...d.chartItems].sort((a, b) => b.amount - a.amount)[0];
            return {
                text:
                    `Your invested assets are split like this:\n` +
                    d.chartItems.map((i) => `• ${i.label}: ${money(i.amount)} (${i.pct}%)`).join("\n") +
                    `\nMost of it, ${top.pct}%, sits in **${top.label}**.`,
                actions: [GO.dashboard]
            };
        }
    },
    {
        name: "liabilities",
        keys: ["liabilit", "debt", "owe", "payable", "borrowed"],
        reply: (d) => {
            const l = d.lending;
            if (!d.totalLiabilities) return { text: "You have **no liabilities** right now. Nothing owed and no loans outstanding." };
            return {
                text:
                    `You owe **${money(d.totalLiabilities)}** in total.\n` +
                    `• Loans outstanding: ${money(l.loansOutstanding)}\n` +
                    `• Money owed to people: ${money(l.peoplePayable)}`,
                actions: [GO.lending]
            };
        }
    },
    {
        name: "loans",
        keys: ["loan", "emi", "installment", "instalment"],
        reply: (d) => {
            const l = d.lending;
            if (!l.activeLoanCount) return { text: "You have **no active loans**.", actions: [GO.lending] };
            return {
                text:
                    `You have **${l.activeLoanCount}** active loan${l.activeLoanCount > 1 ? "s" : ""}.\n` +
                    `• Outstanding: ${money(l.loansOutstanding)}\n` +
                    `• Monthly EMI: ${money(l.monthlyEmi)}`,
                actions: [GO.lending]
            };
        }
    },
    {
        name: "lending",
        keys: ["lent", "receivable", "owed to me", "people owe", "lending", "money given", "who owes"],
        reply: (d) => {
            const l = d.lending;
            if (!l.peopleReceivable && !l.peoplePayable) return empty("lending records", GO.lending);
            return {
                text:
                    `People owe you **${money(l.peopleReceivable)}**.\n` +
                    (l.peoplePayable ? `You owe people ${money(l.peoplePayable)}.` : `You don't owe anyone.`),
                actions: [GO.lending]
            };
        }
    },
    {
        name: "cash",
        keys: ["cash", "bank balance", "balance", "bank", "liquid"],
        reply: (d) => ({
            text: `Your cash & bank balance is **${money(d.income.cash)}**.`,
            actions: [GO.income]
        })
    },
    {
        name: "month",
        keys: ["this month", "monthly", "month", "spend", "spent", "spending", "expense", "expenses", "saving", "savings", "income"],
        reply: (d) => {
            if (!d.income.hasData) return empty("income or expense entries", GO.income);
            const m = d.income.month;
            const rate = m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null;
            return {
                text:
                    `This month so far:\n` +
                    `• Income: ${money(m.income)}\n` +
                    `• Expenses: ${money(m.expense)}\n` +
                    `• Invested: ${money(m.investment)}\n` +
                    (rate === null ? "" : `• Savings rate: **${rate.toFixed(0)}%** of income\n`) +
                    `Overall, you've earned ${money(d.income.income)} and spent ${money(d.income.expense)}.`,
                actions: [GO.income]
            };
        }
    },
    {
        name: "stocks",
        keys: ["stock", "stocks", "share", "shares", "equity", "holding", "holdings", "gainer", "loser", "profit", "loss", "pnl", "p&l", "returns"],
        reply: (d) => {
            const s = d.stocks;
            if (!s.holdings) return empty("stock holdings", GO.stocks);
            const best = [...d.holdings].sort((a, b) => b.pnl - a.pnl)[0];
            const worst = [...d.holdings].sort((a, b) => a.pnl - b.pnl)[0];
            return {
                text:
                    `You hold **${s.holdings}** stock${s.holdings > 1 ? "s" : ""} worth **${money(s.currentValue)}**.\n` +
                    `• Invested: ${money(s.invested)}\n` +
                    `• Profit/loss: ${signed(s.pnl)} (${pct(s.pnlPct)})\n` +
                    (best ? `• Best: ${best.symbol} (${signed(best.pnl)})\n` : "") +
                    (worst && worst !== best ? `• Weakest: ${worst.symbol} (${signed(worst.pnl)})` : ""),
                actions: [GO.stocks]
            };
        }
    },
    {
        name: "mutualfunds",
        keys: ["mutual fund", "mutual funds", "mf", "sip", "sips", "step up", "stepup"],
        reply: (d) => {
            const m = d.mutualFunds;
            if (!m.hasData) return empty("mutual fund or SIP entries", GO.mutualfund);
            return {
                text:
                    `Your mutual funds are worth **${money(m.currentValue)}** on ${money(m.invested)} invested.\n` +
                    `Gain: ${signed(m.pnl)} (${pct(m.pnlPct)}) across ${m.sips.length} SIP${m.sips.length > 1 ? "s" : ""}.`,
                actions: [GO.mutualfund]
            };
        }
    },
    {
        name: "deposits",
        keys: ["fixed deposit", "fixed deposits", "fd", "fds", "deposit", "deposits", "maturity", "matures"],
        reply: (d) => {
            const f = d.deposits;
            if (!f.activeCount) return empty("active fixed deposits", GO.deposits);
            const next = f.nextMaturity;
            return {
                text:
                    `You have **${f.activeCount}** active fixed deposit${f.activeCount > 1 ? "s" : ""} worth **${money(f.totalCurrentValue)}**.` +
                    (next ? `\nThe next one to mature is **${next.bankName}** on ${next.date}.` : ""),
                actions: [GO.deposits]
            };
        }
    }
];

/* -------- matching -------- */

const normalize = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/* A key counts as a whole word/phrase, or as a word prefix when it ends in a stem ("liabilit"). */
function hits(text, key) {
    return text.includes(` ${key} `) || text.includes(` ${key}s `) || (key.length >= 6 && text.includes(` ${key}`));
}

function pickIntent(text) {
    let best = null;
    let bestScore = 0;

    INTENTS.forEach((intent) => {
        const score = intent.keys.reduce((s, k) => (hits(text, k) ? s + k.split(" ").length + 1 : s), 0);
        if (score > bestScore) {
            best = intent;
            bestScore = score;
        }
    });

    return best;
}

function navigationTarget(raw, text) {
    if (!/\b(open|go to|goto|take me|show me|navigate|visit)\b/.test(raw.toLowerCase())) return null;
    const hit = PAGES.find(([words]) => words.some((w) => text.includes(` ${w}`)));
    return hit ? hit[1] : null;
}

/* Suggested questions. The first six show on the start screen; each one is answered by an intent above. */
export const SUGGESTIONS = [
    "What's my net worth?",
    "Show my summary",
    "How are my stocks doing?",
    "Spending this month",
    "Any loans or EMI?",
    "How are my mutual funds doing?",
    "When does my next FD mature?",
    "How is my money split?",
    "What's my cash balance?",
    "Who owes me money?",
    "What are my liabilities?",
    "What can you do?"
];

export function respond(input, snapshot) {
    const raw = String(input || "").trim();
    const text = normalize(raw);

    const target = navigationTarget(raw, text);
    if (target) return { text: `Sure, taking you there.`, actions: [target], go: target.path };

    const intent = pickIntent(text);

    if (!intent) {
        return {
            text:
                "I didn't quite get that. I can help with your **net worth**, **cash**, **spending**, **stocks**, " +
                "**mutual funds**, **deposits** and **loans**. Try asking, for example, 'What is my net worth?'"
        };
    }

    // Greetings and help don't need data.
    return intent.reply(snapshot || {});
}

/* Intents that need no data, so Rover can answer instantly. */
export const needsData = (input) => {
    const intent = pickIntent(normalize(input));
    return !!intent && !["greeting", "thanks", "help"].includes(intent.name);
};
