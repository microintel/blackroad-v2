/* =========================================================
   FINANCIAL INTELLIGENCE - shared presentation helpers
   Markup only. All numbers come from engine.js.
   ========================================================= */

import { icon } from "../../../components/icons.js";

export { inr, signedInr, signedPct } from "./engine.js";

/* One feature area = one card with a stable data-fi key.
   */
export function fiCard({
    key, tier, span, half = false, title, subtitle, iconName, body
}) {
    const id = `br-fi-${key}-title`;

    return `
        <article class="br-card br-fi-card br-fi-${tier} br-fi-span-${span}${
            half ? " br-fi-half" : ""
        }" data-fi="${key}" aria-labelledby="${id}">
            <div class="br-card-heading">
                <div>
                    <h3 id="${id}">${title}</h3>
                    <p>${subtitle}</p>
                </div>
                <span class="br-fi-icon" aria-hidden="true">${icon(iconName, { size: 18 })}</span>
            </div>
            <div class="br-fi-body" data-fi-body>${body}</div>
        </article>
    `;
}

export function fiSlot(caption, extraClass = "") {
    return `<div class="br-fi-slot ${extraClass}"><span>${caption}</span></div>`;
}

export function fiStat(label, value, valueClass = "") {
    return `<div class="br-fi-stat">
        <span class="br-stat-label">${label}</span>
        <strong class="${valueClass}">${value}</strong>
    </div>`;
}

export function fiBar(percent, tone = "") {
    return `<div class="br-fi-bar${tone ? " br-fi-bar-" + tone : ""}"
        role="presentation"><span style="width:${Math.min(100, Math.max(0, percent))}%"></span></div>`;
}

export const levelBadge = (level) =>
    level === "High" ? "br-badge-danger"
    : level === "Medium" ? "br-badge-warning"
    : "br-badge-success";
