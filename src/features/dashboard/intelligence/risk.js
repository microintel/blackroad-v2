import { fiCard, levelBadge, fiBar, inr } from "./shared.js";

export function renderRisk(model) {
    const { m } = model;
    const flagged = m.risks.filter((r) => r.level !== "Low");
    const tone = (l) => (l === "High" ? "danger" : l === "Medium" ? "warning" : "");

    return fiCard({
        key: "risk",
        tier: "secondary",
        span: 5,
        title: "Financial risk radar",
        subtitle: "Where pressure could build.",
        iconName: "circle-alert",
        body: `
            <div class="br-fi-figure br-fi-figure-row">
                <span class="br-stat-label">Overall risk</span>
                <span class="br-badge ${levelBadge(m.overall)}">${m.overall}</span>
            </div>

            <ul class="br-fi-meters">
                ${m.risks.map((r) => `
                    <li>
                        <div class="br-fi-meter-head">
                            <span>${r.label}</span>
                            <b>${r.shown}</b>
                            <span class="br-badge ${levelBadge(r.level)}">${r.level}</span>
                        </div>
                        ${fiBar(r.severity, tone(r.level))}
                    </li>`).join("")}
            </ul>

            <div class="br-fi-note">
                ${flagged.length
                    ? flagged.map((r) => `<p>${r.msg}</p>`).join("")
                    : "<p>All four checks are within safe limits.</p>"}
            </div>
        `
    });
}
