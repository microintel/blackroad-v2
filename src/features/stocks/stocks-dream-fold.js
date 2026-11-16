/*
 * stocks-dream-fold.js
 *
 * Open / close ("fold") helpers shared by the Dream wishlist and paper
 * trading views. Pure UI: it only toggles a class and remembers which
 * items are open, so list refreshes (live prices) keep your layout.
 * Nothing here touches stored data.
 */

import { icon } from "../../components/icons.js";

const state = new Map(); // key -> boolean

export const isOpen = (key, def = false) => (state.has(key) ? state.get(key) : def);
export const openClass = (key, def = false) => (isOpen(key, def) ? " is-open" : "");
export const chevron = () => `<span class="dr-chev" aria-hidden="true">${icon("chevron-down", { size: 16 })}</span>`;

/* A titled section that opens and closes */
export function foldSection(key, title, inner, def = false) {
    const open = isOpen(key, def);
    return `
        <div class="dp-fold${open ? " is-open" : ""}" data-fold-host>
            <button type="button" class="dp-fold-head" data-fold="${key}" aria-expanded="${open}">
                <span>${title}</span>${chevron()}
            </button>
            <div class="dr-more"><div>${inner}</div></div>
        </div>`;
}

/* "Expand all / Collapse all" for a list scope */
export function allButton(keys) {
    const every = keys.length > 0 && keys.every((k) => isOpen(k));
    return `<button type="button" class="dr-textbtn" data-fold-all>${every ? "Collapse all" : "Expand all"}</button>`;
}

function syncAll(scope) {
    if (!scope) return;
    const btn = scope.querySelector("[data-fold-all]");
    if (!btn) return;
    const hosts = [...scope.querySelectorAll("[data-fold-host]")];
    btn.textContent = hosts.length && hosts.every((h) => h.classList.contains("is-open")) ? "Collapse all" : "Expand all";
}

function setHost(host, open) {
    const btn = host.querySelector("[data-fold]");
    if (!btn) return;
    host.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    state.set(btn.dataset.fold, open);
}

export function bindFold(page) {
    page.addEventListener("click", (event) => {
        const all = event.target.closest("[data-fold-all]");
        if (all && page.contains(all)) {
            const scope = all.closest("[data-fold-scope]");
            if (!scope) return;
            const hosts = [...scope.querySelectorAll("[data-fold-host]")];
            const open = !hosts.every((h) => h.classList.contains("is-open"));
            hosts.forEach((h) => setHost(h, open));
            syncAll(scope);
            return;
        }

        const btn = event.target.closest("[data-fold]");
        if (!btn || !page.contains(btn)) return;
        const host = btn.closest("[data-fold-host]");
        if (!host) return;
        setHost(host, !host.classList.contains("is-open"));
        syncAll(btn.closest("[data-fold-scope]"));
    });
}
