import { fiCard, how, inr } from "./shared.js";

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
                        <div><strong>${h.status}</strong><small>${h.score} / 100</small></div>
                    </div>
                </div>
                <p class="br-fi-lead">${lead}</p>
            </div>

            <ul class="br-fi-rows">
                ${h.parts.map((p) => `
                    <li><span>${p.label}</span><b>${Math.round(p.points)} / ${p.max}</b></li>`).join("")}
            </ul>
        `,
        how: how(
            "The score adds up five checks, worth 100 points in total. Good is 65 or more, Fair is 40 to 64, and below 40 is At risk.",
            [
                `<b>Emergency cover (30):</b> savings ${inr(m.savings)} ÷ monthly bills ${inr(m.obligations)} = ${m.coverage.toFixed(1)} months. Full marks at 4 months.`,
                `<b>Savings vs expenses (20):</b> ${inr(m.savings)} ÷ ${inr(m.expenses)} = ${m.savingsVsExpenses.toFixed(1)}×. Full marks at 3×.`,
                `<b>EMI burden (20):</b> EMI is ${Math.round(m.emiRatio * 100)}% of income. Full marks at 25% or less, zero at 55%.`,
                `<b>Amount kept (15):</b> ${inr(m.net)} left plus ${inr(m.sip)} SIP is ${Math.round(m.savingsRate * 100)}% of income. Full marks at 15%.`,
                `<b>Spending trend (10):</b> spending changed ${m.trendPct.toFixed(1)}% vs last month. Full marks if it did not rise, zero at +15%.`
            ]
        )
    });
}
