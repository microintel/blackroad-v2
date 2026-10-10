import { ChatMessage, TypingIndicator } from "../../components/chat/chat-message.js";
import { SuggestionList, SuggestionRow } from "../../components/chat/chat-suggestions.js";
import { ChatComposer } from "../../components/chat/chat-composer.js";
import { roverMark } from "../../components/icons.js";
import { greeting } from "../../components/chat/chat-format.js";
import { respond, needsData, SUGGESTIONS } from "./rover-engine.js";
import { getSnapshot } from "./rover-data.js";
import { rankSuggestions, tokenize } from "./rover-match.js";
import { loadHistory, saveHistory, clearHistory } from "./rover-history.js";

/*
 * The Rover page view (like the feature pages in the app: it assembles
 * components and owns the flow). Returns { el, newChat }.
 *
 *   engine  -> what to answer        (rover-engine.js)
 *   data    -> the user's numbers    (rover-data.js)
 *   history -> remembered messages   (rover-history.js)
 *   chat UI -> components/chat/*
 */

/* How long Rover "thinks" before answering, so the loading animation is seen (ms). */
const THINK_MS = 1400;

const START_COUNT = 6;

/* On phones, don't pop the keyboard open on its own; on desktop keep the cursor in the box. */
const hasMouse = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function RoverView({ hrefFor }) {
    const el = document.createElement("main");
    el.className = "rv-view is-empty";
    el.innerHTML = `
        <div class="rv-scroll">
            <div class="rv-col">
                <section class="rv-empty">
                    ${roverMark(52, "rv-hero-mark")}
                    <h2>${greeting()}.</h2>
                    <p>What would you like to know about your money?</p>
                </section>
                <div class="rv-messages" role="log" aria-live="polite"></div>
            </div>
        </div>
        <div class="rv-dock"><div class="rv-col"></div></div>
    `;

    const scrollBox = el.querySelector(".rv-scroll");
    const list = el.querySelector(".rv-messages");
    const dock = el.querySelector(".rv-dock .rv-col");

    const suggestions = SuggestionList(SUGGESTIONS);
    const intro = el.querySelector(".rv-empty");
    intro.appendChild(suggestions);

    // The start screen eases in once; later filtering must not replay it.
    intro.classList.add("is-intro");
    setTimeout(() => intro.classList.remove("is-intro"), 1200);

    const chips = SuggestionRow(SUGGESTIONS);
    const composer = ChatComposer(send, (text) => { draft = text; applyFilter(); });
    dock.append(chips, composer.el);
    composer.el.prepend(chips.toggleButton);
    chips.addEventListener("click", (e) => { const b = e.target.closest(".rv-chip"); if (b) { chips.setOpen(false); send(b.querySelector("span").textContent); } });

    let messages = loadHistory();
    let draft = "";
    let busy = false;

    function pick(e) {
        const b = e.target.closest(".rv-suggestion, .rv-chip");
        if (b) send(b.textContent);
    }

    const scroll = () => { scrollBox.scrollTop = scrollBox.scrollHeight; };
    const sync = () => el.classList.toggle("is-empty", messages.length === 0);

    /*
     * Suggestions are always there. While you type they narrow to the questions that share a
     * word with what you typed (best match first); with nothing typed you see them all, minus
     * the ones you've already asked. Items are hidden, never rebuilt, so nothing jumps.
     */
    function applyFilter() {
        const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text.toLowerCase()));
        const typed = tokenize(draft).length > 0;
        const fresh = SUGGESTIONS.filter((q) => !asked.has(q.toLowerCase()));
        const ranked = typed ? rankSuggestions(draft, fresh) : [];
        const matched = ranked.length > 0;
        // Typed something that matches nothing: show everything rather than an empty menu.
        const shown = typed && matched ? ranked.map((r) => r.item) : fresh;
        const rank = new Map(shown.map((q, i) => [q, i]));

        chips.querySelectorAll(".rv-chip").forEach((chip) => {
            const q = chip.querySelector("span").textContent;
            chip.hidden = !rank.has(q);
            chip.style.order = String(typed && matched ? rank.get(q) : 0);
        });
        chips.sync();
        // While typing, the best matches drop down on their own; clearing the box closes them.
        chips.setOpen(typed && matched && messages.length > 0);

        const inList = new Set(typed && matched ? shown.slice(0, START_COUNT) : SUGGESTIONS.slice(0, START_COUNT));
        suggestions.querySelectorAll("li").forEach((li) => { li.hidden = !inList.has(li.textContent); });
    }

    function render() {
        list.replaceChildren(...messages.map((m) => ChatMessage(m, hrefFor)));
        applyFilter();
        sync();
        scroll();
    }

    function add(m) {
        messages.push(m);
        saveHistory(messages);
        list.appendChild(ChatMessage(m, hrefFor, { animate: true }));
        if (m.role === "user") applyFilter();
        sync();
        scroll();
    }

    function typing(on) {
        list.querySelector(".rv-typing")?.remove();
        if (on) { list.appendChild(TypingIndicator()); scroll(); }
    }

    async function send(text) {
        const q = String(text || "").trim();
        if (!q || busy) return;

        const keepFocus = composer.hasFocus() || hasMouse();

        busy = true;
        composer.clear();
        add({ role: "user", text: q });
        typing(true);

        let reply;
        try {
            const [snapshot] = await Promise.all([
                needsData(q) ? getSnapshot() : Promise.resolve({}),
                new Promise((r) => setTimeout(r, THINK_MS))
            ]);
            reply = respond(q, snapshot);
        } catch (error) {
            console.error("Rover:", error);
            reply = { text: "I couldn't read your data just now. Try again in a moment." };
        }

        typing(false);
        add({ role: "rover", text: reply.text, actions: reply.actions });
        busy = false;

        // "open stocks" and similar: go straight to that BlackRoad page.
        if (reply.go) setTimeout(() => { window.location.href = hrefFor(reply.go); }, 700);

        if (keepFocus) composer.focus();
    }

    suggestions.addEventListener("click", pick);

    render();
    if (hasMouse()) composer.focus();

    return {
        el,
        newChat() {
            messages = [];
            clearHistory();
            render();
            if (hasMouse()) composer.focus();
        }
    };
}
