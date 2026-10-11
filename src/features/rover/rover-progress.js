import { roverMark } from "../../components/icons.js";
import { esc } from "../../components/chat/chat-format.js";

/*
 * Rover's own progress card for report downloads. It lives in the chat as a Rover message
 * (no popup, no overlay), and has the same controls as components/report-progress.js:
 *
 *   const progress = createProgress({ title, steps, doneTitle, doneText });
 *   ... build the report ...
 *   await progress.ready();   // resolves when the bar reaches 100%
 *   ... save the file ...
 *   progress.complete();      // or progress.fail("message") / progress.close()
 *
 * Purely presentational: it never reads or writes app data.
 */

const HOLD_CAP = 92;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const CHECK = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

/* host(el): puts the card in the chat and scrolls to it. Returns the progress factory. */
export function progressIn(host) {
    return function createProgress({
        title = "Preparing your report",
        steps = ["Collecting your data", "Calculating totals", "Creating the file", "Finalizing"],
        doneTitle = "Report ready",
        doneText = "Your report has been saved.",
        minDuration = 3200
    } = {}) {
        const el = document.createElement("div");
        el.className = "rv-msg is-rover rv-prog is-new";
        el.setAttribute("role", "status");
        el.innerHTML = `
            <div class="rv-bubble">
                <div class="rv-prog-card">
                    <div class="rv-prog-head">
                        <span class="rv-prog-icon" data-p-icon>${roverMark(28, "rv-dots")}</span>
                        <div class="rv-prog-text">
                            <strong data-p-title>${esc(title)}</strong>
                            <span data-p-sub aria-live="polite">${esc(steps[0])}…</span>
                        </div>
                        <b class="rv-prog-pct"><span data-p-pct>0</span>%</b>
                    </div>
                    <div class="rv-prog-bar" aria-hidden="true"><i data-p-bar></i></div>
                    <ol class="rv-prog-steps">
                        ${steps.map((s) => `<li><i></i>${esc(s)}</li>`).join("")}
                    </ol>
                </div>
            </div>`;
        host(el);

        const icon = el.querySelector("[data-p-icon]");
        const titleEl = el.querySelector("[data-p-title]");
        const subEl = el.querySelector("[data-p-sub]");
        const pctEl = el.querySelector("[data-p-pct]");
        const bar = el.querySelector("[data-p-bar]");
        const stepEls = [...el.querySelectorAll(".rv-prog-steps li")];

        const t0 = performance.now();
        let cap = HOLD_CAP, value = 0, stopped = false, readyRequested = false, finished = false, raf = 0, resolveReady;
        const readyPromise = new Promise((res) => { resolveReady = res; });

        function paint(p) {
            const v = Math.max(0, Math.min(100, p));
            bar.style.transform = `scaleX(${v / 100})`;
            pctEl.textContent = String(Math.floor(v));
            const active = Math.min(stepEls.length - 1, Math.floor(v / (100 / stepEls.length)));
            stepEls.forEach((li, i) => {
                li.classList.toggle("is-done", v >= 100 || i < active);
                li.classList.toggle("is-active", v < 100 && i === active);
            });
            if (v < 100) subEl.textContent = steps[active] + "…";
        }

        function tick(now) {
            if (stopped) return;
            value = Math.max(value, Math.min(easeInOut(Math.min(1, (now - t0) / minDuration)) * 100, cap));
            paint(value);

            if (value >= 100 && readyRequested && !finished) {
                finished = true;
                subEl.textContent = "Almost there…";
                resolveReady();
                return;
            }
            raf = requestAnimationFrame(tick);
        }
        paint(0);
        raf = requestAnimationFrame(tick);

        const stop = () => { stopped = true; cancelAnimationFrame(raf); };

        return {
            ready() { readyRequested = true; cap = 100; return readyPromise; },

            complete(text = doneText) {
                stop();
                paint(100);
                el.classList.add("is-success");
                icon.innerHTML = CHECK;
                titleEl.textContent = doneTitle;
                subEl.textContent = text;
            },

            fail(message = "Something went wrong.") {
                stop();
                el.classList.add("is-error");
                icon.innerHTML = CROSS;
                titleEl.textContent = "Couldn’t create the report";
                subEl.textContent = message;
            },

            close() { stop(); el.remove(); }
        };
    };
}
