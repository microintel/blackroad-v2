import { Sidebar } from "../components/layout/sidebar.js";
import { Topbar } from "../components/layout/topbar.js";
import { getRoute, initRouter, hardNavigate, replaceRoute } from "./router.js";
import { renderView } from "./views.js";
import { navigate } from "./router.js";
import { getSession, currentUser, logout } from "../services/auth.js";
import { AuthScreen } from "../features/auth/auth-screen.js";
import { BottomNav, setupDrawer } from "../components/layout/mobile-nav.js";
import { initPreferences, toggleTheme, getTheme } from "../services/preferences.js";
import { themeToggleContent } from "../components/layout/topbar.js";

initPreferences();

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

async function renderApp() {
    const root = document.querySelector("#app");

    if (!root) {
        console.error(
            "BlackRoad: #app element not found."
        );

        return;
    }

    let route = getRoute();

    if (!(await passesGate(route))) route = getRoute();

    root.innerHTML = "";

    if (route.module === "login" || route.module === "register") {
        root.appendChild(AuthScreen(route.module));
        return;
    }

    // Main application shell
    const shell = document.createElement("div");

    shell.className = "br-app-shell";

    // Sidebar
    const sidebar = Sidebar();

    // Main area
    const main = document.createElement("main");

    main.className = "br-main";

    // Top navigation
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

    // Light / Dark toggle. The topbar is rebuilt on every render, so this
    // listener lives and dies with its button (no duplicates across routes).
    topbar
        .querySelector('[data-action="toggle-theme"]')
        ?.addEventListener("click", () => toggleTheme());

    // Logout
    topbar
        .querySelector('[data-action="logout"]')
        ?.addEventListener("click", async () => {
            await logout();
            hardNavigate("/login");
        });

    // Page content container
    const content = document.createElement("div");

    content.className = "br-content";

    try {
        // Views can now return either:
        // 1. HTML string
        // 2. DOM element
        // 3. Promise resolving to either
        const view = await renderView(route);

        if (typeof view === "string") {
            content.innerHTML = view;
        } else if (view instanceof Node) {
            content.appendChild(view);
        } else {
            console.error(
                "BlackRoad: Invalid view returned for route:",
                route
            );

            content.innerHTML = `
                <section class="br-page">
                    <div class="br-card">
                        <h2>Unable to load page</h2>
                        <p class="br-muted">
                            The page returned an invalid view.
                        </p>
                    </div>
                </section>
            `;
        }
    } catch (error) {
        console.error(
            "BlackRoad: Error rendering route:",
            error
        );

        content.innerHTML = `
            <section class="br-page">
                <div class="br-card">
                    <h2>Something went wrong</h2>

                    <p class="br-muted">
                        This page could not be loaded.
                    </p>
                </div>
            </section>
        `;
    }

    // Build application
    main.appendChild(topbar);
    main.appendChild(content);

    const backdrop = document.createElement("div");
    backdrop.className = "br-drawer-backdrop";

    shell.appendChild(sidebar);
    shell.appendChild(backdrop);
    shell.appendChild(main);
    shell.appendChild(BottomNav(route));

    setupDrawer(shell, sidebar, backdrop, topbar.querySelector(".br-mobile-menu"));

    root.appendChild(shell);
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