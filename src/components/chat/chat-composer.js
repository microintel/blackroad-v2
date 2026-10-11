import { icon } from "../icons.js";
import { esc } from "./chat-format.js";

/*
 * The message box. onSend(text) on submit; onTyping(text) on every change.
 *
 * Up / Down arrows walk through earlier commands, like a terminal: Up goes back one command at a time
 * (history() returns them oldest first), Down comes forward again and ends on what you were typing.
 *
 * With `attach: true` it also takes files: the upload button (or a drop) puts them inside the box as
 * small chips, so you can type next to them. `onFiles(files)` is called whenever the chips change.
 */

const MAX_FILES = 8;
const EXCEL = /\.(xlsx|xls)$/i;

export function ChatComposer(onSend, onTyping = () => {}, { attach = false, accept = "", onFiles = () => {}, history = () => [] } = {}) {
    const form = document.createElement("form");
    form.className = "rv-form";
    form.autocomplete = "off";
    form.innerHTML = `
        <div class="rv-files" hidden>
            <div class="rv-file-list"></div>
            <p class="rv-files-hint">Now type the broker, like <b>Angel One</b>, and pick the report.</p>
        </div>
        <textarea class="rv-input" rows="1" maxlength="300" placeholder="Ask Rover" aria-label="Message Rover" enterkeyhint="enter" autocapitalize="sentences"></textarea>
        ${attach ? `<button type="button" class="rv-attach" aria-label="Upload a brokerage report" title="Upload a brokerage report">${icon("upload", { size: 20 })}</button>
        <input type="file" class="rv-attach-input" hidden multiple accept="${esc(accept)}">` : ""}
        <button type="submit" class="rv-send" aria-label="Send">${icon("send", { size: 18 })}</button>
    `;

    const input = form.querySelector(".rv-input");
    const picker = form.querySelector(".rv-attach-input");
    const tray = form.querySelector(".rv-files");
    const listEl = form.querySelector(".rv-file-list");
    const hint = form.querySelector(".rv-files-hint");
    const idle = input.placeholder;
    let files = [];

    /* The box grows in height with what you type (never in width), up to a limit, then scrolls. */
    const MAX_H = 168;
    const grow = () => {
        if (!input.isConnected) return;
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, MAX_H) + "px";
    };
    window.addEventListener("resize", grow);

    /* Enter sends on a computer (Shift+Enter = new line). On a phone Enter always starts a new line; the Send button sends. */
    const hasMouse = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function paint() {
        tray.hidden = files.length === 0;
        form.classList.toggle("has-files", files.length > 0);
        input.placeholder = files.length ? "Type your broker, e.g. Angel One" : idle;
        listEl.innerHTML = files
            .map((f, i) => `<span class="rv-file-chip" title="${esc(f.name)}">${icon("file-chart-column", { size: 16 })}<span class="rv-file-name">${esc(f.name)}</span><button type="button" class="rv-file-x" data-i="${i}" aria-label="Remove ${esc(f.name)}">${icon("x", { size: 14 })}</button></span>`)
            .join("");
        onFiles(files.slice());
    }

    function addFiles(list) {
        const rejected = [];
        [...list].forEach((f) => {
            if (!EXCEL.test(f.name)) { rejected.push(f.name); return; }
            if (files.length >= MAX_FILES || files.some((x) => x.name === f.name && x.size === f.size)) return;
            files.push(f);
        });
        paint();
        if (rejected.length) nudge(`${rejected.join(", ")} isn't an Excel file (.xlsx).`);
    }

    function nudge(text) {
        if (text) hint.textContent = text;
        hint.classList.remove("is-nudge");
        void hint.offsetWidth; // restart the animation
        hint.classList.add("is-nudge");
    }

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        onSend(input.value);
    });

    form.querySelector(".rv-attach")?.addEventListener("click", () => picker.click());
    picker?.addEventListener("change", () => { addFiles(picker.files); picker.value = ""; input.focus({ preventScroll: true }); });
    listEl.addEventListener("click", (e) => {
        const b = e.target.closest(".rv-file-x");
        if (!b) return;
        files.splice(Number(b.dataset.i), 1);
        paint();
    });

    input.addEventListener("input", () => { recall = -1; grow(); onTyping(input.value); });

    /* Terminal-style command recall. `recall` is the position in the list (-1 = not browsing). */
    let recall = -1;
    let draft = "";

    function show(text) {
        input.value = text;
        grow();
        onTyping(text);
        // Caret at the end, after the browser has finished handling the key.
        requestAnimationFrame(() => { try { input.setSelectionRange(text.length, text.length); } catch { /* ignore */ } });
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            if (hasMouse()) {
                e.preventDefault();
                if (form.requestSubmit) form.requestSubmit();
                else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
            return;
        }
        if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
        // With several lines typed, the arrows move the cursor as usual; recall only works on a single line.
        if (recall === -1 && (input.value.includes("\n") || input.scrollHeight > 44)) return;
        const list = history();
        if (!list.length) return;
        e.preventDefault();

        if (e.key === "ArrowUp") {
            if (recall === -1) { draft = input.value; recall = list.length; }
            if (recall > 0) show(list[--recall]);
        } else if (recall !== -1) {
            if (recall < list.length - 1) show(list[++recall]);
            else { recall = -1; show(draft); }
        }
    });

    form.addEventListener("submit", () => { recall = -1; draft = ""; });

    return {
        el: form,
        input,
        clear: () => { input.value = ""; grow(); onTyping(""); },
        focus: () => input.focus({ preventScroll: true }),
        hasFocus: () => document.activeElement === input,
        files: () => files.slice(),
        addFiles,
        clearFiles: () => { files = []; hint.textContent = "Now type the broker, like Angel One, and pick the report."; paint(); },
        openPicker: () => picker?.click(),
        nudge
    };
}
