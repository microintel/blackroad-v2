import { ChatMessage, PendingMessage, fillMessage } from "../../components/chat/chat-message.js";
import { SuggestionList, SuggestionRow } from "../../components/chat/chat-suggestions.js";
import { ChatComposer } from "../../components/chat/chat-composer.js";
import { roverMark } from "../../components/icons.js";
import { greeting, esc } from "../../components/chat/chat-format.js";
import { respond, needsData, SUGGESTIONS, TOP_SUGGESTIONS } from "./rover-engine.js";
import { getSnapshot } from "./rover-data.js";
import { rankSuggestions, tokenize } from "./rover-match.js";
import { runReport } from "./rover-reports.js";
import { progressIn } from "./rover-progress.js";
import { flowFromText, flowLabel, flowReply, readFiles, downloadBrokerPdf, session as brokerSession, resetSession, resolveRequest, pickText, PICKS, ACCEPT } from "./rover-brokers.js";
import { loadHistory, saveHistory, clearHistory, loadCommands, saveCommand } from "./rover-history.js";

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
const THINK_MS = 2300;

const START_COUNT = 6;

/* On phones, don't pop the keyboard open on its own; on desktop keep the cursor in the box. */
const hasMouse = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function RoverView({ hrefFor, name = "" }) {
    const el = document.createElement("main");
    el.className = "rv-view is-empty";
    el.innerHTML = `
        <div class="rv-scroll">
            <div class="rv-col">
                <section class="rv-empty">
                    ${roverMark(72, "rv-hero-mark")}
                    <h2>${greeting()}${name ? `<span class="rv-hello-name">, ${esc(name)}</span>` : ""}.</h2>
                    <p>What would you like to know about your money?</p>
                </section>
                <div class="rv-messages" role="log" aria-live="polite"></div>
                <div class="rv-spacer" aria-hidden="true"></div>
            </div>
        </div>
        <div class="rv-dock"><div class="rv-col"></div></div>
        <div class="rv-queries-backdrop" aria-hidden="true"></div>
        <aside class="rv-queries" aria-label="Suggested questions">
            <p class="rv-queries-title">${roverMark(14)}<span>Ask Rover</span></p>
            <div class="rv-queries-list">${TOP_SUGGESTIONS.map((q) => `<button type="button" class="rv-query"><span></span></button>`).join("")}</div>
            <p class="rv-queries-hint">Or just type. I understand many more questions, like reminders, a single stock or your income statement.</p>
        </aside>
    `;
    el.querySelectorAll(".rv-query span").forEach((s, i) => { s.textContent = TOP_SUGGESTIONS[i]; });

    const scrollBox = el.querySelector(".rv-scroll");
    const list = el.querySelector(".rv-messages");
    const spacer = el.querySelector(".rv-spacer");
    const dock = el.querySelector(".rv-dock .rv-col");

    const suggestions = SuggestionList(SUGGESTIONS);
    const intro = el.querySelector(".rv-empty");
    intro.appendChild(suggestions);

    // The start screen eases in once; later filtering must not replay it.
    intro.classList.add("is-intro");
    setTimeout(() => intro.classList.remove("is-intro"), 1200);

    // The menu replaces the start-screen list while it is open (typing, or the sparkle button).
    const chips = SuggestionRow(SUGGESTIONS, {
        onOpenChange: (open) => el.classList.toggle("is-typing", open && messages.length === 0)
    });
    // Earlier commands for the Up / Down arrows (oldest first).
    let commands = loadCommands();

    const composer = ChatComposer(send, (text) => { draft = text; applyFilter(); }, { attach: true, accept: ACCEPT, onFiles: () => applyFilter(), history: () => commands });
    // Adding more years from a summary: its own hidden picker.
    const morePicker = Object.assign(document.createElement("input"), { type: "file", multiple: true, hidden: true, accept: ACCEPT });
    el.appendChild(morePicker);
    const note = document.createElement("div");
    note.className = "rv-note";
    note.innerHTML = `<p>Rover is a financial intelligence bot and can make mistakes, so double-check it.</p><p class="rv-credit">Developed by <strong>Microintel</strong></p>`;
    dock.append(chips, composer.el, note);

    /* Side panel with every ready-made question (a drawer on phones, opened by the header menu button). */
    const queriesBox = el.querySelector(".rv-queries");
    const setQueries = (open) => {
        el.classList.toggle("is-queries-open", open);
        document.querySelector(".rv-shell")?.classList.toggle("is-menu-open", open);
        document.querySelector('[data-action="toggle-queries"]')?.setAttribute("aria-expanded", String(open));
    };
    window.addEventListener("rv:toggle-queries", () => setQueries(!el.classList.contains("is-queries-open")));
    el.querySelector(".rv-queries-backdrop").addEventListener("click", () => setQueries(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setQueries(false); });
    queriesBox.addEventListener("click", (e) => {
        const b = e.target.closest(".rv-query");
        if (!b) return;
        setQueries(false);
        send(b.textContent);
    });
    chips.addEventListener("click", (e) => { const b = e.target.closest(".rv-chip"); if (b) { chips.setOpen(false); send(b.querySelector("span").textContent); } });

    let messages = loadHistory();
    let draft = "";
    let busy = false;
    let showingPicks = false;
    let epoch = 0; // bumps on "New chat" so a late answer never lands in the new conversation

    function pick(e) {
        const b = e.target.closest(".rv-suggestion, .rv-chip");
        if (b) send(b.textContent);
    }

    const scroll = () => { scrollBox.scrollTop = scrollBox.scrollHeight; };

    /*
     * After you send, your message sits at the TOP of the view and the answer fills in below it
     * (nothing jumps to the bottom). A spacer under the list gives short answers room to do that;
     * it shrinks as the answer grows.
     */
    const TOP_GAP = 12;
    let pinned = null;
    const fit = () => {
        if (!pinned || !pinned.isConnected) return;
        const pad = parseFloat(getComputedStyle(scrollBox).paddingBottom) || 0;
        const below = spacer.offsetTop - pinned.offsetTop;
        const h = Math.max(0, Math.round(scrollBox.clientHeight - TOP_GAP - below - pad));
        if (Math.abs(h - (parseFloat(spacer.style.height) || 0)) > 0.5) spacer.style.height = h + "px";
    };
    const pinToTop = (node) => {
        pinned = node;
        fit();
        scrollBox.scrollTop = Math.max(0, node.offsetTop - TOP_GAP);
    };
    const unpin = () => { pinned = null; spacer.style.height = "0px"; };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(list);
    window.addEventListener("resize", fit);
    const sync = () => el.classList.toggle("is-empty", messages.length === 0);

    /*
     * Suggestions are always there. While you type they narrow to the questions that share a
     * word with what you typed (best match first); with nothing typed you see them all, minus
     * the ones you've already asked. Items are hidden, never rebuilt, so nothing jumps.
     */
    function applyFilter() {
        // With files attached the list is the brokers' reports ("Angel One · Profit & Loss"...).
        const forFiles = composer.files().length > 0;
        if (forFiles !== showingPicks) {
            showingPicks = forFiles;
            chips.setItems(forFiles ? PICKS : SUGGESTIONS, forFiles ? "Which report is this?" : "Suggested for you");
        }
        const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text.toLowerCase()));
        const typed = tokenize(draft).length > 0;
        const source = forFiles ? PICKS : SUGGESTIONS;
        const fresh = forFiles ? PICKS : source.filter((q) => !asked.has(q.toLowerCase()));
        const ranked = typed ? rankSuggestions(draft, fresh) : [];
        const matched = ranked.length > 0;
        // Typed something that matches nothing: show everything rather than an empty menu.
        const shown = typed && matched ? ranked.map((r) => r.item) : fresh;
        const rank = new Map(shown.map((q, i) => [q, i]));

        // Typing: only the best few, so the list stays short above the keyboard.
        // Nothing typed: just the first few (the most useful ones), never the whole list.
        const cap = typed && matched ? (hasMouse() ? 8 : 5) : START_COUNT;
        chips.querySelectorAll(".rv-chip").forEach((chip) => {
            const q = chip.querySelector("span").textContent;
            chip.hidden = !rank.has(q) || rank.get(q) >= cap;
            chip.style.order = String(typed && matched ? rank.get(q) : 0);
        });
        chips.sync();
        // While typing, the best matches drop down on their own; clearing the box closes them.
        // On phones this works on the start screen too (the keyboard covers the list there).
        // Works the same on the very first (empty) screen, on desktop and phones.
        chips.setOpen(typed || forFiles);

        const inList = new Set(!forFiles && typed && matched ? shown.slice(0, START_COUNT) : SUGGESTIONS.slice(0, START_COUNT));
        suggestions.querySelectorAll("li").forEach((li) => { li.hidden = !inList.has(li.textContent); });
    }

    function render() {
        unpin();
        list.replaceChildren(...messages.map((m) => ChatMessage(m, hrefFor)));
        applyFilter();
        sync();
        scroll();
    }

    function add(m) {
        messages.push(m);
        saveHistory(messages);
        const node = ChatMessage(m, hrefFor, { animate: true });
        list.appendChild(node);
        if (m.role === "user") applyFilter();
        sync();
        return node;
    }

    /* Keep a new card (like report progress) in view without yanking the page to the bottom. */
    const reveal = (node) => node.scrollIntoView({ block: "nearest", behavior: "smooth" });

    async function send(text) {
        const q = String(text || "").trim();
        if (busy) return;

        // Remember typed commands for the Up / Down arrows (not file uploads).
        if (q && !composer.files().length) {
            saveCommand(q);
            if (commands[commands.length - 1] !== q) commands.push(q);
        }

        // Files are attached: the text says which broker / report they are.
        const files = composer.files();
        if (files.length) {
            const pick = resolveRequest(q);
            if (!pick) {
                composer.nudge("Type the broker first, like Angel One, then pick the report.");
                applyFilter();
                composer.focus();
                return;
            }
            composer.clearFiles();
            const names = files.map((f) => f.name).join(", ");
            return converse(`${pickText(pick)} · ${names.length > 80 ? files.length + " files" : names}`, () => readFiles(files, pick), {
                status: ["Opening your file", "Reading the Equity P&L", "Checking the totals", "Writing the summary"]
            });
        }
        if (!q) return;

        // "upload my brokerage report", "Angel One P&L file"... start the guided flow.
        const flow = flowFromText(q);
        if (flow) return converse(q, () => flowReply());
        return converse(q);
    }

    /* A button inside a Rover message (broker, report, add another year...). */
    const runFlow = (id) => { if (!busy) converse(flowLabel(id), () => flowReply(), { keepDraft: true }); };

    /* "Add another year" under a summary: those files join the report you're reading. */
    function uploadFiles(files) {
        const list_ = [...files];
        if (!list_.length || busy) return;
        const names = list_.map((f) => f.name).join(", ");
        converse(`Uploaded ${names.length > 90 ? list_.length + " files" : names}`, () => readFiles(list_), {
            keepDraft: true,
            status: ["Opening your file", "Reading the Equity P&L", "Checking the totals", "Writing the summary"]
        });
    }

    /* One question/answer turn. `make` produces the reply (default: the normal Rover engine). */
    async function converse(q, make, { keepDraft = false, status } = {}) {

        const keepFocus = composer.hasFocus() || hasMouse();

        busy = true;
        const mine = epoch;
        if (!keepDraft) composer.clear();
        const mineNode = add({ role: "user", text: q });

        // Rover's answer is one bubble: it shows the generating animation, then becomes the reply.
        const pending = status ? PendingMessage(status) : PendingMessage();
        list.appendChild(pending);
        pinToTop(mineNode);

        let reply;
        try {
            if (make) {
                [reply] = await Promise.all([make(), new Promise((r) => setTimeout(r, THINK_MS))]);
            } else {
                const [snapshot] = await Promise.all([
                    needsData(q) ? getSnapshot() : Promise.resolve({}),
                    new Promise((r) => setTimeout(r, THINK_MS))
                ]);
                reply = respond(q, snapshot);
            }
        } catch (error) {
            console.error("Rover:", error);
            reply = { text: "I couldn't read your data just now. Try again in a moment." };
        }

        if (mine !== epoch) { busy = false; return; }

        const answer = { role: "rover", text: reply.text, actions: reply.actions, blocks: reply.blocks, choices: reply.choices, upload: reply.upload };
        messages.push(answer);
        saveHistory(messages);
        fillMessage(pending, answer, hrefFor);
        sync();
        // The answer always opens at its first line, at the top of the view.
        pinToTop(pending);
        requestAnimationFrame(() => { if (pinned === pending) pinToTop(pending); });
        busy = false;

        // "open stocks" and similar: go straight to that BlackRoad page.
        if (reply.go) setTimeout(() => { window.location.href = hrefFor(reply.go); }, 700);

        if (keepFocus) composer.focus();
    }

    suggestions.addEventListener("click", pick);

    /* Broker / report / "add another year" buttons. Once one is used, the others in that message fade. */
    list.addEventListener("click", (e) => {
        const b = e.target.closest(".rv-choice");
        if (b && b.dataset.flow === "more") { if (!busy) morePicker.click(); return; }
        if (b && b.dataset.flow === "new") { if (!busy) { resetSession(); composer.openPicker(); } return; }
        if (b && !busy) {
            b.closest(".rv-choices").classList.add("is-used");
            b.classList.add("is-picked");
            runFlow(b.dataset.flow);
            return;
        }
        // The upload card in a message puts the files into the message box.
        const pick_ = e.target.closest(".rv-pick");
        if (pick_) composer.openPicker();
    });
    morePicker.addEventListener("change", () => { uploadFiles(morePicker.files); morePicker.value = ""; });
    // Drop Excel file(s) anywhere on the page: they go into the message box.
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    ["dragover", "dragenter"].forEach((t) => el.addEventListener(t, (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        el.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((t) => el.addEventListener(t, (e) => {
        if (t === "dragleave" && el.contains(e.relatedTarget)) return;
        el.classList.remove("is-dragging");
        if (t === "drop" && hasFiles(e)) { e.preventDefault(); composer.addFiles(e.dataTransfer.files); composer.focus(); }
    }));
    // With files attached, tapping the box brings the report suggestions back.
    composer.input.addEventListener("focus", () => { if (composer.files().length) applyFilter(); });
    // A broker logo that can't load (offline) falls back to its first letter.
    list.addEventListener("error", (e) => {
        const img = e.target;
        // A logo inside a chart that can't load: drop it, the chart's own mark stays.
        if (img instanceof SVGImageElement && img.matches("image[data-stk-logo], image[data-mf-logo]")) { img.closest(".rv-svg-logo")?.remove(); return; }
        // A stock logo that can't load: drop the picture, the symbol's initials stay (same as the Stocks page).
        if (img instanceof HTMLImageElement && img.matches("img[data-stk-logo], img[data-mf-logo]")) { img.remove(); return; }
        if (!(img instanceof HTMLImageElement) || !img.classList.contains("rv-choice-img")) return;
        img.parentElement.textContent = img.parentElement.dataset.letter || "";
    }, true);

    /* Download buttons inside Rover's replies. */
    list.addEventListener("click", async (e) => {
        const b = e.target.closest(".rv-download");
        if (!b || b.disabled) return;

        const label = b.textContent;
        b.disabled = true;
        b.textContent = "Preparing…";
        try {
            // Progress shows as a Rover message in the chat itself (not a popup).
            const host = progressIn((card) => { list.appendChild(card); reveal(card); });
            let result;
            if (b.dataset.download === "broker-pdf") {
                // The brokerage PDF: same pages as the Brokerage Report Reader's own download.
                if (!brokerSession.years.length) result = "again";
                else {
                    const progress = host({
                        title: "Creating your P&L report",
                        steps: ["Reading your P&L data", "Verifying totals & charges", "Designing report pages", "Finalizing PDF"],
                        doneTitle: "PDF downloaded",
                        doneText: "Your Equity P&L report has been saved."
                    });
                    try {
                        result = await downloadBrokerPdf(progress);
                        progress.complete();
                    } catch (error) {
                        progress.fail(error.message || String(error));
                        throw error;
                    }
                }
            } else {
                result = await runReport(b.dataset.download, { progress: host });
            }
            if (result === "again") { b.textContent = "Upload the file again to download"; setTimeout(() => { b.textContent = label; b.disabled = false; }, 2600); return; }
            b.textContent = result === "empty" ? "Nothing to export yet" : "Downloaded ✓";
        } catch (error) {
            console.error("Rover report:", error);
            b.textContent = "Couldn't create it. Try again";
        }
        setTimeout(() => { b.textContent = label; b.disabled = false; }, 2600);
    });

    render();
    if (hasMouse()) composer.focus();

    return {
        el,
        newChat() {
            epoch += 1;
            busy = false;
            messages = [];
            resetSession();
            clearHistory();
            render();
            if (hasMouse()) composer.focus();
        }
    };
}
