import { icon } from "../icons.js";

/* The message box. onSend(text) on submit; onTyping(text) on every change. */

export function ChatComposer(onSend, onTyping = () => {}) {
    const form = document.createElement("form");
    form.className = "rv-form";
    form.autocomplete = "off";
    form.innerHTML = `
        <input class="rv-input" type="text" maxlength="300" placeholder="Ask Rover" aria-label="Message Rover">
        <button type="submit" class="rv-send" aria-label="Send">${icon("send", { size: 18 })}</button>
    `;

    const input = form.querySelector("input");

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        onSend(input.value);
    });

    input.addEventListener("input", () => onTyping(input.value));

    return {
        el: form,
        input,
        clear: () => { input.value = ""; onTyping(""); },
        focus: () => input.focus({ preventScroll: true }),
        hasFocus: () => document.activeElement === input
    };
}
