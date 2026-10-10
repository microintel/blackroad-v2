import { roverMark } from "../../components/icons.js";

/*
 * The only piece of Rover inside BlackRoad: a small button that opens the
 * separate Rover page (rover.html). No chat code runs in the app itself.
 */
export function mountRoverLink(shell) {
    if (!shell || shell.querySelector(".br-rover-link")) return;

    const a = document.createElement("a");
    a.className = "br-rover-link";
    a.href = new URL("../../../rover.html", import.meta.url).href;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Open Rover");
    a.title = "Open Rover";
    a.innerHTML = roverMark(36);

    shell.appendChild(a);
}
