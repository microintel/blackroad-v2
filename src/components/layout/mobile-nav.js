import { navigate } from "../../app/router.js";

/* Mobile navigation: slide-in drawer + bottom tab bar.
   The desktop sidebar is reused as the drawer (CSS decides which). */

const TABS = [
    { label: "Home", path: "/dashboard", icon: "⌂" },
    { label: "Income", path: "/income", icon: "₹" },
    { label: "Stocks", path: "/stocks", icon: "↗" },
    { label: "Lending", path: "/lending", icon: "⇄" }
];

export function BottomNav(route) {
    const nav = document.createElement("nav");
    nav.className = "br-bottom-nav";
    nav.setAttribute("aria-label", "Quick navigation");

    const here = window.location.pathname === "/" ? "/dashboard" : window.location.pathname;

    nav.innerHTML =
        TABS.map((t) => `
            <a href="${t.path}" class="br-bottom-item${here === t.path ? " is-active" : ""}" data-path="${t.path}">
                <span class="br-bottom-icon">${t.icon}</span>
                <span class="br-bottom-label">${t.label}</span>
            </a>`).join("") +
        `<button type="button" class="br-bottom-item" data-more>
            <span class="br-bottom-icon">☰</span>
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

export function setupDrawer(shell, sidebar, backdrop, menuButton) {
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

    // Never leave the page scroll-locked after a re-render.
    document.body.classList.remove("br-no-scroll");
}
