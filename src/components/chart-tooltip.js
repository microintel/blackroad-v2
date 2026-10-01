/* =========================================================
   CHART TOOLTIP
   One shared tooltip for every SVG chart. A chart marks the
   shapes that should show values with tipAttr(); a single set of
   document listeners (initChartTooltips, called once at boot)
   shows the tooltip for mouse hover and for touch tap / drag.

     <rect class="br-tip-hit" ${tipAttr("Jan 2026", [
         ["Income", "₹1,000.00", "var(--br-success)"]
     ])} />

   rows: [label, value, colour?]. Text is written with
   textContent, so values can never inject markup.
   ========================================================= */

const HIDE_DELAY_TOUCH = 1800;

let tipEl = null;
let activeEl = null;
let hideTimer = null;
let installed = false;

/* data-tip="..." attribute string for a chart shape. */
export function tipAttr(title, rows = []) {
    const json = JSON.stringify({ t: title ?? "", r: rows });

    const safe = json
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    return `data-tip="${safe}"`;
}

function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;

    tipEl = document.createElement("div");
    tipEl.className = "br-chart-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);

    return tipEl;
}

function fill(data) {
    const el = ensureTip();
    el.replaceChildren();

    if (data.t) {
        const title = document.createElement("div");
        title.className = "br-chart-tip-title";
        title.textContent = data.t;
        el.appendChild(title);
    }

    (data.r || []).forEach(([label, value, color]) => {
        const row = document.createElement("div");
        row.className = "br-chart-tip-row";

        const key = document.createElement("span");
        key.className = "br-chart-tip-key";

        if (color) {
            const dot = document.createElement("i");
            dot.className = "br-chart-tip-dot";
            dot.style.background = color;
            key.appendChild(dot);
        }

        key.appendChild(document.createTextNode(label));

        const val = document.createElement("strong");
        val.textContent = value;

        row.append(key, val);
        el.appendChild(row);
    });
}

function place(x, y) {
    const el = ensureTip();
    const gap = 14;
    const margin = 8;

    const { width, height } = el.getBoundingClientRect();

    let left = x + gap;
    if (left + width > window.innerWidth - margin) left = x - width - gap;
    left = Math.max(margin, left);

    let top = y - height - gap;
    if (top < margin) top = y + gap + 6;
    top = Math.min(top, window.innerHeight - height - margin);

    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function setActive(next) {
    if (activeEl === next) return;

    activeEl?.classList.remove("is-tip-active");
    activeEl = next;
    activeEl?.classList.add("is-tip-active");
}

function hide() {
    clearTimeout(hideTimer);
    hideTimer = null;

    setActive(null);
    tipEl?.classList.remove("is-visible");
}

function show(target, x, y) {
    clearTimeout(hideTimer);
    hideTimer = null;

    if (target !== activeEl) {
        let data;

        try {
            data = JSON.parse(target.getAttribute("data-tip"));
        } catch {
            hide();
            return;
        }

        fill(data);
        setActive(target);
    }

    const el = ensureTip();
    el.classList.add("is-visible");
    place(x, y);
}

function tipTargetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    return hit?.closest?.("[data-tip]") || null;
}

function onPointer(event) {
    const isTouch = event.pointerType === "touch";

    /* A mouse only reports hover; a finger reports while pressed. */
    if (event.type === "pointermove" && isTouch && event.buttons === 0) {
        return;
    }

    const target = tipTargetAt(event.clientX, event.clientY);

    if (!target) {
        hide();
        return;
    }

    show(target, event.clientX, event.clientY);
}

function onPointerEnd(event) {
    if (event.pointerType !== "touch") return;

    /* Leave the values on screen briefly after the finger lifts. */
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY_TOUCH);
}

export function initChartTooltips() {
    if (installed) return;
    installed = true;

    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerup", onPointerEnd, { passive: true });
    document.addEventListener("pointercancel", onPointerEnd, { passive: true });

    /* A mouse leaving the window, scrolling or navigating clears it. */
    document.documentElement.addEventListener("mouseleave", hide);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("hashchange", hide);
    window.addEventListener("resize", hide);
}
