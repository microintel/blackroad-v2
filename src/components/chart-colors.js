/* =========================================================
   CHART COLOURS
   Canvas and inline-SVG charts can't read CSS variables from
   their own markup, so JavaScript reads the active theme's
   tokens (theme.css) at the moment a chart is drawn. Values are
   flat hex colours: no gradients.

   Charts are drawn when a view renders, so a chart already on
   screen keeps its colours until the view is rendered again
   (navigating, refreshing, or switching a tab).
   ========================================================= */

const FALLBACK = {
    gold: "#D4AF37",
    goldBright: "#F0CC65",
    goldMuted: "#A88932",
    success: "#22C55E",
    danger: "#F87171",
    info: "#60A5FA",
    infoStrong: "#3B82F6",
    warning: "#F59E0B",
    text: "#FFFFFF",
    textSecondary: "#A3A3A3",
    textMuted: "#737373"
};

const TOKEN = {
    gold: "--br-gold",
    goldBright: "--br-gold-bright",
    goldMuted: "--br-gold-muted",
    success: "--br-success",
    danger: "--br-danger",
    info: "--br-info",
    infoStrong: "--br-info-strong",
    warning: "--br-warning",
    text: "--br-text",
    textSecondary: "--br-text-secondary",
    textMuted: "--br-text-muted"
};

function readToken(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch {
        return fallback;
    }
}

/* COLORS.success etc. keep working exactly as before; each property
   is now looked up from the active theme when it is read. */
export const COLORS = Object.defineProperties(
    {},
    Object.fromEntries(
        Object.keys(TOKEN).map((key) => [
            key,
            { enumerable: true, get: () => readToken(TOKEN[key], FALLBACK[key]) }
        ])
    )
);

/* Neutral series for breakdowns (categories, holdings): not good/bad news.
   Tracks --br-series-1..7, so it follows the theme too. */
const SERIES_FALLBACK = [
    "#D4AF37", "#60A5FA", "#A3A3A3", "#A88932", "#3B82F6", "#737373", "#F0CC65"
];

export const SERIES = new Proxy(SERIES_FALLBACK, {
    get(target, prop, receiver) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
            const i = Number(prop);
            return readToken("--br-series-" + (i + 1), target[i]);
        }
        return Reflect.get(target, prop, receiver);
    }
});

export const seriesColor = (i) => SERIES[i % SERIES_FALLBACK.length];
