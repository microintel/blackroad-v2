/* =========================================================
   MUTUAL FUND LOGOS (frontend only)
   Fund house name -> logo image from the MicroIntel mf-logos service.

   Source: https://github.com/microintel/mf-logos
     service.json   { name, version, count, funds: [{ name, url }] }

   Nothing is copied into the project and there is no backend.
   The small index is fetched once from raw.githubusercontent.com and
   cached in localStorage; logos are plain <img> requests to the same host.
   If no logo matches a name (or the image fails to load) the first
   letter of the name is shown instead.
   ========================================================= */

const SERVICE_URL = "https://raw.githubusercontent.com/microintel/mf-logos/main/service.json";
const CACHE_KEY = "br-mf-logo-index-v1";
const MAX_AGE = 24 * 60 * 60 * 1000; /* 1 day, so newly added logos show up quickly */

let indexPromise = null;

function cleanFunds(list) {
    return (Array.isArray(list) ? list : [])
        .filter((f) => f && typeof f.name === "string" && typeof f.url === "string" && /^https:\/\//i.test(f.url))
        .map((f) => ({ name: f.name, url: f.url }));
}

function readCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        return c && Array.isArray(c.funds) ? c : null;
    } catch (e) {
        return null;
    }
}

/* Instant, synchronous read of whatever is cached (may be empty on first run). */
export function getCachedMfFunds() {
    const c = readCache();
    return c ? cleanFunds(c.funds) : [];
}

/* [{ name, url }]. Falls back to the cached copy (or empty) if the fetch fails. */
export function loadMfLogos() {
    if (indexPromise) return indexPromise;

    indexPromise = (async () => {
        const cached = readCache();

        if (cached && Date.now() - cached.t < MAX_AGE) return cleanFunds(cached.funds);

        try {
            const res = await fetch(SERVICE_URL);

            if (!res.ok) throw new Error("HTTP " + res.status);

            const data = await res.json();
            const funds = cleanFunds(data && data.funds);

            if (!funds.length) throw new Error("empty list");

            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), funds }));
            } catch (e) { /* storage full or blocked */ }

            return funds;
        } catch (e) {
            console.warn("BlackRoad MF logos: could not load service.json.", e);
            indexPromise = null; /* try again next time */
            return cached ? cleanFunds(cached.funds) : [];
        }
    })();

    return indexPromise;
}

const words = (s) =>
    String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

const DROP = new Set(["mutual", "fund", "mf", "asset", "management", "company", "amc", "ltd", "limited"]);

/* "SBI Mutual Fund" -> ["sbi"] */
const coreWords = (name) => {
    const w = words(name).filter((x) => !DROP.has(x));
    return w.length ? w : words(name);
};

const startsWithWords = (hay, needle) =>
    needle.length > 0 && hay.length >= needle.length && needle.every((x, i) => hay[i] === x);

/* Keywords match only when they are the SAME whole word.
   No prefix / "starts with" matching: "quant" must never match "quantum".
   A wrong logo is worse than the letter fallback, so we stay strict. */
const sameWord = (a, b) => a === b;

/* Not every keyword matched, but the house name's first word is near the front
   (at least half matched), or three-quarters / 2+ of its words matched. */
function matchedPartly(at, core) {
    const m = at.filter((i) => i !== -1).length;
    if (!m) return false;
    if (at[0] !== -1 && at[0] <= 1 && m / core.length >= 0.5) return true;
    return m >= 2 && m / core.length >= 0.75;
}

/* Returns the matching { name, url } for a typed / mfapi scheme name, or null.

   Whole-word keyword matching, anchored at the START of the name (a fund name
   begins with its fund house): "Aditya Birla Sun Life Flexi Cap Fund - Direct"
   finds "Aditya Birla Sun Life Mutual Fund"; typing only "kotak" finds
   "Kotak Mahindra Mutual Fund". When unsure (no match, or two houses fit
   equally) it returns null so the first letter is shown instead. */
/* Fund houses that are known by another name in mfapi scheme names than in the
   logo list. [name starts with these words] -> logo name. Only certain pairs. */
const ALIASES = [
    ["parag parikh", "PPFAS Mutual Fund"],
    ["ppfas", "PPFAS Mutual Fund"],
    ["idfc", "Bandhan Mutual Fund"],
    ["iifl", "360 ONE Mutual Fund"],
    ["reliance", "Nippon India Mutual Fund"],
    ["wealth company", "The Wealth Company Mutual Fund"],
    ["jio blackrock", "Jio BlackRock Mutual Fund"]
].map(([from, to]) => [words(from), words(to).join(" ")]);

export function findMfLogo(name, funds) {
    const typed = words(name);

    if (!typed.length || !funds || !funds.length) return null;

    for (const [from, to] of ALIASES) {
        if (startsWithWords(typed, from)) {
            const hit = funds.find((f) => words(f.name).join(" ") === to);
            if (hit) return hit;
        }
    }

    const typedCore = typed.filter((x) => !DROP.has(x));
    const full = typed.join(" ");

    let best = null;
    let bestScore = -1;
    let tied = false;

    for (const f of funds) {
        if (words(f.name).join(" ") === full) return f;

        const core = coreWords(f.name);
        const at = core.map((c) => typed.findIndex((w) => sameWord(w, c)));
        const found = at.filter((i) => i !== -1);
        let score = -1;

        /* A fund name always starts with its fund house, so the very first typed
           word must be one of the house's keywords. Matching in the middle of a
           name ("Union Bank of India ..." vs "Bank Of India") is never allowed. */
        if (found.length && Math.min(...found) === 0) {
            if (found.length === core.length) {
                score = core.length * 100;
            } else if (matchedPartly(at, core)) {
                /* e.g. "Kotak Flexicap" for "Kotak Mahindra",
                   or the old name "Birla Sun Life ..." for "Aditya Birla Sun Life" */
                score = found.length * 10 - core.length;
            } else if (typedCore.length && sameWord(typedCore[0], core[0]) && typedCore.every((w) => core.some((c) => sameWord(w, c)))) {
                /* typed only the start of the house name ("kotak") */
                score = typedCore.length * 10 - core.length;
            }
        }

        if (score > bestScore) {
            best = f;
            bestScore = score;
            tied = false;
        } else if (score === bestScore && score >= 0) {
            tied = true;
        }
    }

    /* Two different fund houses fit equally well -> don't guess, show the letter */
    return bestScore >= 0 && !tied ? best : null;
}

/* Scheme suggestions from mfapi.in while typing a SIP name.
   Resolves [{ schemeCode, schemeName }] (max `limit`). Pass an AbortSignal to cancel. */
export async function searchMfSchemes(query, signal, limit = 8) {
    const q = String(query || "").trim();

    if (q.length < 2) return [];

    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { signal });

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    return (Array.isArray(data) ? data : [])
        .filter((x) => x && x.schemeName)
        .slice(0, limit)
        .map((x) => ({ schemeCode: x.schemeCode, schemeName: String(x.schemeName) }));
}

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Logo badge for a SIP name. The letter sits behind the image, so when the
   image is missing or fails to load (the page removes the <img>), the letter shows. */
export function mfLogoHTML(name, funds, size = "md") {
    const text = String(name || "").trim();
    const letter = (text.match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase();
    const hit = findMfLogo(text, funds);
    const img = hit
        ? `<img src="${esc(hit.url)}" alt="${esc(hit.name)} logo" loading="lazy" decoding="async" data-mf-logo>`
        : "";

    return `<span class="mf-logo mf-logo-${size}" data-initials="${esc(letter)}">${img}</span>`;
}
