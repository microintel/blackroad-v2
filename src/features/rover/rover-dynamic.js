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
    each(d?.people, (p) => add("person", p.name, `Money with ${clean(p.name)}`, "owe owes lend lent borrowed lending balance money"));
    each(d?.fds, (f) => add("fd", f.name, `FD in ${clean(f.name)}`, "fd fixed deposit maturity matures bank interest"));
    each(d?.loans, (l) => add("loan", l.lender, `Loan from ${clean(l.lender)}`, "loan emi lender debt outstanding borrowed"));
    each(d?.categories, (c) => add("spend", c.label, `Spending on ${clean(c.label)}`, "spend spent spending expense cost paid how much"));
    each(d?.holdings, (h) => add("stock", h.name || h.symbol, `How is ${clean(h.name || h.symbol)} doing?`, "stock share holding invest"));

    return out;
}

/* ---------- 2. suggestions while typing ---------- */

/*
 * An entity is only offered when the typed words point at its NAME (so "income d" finds Dad, not
 * every income question), and every typed word must fit something in the name, the question or its
 * synonyms. Best first: more name hits, then the order the data came in (biggest first).
 */
export function rankEntities(query, entities, limit = 4) {
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

function incomeAnswer(source, d) {
    const label = clean(source.label);
    const rows = (d.allIncome || []).filter((e) => clean(e.source) === label);
    const total = rows.reduce((s, e) => s + e.amount, 0) || source.amount || 0;
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
    return {
        text: p.balance > 0 ? `🤝 **${name}** owes you **${amt}**.` : `🤝 You owe **${name}** **${amt}**.`,
        blocks: []
    };
}

function fdAnswer(f) {
    const name = clean(f.name);
    const when = f.maturityDate ? `\n• 📅 Matures on ${pretty(f.maturityDate)}` + (Number.isFinite(f.days) ? ` (${f.days > 0 ? `in ${plural(f.days, "day")}` : f.days === 0 ? "today" : "already matured"})` : "") : "";
    return {
        text: `🏦 **${name}** FD: **${money(f.principal)}** at ${Number(f.rate || 0).toFixed(2)}%, worth **${money(f.value)}** today.${when}`,
        blocks: []
    };
}

function loanAnswer(l) {
    const name = clean(l.lender);
    return {
        text:
            `🏠 Loan from **${name}**: **${money(l.outstanding)}** still to pay (of ${money(l.principal)}).` +
            (l.emi ? `\n• 💳 EMI: ${money(l.emi)}` : "") +
            (l.nextDue ? `\n• 📅 Next due: ${pretty(l.nextDue)}` : ""),
        blocks: []
    };
}

const KINDS = [
    { kind: "income", list: (d) => d.incomeSources, label: (x) => x.label, answer: incomeAnswer, page: GO("Open Income Statement", "/income") },
    { kind: "person", list: (d) => d.people, label: (x) => x.name, answer: personAnswer, page: GO("Open Lending", "/lending") },
    { kind: "fd", list: (d) => d.fds, label: (x) => x.name, answer: fdAnswer, page: GO("Open Fixed Deposits", "/deposits") },
    { kind: "loan", list: (d) => d.loans, label: (x) => x.lender, answer: loanAnswer, page: GO("Open Lending", "/lending") }
];

/* Returns a reply, or null. `nameOnly` is true when the question was just a name (no income / loan / FD word). */
export function entityReply(raw, text, d) {
    try {
        if (!d) return null;
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
