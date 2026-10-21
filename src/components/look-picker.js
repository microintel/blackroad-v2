import { icon } from "./icons.js";
import { VARIANTS, getVariant, setVariant } from "../services/preferences.js";

/* "Themes" popup: the two original modes and one additional palette.
   A tap applies at once, so the popup itself shows the result live. Opens from
   the account menu and from Account > Appearance. */

let current = null;

const themeCard = (v) => `
    <button type="button" class="lk-theme" data-variant-id="${v.id}" aria-pressed="false">
        <span class="lk-prev" style="background:${v.bg}">
            ${v.swatches
                ? `<span class="lk-strip">${v.swatches.map((c) => `<em style="background:${c}"></em>`).join("")}</span>`
                : `<i style="background:${v.accent}"></i><i style="background:${v.text};opacity:.55"></i>
                   <b style="background:${v.surface};border-color:${v.text}33"></b>`}
        </span>
        <span class="lk-name">${v.label}</span>
    </button>`;

export function openLookPicker() {
    if (current) return;

    const layer = document.createElement("div");
    layer.className = "lk-layer";
    layer.innerHTML = `
        <div class="lk-dialog" role="dialog" aria-modal="true" aria-labelledby="lk-title">
            <div class="lk-head">
                <div>
                    <h3 id="lk-title">Themes</h3>
                </div>
                <button type="button" class="lk-close" data-lk-close aria-label="Close">${icon("x", { size: 18 })}</button>
            </div>

            <div class="lk-body">
                <div class="lk-grid">${VARIANTS.map(themeCard).join("")}</div>
            </div>

            <div class="lk-foot">
                <button type="button" class="lk-done" data-lk-close>Done</button>
            </div>
        </div>`;
    document.body.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const sync = () => {
        const v = getVariant();
        layer.querySelectorAll("[data-variant-id]").forEach((b) =>
            b.setAttribute("aria-pressed", String(b.dataset.variantId === v)));
    };

    function close() {
        window.removeEventListener("br:theme-change", sync);
        document.removeEventListener("keydown", onKey, true);
        layer.classList.remove("is-open");
        setTimeout(() => layer.remove(), 180);
        current = null;
    }
    current = close;

    function onKey(e) {
        if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
    }
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("br:theme-change", sync);

    layer.addEventListener("click", (e) => {
        if (e.target === layer || e.target.closest("[data-lk-close]")) return close();

        const t = e.target.closest("[data-variant-id]");
        if (t) {
            const r = t.getBoundingClientRect();
            setVariant(t.dataset.variantId, { el: t, x: r.left + r.width / 2, y: r.top + r.height / 2 });
            sync();
            return;
        }
    });

    sync();
    // keep the selected theme in view when the list is long (phones)
    layer.querySelector('[data-variant-id][aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
}
