/* =========================================================
   STOCKS — LIVE MARKET DATA
   Same endpoints and response shapes as the old app:
     LTP:   { symbol, yahooSymbol, ltp }  |  { error }
     Chart: { history: [{ date, close }], ... }  |  { error }
   Manual price entry always stays available as an override.
   ========================================================= */

export const LTP_API_BASE = "https://indian-stock-ltp.vercel.app/api/ltp";
export const CHART_API_BASE = "https://indian-stock-ltp.vercel.app/api/chart";
export const LOGO_API_BASE = "https://indian-stock-ltp.vercel.app/api/logo";
export const LIVE_PRICE_POLL_MS = 3000;

/* Logo/icon image for a stock symbol (plain <img> request). */
export function stockLogoUrl(symbol) {
    return `${LOGO_API_BASE}?symbol=${encodeURIComponent(symbol)}`;
}

/* Small round stock logo (any pixel size) for lists, bars and cards.
   Initials sit behind the picture, so a logo that can't load just falls back to them. */
export function stockMiniLogoHTML(symbol, px = 24) {
    const sym = String(symbol || "").trim().toUpperCase();
    const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="stk-logo" style="width:${px}px;height:${px}px;border-radius:${Math.round(px * 0.28)}px;font-size:${Math.round(px * 0.38)}px;" data-initials="${esc(sym.slice(0, 2))}"><img src="${esc(stockLogoUrl(sym))}" alt="" loading="lazy" decoding="async" data-stk-logo></span>`;
}

/* Drops a logo image that fails to load (the initials show instead). */
export function watchStockLogos(root) {
    root.addEventListener("error", (event) => {
        const img = event.target;
        if (img && img.matches && img.matches("img[data-stk-logo]")) img.remove();
    }, true);
}

export async function fetchLTP(symbol) {
    const res = await fetch(
        `${LTP_API_BASE}?symbol=${encodeURIComponent(symbol)}`
    );
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data.ltp;
}

/*
 * LTP + company details in one call (details=1).
 * Returns { ltp, companyName, exchange, isin, logo }; never trusts missing fields.
 */
export async function fetchStockDetails(symbol) {
    const res = await fetch(
        `${LTP_API_BASE}?symbol=${encodeURIComponent(symbol)}&details=1`
    );
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return {
        ltp: data.ltp,
        companyName: typeof data.companyName === "string" ? data.companyName.trim() : "",
        exchange: data.exchange || "",
        isin: data.isin || "",
        logo: data.logo || ""
    };
}

export async function fetchChartHistory(symbol) {
    const res = await fetch(
        `${CHART_API_BASE}?symbol=${encodeURIComponent(symbol)}`
    );
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data;
}

/*
 * Fetches LTP for every symbol in the list.
 * Returns { updates: {SYM: ltp}, updated, failed }.
 * Never throws — a failed symbol just counts as failed.
 */
export async function fetchLTPs(symbols) {
    const results = await Promise.all(
        symbols.map(async (sym) => {
            try {
                return { sym, ltp: await fetchLTP(sym) };
            } catch (err) {
                return { sym, ltp: null };
            }
        })
    );

    const updates = {};
    let failed = 0;

    results.forEach(({ sym, ltp }) => {
        if (typeof ltp === "number" && isFinite(ltp) && ltp >= 0) {
            updates[sym] = ltp;
        } else {
            failed++;
        }
    });

    return { updates, updated: Object.keys(updates).length, failed };
}
