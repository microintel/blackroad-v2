/*
 * Suggestion matcher.
 *
 * Ranks the suggested questions against what the person is typing, so the
 * best one is on top even with typos, short word-starts or different words
 * for the same thing ("expenses" finds "Spending this month").
 *
 * Each typed word is scored against every word of a suggestion; the best
 * pairing counts:
 *   1.00  same word (after trimming plural / -ing / -ed)
 *   0.90  word-start  ("mut" -> "mutual", works while typing)
 *   0.80  same meaning (synonym group)
 *   0.60  close spelling (one or two letters off)
 * Rarer words weigh more than common ones (inverse frequency across the
 * suggestions), a full-phrase hit adds a bonus, and a hit on the last
 * (still-being-typed) word is forgiven a little. Pure, no DOM.
 */

const FILLER = new Set([
    "how", "are", "is", "the", "what", "whats", "do", "does", "any", "me", "my", "to", "of", "and", "or",
    "can", "you", "i", "a", "an", "in", "on", "s", "this", "show", "tell", "please", "about", "when", "who", "all"
]);

/* Words that mean the same thing in this app. */
const GROUPS = [
    ["worth", "networth", "wealth", "assets", "asset", "total", "holdings"],
    ["summary", "overview", "snapshot", "report", "status", "dashboard"],
    ["stock", "share", "equity", "portfolio", "demat", "market", "invest", "investment", "pnl", "profit", "loss"],
    ["mutual", "fund", "mf", "sip", "nav"],
    ["spend", "spending", "expense", "cost", "bill", "paid", "outflow", "month", "monthly", "salary", "income"],
    ["loan", "emi", "debt", "borrow", "credit", "mortgage", "installment", "liability", "liabilities"],
    ["fd", "fixed", "deposit", "maturity", "mature", "interest", "rd", "recurring"],
    ["split", "allocation", "breakdown", "distribution", "mix", "spread", "diversification"],
    ["cash", "balance", "bank", "savings", "account", "money"],
    ["owe", "owes", "lend", "lent", "lending", "receivable", "borrowed"],
    ["help", "capability", "capabilities", "features", "options"]
];

const GROUP_OF = new Map();
GROUPS.forEach((g, i) => g.forEach((w) => { GROUP_OF.set(w, i); GROUP_OF.set(stem(w), i); }));

/* Meaning group of a word, trying the word as typed and its plain forms. */
function groupOf(w) {
    for (const c of [w, stem(w), w.replace(/s$/, ""), w.replace(/e?s$/, ""), w.replace(/e?d$/, ""), w.replace(/ing$/, "")]) {
        if (GROUP_OF.has(c)) return GROUP_OF.get(c);
    }
    return undefined;
}

function stem(w) {
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
}

export function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/['’]/g, "")
        .split(/[^a-z0-9&]+/)
        .filter((w) => w.length > 0 && !FILLER.has(w));
}

/* Edit distance, stopping early once it passes `max`. */
function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            rowMin = Math.min(rowMin, cur[j]);
        }
        if (rowMin > max) return max + 1;
        prev = cur;
    }
    return prev[b.length];
}

/* How well one typed word matches one suggestion word (0 to 1). */
function wordScore(q, w, isLast) {
    const sq = stem(q), sw = stem(w);
    if (sq === sw) return 1;
    if (isLast && q.length >= 2 && (w.startsWith(q) || sw.startsWith(sq))) return 0.9;
    if (q.length >= 3 && w.startsWith(q)) return 0.85;
    const g = groupOf(q);
    if (g !== undefined && g === groupOf(w)) return 0.8;
    if (q.length >= 4) {
        const max = q.length >= 8 ? 2 : 1;
        if (distance(sq, sw, max) <= max) return 0.6;
    }
    return 0;
}

const THRESHOLD = 0.4;

/* Returns [{ item, score }] best first. Nothing typed: every item, original order. */
export function rankSuggestions(query, items) {
    const q = tokenize(query);
    if (!q.length) return items.map((item) => ({ item, score: 0 }));

    const docs = items.map((item) => ({ item, words: tokenize(item) }));

    // Rare words count for more: weight = log(1 + N / suggestions it matches). A word that matches
    // nothing ("much") barely counts, so extra chatter never sinks a good match.
    const weight = (word, i) => {
        const df = docs.filter((d) => d.words.some((w) => wordScore(word, w, i === q.length - 1) > 0)).length;
        return df === 0 ? 0.3 : Math.log(1 + docs.length / df);
    };
    const weights = q.map(weight);
    if (weights.every((w) => w === 0.3)) return [];
    const total = weights.reduce((a, b) => a + b, 0);
    const phrase = q.join(" ");

    return docs
        .map((d, index) => {
            let sum = 0;
            q.forEach((word, i) => {
                const best = Math.max(0, ...d.words.map((w) => wordScore(word, w, i === q.length - 1)));
                sum += best * weights[i];
            });
            let score = sum / total;
            if (d.words.join(" ").includes(phrase)) score = Math.min(1, score + 0.15);
            return { item: d.item, score, index };
        })
        .filter((r) => r.score >= THRESHOLD)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ item, score }) => ({ item, score }));
}
