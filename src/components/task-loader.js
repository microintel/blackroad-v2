/* =========================================================
   TASK LOADER
   A small, branded loading animation (a mini candlestick chart that
   rises and falls) for quick jobs: downloading, exporting, importing,
   reading a file, calculating.

   Purely presentational: it never reads or writes app data. It only
   wraps the work that was already happening and makes sure the user
   sees a short, clear progress state instead of nothing.

   Usage:
       const result = await runTask(
           { kind: "export", title: "Exporting CSV" },
           async () => { ...the original work...; return value; }
       );
   Or manually:
       const t = showTaskLoader({ kind: "read" });
       t.setText("Parsing rows…");
       await t.close();
   If the work throws, the loader closes and the error is re-thrown
   untouched, so existing error handling keeps working.
   ========================================================= */

const KINDS = {
    download:  { title: "Downloading",          sub: "Getting your file ready" },
    export:    { title: "Exporting",            sub: "Packing your data into a file" },
    import:    { title: "Importing",            sub: "Bringing your data in" },
    read:      { title: "Reading file",         sub: "Checking what's inside" },
    calculate: { title: "Calculating",          sub: "Crunching the numbers" }
};

const MIN_VISIBLE = 900;     // ms the loader stays up at the least, so it never just flashes

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* The animated chart. Used by the overlay and by inline loaders. */
export function loaderChartHTML() {
    const candles = [
        { h: 46, b: 20, up: true },
        { h: 58, b: 26, up: false },
        { h: 40, b: 16, up: true },
        { h: 62, b: 30, up: true },
        { h: 50, b: 22, up: false }
    ];
    return `
        <span class="br-tl-chart" aria-hidden="true">
            ${candles.map((c, i) => `
                <i class="br-tl-c ${c.up ? "is-up" : "is-down"}" style="--d:${i * 0.14}s;--h:${c.h}px;--b:${c.b}px"></i>`).join("")}
            <b class="br-tl-base"></b>
        </span>`;
}

/* Small inline version for buttons / result areas. */
export function inlineLoader(kind = "calculate", text) {
    const label = text || (KINDS[kind] || KINDS.calculate).title + "…";
    return `
        <span class="br-tl-inline" role="status" aria-live="polite">
            <span class="br-tl-mini" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span>${esc(label)}</span>
        </span>`;
}

export function showTaskLoader({ kind = "calculate", title, subtitle, minDuration = MIN_VISIBLE } = {}) {
    const k = KINDS[kind] || KINDS.calculate;
    const t0 = performance.now();

    const root = document.createElement("div");
    root.className = "br-tl";
    root.dataset.kind = kind;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-busy", "true");
    root.innerHTML = `
        <div class="br-tl-card">
            ${loaderChartHTML()}
            <strong class="br-tl-title" data-tl-title>${esc(title || k.title)}…</strong>
            <span class="br-tl-sub" data-tl-sub>${esc(subtitle || k.sub)}</span>
            <span class="br-tl-bar" aria-hidden="true"><i></i></span>
        </div>`;

    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add("is-in"));

    const titleEl = root.querySelector("[data-tl-title]");
    const subEl = root.querySelector("[data-tl-sub]");
    let closed = false;

    return {
        setText(sub) { if (!closed && subEl) subEl.textContent = sub; },
        setTitle(text) { if (!closed && titleEl) titleEl.textContent = text; },
        async close() {
            if (closed) return;
            closed = true;
            const left = minDuration - (performance.now() - t0);
            if (left > 0) await wait(left);
            root.classList.remove("is-in");
            root.classList.add("is-out");
            await wait(220);
            root.remove();
        },
        /* Close at once (used when the work failed). */
        abort() {
            if (closed) return;
            closed = true;
            root.remove();
        }
    };
}

/* Run `fn` behind the loader. Returns whatever `fn` returns and re-throws
   whatever `fn` throws, so callers behave exactly as before. */
export async function runTask(options, fn) {
    const loader = showTaskLoader(options);
    let result;
    try {
        result = await fn(loader);
    } catch (err) {
        loader.abort();
        throw err;
    }
    await loader.close();
    return result;
}

/* Calculators recalculate instantly on every keystroke, so they must not be
   delayed. This only plays a short sweep along the top edge of the screen
   while the results update. It is fixed-position, so it cannot move layout. */
export function pulseCalculating(ms = 520) {
    let bar = document.querySelector(".br-tl-topbar");
    if (!bar) {
        bar = document.createElement("div");
        bar.className = "br-tl-topbar";
        bar.setAttribute("aria-hidden", "true");
        bar.innerHTML = "<i></i>";
        document.body.appendChild(bar);
    }
    bar.classList.remove("is-on");
    void bar.offsetWidth;                // restart the animation
    bar.classList.add("is-on");
    clearTimeout(bar._brT);
    bar._brT = setTimeout(() => bar.classList.remove("is-on"), ms);
}
