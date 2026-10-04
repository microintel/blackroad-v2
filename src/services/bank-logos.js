/* =========================================================
   BANK LOGOS (frontend only)
   Bank name -> bank slug -> raw GitHub logo URL.

   Source: https://github.com/praveenpuglia/indian-banks
     data/banks.json            { slug: "Bank name" }
     assets/logos/{slug}/symbol.svg (and symbol.png next to it)

   Nothing is copied into the project and there is no backend.
   The small name index is fetched once from raw.githubusercontent.com and
   cached in localStorage; logos are plain <img> requests to the same host.
   ========================================================= */

const BASE = "https://raw.githubusercontent.com/praveenpuglia/indian-banks/main";
const CACHE_KEY = "br-bank-index-v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/* Each bank has its own folder. We show the square symbol (small logo),
   not the wide wordmark: assets/logos/<slug>/symbol.svg and symbol.png. */
export const logoUrl = (slug, ext = "svg") => `${BASE}/assets/logos/${slug}/symbol.${ext}`;

/* Everyday short names -> slug. Only a few; every full name comes from the dataset. */
const ALIASES = {
    sbi: "sbin", pnb: "punb", icici: "icic", axis: "utib", kotak: "kkbk",
    bob: "barb", boi: "bkid", idfc: "idfb", yes: "yesb", canara: "cnrb",
    union: "ubin", indusind: "indb", rbl: "ratn", uco: "ucba", idbi: "ibkl"
};

/* Bank names only (no URLs), used when the dataset file cannot be fetched
   (offline, blocked). Logo URLs are still built from the slug. */
const FALLBACK = {
    airp: "Airtel Payments Bank",
    aubl: "AU Small Finance Bank Limited",
    barb: "Bank of Baroda",
    bdbl: "Bandhan Bank",
    bkid: "Bank of India",
    cbin: "Central Bank of India",
    ciub: "City Union Bank",
    cnrb: "Canara Bank",
    csbk: "CSB Bank Limited",
    dcbl: "DCB Bank Limited",
    dlxb: "Dhanalakshmi Bank",
    esmf: "ESAF Small Finance Bank",
    fdrl: "Federal Bank",
    fino: "FINO Payments Bank",
    hdfc: "HDFC Bank",
    ibkl: "IDBI Bank",
    icic: "ICICI Bank Limited",
    idfb: "IDFC First Bank Limited",
    idib: "Indian Bank",
    indb: "IndusInd Bank",
    ioba: "Indian Overseas Bank",
    jaka: "Jammu and Kashmir Bank",
    jiop: "Jio Payments Bank",
    karb: "Karnataka Bank Limited",
    kkbk: "Kotak Mahindra Bank Limited",
    kvbl: "Karur Vysya Bank",
    mahb: "Bank of Maharashtra",
    ntbl: "The Nainital Bank Limited",
    psib: "Punjab and Sind Bank",
    punb: "Punjab National Bank",
    pytm: "Paytm Payments Bank",
    ratn: "RBL Bank Limited",
    sbin: "State Bank of India",
    scbl: "Standard Chartered Bank",
    sibl: "South Indian Bank",
    tmbl: "Tamilnad Mercantile Bank Limited",
    ubin: "Union Bank of India",
    ucba: "UCO Bank",
    ujvn: "Ujjivan Small Finance Bank Ltd",
    utib: "Axis Bank",
    yesb: "Yes Bank",
};

const GENERIC = new Set(["bank", "limited", "ltd", "the", "of", "and", "pvt", "private", "co", "operative", "small", "finance"]);

let indexPromise = null;

function readCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        return c && c.data && typeof c.data === "object" ? c : null;
    } catch (e) {
        return null;
    }
}

/* { slug: name }. Falls back to the built-in names if the fetch fails. */
export function loadBankIndex() {
    if (indexPromise) return indexPromise;

    indexPromise = (async () => {
        const cached = readCache();

        if (cached && Date.now() - cached.t < MAX_AGE) return { ...FALLBACK, ...cached.data };

        try {
            const res = await fetch(`${BASE}/data/banks.json`);

            if (!res.ok) throw new Error("HTTP " + res.status);

            const data = await res.json();

            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
            } catch (e) { /* storage full or blocked */ }

            return { ...FALLBACK, ...data };
        } catch (e) {
            console.warn("BlackRoad bank logos: could not load banks.json, using built-in names.", e);
            indexPromise = null; /* try again next time */
            return { ...FALLBACK, ...(cached ? cached.data : {}) };
        }
    })();

    return indexPromise;
}

const words = (s) =>
    String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/* Returns the slug for a typed/selected bank name, or "" when not found. */
export function findSlug(name, index) {
    const w = words(name);

    if (!w.length) return "";

    const typed = w.join(" ");
    const entries = Object.entries(index || {});

    /* 1. exact name, or the slug itself */
    const exact = entries.find(([slug, n]) => words(n).join(" ") === typed || slug === typed);

    if (exact) return exact[0];

    /* 2. everyday short name */
    if (ALIASES[typed]) return ALIASES[typed];

    /* 3. every meaningful word typed appears in exactly one dataset name */
    const key = w.filter((x) => !GENERIC.has(x));

    if (!key.length) return "";

    const hits = entries.filter(([, n]) => {
        const nw = words(n);
        return key.every((x) => nw.includes(x));
    });

    return hits.length === 1 ? hits[0][0] : ALIASES[key[0]] && key.length === 1 ? ALIASES[key[0]] : "";
}

/* ---------- For the PDF export ----------
   jsPDF cannot draw SVG, so fetch the PNG next to the SVG as a data URL.
   If that fails, draw the SVG onto a canvas instead.
   Resolves { data, w, h } (data is a PNG data URL) or null. */

function readBlob(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (cors) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image failed"));
        img.src = src;
    });
}

export async function loadLogoDataURL(slug) {
    if (!slug) return null;

    try {
        const res = await fetch(logoUrl(slug, "png"));
        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await readBlob(await res.blob());
        const img = await loadImage(data);

        return { data, w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    } catch (e) { /* fall through to the SVG */ }

    try {
        const img = await loadImage(logoUrl(slug, "svg"), true);
        const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        const h = 256;
        const w = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement("canvas");

        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);

        return { data: canvas.toDataURL("image/png"), w, h };
    } catch (e) {
        return null;
    }
}
