import { Sidebar } from "../components/layout/sidebar.js";
import { Topbar } from "../components/layout/topbar.js";
import { confirmLogout } from "../components/confirm-dialog.js";
import { getRoute, initRouter, hardNavigate, replaceRoute, currentPath } from "./router.js";
import { renderView } from "./views.js";
import { navigate } from "./router.js";
import { getSession, currentUser, logout } from "../services/auth.js";
import { AuthScreen } from "../features/auth/auth-screen.js";
import { BottomNav, setupDrawer } from "../components/layout/mobile-nav.js";
import { initPreferences, toggleTheme, getTheme } from "../services/preferences.js";
import { themeToggleContent } from "../components/layout/topbar.js";
import { initChartTooltips } from "../components/chart-tooltip.js";
import { pageSkeleton, skeletonVariantFor } from "../components/skeleton.js";

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
            toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
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

    if (route.module === "login" || route.module === "register") {
        root.innerHTML = "";
        root.appendChild(AuthScreen(route.module));
        return;
    }

    // Main application shell: reuse it when it is already on screen.
    let shell = root.querySelector(":scope > .br-app-shell");
    let content;

    if (shell) {
        updateShell(shell, route);
        content = shell.querySelector(".br-content");
        window.scrollTo(0, 0);
    } else {
        root.innerHTML = "";
        ({ shell, content } = buildShell(route));
        root.appendChild(shell);
    }

    // Show the page frame straight away; the skeleton fills it while data loads.
    content.classList.remove("br-view-in");
    content.replaceChildren(pageSkeleton(skeletonVariantFor(route.module)));

    let html = null;
    let node = null;

    try {
        // Views can return either:
        // 1. HTML string
        // 2. DOM element
        // 3. Promise resolving to either
        const view = await renderView(route);

        if (typeof view === "string") {
            html = view;
        } else if (view instanceof Node) {
            node = view;
        } else {
            console.error(
                "BlackRoad: Invalid view returned for route:",
                route
            );

            html = errorCard("Unable to load page", "The page returned an invalid view.");
        }
    } catch (error) {
        console.error(
            "BlackRoad: Error rendering route:",
            error
        );

        html = errorCard("Something went wrong", "This page could not be loaded.");
    }

    if (myId !== renderId) return;

    if (node) content.replaceChildren(node);
    else content.innerHTML = html;

    // Fade the real page in once.
    void content.offsetWidth;
    content.classList.add("br-view-in");
}

document.addEventListener(
    "DOMContentLoaded",
    async () => {
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