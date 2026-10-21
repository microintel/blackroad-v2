/* =========================================================
   RANGE MOTION
   Presentation only. Nothing here changes what a range button
   does; it only animates the result.

   - A sliding, stretching "pill" under range selectors
     (1M / 3M / 6M / 1Y / All ...) in the dashboard, Mutual Fund
     profit chart, Stocks P&L chart and Income trend chart.
   - When a range is picked, the chart wipes in from the left and
     the figures beside it rise in.

   Works through the Web Animations API (opacity / transform /
   clip-path), skips everything for reduced motion.
   ========================================================= */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const reducedQuery =
    typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

const reduced = () => !!(reducedQuery && reducedQuery.matches);

function play(el, keyframes, options) {
    if (!el || reduced() || typeof el.animate !== "function") return null;

    try {
        return el.animate(keyframes, { easing: EASE, fill: "backwards", ...options });
    } catch {
        return null;
    }
}

/* [group selector, button selector] */
const GROUPS = [
    [".br-dash-pills", ".br-dash-pill"],
    [".su-range", ".su-range-btn"],
    [".stk-pnl-bar .br-chip-row", ".br-chip"],
    [".br-income-tabs:has([data-compare-range])", ".br-income-tab"],
    [".br-income-tabs:has([data-compare-mode])", ".br-income-tab"]
];

/* Range buttons -> where the chart that changes lives. */
const CHARTS = [
    {
        button: "[data-range]",
        active: "[data-range].active",
        scope: (btn) => btn.closest(".br-card"),
        plot: ["[data-pnl-chart] svg", ".br-dash-pnl-foot"],
        text: [".br-dash-pnl-foot strong"]
    },
    {
        button: "[data-su-range]",
        active: "[data-su-range].active",
        scope: (btn) => btn.closest(".su-profit"),
        plot: [".su-profit-plot", ".su-profit-axis"],
        text: [".su-profit-value", ".su-profit-head small"]
    },
    {
        button: "[data-pnl-range]",
        active: null,
        scope: (btn) => btn.closest("[data-pnl-host], .stk-pnl-bar")?.parentElement,
        plot: ["[data-pnl-plot]"],
        text: ["[data-pnl-read]"]
    },
    {
        button: "[data-compare-range]",
        active: "[data-compare-range].active",
        scope: (btn) => btn.closest("section"),
        plot: [".br-table-wrap svg"],
        text: []
    }
];

/* ---------- sliding pill ---------- */

const lastPos = new Map();   /* group key -> { x, w, at } so a re-rendered group can slide from where it was */

function keyOf(group, sel) {
    const all = [...document.querySelectorAll(sel)];
    return sel + "#" + all.indexOf(group);
}

function place(group, ink, btnSel, moved) {
    const btn = [...group.querySelectorAll(btnSel)].find(
        (b) => b.classList.contains("active") && b.offsetWidth
    );

    if (!btn) {
        group.removeAttribute("data-rink-ready");
        return;
    }

    const x = btn.offsetLeft;
    const y = btn.offsetTop;
    const w = btn.offsetWidth;
    const h = btn.offsetHeight;
    ink._pos = { x, y, w, h };
    ink.style.width = w + "px";
    ink.style.height = h + "px";
    ink.style.transform = `translate(${x}px, ${y}px)`;

    if (!group.hasAttribute("data-rink-ready")) {
        group.setAttribute("data-rink-ready", "");
    }

    group._rkey && lastPos.set(group._rkey, { x, w, at: Date.now() });
}

function setup(group, sel, btnSel) {
    if (group._brRange) return;
    group._brRange = true;

    const ink = document.createElement("span");
    ink.className = "br-range-ink";
    ink.setAttribute("aria-hidden", "true");

    group.classList.add("br-range-ink-on");
    group.appendChild(ink);
    group._rkey = keyOf(group, sel);

    const sync = () => place(group, ink, btnSel, false);

    /* A group that was just re-rendered (the whole card is rebuilt on a range
       click in Mutual Fund and Income): start the pill where the old one was. */
    const before = lastPos.get(group._rkey);
    sync();

    /* Slide on later moves only; a first placement must not glide in from the corner. */
    const first = () => requestAnimationFrame(() => requestAnimationFrame(() => group.setAttribute("data-rink-go", "")));

    if (before && Date.now() - before.at < 1200 && ink._pos && before.x !== ink._pos.x) {
        const { x, y } = ink._pos;
        const to = { x, w: ink._pos.w };

        ink.style.width = before.w + "px";
        ink.style.transform = `translate(${before.x}px, ${y}px)`;

        requestAnimationFrame(() => {
            group.setAttribute("data-rink-go", "");
            ink.style.width = to.w + "px";
            ink.style.transform = `translate(${to.x}px, ${y}px)`;
        });
    } else {
        first();
    }

    if (typeof ResizeObserver === "function") {
        const ro = new ResizeObserver(sync);
        ro.observe(group);
        group.querySelectorAll(btnSel).forEach((b) => ro.observe(b));
    }

    new MutationObserver(() => place(group, ink, btnSel, true)).observe(group, {
        attributes: true,
        attributeFilter: ["class"],
        subtree: true
    });
}

/* Safe to call repeatedly. */
export function initRanges(root = document) {
    for (const [sel, btnSel] of GROUPS) {
        let list;

        try {
            list = root.querySelectorAll(sel);
        } catch {
            continue;   /* :has() not supported: no pill, everything else still works */
        }

        list.forEach((group) => setup(group, sel, btnSel));
    }
}


/* ---------- chart reveal ---------- */

function reveal(def, btn) {
    /* the clicked button may have been replaced by the re-render */
    const live = btn.isConnected ? btn : def.active ? document.querySelector(def.active) : null;
    const scope = live ? def.scope(live) : null;

    if (!scope) return;

    for (const sel of def.plot) {
        scope.querySelectorAll(sel).forEach((el) => {
            play(
                el,
                [
                    { clipPath: "inset(-10px 100% -10px -4px)", opacity: 0.35 },
                    { clipPath: "inset(-10px -4px -10px -4px)", opacity: 1 }
                ],
                { duration: 780, easing: "cubic-bezier(0.65, 0, 0.25, 1)" }
            );
        });
    }

    for (const sel of def.text) {
        scope.querySelectorAll(sel).forEach((el) => {
            play(
                el,
                [
                    { opacity: 0, transform: "translateY(8px)" },
                    { opacity: 1, transform: "none" }
                ],
                { duration: 480, delay: 120 }
            );
        });
    }
}

let wired = false;

/* Call once. Wires the click handler and watches for re-rendered groups. */
export function initRangeMotion(root) {
    initRanges(root || document);

    if (wired) return;
    wired = true;

    document.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        for (const def of CHARTS) {
            const btn = target.closest(def.button);
            if (!btn) continue;

            /* wait until the click handlers have redrawn the chart */
            requestAnimationFrame(() => requestAnimationFrame(() => reveal(def, btn)));
            break;
        }
    });

    /* Mutual Fund and Income rebuild whole cards: pick up the new groups. */
    let queued = false;
    const host = document.body;

    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            initRanges(host);
        });
    }).observe(host, { childList: true, subtree: true });
}
