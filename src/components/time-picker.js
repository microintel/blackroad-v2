import { icon } from "./icons.js";

/* Clock-style time picker.
   Turns a plain <input type="time"> into a button that opens an analog clock
   (pick the hour, then the minute, then AM / PM).
   The real input stays in the form as the single source of truth, so
   form.time.value works exactly as before, including programmatic changes. */

const pad = (n) => String(n).padStart(2, "0");
const NS = "http://www.w3.org/2000/svg";

function parse(value) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value || ""));
    if (!m) return null;
    const h24 = Math.min(23, +m[1]);
    return { h24, min: Math.min(59, +m[2]), sec: m[3] !== undefined ? Math.min(59, +m[3]) : 0, hasSec: m[3] !== undefined };
}

function label(value) {
    const t = parse(value);
    if (!t) return "";
    const ap = t.h24 >= 12 ? "PM" : "AM";
    const h = t.h24 % 12 || 12;
    return `${pad(h)}:${pad(t.min)}${t.hasSec ? ":" + pad(t.sec) : ""} ${ap}`;
}

let openPicker = null;

export function enhanceTimeInput(input) {
    if (!input || input.dataset.tpReady) return;
    input.dataset.tpReady = "1";

    // wrapper + trigger button (placed before the input so a label click opens it)
    const wrap = document.createElement("span");
    wrap.className = "tp-wrap";
    input.parentNode.insertBefore(wrap, input);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "tp-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    wrap.appendChild(trigger);
    wrap.appendChild(input);

    input.classList.add("tp-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    const refresh = () => {
        const text = label(input.value);
        trigger.innerHTML =
            `<span class="tp-trigger-text${text ? "" : " is-empty"}">${text || "Select time"}</span>` +
            `<span class="tp-trigger-icon" aria-hidden="true">${icon("clock", { size: 18 })}</span>`;
        trigger.setAttribute("aria-label", text ? `Time ${text}. Change time` : "Select time");
    };

    // keep the button in sync when code sets input.value / resets the form
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); refresh(); }
    });
    input.form?.addEventListener("reset", () => setTimeout(refresh, 0));

    refresh();
    trigger.addEventListener("click", () => openClock(input, trigger));
}

export function enhanceTimeInputs(root) {
    root.querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);
}

/* ---------- the clock dialog ---------- */

function openClock(input, trigger) {
    if (openPicker) openPicker();

    const now = new Date();
    const cur = parse(input.value) || { h24: now.getHours(), min: now.getMinutes(), sec: now.getSeconds(), hasSec: true };

    let h = cur.h24 % 12 || 12;
    let min = cur.min;
    let ap = cur.h24 >= 12 ? "PM" : "AM";
    let mode = "hour";
    const sec = cur.sec;

    const layer = document.createElement("div");
    layer.className = "tp-layer";
    layer.innerHTML = `
        <div class="tp-dialog" role="dialog" aria-modal="true" aria-label="Select time">
            <div class="tp-head">
                <div class="tp-readout">
                    <button type="button" class="tp-seg" data-seg="hour"></button>
                    <span class="tp-colon">:</span>
                    <button type="button" class="tp-seg" data-seg="minute"></button>
                </div>
                <div class="tp-ap" role="group" aria-label="AM or PM">
                    <button type="button" data-ap="AM">AM</button>
                    <button type="button" data-ap="PM">PM</button>
                </div>
            </div>
            <div class="tp-face-wrap">
                <svg class="tp-face" viewBox="0 0 240 240" aria-hidden="true"></svg>
            </div>
            <div class="tp-actions">
                <button type="button" class="tp-link" data-act="clear">Clear</button>
                <span class="tp-spacer"></span>
                <button type="button" class="tp-link" data-act="now">Now</button>
                <button type="button" class="tp-btn" data-act="cancel">Cancel</button>
                <button type="button" class="tp-btn tp-btn-primary" data-act="ok">OK</button>
            </div>
        </div>`;
    document.body.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const svg = layer.querySelector(".tp-face");
    const segHour = layer.querySelector('[data-seg="hour"]');
    const segMin = layer.querySelector('[data-seg="minute"]');

    const C = 120, R_NUM = 92, R_HAND = 92;
    const el = (name, attrs, text) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const pos = (deg, r) => {
        const a = (deg - 90) * Math.PI / 180;
        return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };

    function draw() {
        svg.textContent = "";
        svg.appendChild(el("circle", { cx: C, cy: C, r: 114, class: "tp-dial" }));

        const isHour = mode === "hour";
        const deg = isHour ? (h % 12) * 30 : min * 6;
        const [hx, hy] = pos(deg, R_HAND);

        svg.appendChild(el("line", { x1: C, y1: C, x2: hx, y2: hy, class: "tp-hand" }));
        svg.appendChild(el("circle", { cx: C, cy: C, r: 4, class: "tp-pivot" }));
        svg.appendChild(el("circle", { cx: hx, cy: hy, r: 18, class: "tp-knob" }));

        const marks = isHour ? 12 : 12; // 12 labels on either face
        for (let i = 1; i <= marks; i++) {
            const value = isHour ? i : (i % 12) * 5;
            const [x, y] = pos(i * 30, R_NUM);
            const active = isHour ? value === h : value === min;
            svg.appendChild(el("text", {
                x, y, class: "tp-num" + (active ? " is-active" : ""),
                "text-anchor": "middle", "dominant-baseline": "central"
            }, isHour ? String(value) : pad(value)));
        }
        // minute not on a 5-step: show a small centre dot in the knob
        if (!isHour && min % 5 !== 0) svg.appendChild(el("circle", { cx: hx, cy: hy, r: 3, class: "tp-knob-dot" }));

        segHour.textContent = pad(h);
        segMin.textContent = pad(min);
        segHour.classList.toggle("is-active", isHour);
        segMin.classList.toggle("is-active", !isHour);
        layer.querySelectorAll("[data-ap]").forEach((b) => b.classList.toggle("is-active", b.dataset.ap === ap));
    }

    // pointer: tap or drag on the dial
    function pick(e) {
        const r = svg.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        if (mode === "hour") h = Math.round(deg / 30) % 12 || 12;
        else min = Math.round(deg / 6) % 60;
        draw();
    }
    let dragging = false;
    svg.addEventListener("pointerdown", (e) => {
        dragging = true;
        svg.setPointerCapture?.(e.pointerId);
        pick(e);
    });
    svg.addEventListener("pointermove", (e) => { if (dragging) pick(e); });
    const end = () => {
        if (!dragging) return;
        dragging = false;
        if (mode === "hour") setTimeout(() => { mode = "minute"; draw(); }, 160);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => { dragging = false; });

    segHour.addEventListener("click", () => { mode = "hour"; draw(); });
    segMin.addEventListener("click", () => { mode = "minute"; draw(); });
    layer.querySelectorAll("[data-ap]").forEach((b) =>
        b.addEventListener("click", () => { ap = b.dataset.ap; draw(); }));

    const emit = () => {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    function close() {
        document.removeEventListener("keydown", onKey, true);
        layer.classList.remove("is-open");
        setTimeout(() => layer.remove(), 180);
        openPicker = null;
        trigger.focus({ preventScroll: true });
    }
    openPicker = close;

    const apply = (h24, m, s) => {
        input.value = `${pad(h24)}:${pad(m)}:${pad(s)}`;
        emit();
    };

    layer.addEventListener("click", (e) => {
        if (e.target === layer) return close();
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        if (act === "cancel") close();
        else if (act === "clear") { input.value = ""; emit(); close(); }
        else if (act === "now") {
            const d = new Date();
            h = d.getHours() % 12 || 12; min = d.getMinutes(); ap = d.getHours() >= 12 ? "PM" : "AM";
            mode = "hour"; draw();
        }
        else if (act === "ok") {
            const h24 = (h % 12) + (ap === "PM" ? 12 : 0);
            apply(h24, min, sec);
            close();
        }
    });

    // Escape / Enter only act on the picker, never on the form behind it
    function onKey(e) {
        if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
        else if (e.key === "Enter") { e.stopImmediatePropagation(); e.preventDefault(); layer.querySelector('[data-act="ok"]').click(); }
    }
    document.addEventListener("keydown", onKey, true);

    draw();
    layer.querySelector('[data-act="ok"]').focus({ preventScroll: true });
}
