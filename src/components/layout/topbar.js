import { icon, roverMark } from "../icons.js";
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
                    <a href="./home.html" aria-label="Home" title="Home">${icon("house", { size: 20 })}<span class="br-header-link-text">Home</span></a>
                    <a href="./download.html" aria-label="Download BlackRoad" title="Download BlackRoad">${icon("download", { size: 20 })}<span class="br-header-link-text">Download BlackRoad</span></a>
                </nav>


                <a
                    class="br-rover-top"
                    href="./rover.html"
                    target="_blank"
                    rel="noopener"
                    aria-label="Open Rover"
                    title="Open Rover"
                >
                    ${roverMark(22)}<span>Rover</span>
                </a>


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


                <div class="br-account-menu">
                    <button
                        class="br-account-button"
                        type="button"
                        data-account-menu-btn
                        aria-haspopup="menu"
                        aria-expanded="false"
                        aria-label="Account menu"
                        title="Settings"
                    >
                        <span class="br-account-avatar" data-account-avatar>${icon("user-round", { size: 18 })}</span>
                    </button>

                    <div class="br-account-pop" role="menu" hidden>
                        <div class="br-account-pop-head">
                            <span class="br-account-avatar br-account-avatar--lg" data-account-avatar-lg></span>
                            <div class="br-account-pop-who">
                                <strong data-account-name>Account</strong>
                                <small data-account-sub hidden></small>
                            </div>
                        </div>
                        <button type="button" role="menuitem" class="br-account-item" data-account-go>
                            ${icon("settings", { size: 18 })}<span>Settings</span>
                        </button>
                        <button type="button" role="menuitem" class="br-account-item br-account-item--phone" data-account-notify>
                            ${icon("bell", { size: 18 })}<span>Notifications</span>
                        </button>
                        <button type="button" role="menuitem" class="br-account-item br-account-item--phone" data-pref="theme">
                            <span class="br-account-item-icon"></span><span class="br-account-item-text"></span>
                        </button>
                        <button type="button" role="menuitem" class="br-account-item br-account-item--phone" data-pref="currency">
                            <span class="br-account-item-icon"></span><span class="br-account-item-text"></span>
                        </button>
                        <button type="button" role="menuitem" class="br-account-item" data-look>
                            <span class="br-account-item-icon">${icon("palette", { size: 18 })}</span><span class="br-account-item-text">Themes</span>
                        </button>
                        <button type="button" role="menuitem" class="br-account-item br-account-item--danger" data-action="logout">
                            ${icon("log-out", { size: 18 })}<span>Log out</span>
                        </button>
                    </div>
                </div>


                <button
                    class="br-icon-button br-header-logout"
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
