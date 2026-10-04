/* UX helpers: purely presentational. Nothing here reads or writes app data
   (the only storage is the open/closed state of sidebar groups). */
const KEY = "br-ux-nav-collapsed";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };

function enhanceNav() {
    const state = load();
    document.querySelectorAll(".br-nav-section:not([data-ux])").forEach((sec) => {
        sec.dataset.ux = "1";
        const title = sec.querySelector(".br-nav-section-title");
        if (!title) return;
        const name = title.textContent.trim();
        const hasActive = !!sec.querySelector(".br-nav-item.is-active, .br-nav-item.active, .br-nav-item[aria-current='page']");
        /* Tools starts folded to cut clutter; the current page's group is always open. */
        const folded = name in state ? state[name] : name === "Tools";
        if (folded && !hasActive) sec.classList.add("is-collapsed");
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        const toggle = () => {
            const c = sec.classList.toggle("is-collapsed");
            const s = load(); s[name] = c; save(s);
        };
        title.addEventListener("click", toggle);
        title.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
    });
}

function enhanceTabs() {
    document.querySelectorAll(".br-income-tab.is-active, .br-income-tab.active").forEach((t) => {
        const box = t.parentElement;
        if (box && box.scrollWidth > box.clientWidth) {
            box.scrollTo({ left: t.offsetLeft - box.clientWidth / 2 + t.clientWidth / 2, behavior: "smooth" });
        }
    });
}

export function initUX() {
    const top = document.createElement("button");
    top.type = "button";
    top.className = "br-ux-top";
    top.setAttribute("aria-label", "Back to top");
    top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
    top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(top);

    let tick = false;
    window.addEventListener("scroll", () => {
        if (tick) return;
        tick = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            top.classList.toggle("is-visible", y > 600);
            document.querySelector(".br-header")?.classList.toggle("is-scrolled", y > 4);
            tick = false;
        });
    }, { passive: true });

    /* The shell and pages are re-rendered on navigation, so re-apply. */
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; enhanceNav(); enhanceTabs(); });
    }).observe(document.getElementById("app"), { childList: true, subtree: true });
    enhanceNav();
}
