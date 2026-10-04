/* =========================================================
   REPORT PROGRESS
   A calm, branded progress overlay shown while a PDF is being
   generated / a print report is being prepared.

   Purely presentational: it never reads or writes app data and
   never changes what a report contains. It only controls WHEN the
   final "save" / "print" happens, so the user sees a clear,
   unhurried progress experience instead of an instant download.

   Usage:
       const progress = startReportProgress({ title, steps, doneText });
       ... build the report ...
       await progress.ready();     // resolves once the bar reaches 100%
       doc.save(...);              // the download happens here
       progress.complete();        // success state, then auto-closes
   On error:  progress.fail("message")
   ========================================================= */

const MIN_DURATION = 3200;   // ms the bar takes at the very least
const HOLD_CAP = 92;         // bar waits here while real work is still running
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function startReportProgress({
    title = "Preparing your report",
    subtitle = "This only takes a moment",
    steps = ["Collecting your data", "Calculating totals", "Designing the pages", "Finalizing"],
    doneTitle = "Report ready",
    doneText = "Your report is ready.",
    minDuration = MIN_DURATION
} = {}) {

    const previouslyFocused = document.activeElement;

    const root = document.createElement("div");
    root.className = "br-rp";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", title);
    root.innerHTML = `
        <div class="br-rp-card">
            <div class="br-rp-ring" aria-hidden="true">
                <svg viewBox="0 0 120 120">
                    <circle class="br-rp-track" cx="60" cy="60" r="${RING_R}"/>
                    <circle class="br-rp-arc" cx="60" cy="60" r="${RING_R}"
                        stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
                    <path class="br-rp-check" d="M38 62 L54 77 L82 46"/>
                </svg>
                <div class="br-rp-pct"><span data-rp-pct>0</span><small>%</small></div>
            </div>

            <h2 class="br-rp-title" data-rp-title>${esc(title)}</h2>
            <p class="br-rp-sub" data-rp-sub aria-live="polite">${esc(subtitle)}</p>

            <div class="br-rp-bar" aria-hidden="true"><i data-rp-bar></i></div>

            <ol class="br-rp-steps">
                ${steps.map((s, i) => `
                    <li data-rp-step="${i}">
                        <span class="br-rp-dot"><svg viewBox="0 0 16 16"><path d="M3.5 8.5 6.5 11.5 12.5 5"/></svg></span>
                        <span class="br-rp-label">${esc(s)}</span>
                    </li>`).join("")}
            </ol>

            <button type="button" class="br-button br-rp-close" data-rp-close hidden>Close</button>
        </div>`;

    document.body.appendChild(root);
    document.body.classList.add("br-rp-open");
    requestAnimationFrame(() => root.classList.add("is-in"));

    const arc = root.querySelector(".br-rp-arc");
    const pctEl = root.querySelector("[data-rp-pct]");
    const bar = root.querySelector("[data-rp-bar]");
    const subEl = root.querySelector("[data-rp-sub]");
    const titleEl = root.querySelector("[data-rp-title]");
    const stepEls = [...root.querySelectorAll("[data-rp-step]")];

    const t0 = performance.now();
    let cap = HOLD_CAP;
    let value = 0;
    let finished = false;      // bar hit 100%
    let stopped = false;       // complete()/fail() called
    let raf = 0;
    let resolveReady;
    const readyPromise = new Promise((res) => { resolveReady = res; });
    let readyRequested = false;

    function paint(p) {
        const v = Math.max(0, Math.min(100, p));
        arc.style.strokeDashoffset = String(RING_C * (1 - v / 100));
        bar.style.transform = `scaleX(${v / 100})`;
        pctEl.textContent = String(Math.floor(v));

        const per = 100 / stepEls.length;
        const active = Math.min(stepEls.length - 1, Math.floor(v / per));
        stepEls.forEach((el, i) => {
            el.classList.toggle("is-done", v >= 100 || i < active);
            el.classList.toggle("is-active", v < 100 && i === active);
        });
        if (v < 100) subEl.textContent = steps[active] + "…";
    }

    function tick(now) {
        if (stopped) return;
        const elapsed = now - t0;
        const timeline = easeInOut(Math.min(1, elapsed / minDuration)) * 100;
        value = Math.max(value, Math.min(timeline, cap));
        paint(value);

        if (value >= 100 && readyRequested && !finished) {
            finished = true;
            subEl.textContent = "Almost there…";
            resolveReady();
            return;
        }
        raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function close() {
        cancelAnimationFrame(raf);
        root.classList.remove("is-in");
        root.classList.add("is-out");
        document.body.classList.remove("br-rp-open");
        setTimeout(() => root.remove(), 320);
        try { previouslyFocused?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    }

    root.querySelector("[data-rp-close]").addEventListener("click", close);

    return {
        /* Call once the report is built. Resolves when the bar reaches 100%,
           i.e. NOT before the minimum duration has passed. Save/print after this. */
        ready() {
            readyRequested = true;
            cap = 100;
            return readyPromise;
        },

        /* Success state, then auto-close. */
        complete(text = doneText, { autoClose = 1500 } = {}) {
            stopped = true;
            cancelAnimationFrame(raf);
            paint(100);
            root.classList.add("is-success");
            titleEl.textContent = doneTitle;
            subEl.textContent = text;
            setTimeout(close, autoClose);
        },

        /* Error state, user closes manually. */
        fail(message = "Something went wrong.") {
            stopped = true;
            cancelAnimationFrame(raf);
            root.classList.add("is-error");
            titleEl.textContent = "Couldn’t create the report";
            subEl.textContent = message;
            const btn = root.querySelector("[data-rp-close]");
            btn.hidden = false;
            btn.focus();
        },

        close
    };
}
