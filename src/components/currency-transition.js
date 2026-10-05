/* =========================================================
   CURRENCY SWITCH ANIMATION
   Covers the screen for ~2 seconds while INR <-> USD changes,
   so the amounts never jump suddenly. The page underneath is
   re-drawn while the overlay is up.
   ========================================================= */

const TOTAL_MS = 2000;
const FADE_MS = 250;
const FAILSAFE_MS = 8000;

let layer = null;
let startedAt = 0;
let failsafe = null;

export function startCurrencyTransition(to) {
    if (layer) return;

    const usd = to === "USD";

    layer = document.createElement("div");
    layer.className = "br-fx-layer";
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-live", "polite");
    layer.innerHTML = `
        <div class="br-fx-card">
            <div class="br-fx-coin" aria-hidden="true">
                <span class="br-fx-face br-fx-face--a">${usd ? "\u20B9" : "$"}</span>
                <span class="br-fx-face br-fx-face--b">${usd ? "$" : "\u20B9"}</span>
            </div>
            <p class="br-fx-text">Switching to ${usd ? "US Dollars" : "Indian Rupees"}\u2026</p>
            <div class="br-fx-bar"><i></i></div>
        </div>
    `;

    document.body.appendChild(layer);
    startedAt = Date.now();

    // Never leave the screen covered if something goes wrong.
    failsafe = setTimeout(endCurrencyTransition, FAILSAFE_MS);
}

/* Remove the overlay once at least TOTAL_MS have passed since it started. */
export function endCurrencyTransition(immediate) {
    if (!layer) return;

    const el = layer;
    const wait = immediate ? 0 : Math.max(0, TOTAL_MS - FADE_MS - (Date.now() - startedAt));

    clearTimeout(failsafe);
    failsafe = null;
    layer = null;

    setTimeout(() => {
        el.classList.add("is-out");
        setTimeout(() => el.remove(), FADE_MS);
    }, wait);
}
