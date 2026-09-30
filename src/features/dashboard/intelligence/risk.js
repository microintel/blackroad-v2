import { fiCard, how, levelBadge, fiBar, inr } from "./shared.js";

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
        `,
        how: how(
            "Four checks each get a level. Overall risk is the worst level among them.",
            [
                `<b>EMI:</b> EMI ÷ income = ${inr(m.emi)} ÷ ${inr(m.income)} = ${Math.round(m.emiRatio * 100)}%. High from 40%, Medium from 30%.`,
                `<b>Savings:</b> ${m.coverage.toFixed(1)} months of bills covered. High under 1 month, Medium under 3.`,
                `<b>Debt:</b> loan balance ÷ yearly income = ${m.risks[2].shown}. High from 100%, Medium from 60%.`,
                `<b>Monthly surplus:</b> what is left after all payments. High if negative, Medium under 5% of income.`
            ]
        )
    });
}
