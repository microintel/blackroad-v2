import { icon } from "../icons.js";
import { getTheme } from "../../services/preferences.js";
import { getCurrency } from "../../services/currency.js";

/* The button shows the theme you would switch TO: a sun while the
   app is dark, a moon while it is light. app.js wires the click. */
export function themeToggleContent(theme) {
    const toLight = theme === "dark";
    return {
        icon: icon(toLight ? "sun" : "moon", { size: 20 }),
        label: toLight ? "Switch to light mode" : "Switch to dark mode"
    };
}

/* The button shows the currency you would switch TO, as an icon: a dollar
   sign while amounts are in rupees, a rupee sign while they are in dollars. */
export function currencyToggleContent(currency) {
    const toRupee = currency === "USD";
    return {
        icon: icon(toRupee ? "indian-rupee" : "dollar-sign", { size: 20 }),
        label: toRupee ? "Showing US dollars. Switch to rupees" : "Showing rupees. Switch to US dollars"
    };
}

export function Topbar(title) {

    const themeUi = themeToggleContent(getTheme());
    const curUi = currencyToggleContent(getCurrency());

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

                <nav class="br-header-links" aria-label="Site">
                    <a href="./home.html">${icon("house", { size: 18 })}<span>Home</span></a>
                    <a href="./download.html">${icon("download", { size: 18 })}<span>Download BlackRoad</span></a>
                </nav>


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
                    class="br-icon-button br-currency-toggle"
                    type="button"
                    data-action="toggle-currency"
                    aria-label="${curUi.label}"
                    title="${curUi.label}"
                >
                    ${curUi.icon}
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
