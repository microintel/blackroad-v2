/* =========================================================
   SKELETON LOADING
   Placeholder shapes shown while a page's data loads. Markup
   only: styles live in styles/skeleton.css. A skeleton stays
   invisible for the first ~120ms (pure CSS), so fast pages
   never flash it.
   ========================================================= */

const line = (w = "100%", h = 12) =>
    `<span class="br-sk" style="width:${w};height:${h}px"></span>`;

const card = (inner = "", cls = "") =>
    `<div class="br-sk-card ${cls}">${inner}</div>`;

const heading = () => `
    <div class="br-sk-heading">
        ${line("min(240px,60%)", 24)}
        ${line("min(420px,90%)", 12)}
    </div>`;

const statCard = () => card(`
    ${line("40%", 10)}
    ${line("65%", 26)}
    ${line("50%", 10)}`);

const rows = (n) => Array.from({ length: n }, () => `
    <div class="br-sk-row">
        ${line("28px", 28)}
        <div class="br-sk-row-text">${line("55%", 12)}${line("35%", 10)}</div>
        ${line("64px", 14)}
    </div>`).join("");

/* Financial Intelligence: tabs, then the first group's two cards */
function intelligence() {
    return `
        <div class="br-sk-tabs">${Array.from({ length: 6 }, () => line("64px", 14)).join("")}</div>
        ${heading()}
        <div class="br-sk-grid br-sk-grid-fi">
            ${card(`
                <div class="br-sk-card-head">${line("45%", 18)}${line("36px", 36)}</div>
                <div class="br-sk-health">
                    <span class="br-sk br-sk-ring"></span>
                    <div class="br-sk-col">${line("100%", 12)}${line("90%", 12)}${line("60%", 12)}</div>
                </div>
                ${[0, 1, 2, 3, 4].map(() => `<div class="br-sk-meter">${line("45%", 10)}${line("100%", 6)}</div>`).join("")}`)}
            ${card(`
                <div class="br-sk-card-head">${line("50%", 18)}${line("36px", 36)}</div>
                ${line("35%", 10)}
                ${line("55%", 34)}
                ${line("100%", 150, )}
                <div class="br-sk-two">${line("100%", 62)}${line("100%", 62)}</div>`)}
        </div>`;
}

function dashboard() {
    return `
        ${heading()}
        <div class="br-sk-grid br-sk-grid-4">${[0, 1, 2, 3].map(statCard).join("")}</div>
        <div class="br-sk-grid br-sk-grid-2">
            ${card(`${line("40%", 16)}${line("100%", 200)}`)}
            ${card(`${line("40%", 16)}${rows(4)}`)}
        </div>`;
}

/* Everything else: heading, summary tiles, a list */
function list() {
    return `
        ${heading()}
        <div class="br-sk-grid br-sk-grid-3">${[0, 1, 2].map(statCard).join("")}</div>
        ${card(`
            <div class="br-sk-toolbar">${line("min(280px,100%)", 36)}${line("96px", 36)}</div>
            ${rows(6)}`)}`;
}

const VARIANTS = { intelligence, dashboard, list };

export function pageSkeleton(variant = "list") {
    const wrap = document.createElement("section");

    wrap.className = "br-page br-skeleton";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-busy", "true");
    wrap.setAttribute("aria-label", "Loading");
    wrap.innerHTML = (VARIANTS[variant] || list)();

    return wrap;
}

export function skeletonVariantFor(module) {
    if (module === "intelligence") return "intelligence";
    if (module === "dashboard") return "dashboard";
    return "list";
}
