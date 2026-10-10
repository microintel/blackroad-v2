import { RoverHeader } from "../components/layout/rover-header.js";
import { RoverView } from "../features/rover/rover-view.js";
import { getSession, currentUser, logout } from "../services/auth.js";
import { seedGuestData } from "../services/guest-seed.js";
import { initPreferences, toggleTheme, getTheme } from "../services/preferences.js";
import { initCurrency, toggleCurrency, getCurrency } from "../services/currency.js";
import { themeToggleContent, currencyToggleContent } from "../components/layout/topbar.js";

/*
 * Entry point of rover.html (the counterpart of app.js for the Rover page).
 * Same preferences, sign-in and data as BlackRoad, but none of its screens.
 */

const base = new URL("../../", import.meta.url);
const hrefFor = (path) => new URL("index.html", base).href + "#" + path;

initPreferences();

/* Keep the header toggles' icons in step with the theme / currency. */
window.addEventListener("br:theme-change", (event) => {
    const ui = themeToggleContent(event.detail?.theme || getTheme());
    document.querySelectorAll('[data-action="toggle-theme"]').forEach((b) => {
        b.innerHTML = ui.icon;
        b.setAttribute("aria-label", ui.label);
        b.setAttribute("title", ui.label);
    });
});

window.addEventListener("br:currency-change", (event) => {
    const ui = currencyToggleContent(event.detail?.currency || getCurrency());
    document.querySelectorAll('[data-action="toggle-currency"]').forEach((b) => {
        b.innerHTML = ui.icon;
        b.setAttribute("aria-label", ui.label);
        b.setAttribute("title", ui.label);
        b.classList.remove("is-busy", "is-error");
    });
});

window.addEventListener("br:currency-error", () => {
    document.querySelectorAll('[data-action="toggle-currency"]').forEach((b) => b.classList.remove("is-busy"));
});

/*
 * Keep the page exactly as tall as what is visible. On phones the on-screen
 * keyboard shrinks the visible area; sizing the page to it (and pinning it)
 * stops the page from scrolling or shifting while you type.
 */
function pinToViewport() {
    const vv = window.visualViewport;
    const root = document.documentElement.style;

    const update = () => {
        root.setProperty("--rv-h", (vv ? vv.height : window.innerHeight) + "px");
        root.setProperty("--rv-top", (vv ? vv.offsetTop : 0) + "px");
        if (window.scrollY) window.scrollTo(0, 0);
    };

    update();
    if (vv) {
        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
}

async function start() {
    const root = document.getElementById("app");

    // Not signed in -> BlackRoad sign-in page.
    let session = await getSession();

    if (session && !session.guest && !(await currentUser())) {
        await logout();
        session = null;
    }

    if (!session) {
        window.location.replace(hrefFor("/login"));
        return;
    }

    // Guests see demo data: load it, exactly as the app does.
    if (session.guest) await seedGuestData();

    initCurrency();

    const shell = document.createElement("div");
    shell.className = "rv-shell";

    const header = RoverHeader({ backHref: hrefFor("/dashboard") });
    const view = RoverView({ hrefFor });

    header.querySelector('[data-action="toggle-theme"]').addEventListener("click", (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggleTheme({ el: e.currentTarget, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });

    header.querySelector('[data-action="toggle-currency"]').addEventListener("click", (e) => {
        e.currentTarget.classList.add("is-busy");
        toggleCurrency();
    });

    header.querySelector('[data-action="new-chat"]').addEventListener("click", view.newChat);

    pinToViewport();

    shell.append(header, view.el);
    root.replaceChildren(shell);
}

start().catch((error) => {
    console.error("Rover:", error);
    document.getElementById("app").textContent = "Rover could not start. Please reload the page.";
});
