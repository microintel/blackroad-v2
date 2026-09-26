import { Sidebar } from "../components/layout/sidebar.js";
import { Topbar } from "../components/layout/topbar.js";
import { getRoute, initRouter } from "./router.js";
import { renderView } from "./views.js";

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

    const route = getRoute();

    root.innerHTML = "";

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

    shell.appendChild(sidebar);
    shell.appendChild(main);

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