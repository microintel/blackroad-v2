import { roverMark } from "../../components/icons.js";

/*
 * Ctrl+R (Cmd+R on Mac) inside BlackRoad opens Rover with a short opening animation (~1.4s),
 * instead of reloading the page. Ctrl+Shift+R (hard reload) is left alone.
 */
let started = false;
let opening = false;

const ROVER_URL = () => new URL("../../../rover.html", import.meta.url).href;

function openRover() {
    if (opening) return;
    opening = true;

    const layer = document.createElement("div");
    layer.className = "br-rover-launch";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<div class="br-rover-launch-inner">${roverMark(104, "br-rover-launch-mark")}<span>Rover</span></div>`;
    document.body.appendChild(layer);

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { window.location.href = ROVER_URL(); }, reduce ? 50 : 1450);
}

export function initRoverShortcut() {
    if (started) return;
    started = true;

    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== "r") return;
        // Only inside the signed-in app (not on the sign-in screens).
        if (!document.querySelector("#app > .br-app-shell")) return;
        e.preventDefault();
        openRover();
    });

    // Coming back with the Back button must not show the old overlay.
    window.addEventListener("pageshow", () => {
        opening = false;
        document.querySelectorAll(".br-rover-launch").forEach((n) => n.remove());
    });
}
