import { fiCard, fiBar, inr } from "./shared.js";

const CIRC = 2 * Math.PI * 52;

export function renderHealth(model) {
    const { m } = model;
    const h = m.health;
    const arc = (h.score / 100) * CIRC;
    const tone = h.status === "At risk" ? " br-fi-arc-danger" : h.status === "Fair" ? " br-fi-arc-warning" : "";

    const lead = `Your financial health is ${h.status.toLowerCase()} because ${h.best.good}.` +
        (h.weakest !== h.best ? ` Weakest area: ${h.weakest.weak}.` : "");

    return fiCard({
        key: "health",
        tier: "primary",
        span: 5,
        title: "Financial health",
        subtitle: "How your money is doing overall.",
        iconName: "circle-check",
        body: `
            <div class="br-fi-health">
                <div class="br-fi-ring" role="img" aria-label="Health score ${h.score} out of 100, ${h.status}">
                    <svg viewBox="0 0 132 132" aria-hidden="true">
                        <circle class="br-fi-ring-track" cx="66" cy="66" r="52"></circle>
                        <circle class="br-fi-ring-arc${tone}" cx="66" cy="66" r="52"
                            stroke-dasharray="${arc.toFixed(1)} ${(CIRC - arc).toFixed(1)}"></circle>
                    </svg>
                    <div class="br-fi-ring-center">
                        <div><strong>${h.score}</strong><small>/ 100 · ${h.status}</small></div>
                    </div>
                </div>
                <p class="br-fi-lead">${lead}</p>
            </div>

            <ul class="br-fi-rows br-fi-rows-meter">
                ${h.parts.map((p) => `
                    <li>
                        <div class="br-fi-row-top"><span>${p.label}</span><b>${Math.round(p.points)} <small>/ ${p.max}</small></b></div>
                        ${fiBar((p.points / p.max) * 100, p.points / p.max < 0.4 ? "danger" : p.points / p.max < 0.7 ? "warning" : "")}
                    </li>`).join("")}
            </ul>
        `
    });
}
