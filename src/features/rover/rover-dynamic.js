import { formatINR } from "../dashboard/dashboard-service.js";

/*
 * Rover dynamic suggestions + name lookups (pure logic, no DOM, no storage, read-only).
 *
 *   buildEntities(snapshot)             the names in YOUR data (income sources, people, FDs, loans,
 *                                       spending categories, stocks), each with a ready question
 *   rankEntities(typed, entities)       the questions that fit what is being typed, best first.
 *                                       Works from the first letter: "income d" finds "Income from Dad"
 *   entityReply(raw, text, snapshot)    answers "Income from Dad", "dad", "Loan from HDFC",
 *                                       "FD in SBI" ... or returns null to carry on as usual
 *
 * `text` is the normalised question (lower case, padded with spaces) that rover-engine.js already makes.
 */

const money = formatINR;
const CAP_PER_KIND = 40;
const SKIP_NAMES = new Set(["other", "others", "self", "na", "n/a", "none", "misc", "miscellaneous"]);

/* Words that say nothing about WHICH source / person / bank it is. */
const GENERIC = new Set([
    "bank", "limited", "ltd", "private", "pvt", "finance", "financial", "fund", "loan", "home", "car", "personal", "gold",
    "from", "fixed", "deposit", "salary", "income", "other", "others", "self", "service", "services", "company", "india",
    "the", "and", "for", "with", "money", "account"
]);

/* ---------- words ---------- */

/* Chatter that never names anything. Single letters are kept: the last one is the start of a name ("d" -> Dad). */
const STOP = new Set(["how", "are", "is", "the", "what", "whats", "do", "does", "any", "me", "my", "to", "of", "and", "or", "can", "you", "i", "a", "an", "in", "on", "this", "show", "tell", "please", "about", "when", "who", "all", "much", "did", "have"]);

const wordsOf = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);

function stem(w) {
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
}

/* Does one typed word fit one real word? The word being typed (the last one) may be just a start: "d" -> "dad". */
function fits(typed, word, isLast) {
    if (typed === word || stem(typed) === stem(word)) return true;
    if (isLast) return word.startsWith(typed);
    return typed.length >= 2 && word.startsWith(typed);
}

/* ---------- 1. the names in the user's data ---------- */

function clean(name) {
    const n = String(name || "").trim();
    return n && !SKIP_NAMES.has(n.toLowerCase()) ? n : "";
}

export function buildEntities(d) {
    const out = [];
    const seen = new Set();
    const add = (kind, name, question, hints) => {
        const n = clean(name);
        if (!n) return;
        const key = question.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ kind, name: n, question, hints });
    };
    const each = (list, fn) => (Array.isArray(list) ? list : []).slice(0, CAP_PER_KIND).forEach(fn);

    each(d?.incomeSources, (s) => add("income", s.label, `Income from ${clean(s.label)}`, "income earned earning received salary source paid how much"));
    each(d?.lendingPeople?.length ? d.lendingPeople : d?.people, (p) => add("person", p.name, `Money with ${clean(p.name)}`, "owe owes lend lent borrowed lending balance money friend"));
    each(d?.fds, (f) => add("fd", f.name, `FD in ${clean(f.name)}`, "fd fixed deposit maturity matures bank interest"));
    each(d?.loans, (l) => add("loan", l.lender, `Loan from ${clean(l.lender)}`, "loan emi lender debt outstanding borrowed"));
    each(d?.categories, (c) => add("spend", c.label, `Spending on ${clean(c.label)}`, "spend spent spending expense cost paid how much"));
    each(d?.holdings, (h) => add("stock", h.name || h.symbol, `How is ${clean(h.name || h.symbol)} doing?`, "stock share holding invest"));
    const sips = d?.mutualFunds?.sips;
    each(sips, (f) => {
        const short = String(f.name || "").split(/\s+-\s+/)[0].trim() || f.name;
        const dup = (sips || []).filter((o) => String(o.name || "").split(/\s+-\s+/)[0].trim() === short).length > 1;
        add("fund", f.name, `How is ${clean(dup ? f.name : short)} doing?`, "mutual fund mf sip fund invest returns");
    });

    return out;
}

/* ---------- 2. suggestions while typing ---------- */

/*
 * An entity is only offered when the typed words point at its NAME (so "income d" finds Dad, not
 * every income question), and every typed word must fit something in the name, the question or its
 * synonyms. Best first: more name hits, then the order the data came in (biggest first).
 */
export function rankEntities(query, entities, limit = 4) {
    // "income dad, sal": the name being typed is the last one; the first piece's word (income / lend ...) still applies to it.
    const pieces = String(query || "").split(/\n|;|,|\||\+/);
    if (pieces.length > 1) {
        const lastPiece = pieces[pieces.length - 1];
        if (!lastPiece.trim()) return [];
        const lead = wordsOf(pieces[0]).filter((w) => INTENT_WORDS.has(w));
        const own = wordsOf(lastPiece).some((w) => INTENT_WORDS.has(w));
        query = (own ? "" : lead.join(" ") + " ") + lastPiece;
    }
    const typed = wordsOf(query).filter((w) => !STOP.has(w));
    if (!typed.length || !entities?.length) return [];

    const last = typed.length - 1;
    const scored = [];

    entities.forEach((e, index) => {
        const nameWords = wordsOf(e.name);
        const otherWords = [...wordsOf(e.question), ...wordsOf(e.hints)];
        let nameHits = 0;
        let otherHits = 0;
        let misses = 0;

        typed.forEach((t, i) => {
            const isLast = i === last;
            if (nameWords.some((w) => fits(t, w, isLast))) nameHits++;
            else if (otherWords.some((w) => fits(t, w, isLast))) otherHits++;
            else misses++;
        });

        if (nameHits < 1) return;
        if (misses > (typed.length >= 3 ? 1 : 0)) return;

        const score = (nameHits + otherHits * 0.5 - misses * 0.5) / typed.length;
        scored.push({ e, score, index });
    });

    return scored
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, limit)
        .map((x) => x.e);
}

/* ---------- 3. answering questions about a name ---------- */

const INTENT = {
    income: /\b(income|earn|earned|earning|earnings|salary|received|receive|source|sources)\b/,
    person: /\b(owe|owes|lend|lent|borrow|borrowed|lending|money|balance|pay back|paid back)\b/,
    fd: /\b(fd|fds|deposit|deposits|fixed|maturity|mature|matures)\b/,
    loan: /\b(loan|loans|emi|lender|debt|outstanding)\b/
};

/* Does the question mention this name? The whole name, or any word of it that actually identifies it. */
function mentions(name, text, tokens) {
    const label = wordsOf(name).join(" ");
    if (label.length >= 2 && text.includes(` ${label} `)) return true;
    if (/\d/.test(label)) return false;
    return wordsOf(name).some((w) => w.length >= 3 && !GENERIC.has(w) && (tokens.has(w) || tokens.has(w + "s")));
}

const parseDay = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const pretty = (s) => {
    const d = parseDay(s);
    return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–";
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const GO = (label, path) => ({ label, path });

function incomeTotal(source, d) {
    const label = clean(source.label);
    const rows = (d.allIncome || []).filter((e) => clean(e.source) === label);
    return rows.reduce((s, e) => s + e.amount, 0) || source.amount || 0;
}

function incomeAnswer(source, d) {
    const label = clean(source.label);
    const rows = (d.allIncome || []).filter((e) => clean(e.source) === label);
    const total = incomeTotal(source, d);
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = rows.filter((e) => String(e.date).slice(0, 7) === month).reduce((s, e) => s + e.amount, 0);
    const all = (d.incomeSources || []).reduce((s, x) => s + x.amount, 0) || 0;
    const last = rows.map((e) => e.date).sort().pop();
    const share = all > 0 ? (total / all) * 100 : 0;

    const lines = [
        `💰 From **${label}** you've received **${money(total)}**` + (rows.length ? ` across ${plural(rows.length, "entry", "entries")}.` : "."),
        `• 📅 This month: ${money(thisMonth)}`,
        rows.length ? `• 🕒 Last received: ${pretty(last)}` : "",
        rows.length > 1 ? `• 📈 Average per entry: ${money(total / rows.length)}` : "",
        all > 0 ? `• 🥧 Share of all your income: ${share.toFixed(1)}%` : ""
    ].filter(Boolean);

    const block = rows.length
        ? {
            kind: "table",
            title: `Income from ${label}`,
            columns: [{ label: "Date", fmt: "text" }, { label: "Category", fmt: "text" }, { label: "Amount", fmt: "money" }],
            rows: rows.slice(0, 6).map((e) => [pretty(e.date), e.category || "–", e.amount])
        }
        : null;

    return { text: lines.join("\n"), blocks: block ? [block] : [] };
}

function personAnswer(p) {
    const name = clean(p.name);
    const amt = money(Math.abs(p.balance));
    const settled = Math.abs(p.balance) < 0.005;
    const head = settled
        ? `✅ **${name}** is settled. Nothing owed either way.`
        : p.balance > 0 ? `🤝 **${name}** owes you **${amt}**.` : `🤝 You owe **${name}** **${amt}**.`;
    const hasDetail = Number.isFinite(p.totalGave);
    const last = p.recent && p.recent[0];

    const lines = [
        head,
        hasDetail ? `• 📤 You gave: ${money(p.totalGave)}` : "",
        hasDetail ? `• 📥 You got back: ${money(p.totalGot)}` : "",
        hasDetail && p.entryCount ? `• 🧾 Entries: ${p.entryCount}` : "",
        last ? `• 🕒 Last entry: ${pretty(last.date)} (${last.type === "gave" ? "gave" : "got back"} ${money(last.amount)})` : "",
        last && last.note ? `• 📝 Note: ${last.note}` : ""
    ].filter(Boolean);

    const block = p.recent && p.recent.length
        ? {
            kind: "table",
            title: `Recent with ${name}`,
            columns: [{ label: "Date", fmt: "text" }, { label: "Type", fmt: "text" }, { label: "Amount", fmt: "money" }, { label: "Note", fmt: "text" }],
            rows: p.recent.map((e) => [pretty(e.date), e.type === "gave" ? "Gave" : "Got back", e.amount, e.note || "–"])
        }
        : null;

    return { text: lines.join("\n"), blocks: block ? [block] : [] };
}

function fdAnswer(f) {
    const name = clean(f.name);
    const earned = (Number(f.value) || 0) - (Number(f.principal) || 0);
    const when = f.maturityDate ? `\n• 📅 Matures on ${pretty(f.maturityDate)}` + (Number.isFinite(f.days) ? ` (${f.days > 0 ? `in ${plural(f.days, "day")}` : f.days === 0 ? "today" : "already matured"})` : "") : "";
    return {
        text: `🏦 **${name}** FD: **${money(f.principal)}** at ${Number(f.rate || 0).toFixed(2)}%, worth **${money(f.value)}** today.\n• 💹 Interest so far: ${money(earned)}${when}`,
        blocks: []
    };
}

function loanAnswer(l) {
    const name = clean(l.lender);
    const paid = Math.max(0, (Number(l.principal) || 0) - (Number(l.outstanding) || 0));
    return {
        text:
            `🏠 Loan from **${name}**: **${money(l.outstanding)}** still to pay (of ${money(l.principal)}).` +
            `\n• ✅ Paid so far: ${money(paid)}` +
            (l.emi ? `\n• 💳 EMI: ${money(l.emi)}` : "") +
            (l.nextDue ? `\n• 📅 Next due: ${pretty(l.nextDue)}` : ""),
        blocks: []
    };
}

const KINDS = [
    { kind: "income", list: (d) => d.incomeSources, label: (x) => x.label, answer: incomeAnswer, page: GO("Open Income Statement", "/income") },
    { kind: "person", list: (d) => (d.lendingPeople?.length ? d.lendingPeople : d.people), label: (x) => x.name, answer: personAnswer, page: GO("Open Lending", "/lending") },
    { kind: "fd", list: (d) => d.fds, label: (x) => x.name, answer: fdAnswer, page: GO("Open Fixed Deposits", "/deposits") },
    { kind: "loan", list: (d) => d.loans, label: (x) => x.lender, answer: loanAnswer, page: GO("Open Lending", "/lending") }
];

/* Returns a reply, or null. `nameOnly` is true when the question was just a name (no income / loan / FD word). */
export function entityReply(raw, text, d) {
    try {
        if (!d) return null;

        // Exact / typo-tolerant match first ("Friend 1" is never confused with "Friend 2").
        const direct = resolvePiece(raw, d, null, [], true);
        if (direct.length) {
            const parts = direct.map((h) => h.k.answer(h.item, d));
            return {
                text: parts.map((p) => p.text).join("\n\n"),
                blocks: parts.flatMap((p) => p.blocks || []),
                actions: [...new Map(direct.map((h) => [h.k.page.path, h.k.page])).values()],
                nameOnly: !kindsAsked(raw).length
            };
        }
        const tokens = new Set(String(text).split(" ").filter(Boolean));
        if (!tokens.size) return null;

        const found = [];
        for (const k of KINDS) {
            const hits = (Array.isArray(k.list(d)) ? k.list(d) : []).filter((x) => clean(k.label(x)) && mentions(k.label(x), text, tokens));
            if (hits.length) found.push({ k, hits: hits.slice(0, 3), asked: INTENT[k.kind].test(text) });
        }
        if (!found.length) return null;

        // "income from dad" picks income; just "dad" shows everything that is called dad.
        const asked = found.filter((f) => f.asked);
        const use = asked.length ? asked : found;

        const parts = use.flatMap((f) => f.hits.map((h) => f.k.answer(h, d)));
        const actions = [...new Map(use.map((f) => [f.k.page.path, f.k.page])).values()];

        return {
            text: parts.map((p) => p.text).join("\n\n"),
            blocks: parts.flatMap((p) => p.blocks || []),
            actions,
            nameOnly: !asked.length
        };
    } catch (error) {
        console.error("Rover name lookup:", error);
        return null;
    }
}


/* ---------- 4. smarter matching: typos, "friend 1", prefixes ---------- */

const INTENT_WORDS = new Set((
    "income earn earned earning earnings salary received receive source sources owe owes lend lent lending borrow borrowed money balance " +
    "pay back paid fd fds deposit deposits fixed maturity mature matures loan loans emi lender debt outstanding " +
    "stock stocks share shares holding holdings fund funds mf sip sips mutual"
).split(" "));

const KIND_INTENT = {
    ...INTENT,
    person: /\b(owe|owes|lend|lent|borrow|borrowed|lending|balance|pay back|paid back)\b/,
    stock: /\b(stock|stocks|share|shares|holding|holdings)\b/,
    fund: /\b(fund|funds|mf|sip|sips|mutual)\b/
};

const kindsAsked = (piece) => {
    const t = wordsOf(piece).join(" ");
    return Object.keys(KIND_INTENT).filter((k) => KIND_INTENT[k].test(t));
};

function levenshtein(a, b) {
    if (a === b) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const up = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = up;
        }
    }
    return prev[b.length];
}

const digitsOf = (x) => String(x).replace(/\D/g, "");

/* How well do the typed words point at this name? 3 exact, 2 start of it, 1.5 one typo, 1.2 one distinctive word, 0 no. */
function nameScore(words, label) {
    const lw = wordsOf(label);
    const lc = lw.join("");
    if (!lc || !words.length) return 0;
    let best = 0;

    for (let i = 0; i < words.length; i++) {
        let acc = "";
        for (let j = i; j < words.length; j++) {
            acc += words[j];
            if (acc === lc) best = Math.max(best, 3);
            else if (j === words.length - 1 && acc.length >= Math.min(3, lc.length) && lc.startsWith(acc)) best = Math.max(best, 2);
            else if (acc.length >= 5 && lc.length >= 5 && digitsOf(acc) === digitsOf(lc) && levenshtein(acc, lc) <= 1) best = Math.max(best, 1.5);
        }
    }

    if (!best && lw.length > 1 && !/\d/.test(lc)) {
        if (lw.some((w) => w.length >= 3 && !GENERIC.has(w) && words.some((x) => x === w || stem(x) === stem(w)))) best = 1.2;
    }
    return best;
}

function findIn(k, d, words, exactOnly, strict) {
    const list = Array.isArray(k.list(d)) ? k.list(d) : [];
    const scored = list
        .filter((x) => clean(k.label(x)))
        .map((x) => ({ x, s: nameScore(words, k.label(x)) }))
        .filter((r) => (exactOnly ? r.s === 3 : strict ? r.s === 3 || r.s === 1.5 || r.s === 1.2 : r.s >= 1.2));
    const top = Math.max(0, ...scored.map((r) => r.s));
    return scored.filter((r) => r.s === top).slice(0, 3).map((r) => r.x);
}

const PNL_WORDS = new Set(["profit", "profits", "pnl", "gain", "gains", "returns", "return", "loss", "losses"]);

/* One typed piece -> what it points at: [{ kind, item, k? }]. `ext` adds stocks and mutual funds (multi-name input). */
function resolvePiece(piece, d, ext, inherited, strict) {
    const all = wordsOf(piece).filter((w) => !STOP.has(w));
    const content = all.filter((w) => !INTENT_WORDS.has(w));
    const words = content.length ? content : all;
    const exactOnly = strict && !content.length;
    const asked = kindsAsked(piece);
    const kinds = asked.length ? asked : inherited;
    const own = KINDS;

    const tryKinds = (names) => own.filter((k) => names.includes(k.kind)).flatMap((k) => findIn(k, d, words, exactOnly, strict).map((item) => ({ kind: k.kind, item, k })));

    let hits = tryKinds(kinds.length ? kinds : own.map((k) => k.kind));
    if (!hits.length && kinds.length) hits = tryKinds(own.map((k) => k.kind));
    if (hits.length || strict || !ext) return hits;

    const stocks = ext.stock ? ext.stock(piece) : [];
    if (stocks.length) return stocks.slice(0, 3).map((item) => ({ kind: "stock", item }));
    const funds = ext.fund ? ext.fund(piece) : [];
    if (funds.length) return funds.slice(0, 3).map((item) => ({ kind: "fund", item }));
    if (content.length && content.every((w) => PNL_WORDS.has(w)) || (!content.length && all.some((w) => PNL_WORDS.has(w)))) return [{ kind: "pnl", item: {} }];
    return [];
}

/* ---------- 5. several names at once: "income dad, salary, profit" / "lend friend 1, friend 2" ---------- */

const signedMoney = (n) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const pctText = (n) => `${n >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(1)}%`;
const MULTI_SKIP = /\b(list|compare|vs|versus|chart|graph|table|download|export|csv|pdf|open|highest|lowest|biggest|smallest|top)\b/i;

function stockAnswer(h) {
    const up = h.pnl >= 0;
    return {
        text:
            `${up ? "🟢" : "🔴"} **${clean(h.name || h.symbol)}** (${h.symbol}) is ${up ? "up" : "down"} **${signedMoney(h.pnl)}** (${pctText(h.pnlPct)}).\n` +
            `• 💰 Value: ${money(h.value)}\n• 💼 Invested: ${money(h.invested)}\n• 🏷️ Average price: ${money(h.avg)}`
    };
}

function fundAnswer(f) {
    const up = f.pnl >= 0;
    return {
        text:
            `${up ? "🟢" : "🔴"} **${f.name}** is ${up ? "up" : "down"} **${signedMoney(f.pnl)}** (${pctText(f.pnlPct)}).\n` +
            `• 💰 Value: ${money(f.currentValue)}\n• 💼 Invested: ${money(f.invested)}`
    };
}

function pnlAnswer(d) {
    const s = d.stocks || {};
    const m = d.mutualFunds || {};
    const realised = d.ledger?.realizedGainLoss;
    return {
        text:
            `📈 **Profit / loss**\n` +
            `• Stocks: ${signedMoney(s.pnl || 0)} (${pctText(s.pnlPct)})\n` +
            `• Mutual funds: ${signedMoney(m.pnl || 0)} (${pctText(m.pnlPct)})` +
            (Number.isFinite(realised) ? `\n• Realised (sold): ${signedMoney(realised)}` : "")
    };
}

function answerFor(h, d) {
    if (h.k) return h.k.answer(h.item, d);
    if (h.kind === "stock") return stockAnswer(h.item);
    if (h.kind === "fund") return fundAnswer(h.item);
    return pnlAnswer(d);
}

const PAGE_OF = {
    income: GO("Open Income Statement", "/income"),
    person: GO("Open Lending", "/lending"),
    loan: GO("Open Lending", "/lending"),
    fd: GO("Open Fixed Deposits", "/deposits"),
    stock: GO("Open Stocks", "/stocks"),
    fund: GO("Open Mutual Fund", "/mutualfund"),
    pnl: GO("Open Dashboard", "/dashboard")
};

function summaryOf(hits, d) {
    const sum = { incomeN: 0, income: 0, recv: 0, pay: 0, people: 0, fdN: 0, fd: 0, loanN: 0, loan: 0, emi: 0, stockN: 0, stockV: 0, stockP: 0, fundN: 0, fundV: 0, fundP: 0 };

    hits.forEach((h) => {
        const x = h.item;
        if (h.kind === "income") { sum.incomeN++; sum.income += incomeTotal(x, d); }
        else if (h.kind === "person") { sum.people++; if (x.balance > 0) sum.recv += x.balance; else sum.pay += -x.balance; }
        else if (h.kind === "fd") { sum.fdN++; sum.fd += Number(x.value) || 0; }
        else if (h.kind === "loan") { sum.loanN++; sum.loan += Number(x.outstanding) || 0; sum.emi += Number(x.emi) || 0; }
        else if (h.kind === "stock") { sum.stockN++; sum.stockV += x.value || 0; sum.stockP += x.pnl || 0; }
        else if (h.kind === "fund") { sum.fundN++; sum.fundV += x.currentValue || 0; sum.fundP += x.pnl || 0; }
    });

    const rows = [];
    if (hits.some((h) => h.kind === "pnl")) {
        rows.push({ icon: "📊", label: "Stocks profit / loss", value: d.stocks?.pnl || 0, fmt: "signed", tone: "auto" });
        rows.push({ icon: "🪙", label: "Mutual funds profit / loss", value: d.mutualFunds?.pnl || 0, fmt: "signed", tone: "auto" });
    }
    if (sum.incomeN) rows.push({ icon: "💰", label: `Income (${plural(sum.incomeN, "source")})`, value: sum.income });
    if (sum.people) {
        rows.push({ icon: "📥", label: "They owe you", value: sum.recv });
        if (sum.pay) rows.push({ icon: "📤", label: "You owe them", value: sum.pay });
        rows.push({ icon: "🤝", label: `Lending net (${plural(sum.people, "person", "people")})`, value: sum.recv - sum.pay, fmt: "signed", tone: "auto" });
    }
    if (sum.fdN) rows.push({ icon: "🏦", label: `Fixed deposits (${sum.fdN})`, value: sum.fd });
    if (sum.loanN) {
        rows.push({ icon: "🏠", label: `Loans still to pay (${sum.loanN})`, value: sum.loan });
        if (sum.emi) rows.push({ icon: "💳", label: "Monthly EMI", value: sum.emi });
    }
    if (sum.stockN) {
        rows.push({ icon: "📈", label: `Stocks value (${sum.stockN})`, value: sum.stockV });
        rows.push({ icon: "📊", label: "Stocks profit / loss", value: sum.stockP, fmt: "signed", tone: "auto" });
    }
    if (sum.fundN) {
        rows.push({ icon: "🪙", label: `Mutual funds value (${sum.fundN})`, value: sum.fundV });
        rows.push({ icon: "📊", label: "Mutual funds profit / loss", value: sum.fundP, fmt: "signed", tone: "auto" });
    }

    const text = rows.map((r) => `• ${r.icon} ${r.label}: ${r.fmt === "signed" ? signedMoney(r.value) : money(r.value)}`).join("\n");
    return { rows, text };
}

/* Returns a reply for two or more names in one message, or null to carry on as usual. `ext` = { stock(piece), fund(piece) }. */
export function multiReply(raw, d, ext) {
    try {
        if (!d || !raw || MULTI_SKIP.test(raw)) return null;

        let parts = String(raw).split(/\n|;|,|\||\+/).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) {
            // "income dad and salary": split on "and" / "&"; if that doesn't find two different names we carry on as one name.
            parts = String(raw).split(/\band\b|&/i).map((x) => x.trim()).filter(Boolean);
            if (parts.length < 2) return null;
        }
        parts = parts.slice(0, 8);

        let inherited = [];
        const seen = new Set();
        const sections = [];
        const hits = [];
        const missing = [];

        parts.forEach((piece) => {
            const asked = kindsAsked(piece);
            if (asked.length) inherited = asked;
            const found = resolvePiece(piece, d, ext, asked.length ? asked : inherited, false);
            const fresh = found.filter((h) => {
                const key = `${h.kind}:${h.k ? clean(h.k.label(h.item)) : h.item.symbol || h.item.id || h.item.name || ""}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            if (!found.length) missing.push(piece);
            fresh.forEach((h) => { hits.push(h); sections.push(answerFor(h, d).text); });
        });

        if (hits.length < 2 || hits.every((h) => h.kind === "fund")) return null;

        const summary = summaryOf(hits, d);
        const text =
            `🔎 Here's what I found for **${plural(hits.length, "item")}**:\n\n` +
            sections.join("\n\n") +
            (summary.text ? `\n\n📋 **Summary**\n${summary.text}` : "") +
            (missing.length ? `\n\n❓ I couldn't find: ${missing.map((m) => `**${m}**`).join(", ")}` : "");

        return {
            text,
            blocks: summary.rows.length ? [{ kind: "statement", title: "Summary", sections: [{ title: "", rows: summary.rows }] }] : [],
            actions: [...new Map(hits.map((h) => [PAGE_OF[h.kind].path, PAGE_OF[h.kind]])).values()]
        };
    } catch (error) {
        console.error("Rover multi-name lookup:", error);
        return null;
    }
}
