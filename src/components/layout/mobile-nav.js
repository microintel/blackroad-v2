import { navigate, currentPath, hrefFor } from "../../app/router.js";
import { icon } from "../icons.js";

/* Mobile navigation: slide-in drawer + bottom tab bar.
   The desktop sidebar is reused as the drawer (CSS decides which). */

const TABS = [
    { label: "Home", path: "/dashboard", icon: "layout-dashboard" },
    { label: "Income", path: "/income", icon: "wallet" },
    { label: "Stocks", path: "/stocks", icon: "chart-candlestick" },
    { label: "Lending", path: "/lending", icon: "arrow-left-right" }
];

export function BottomNav(route) {
    const nav = document.createElement("nav");
    nav.className = "br-bottom-nav";
    nav.setAttribute("aria-label", "Quick navigation");

    const here = currentPath() === "/" ? "/dashboard" : currentPath();

    nav.innerHTML =
        TABS.map((t) => `
            <a href="${hrefFor(t.path)}" class="br-bottom-item${here === t.path ? " is-active" : ""}" data-path="${t.path}">
                <span class="br-bottom-icon">${icon(t.icon, { size: 22 })}</span>
                <span class="br-bottom-label">${t.label}</span>
            </a>`).join("") +
        `<button type="button" class="br-bottom-item" data-more>
            <span class="br-bottom-icon">${icon("menu", { size: 22 })}</span>
            <span class="br-bottom-label">More</span>
        </button>`;

    nav.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-path]");
        if (!a) return;
        e.preventDefault();
        navigate(a.dataset.path);
    });

    return nav;
}

/* Listeners that outlive a render are removed on the next one. */
let teardownDrawer = null;

export function setupDrawer(shell, sidebar, backdrop, menuButton) {
    if (teardownDrawer) teardownDrawer();

    const open = () => {
        sidebar.classList.add("is-open");
        backdrop.classList.add("is-open");
        document.body.classList.add("br-no-scroll");
    };
    const close = () => {
        sidebar.classList.remove("is-open");
        backdrop.classList.remove("is-open");
        document.body.classList.remove("br-no-scroll");
    };

    menuButton?.addEventListener("click", open);
    shell.querySelector("[data-more]")?.addEventListener("click", open);
    backdrop.addEventListener("click", close);

    // Tapping any sidebar link closes the drawer (page then re-renders).
    sidebar.addEventListener("click", (e) => {
        if (e.target.closest("a")) close();
    });

    // Escape closes it.
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);

    // Resizing (or rotating) up to the desktop layout while the drawer is
    // open must release the page scroll lock and reset the drawer.
    const desktop = window.matchMedia("(min-width: 769px)");
    const onBreakpoint = () => { if (desktop.matches) close(); };
    if (desktop.addEventListener) desktop.addEventListener("change", onBreakpoint);
    else if (desktop.addListener) desktop.addListener(onBreakpoint);

    teardownDrawer = () => {
        document.removeEventListener("keydown", onKey);
        if (desktop.removeEventListener) desktop.removeEventListener("change", onBreakpoint);
        else if (desktop.removeListener) desktop.removeListener(onBreakpoint);
        teardownDrawer = null;
    };

    // Never leave the page scroll-locked after a re-render.
    document.body.classList.remove("br-no-scroll");
}
