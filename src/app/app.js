import { Sidebar } from "../components/layout/sidebar.js";
import { Topbar } from "../components/layout/topbar.js";
import { confirmLogout } from "../components/confirm-dialog.js";
import { getRoute, routeFor, initRouter, hardNavigate, replaceRoute, currentPath } from "./router.js";
import { renderView, prefetchView, warmViews } from "./views.js";
import { pageLeave, pageEnter, initTabs } from "../components/motion.js";
import { navigate } from "./router.js";
import { getSession, currentUser, logout, isGuestSync } from "../services/auth.js";
import { seedGuestData } from "../services/guest-seed.js";
import { AuthScreen } from "../features/auth/auth-screen.js";
import { BottomNav, setupDrawer } from "../components/layout/mobile-nav.js";
import { initPreferences, toggleTheme, getTheme } from "../services/preferences.js";
import { themeToggleContent, currencyToggleContent } from "../components/layout/topbar.js";
import { initCurrency, toggleCurrency, getCurrency } from "../services/currency.js";
import { startCurrencyTransition, endCurrencyTransition } from "../components/currency-transition.js";
import { initChartTooltips } from "../components/chart-tooltip.js";
import { pageSkeleton, skeletonVariantFor } from "../components/skeleton.js";
import { initUX } from "./ux.js";

initPreferences();
initChartTooltips();

// Keep the header toggle's icon and label in step with the theme, whether it
// changed from the toggle itself or from the system setting. Registered once.
window.addEventListener("br:theme-change", (event) => {
    const ui = themeToggleContent(event.detail?.theme || getTheme());
    document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
        button.innerHTML = ui.icon;
        button.setAttribute("aria-label", ui.label);
        button.setAttribute("title", ui.label);
    });
});

// Currency (INR / USD) display switch. The rate is fetched at most once a
// day (see services/currency.js). On a change, the header button is updated
// and the current page is drawn again so every amount uses the new currency.
initCurrency();

window.addEventListener("br:currency-change", (event) => {
    const ui = currencyToggleContent(event.detail?.currency || getCurrency());
    document.querySelectorAll('[data-action="toggle-currency"]').forEach((button) => {
        button.innerHTML = ui.icon;
        button.setAttribute("aria-label", ui.label);
        button.setAttribute("title", ui.label);
        button.classList.remove("is-busy", "is-error");
    });

    if (document.querySelector("#app > .br-app-shell")) {
        renderApp()
            .catch((error) => console.error("BlackRoad: Route rendering error:", error))
            .finally(() => endCurrencyTransition());
    } else {
        endCurrencyTransition();
    }
});

window.addEventListener("br:currency-error", () => {
    endCurrencyTransition(true);
    document.querySelectorAll('[data-action="toggle-currency"]').forEach((button) => {
        button.classList.remove("is-busy");
        button.classList.add("is-error");
        button.setAttribute("title", "USD rate unavailable right now. Showing rupees.");
        setTimeout(() => button.classList.remove("is-error"), 2500);
    });
});

/* Sign-in gate. Returns true when the requested page may render. */
async function passesGate(route) {
    const isAuthRoute = route.module === "login" || route.module === "register";

    let session = await getSession();

    // A session whose account record is gone is treated as signed out.
    if (session && !session.guest && !(await currentUser())) {
        await logout();
        session = null;
    }

    if (!session && !isAuthRoute) {
        replaceRoute("/login");
        return false;
    }
    if (session && isAuthRoute) {
        replaceRoute("/dashboard");
        return false;
    }
    return true;
}

function htmlToElement(html) {
    const template = document.createElement("template");

    template.innerHTML = html.trim();

    return template.content.firstElementChild;
}

/* Latest render wins: a slow page that finishes after the user has already
   moved on must not overwrite the newer page. */
let renderId = 0;

const here = () => (currentPath() === "/" ? "/dashboard" : currentPath());

/* Keep the existing shell (sidebar, header, nav) between pages and only
   update what differs. Rebuilding it on every click was the main cause of
   flicker and lag when moving around the app. */
function updateShell(shell, route) {
    const path = here();

    const title = shell.querySelector(".br-page-title");
    if (title) title.textContent = route.title;

    shell.querySelectorAll(".br-nav-item").forEach((link) => {
        const on = link.getAttribute("href") === "#" + path;
        link.classList.toggle("is-active", on);
        if (on) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });

    shell.querySelectorAll(".br-bottom-item[data-path]").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.path === path);
    });
}

function buildShell(route) {
    const shell = document.createElement("div");

    shell.className = "br-app-shell";

    const sidebar = Sidebar();

    const main = document.createElement("main");

    main.className = "br-main";

    const topbar = htmlToElement(
        Topbar(route.title)
    );

    // Topbar shortcuts: Notifications and Account buttons
    topbar
        .querySelector('[aria-label="Notifications"]')
        ?.addEventListener("click", () => navigate("/notifications"));

    topbar
        .querySelector(".br-account-button")
        ?.addEventListener("click", () => navigate("/account"));

    // Light / Dark toggle. The shell now lives across pages, so this is
    // attached once, to the button that stays.
    topbar
        .querySelector('[data-action="toggle-theme"]')
        ?.addEventListener("click", (event) => {
            const r = event.currentTarget.getBoundingClientRect();
            toggleTheme({
                el: event.currentTarget,
                x: r.left + r.width / 2,
                y: r.top + r.height / 2
            });
        });

    // INR / USD display toggle
    topbar
        .querySelector('[data-action="toggle-currency"]')
        ?.addEventListener("click", (event) => {
            event.currentTarget.classList.add("is-busy");
            startCurrencyTransition(getCurrency() === "USD" ? "INR" : "USD");
            toggleCurrency();
        });

    // Logout
    topbar
        .querySelector('[data-action="logout"]')
        ?.addEventListener("click", async () => {
            if (await confirmLogout()) hardNavigate("/login");
        });

    const content = document.createElement("div");

    content.className = "br-content";

    main.appendChild(topbar);
    main.appendChild(content);

    const footer = document.createElement("footer");
    footer.className = "br-footer";
    footer.innerHTML = 'Developed by <strong>Microintel</strong>';
    main.appendChild(footer);

    const backdrop = document.createElement("div");
    backdrop.className = "br-drawer-backdrop";

    shell.appendChild(sidebar);
    shell.appendChild(backdrop);
    shell.appendChild(main);
    shell.appendChild(BottomNav(route));

    setupDrawer(shell, sidebar, backdrop, topbar.querySelector(".br-mobile-menu"));

    return { shell, content };
}

const errorCard = (title, text) => `
    <section class="br-page">
        <div class="br-card">
            <h2>${title}</h2>
            <p class="br-muted">${text}</p>
        </div>
    </section>
`;

async function renderApp() {
    const root = document.querySelector("#app");

    if (!root) {
        console.error(
            "BlackRoad: #app element not found."
        );

        return;
    }

    const myId = ++renderId;

    let route = getRoute();

    if (!(await passesGate(route))) route = getRoute();

    if (myId !== renderId) return;

    // Guests are read-only: load the demo data from /sample.json before any page reads it.
    if (isGuestSync() && route.module !== "login" && route.module !== "register") {
        await seedGuestData();

        if (myId !== renderId) return;
    }

    if (route.module === "login" || route.module === "register") {
        root.innerHTML = "";
        root.appendChild(AuthScreen(route.module));
        return;
    }

    // Main application shell: reuse it when it is already on screen.
    let shell = root.querySelector(":scope > .br-app-shell");
    let content;
    let leave = null;

    if (shell) {
        updateShell(shell, route);
        content = shell.querySelector(".br-content");

        // The old page fades out while the new one is already loading.
        leave = pageLeave(content);
    } else {
        root.innerHTML = "";
        ({ shell, content } = buildShell(route));
        root.appendChild(shell);
    }

    // Start loading the page now; this runs alongside the fade-out above.
    let ready = false;
    const loading = loadView(route);
    loading.then(() => { ready = true; });

    if (leave) {
        await leave.done;

        if (myId !== renderId) return;
    }

    // Still loading once the old page is gone: show the skeleton frame.
    if (!leave || !ready) {
        window.scrollTo(0, 0);
        content.replaceChildren(pageSkeleton(skeletonVariantFor(route.module)));

        if (leave) leave.cancel();
    }

    const { html, node } = await loading;

    if (myId !== renderId) return;

    window.scrollTo(0, 0);

    if (node) content.replaceChildren(node);
    else content.innerHTML = html;

    // Soft entrance for the new page, then the sliding tab indicators.
    pageEnter(content);
    initTabs(content);

    // Once the first page is up, load the other pages' code in the background.
    if (!warmed) {
        warmed = true;
        warmViews();
    }
}

let warmed = false;

/* Load a page's view. Resolves to { html } or { node }, never rejects. */
async function loadView(route) {
    try {
        // Views can return either:
        // 1. HTML string
        // 2. DOM element
        // 3. Promise resolving to either
        const view = await renderView(route);

        if (typeof view === "string") return { html: view, node: null };

        if (view instanceof Node) return { html: null, node: view };

        console.error(
            "BlackRoad: Invalid view returned for route:",
            route
        );

        return {
            html: errorCard("Unable to load page", "The page returned an invalid view."),
            node: null
        };
    } catch (error) {
        console.error(
            "BlackRoad: Error rendering route:",
            error
        );

        return {
            html: errorCard("Something went wrong", "This page could not be loaded."),
            node: null
        };
    }
}

/* Start loading a section's code as soon as the pointer or a finger is on
   its link, so the click itself has nothing left to wait for. */
function watchNavIntent() {
    const warm = (event) => {
        const link = event.target.closest?.(".br-nav-item[href^='#/'], .br-bottom-item[data-path]");

        if (!link) return;

        const path = link.dataset.path || link.getAttribute("href").slice(1);

        prefetchView(routeFor(path)?.module);
    };

    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("touchstart", warm, { passive: true });
}

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        watchNavIntent();
        initUX();

        // Initial page
        await renderApp();

        // Handle sidebar navigation,
        // browser back and browser forward.
        initRouter(() => {
            renderApp().catch((error) => {
                console.error(
                    "BlackRoad: Route rendering error:",
                    error
                );
            });
        });
    }
);