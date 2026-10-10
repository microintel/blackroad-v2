import { icon, roverMark } from "../icons.js";
import { getTheme } from "../../services/preferences.js";
import { getCurrency } from "../../services/currency.js";
import { themeToggleContent, currencyToggleContent } from "./topbar.js";

/* Header of the Rover page. Same look and controls as the BlackRoad header. */

export function RoverHeader({ backHref }) {
    const themeUi = themeToggleContent(getTheme());
    const curUi = currencyToggleContent(getCurrency());

    const header = document.createElement("header");
    header.className = "br-header";
    header.innerHTML = `
        <div class="br-header-left">
            <a class="br-icon-button" href="${backHref}" aria-label="Back to BlackRoad" title="Back to BlackRoad">${icon("arrow-left", { size: 20 })}</a>
            <h1 class="br-page-title rv-title">${roverMark(26, "rv-title-mark")}<span>Rover</span></h1>
        </div>

        <div class="br-header-actions">
            <button type="button" class="br-icon-button" data-action="toggle-theme" aria-label="${themeUi.label}" title="${themeUi.label}">${themeUi.icon}</button>
            <button type="button" class="br-icon-button br-currency-toggle" data-action="toggle-currency" aria-label="${curUi.label}" title="${curUi.label}">${curUi.icon}</button>
            <button type="button" class="br-button rv-new" data-action="new-chat">${icon("plus", { size: 16 })}<span>New chat</span></button>
        </div>
    `;
    return header;
}
