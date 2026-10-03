/* =========================================================
   BLACKROAD CURRENCY
   Display-only INR <-> USD switch.

   - All data is stored and entered in rupees. Nothing stored is
     ever converted; only what is SHOWN changes.
   - The USD rate comes from fxapi.app (INR -> USD) and is fetched
     at most once per calendar day, then kept in localStorage.
   - If the fetch fails, the last saved rate is used; if there is
     none at all the app simply stays in rupees.

   Storage keys
     br_currency   'INR' | 'USD'
     br_fx_rate    JSON { rate, date, ts }   (rate = USD per 1 INR)
   ========================================================= */

const K = { mode: "br_currency", rate: "br_fx_rate" };

const FX_URL = "https://fxapi.app/api/inr/usd.json";

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const localDay = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");

    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function readRate() {
    try {
        const r = JSON.parse(get(K.rate) || "null");

        return r && r.rate > 0 ? r : null;
    } catch {
        return null;
    }
}

let inflight = null;
let failedDay = "";

/* ---------------- rate ---------------- */

/* Make sure a rate for today is saved. Hits the network only when the
   saved rate is not from today, and only once per day (a failed attempt
   is not repeated until tomorrow or a reload). Never rejects. */
export function ensureRate() {
    const saved = readRate();
    const today = localDay();

    if (saved && saved.date === today) return Promise.resolve(saved.rate);
    if (failedDay === today) return Promise.resolve(saved ? saved.rate : 0);
    if (inflight) return inflight;

    inflight = fetch(FX_URL, { cache: "no-store" })
        .then((res) => {
            if (!res.ok) throw new Error("HTTP " + res.status);

            return res.json();
        })
        .then((data) => {
            const rate = Number(data && data.rate);

            if (!(rate > 0)) throw new Error("bad rate");

            set(K.rate, JSON.stringify({ rate, date: today, ts: Date.now() }));

            return rate;
        })
        .catch((error) => {
            failedDay = today;
            console.warn("BlackRoad: USD rate fetch failed", error);

            return saved ? saved.rate : 0;
        })
        .finally(() => { inflight = null; });

    return inflight;
}

/* USD per 1 INR from storage (0 when never fetched). */
export const getRate = () => (readRate() || { rate: 0 }).rate;

export const rateInfo = () => readRate();

/* ---------------- mode ---------------- */

export const getCurrency = () => (get(K.mode) === "USD" && getRate() > 0 ? "USD" : "INR");

export const isUSD = () => getCurrency() === "USD";

/* Switch currency and tell the app (it re-renders the page). */
export async function setCurrency(next) {
    if (next === "USD") {
        await ensureRate();

        if (!(getRate() > 0)) {
            window.dispatchEvent(new CustomEvent("br:currency-error"));

            return getCurrency();
        }
    }

    set(K.mode, next === "USD" ? "USD" : "INR");
    window.dispatchEvent(new CustomEvent("br:currency-change", { detail: { currency: getCurrency() } }));

    return getCurrency();
}

export const toggleCurrency = () => setCurrency(isUSD() ? "INR" : "USD");

/* Fetch today's rate in the background at start-up. */
export function initCurrency() {
    ensureRate().then(() => {
        // A saved USD choice with no rate yet falls back to INR on its own;
        // once the rate arrives, refresh so the saved choice shows.
        if (get(K.mode) === "USD" && getRate() > 0) {
            window.dispatchEvent(new CustomEvent("br:currency-change", { detail: { currency: "USD" } }));
        }
    });
}

/* ---------------- conversion + formatting ---------------- */

/* Rupee amount -> amount in the display currency. */
export const convert = (inr) => (isUSD() ? (Number(inr) || 0) * getRate() : Number(inr) || 0);

export const symbol = () => (isUSD() ? "$" : "₹");

/* USD text for a RUPEE amount. whole = round large figures to dollars. */
export function usd(inr, { whole = false, sign = true } = {}) {
    const v = (Number(inr) || 0) * getRate();
    const abs = Math.abs(v);
    const dp = whole && abs >= 1000 ? 0 : 2;
    const text = abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

    return (sign && v < 0 && abs >= (dp ? 0.005 : 0.5) ? "-" : "") + "$" + text;
}

/* Short axis labels: $1.2K, $3.4M, $1.1B */
export function usdShort(inr) {
    const v = Math.abs((Number(inr) || 0) * getRate());
    const s = (Number(inr) || 0) < 0 ? "-" : "";
    const trim = (x) => String(+x.toFixed(2));

    if (v >= 1e9) return s + "$" + trim(v / 1e9) + "B";
    if (v >= 1e6) return s + "$" + trim(v / 1e6) + "M";
    if (v >= 1e3) return s + "$" + trim(v / 1e3) + "K";

    return s + "$" + trim(v);
}
