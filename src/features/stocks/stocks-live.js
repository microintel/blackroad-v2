/* =========================================================
   STOCKS — LIVE MARKET DATA
   Same endpoints and response shapes as the old app:
     LTP:   { symbol, yahooSymbol, ltp }  |  { error }
     Chart: { history: [{ date, close }], ... }  |  { error }
   Manual price entry always stays available as an override.
   ========================================================= */

export const LTP_API_BASE = "https://indian-stock-ltp.vercel.app/api/ltp";
export const CHART_API_BASE = "https://indian-stock-ltp.vercel.app/api/chart";
export const LIVE_PRICE_POLL_MS = 3000;

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
