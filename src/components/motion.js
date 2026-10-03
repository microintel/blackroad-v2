/* =========================================================
   MOTION
   Page, section and tab transitions. Presentation only: no
   feature code depends on anything in here, and every function
   is safe to skip (reduced motion, old browsers).

   - pageLeave / pageEnter : fade out the old page, stagger the
     new one in when you move between sections.
   - initTabs              : sliding indicator under tabs and a
     direction-aware slide for the panel that opens.

   Only opacity and transform are animated (compositor only),
   through the Web Animations API, so nothing is left behind in
   the DOM when an animation ends.
   ========================================================= */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedQuery =
    typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

const reduced = () => !!(reducedQuery && reducedQuery.matches);

function play(el, keyframes, options) {
    if (!el || reduced() || typeof el.animate !== "function") return null;

    try {
        return el.animate(keyframes, {
            easing: EASE,
            fill: "backwards",
            ...options
        });
    } catch {
        return null;
    }
}

const isShown = (el) => !el.hidden && el.getClientRects().length > 0;


/* =========================================================
   PAGE TRANSITIONS
========================================================= */

let leaving = null;

/* Fade the current page out. Returns { done, cancel }. The page stays
   invisible until pageEnter() / cancel() so there is no flash between
   the old page leaving and the new one arriving. */
export function pageLeave(content) {
    if (leaving && leaving.content === content) return leaving;

    const anim = content.firstElementChild
        ? play(
              content,
              [
                  { opacity: 1, transform: "none" },
                  { opacity: 0, transform: "translateY(-6px)" }
              ],
              { duration: 120, easing: "ease-in", fill: "forwards" }
          )
        : null;

    const handle = {
        content,
        done: anim ? anim.finished.catch(() => {}) : Promise.resolve(),
        cancel() {
            if (anim) anim.cancel();
            if (leaving === handle) leaving = null;
        }
    };

    leaving = anim ? handle : null;

    return handle;
}

export function cancelLeave() {
    if (leaving) leaving.cancel();
}

/* Elements that get the staggered entrance: the page's own blocks, and
   for tabbed pages the blocks inside the visible tab panel. */
function staggerTargets(page) {
    const out = [];

    for (const el of page.children) {
        if (!isShown(el)) continue;

        if (el.matches("[data-income-view-container], [data-stocks-view], .inc-view")) {
            for (const inner of el.children) {
                if (isShown(inner)) out.push(inner);
            }
        } else {
            out.push(el);
        }
    }

    return out.slice(0, 8);
}

/* Soft entrance for a freshly rendered page. Pages that already animate
   themselves (dashboard, mutual fund) only get the quick fade. */
export function pageEnter(content) {
    cancelLeave();

    const page = content.firstElementChild;

    if (!page || reduced()) return;

    const ownMotion = page.matches(".br-dash, .br-stepup");
    const targets = ownMotion ? [] : staggerTargets(page);

    if (targets.length < 2) {
        play(
            content,
            [
                { opacity: 0, transform: "translateY(10px)" },
                { opacity: 1, transform: "none" }
            ],
            { duration: 300 }
        );
        return;
    }

    play(content, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });

    targets.forEach((el, i) => {
        play(
            el,
            [
                { opacity: 0, transform: "translateY(14px)" },
                { opacity: 1, transform: "none" }
            ],
            { duration: 360, delay: i * 40 }
        );
    });
}


/* =========================================================
   TABS
   Every tab group in the app uses .br-income-tabs. Groups that
   switch a panel (Income, Stocks, Mutual Fund, Lending, Financial
   Intelligence) get a sliding indicator, and the panel that opens
   slides in from the side the new tab is on.
========================================================= */

const TAB_ATTRS = [
    "data-income-tab",
    "data-stocks-tab",
    "data-su-tab",
    "data-ll-tab",
    "data-calc-tab",
    "data-fi-tab"
];

const PANEL_FOR = [
    ["incomeTab", (page, v) => page.querySelector(`[data-income-view-container="${v}"]`)],
    ["stocksTab", (page, v) => page.querySelector(`[data-stocks-view="${v}"]`)],
    ["fiTab", (page, v) => page.querySelector(`[data-fi-group="${v}"]`)],
    ["llTab", (page) => page.querySelector("[data-ll-content]")],
    ["calcTab", (page) => page.querySelector("[data-calc-content]")]
    /* Mutual Fund (data-su-tab) animates its own content. */
];

const SHIFT = 10;   /* px: stays inside the page padding, so no sideways scroll */

function panelOf(button) {
    const page = button.closest(".br-page") || document;

    for (const [key, find] of PANEL_FOR) {
        const value = button.dataset[key];
        if (value !== undefined) return find(page, value);
    }

    return null;
}

function slidePanel(panel, dir) {
    if (!panel || !isShown(panel)) return;

    play(
        panel,
        [
            { opacity: 0, transform: `translateX(${dir * SHIFT}px)` },
            { opacity: 1, transform: "none" }
        ],
        { duration: 280 }
    );
}

function placeInk(group, ink) {
    const button = group.querySelector(".br-income-tab.active");

    if (!button || !button.offsetWidth) {
        group.removeAttribute("data-ink-ready");
        return;
    }

    let x = button.offsetLeft;
    let y = button.offsetTop;
    let w = button.offsetWidth;
    let h = button.offsetHeight;

    if (group.dataset.ink === "line") {
        /* The line sits exactly where the tab's own bottom border is. */
        const border = parseFloat(getComputedStyle(button).borderBottomWidth) || 2;
        y += h - border;
        h = border;
    }

    ink.style.width = w + "px";
    ink.style.height = h + "px";
    ink.style.transform = `translate(${x}px, ${y}px)`;

    if (!group.hasAttribute("data-ink-ready")) {
        group.setAttribute("data-ink-ready", "");

        /* Turn the slide on one frame later, so the first placement
           is not animated from the corner. */
        requestAnimationFrame(() =>
            requestAnimationFrame(() => group.setAttribute("data-ink-animate", ""))
        );
    }
}

function setupGroup(group) {
    if (group._brInk) return;

    const managed = TAB_ATTRS.some((attr) => group.querySelector(`[${attr}]`));
    if (!managed) return;

    const ink = document.createElement("span");
    ink.className = "br-tab-ink";
    ink.setAttribute("aria-hidden", "true");

    group._brInk = ink;
    group.classList.add("br-tabs-ink-on");
    group.appendChild(ink);

    /* Underlined tabs (a bottom border) get a line; filled tabs a block. */
    group.dataset.ink =
        parseFloat(getComputedStyle(group).borderBottomWidth) > 0 ? "line" : "block";

    const tabs = () => [...group.querySelectorAll(".br-income-tab")];

    let current = group.querySelector(".br-income-tab.active");

    const sync = () => placeInk(group, ink);

    sync();

    /* Re-place the indicator when tabs change size (counts load, fonts,
       window resize, theme). */
    if (typeof ResizeObserver === "function") {
        const ro = new ResizeObserver(sync);
        ro.observe(group);
        tabs().forEach((tab) => ro.observe(tab));
    }

    /* A tab became active (click, keyboard, or code such as "jump to"). */
    new MutationObserver(() => {
        const next = group.querySelector(".br-income-tab.active");

        if (!next || next === current) return;

        const list = tabs();
        const dir = list.indexOf(next) >= list.indexOf(current) ? 1 : -1;

        current = next;

        sync();
        slidePanel(panelOf(next), dir);

        /* Keep the new tab centred in a scrolling tab strip (narrow
           screens). Scrolls the strip only, never the page. */
        if (group.scrollWidth > group.clientWidth + 1) {
            group.scrollTo({
                left: next.offsetLeft - (group.clientWidth - next.offsetWidth) / 2,
                behavior: reduced() ? "auto" : "smooth"
            });
        }
    }).observe(group, { attributes: true, attributeFilter: ["class"], subtree: true });
}

/* Call after a page is on screen. Safe to call repeatedly. */
export function initTabs(root = document) {
    root.querySelectorAll(".br-income-tabs").forEach(setupGroup);
}
