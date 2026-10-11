import { icon, roverMark } from "../icons.js";
import { getTheme } from "../../services/preferences.js";
import { getCurrency } from "../../services/currency.js";
import { themeToggleContent, currencyToggleContent } from "./topbar.js";

/* Header of the Rover page. Same look and controls as the BlackRoad header.
   On phones (rover.css): menu button on the left, the Rover mark in the middle (with the name while the
   menu is open), New chat and a Home button on the right. Theme and currency follow the dashboard. */

export function RoverHeader({ backHref }) {
    const themeUi = themeToggleContent(getTheme());
    const curUi = currencyToggleContent(getCurrency());

    const header = document.createElement("header");
    header.className = "br-header";
    header.innerHTML = `
        <div class="br-header-left">
            <button type="button" class="br-icon-button rv-menu" data-action="toggle-queries" aria-label="Open suggested questions" aria-expanded="false" title="Suggested questions">${icon("menu", { size: 20 })}</button>
            <a class="br-icon-button rv-back" href="${backHref}" aria-label="Back to BlackRoad" title="Back to BlackRoad">${icon("arrow-left", { size: 20 })}</a>
            <h1 class="br-page-title rv-title">${roverMark(34, "rv-title-mark")}<span>Rover</span></h1>
        </div>

        <div class="br-header-actions">
            <button type="button" class="br-icon-button" data-action="toggle-theme" aria-label="${themeUi.label}" title="${themeUi.label}">${themeUi.icon}</button>
            <button type="button" class="br-icon-button br-currency-toggle" data-action="toggle-currency" aria-label="${curUi.label}" title="${curUi.label}">${curUi.icon}</button>
            <button type="button" class="br-button rv-new" data-action="new-chat" title="New chat (Ctrl+N)">${icon("plus", { size: 16 })}<span>New chat</span></button>
            <a class="br-icon-button rv-home" href="${backHref}" aria-label="Go to BlackRoad" title="BlackRoad">${icon("house", { size: 20 })}</a>
        </div>
    `;
    return header;
}
