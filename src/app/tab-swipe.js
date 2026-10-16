/* =========================================================
   TAB ARROW KEYS
   Income, Stocks, Mutual Fund (StepUp) and Lending.

   Desktop: Left / Right arrow keys move to the previous / next tab.
   It only clicks the same tab buttons the user would click, so every
   module keeps working exactly as before. Mobile swipe was removed.
   ========================================================= */

const TAB_ATTRS = ["data-income-tab", "data-stocks-tab", "data-su-tab", "data-ll-tab"];

/* Same panels motion.js knows about (the one that holds the open tab). */
const PANEL_FOR = [
    ["incomeTab", (page, v) => page.querySelector(`[data-income-view-container="${v}"]`)],
    ["stocksTab", (page, v) => page.querySelector(`[data-stocks-view="${v}"]`)],
    ["suTab", (page) => page.querySelector("[data-su-content]")],
    ["llTab", (page) => page.querySelector("[data-ll-content]")]
];

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedQuery =
    typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

const reduced = () => !!(reducedQuery && reducedQuery.matches);

const isShown = (el) => !!el && !el.hidden && el.getClientRects().length > 0;

const modalOpen = () =>
    !!document.querySelector(".br-modal-layer:not([hidden])") ||
    document.body.classList.contains("br-no-scroll");

function panelOf(page, button) {
    for (const [key, find] of PANEL_FOR) {
        const value = button.dataset[key];
        if (value !== undefined) return find(page, value);
    }
    return null;
}

/* The tab group of a page, its tabs, the open one and the open panel. */
function getContext(page) {
    if (!page) return null;

    const group = [...page.querySelectorAll(".br-income-tabs")].find((g) =>
        TAB_ATTRS.some((attr) => g.querySelector(`[${attr}]`))
    );

    if (!group || !isShown(group)) return null;

    const tabs = [...group.querySelectorAll(".br-income-tab")].filter(
        (t) => isShown(t) && !t.disabled
    );

    const idx = tabs.findIndex((t) => t.classList.contains("active"));
    if (idx < 0) return null;

    const panel = panelOf(page, tabs[idx]);
    if (!panel || !isShown(panel)) return null;

    return { page, group, tabs, idx, panel };
}

const currentPage = () => document.querySelector("#app .br-content .br-page");

function scrollsSideways(el) {
    const ox = getComputedStyle(el).overflowX;
    return (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
}

/* Places where a sideways drag already means something else. */
function blockedTarget(el, page) {
    if (el.closest(
        'input, textarea, select, [contenteditable="true"], [role="slider"], canvas, ' +
        '[data-tip], [data-no-swipe], .br-income-tabs, dialog, [role="dialog"]'
    )) return true;

    /* Chart drawings are svg; icons inside buttons and links are not. */
    const svg = el.closest("svg");
    if (svg && !svg.closest('button, a, label, summary, [role="button"]')) return true;

    for (let n = el; n && n !== page; n = n.parentElement) {
        if (scrollsSideways(n)) return true;
    }

    return false;
}

function isTyping(el) {
    return !!el && !!el.closest?.(
        'input, textarea, select, [contenteditable="true"], [role="slider"], [role="textbox"], ' +
        '[role="combobox"], [role="listbox"], [role="menu"]'
    );
}


/* ---------- animation helpers ---------- */

function animate(el, keyframes, options) {
    if (!el || reduced() || typeof el.animate !== "function") return null;

    try {
        return el.animate(keyframes, { easing: EASE, ...options });
    } catch {
        return null;
    }
}

const frame = (x, o) => ({ transform: `translate3d(${x}px,0,0)`, opacity: o });

/* A small nudge: "there is nothing further this way". */
function nudge(panel, dir) {
    animate(
        panel,
        [
            { transform: "translate3d(0,0,0)" },
            { transform: `translate3d(${-dir * 12}px,0,0)` },
            { transform: "translate3d(0,0,0)" }
        ],
        { duration: 260 }
    );
}

/* ---------- keyboard ---------- */

function onKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isTyping(event.target) || isTyping(document.activeElement)) return;
    if (modalOpen()) return;

    /* A focused strip or table that scrolls sideways keeps its arrows. */
    const t = event.target;
    if (t instanceof Element && t !== document.body && scrollsSideways(t)) return;

    const ctx = getContext(currentPage());
    if (!ctx) return;

    const dir = event.key === "ArrowRight" ? 1 : -1;
    const target = ctx.tabs[ctx.idx + dir];

    if (!target) {
        nudge(ctx.panel, dir);
        return;
    }

    event.preventDefault();
    target.click();
}

let installed = false;

export function initTabSwipe() {
    if (installed) return;
    installed = true;

    document.addEventListener("keydown", onKeyDown);

}
