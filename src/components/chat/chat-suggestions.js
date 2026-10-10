import { esc } from "./chat-format.js";
import { icon, roverMark } from "../icons.js";

/* Suggested questions: a list on the empty screen, a quiet row once chatting. Both show/hide items with `hidden`. */

export function SuggestionList(items) {
    const ul = document.createElement("ul");
    ul.className = "rv-suggest";
    ul.innerHTML = items.map((q) => `<li><button type="button" class="rv-suggestion">${esc(q)}</button></li>`).join("");
    return ul;
}

/*
 * Once chatting: a sparkle button inside the message box opens a card of suggestions just above it.
 * Same width as the box, big tap targets, closes on pick / outside tap / Esc.
 * Returns the card (`el`, has the .rv-chip buttons) plus `toggleButton` for the composer.
 */
export function SuggestionRow(items) {
    const row = document.createElement("div");
    row.className = "rv-chips";
    row.innerHTML = `
        <div class="rv-chip-menu" role="menu" aria-label="Suggestions" hidden>
            <p class="rv-chip-title">${roverMark(14)}<span>Suggested for you</span></p>
            ${items.map((q) => `<button type="button" class="rv-chip" role="menuitem"><span>${esc(q)}</span>${icon("arrow-up-right", { size: 16 })}</button>`).join("")}
        </div>`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "rv-suggest-toggle";
    toggle.setAttribute("aria-label", "Show suggestions");
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = roverMark(22);

    const menu = row.querySelector(".rv-chip-menu");
    const setOpen = (open) => {
        if (open && !menu.querySelector(".rv-chip:not([hidden])")) open = false;
        menu.hidden = !open;
        toggle.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => setOpen(menu.hidden));
    document.addEventListener("pointerdown", (e) => {
        if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

    row.toggleButton = toggle;
    row.setOpen = setOpen;
    /* Hide the button when there is nothing left to suggest. */
    row.sync = () => {
        const any = !!menu.querySelector(".rv-chip:not([hidden])");
        toggle.hidden = !any;
        if (!any) setOpen(false);
    };
    return row;
}
