import { esc, richText } from "./chat-format.js";
import { roverMark, icon } from "../icons.js";
import { renderBlocks } from "../../features/rover/rover-visuals.js";

/*
 * One chat message, plus the "generating" state of Rover's reply.
 *
 * Rover's reply is ONE bubble the whole time: it appears as soon as you send, shows the
 * generating animation inside itself, and then fills with the answer (text streams in word by
 * word; charts, tables and gauges draw in after it). `hrefFor(path)` builds app links.
 */

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function messageBody(message, hrefFor) {
    if (message.role === "user") return `<p>${esc(message.text)}</p>`;

    const actions = (message.actions || []).length
        ? `<div class="rv-actions">${message.actions
              .map((a) => a.download
                  ? `<button type="button" class="rv-action rv-download" data-download="${esc(a.download)}">${esc(a.label)}</button>`
                  : `<a class="rv-action" href="${esc(hrefFor(a.path))}">${esc(a.label)}</a>`)
              .join("")}</div>`
        : "";

    const visuals = (message.blocks || []).length ? `<div class="rv-visuals">${renderBlocks(message.blocks)}</div>` : "";

    const choices = (message.choices || []).length
        ? `<div class="rv-choices">${message.choices
              .map((c) => `<button type="button" class="rv-choice${c.quiet ? " is-quiet" : ""}" data-flow="${esc(c.flow)}">${c.logo ? `<span class="rv-choice-logo" data-letter="${esc(c.letter || "")}"><img class="rv-choice-img" src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ""}<span>${esc(c.label)}</span></button>`)
              .join("")}</div>`
        : "";

    const upload = message.upload
        ? `<div class="rv-upload" data-upload>
               <span class="rv-upload-icon">${icon("upload", { size: 22 })}</span>
               <p>Drop your Excel file(s) here, or</p>
               <button type="button" class="br-button br-button-primary rv-pick">Choose file${message.upload.multiple ? "(s)" : ""}</button>
               
           </div>`
        : "";

    return richText(message.text) + visuals + upload + choices + actions;
}

/* Wrap every word of a paragraph so it can fade in one after another. Returns the next start time. */
function streamWords(p, start, step) {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    let t = start;
    nodes.forEach((node) => {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement("span");
            w.className = "rv-w";
            w.style.setProperty("--d", `${Math.round(t)}ms`);
            w.textContent = part;
            frag.appendChild(w);
            t += step;
        });
        node.replaceWith(frag);
    });
    return t;
}

/* Order the reveal: text streams first, then rows, charts and links rise in below it. */
function choreograph(bubble) {
    const reduced = prefersReducedMotion();
    const words = (bubble.textContent.match(/\S+/g) || []).length;
    const step = Math.min(34, Math.max(10, 1100 / Math.max(words, 1)));
    let t = 0;

    [...bubble.children].forEach((node) => {
        if (node.tagName === "P" && !reduced) {
            t = streamWords(node, t, step) + 60;
        } else if (node.classList.contains("rv-rows")) {
            [...node.children].forEach((row, k) => row.style.setProperty("--d", `${Math.round(t + k * 70)}ms`));
            t += node.children.length * 70 + 80;
        } else if (node.classList.contains("rv-visuals")) {
            const cells = [...node.querySelectorAll(".rv-cell")].sort((a, b) => a.dataset.i - b.dataset.i);
            cells.forEach((block, k) => block.style.setProperty("--d", `${Math.round(t + k * 220)}ms`));
            t += cells.length * 220;
        } else {
            node.style.setProperty("--d", `${Math.round(t)}ms`);
            t += 120;
        }
    });
}

/* animate: stream the reply in (new replies only, not remembered history). */
export function ChatMessage(message, hrefFor, { animate = false } = {}) {
    const el = document.createElement("div");
    el.className = `rv-msg is-${message.role}${animate ? " is-new" : ""}`;
    el.innerHTML = `<div class="rv-bubble"></div>`;
    fillBubble(el, message, hrefFor, animate);
    return el;
}

function fillBubble(el, message, hrefFor, animate) {
    const bubble = el.querySelector(".rv-bubble");
    bubble.innerHTML = messageBody(message, hrefFor);
    if (message.role === "user" || !animate) return;
    choreograph(bubble);
}

const STATUS = ["Looking at your accounts", "Checking the numbers", "Drawing it up"];

/*
 * Rover's reply bubble while it is working: the dot-ring spins and a few lines shimmer
 * inside the bubble. Call `fillMessage(el, reply, hrefFor)` to turn this same bubble into the answer.
 */
export function PendingMessage(status = STATUS) {
    const el = document.createElement("div");
    el.className = "rv-msg is-rover rv-typing rv-pending";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Rover is working on your answer");
    el.innerHTML = `
        <div class="rv-bubble">
            <div class="rv-gen">
                ${roverMark(40, "rv-dots")}
                <span class="rv-status"></span>
            </div>
            <div class="rv-skel" aria-hidden="true"><i style="--w:92%"></i><i style="--w:74%"></i><i style="--w:48%"></i></div>
        </div>`;

    const label = el.querySelector(".rv-status");
    let i = 0;
    const show = () => { label.textContent = status[i % status.length] + "…"; i += 1; };
    show();
    const timer = setInterval(() => (el.isConnected && el.classList.contains("rv-pending") ? show() : clearInterval(timer)), 1100);

    return el;
}

/* Turn the pending bubble into the real reply, in place. */
export function fillMessage(el, message, hrefFor) {
    el.classList.remove("rv-typing", "rv-pending");
    el.classList.add("is-new");
    el.removeAttribute("role");
    el.removeAttribute("aria-label");
    fillBubble(el, message, hrefFor, true);
}

/* Kept for compatibility: the older stand-alone indicator. */
export function TypingIndicator() {
    return PendingMessage();
}
