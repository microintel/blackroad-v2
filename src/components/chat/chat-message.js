import { esc, richText } from "./chat-format.js";
import { roverMark } from "../icons.js";

/* One chat message, and the "typing" indicator. `hrefFor(path)` builds app links. */

/* animate: stagger the reply in (new replies only, not remembered history). */
export function ChatMessage(message, hrefFor, { animate = false } = {}) {
    const el = document.createElement("div");
    el.className = `rv-msg is-${message.role}${animate ? " is-new" : ""}`;

    const body = message.role === "user" ? `<p>${esc(message.text)}</p>` : richText(message.text);

    const actions = (message.actions || []).length
        ? `<div class="rv-actions">${message.actions
              .map((a) => `<a class="rv-action" href="${esc(hrefFor(a.path))}">${esc(a.label)}</a>`)
              .join("")}</div>`
        : "";

    el.innerHTML = `<div class="rv-bubble">${body}${actions}</div>`;

    // Each block (paragraph, row, links) rises in one after the other.
    el.querySelectorAll(".rv-bubble > *, .rv-rows > div").forEach((node, i) => node.style.setProperty("--i", i));

    return el;
}

const STATUS = ["Looking at your accounts", "Checking the numbers", "Putting it together"];

/* The Rover dot-ring spins while Rover works on an answer. */
export function TypingIndicator() {
    const el = document.createElement("div");
    el.className = "rv-msg is-rover rv-typing";
    el.setAttribute("role", "status");
    el.innerHTML = `
        <div class="rv-bubble">
            ${roverMark(34, "rv-dots")}
            <span class="rv-status"></span>
        </div>`;

    // Cycle the status line while the indicator is on screen.
    const label = el.querySelector(".rv-status");
    let i = 0;
    const show = () => { label.textContent = STATUS[i % STATUS.length] + "…"; i += 1; };
    show();
    const timer = setInterval(() => (el.isConnected ? show() : clearInterval(timer)), 1100);

    return el;
}
