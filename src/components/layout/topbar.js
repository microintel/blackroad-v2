import { icon } from "../icons.js";
import { getTheme } from "../../services/preferences.js";

/* The button shows the theme you would switch TO: a sun while the
   app is dark, a moon while it is light. app.js wires the click. */
export function themeToggleContent(theme) {
    const toLight = theme === "dark";
    return {
        icon: icon(toLight ? "sun" : "moon", { size: 20 }),
        label: toLight ? "Switch to light mode" : "Switch to dark mode"
    };
}

export function Topbar(title) {

    const themeUi = themeToggleContent(getTheme());

    return `

        <header class="br-header">

            <div class="br-header-left">

                <button
                    class="br-mobile-menu"
                    type="button"
                    aria-label="Open navigation"
                >
                    ${icon("menu", { size: 20 })}
                </button>


                <div>

                    <h1 class="br-page-title">
                        ${title}
                    </h1>

                </div>

            </div>


            <div class="br-header-actions">

                <button
                    class="br-icon-button"
                    type="button"
                    data-action="toggle-theme"
                    aria-label="${themeUi.label}"
                    title="${themeUi.label}"
                >
                    ${themeUi.icon}
                </button>


                <button
                    class="br-icon-button"
                    type="button"
                    aria-label="Notifications"
                    title="Notifications"
                >
                    ${icon("bell", { size: 20 })}
                </button>


                <button
                    class="br-account-button"
                    type="button"
                >
                    ${icon("user-round", { size: 16 })}
                    Account
                </button>


                <button
                    class="br-icon-button"
                    type="button"
                    data-action="logout"
                    aria-label="Log out"
                    title="Log out"
                >
                    ${icon("log-out", { size: 20 })}
                </button>

            </div>

        </header>

    `;
}
