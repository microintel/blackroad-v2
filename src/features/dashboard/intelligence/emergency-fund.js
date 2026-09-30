import { fiCard, how, fiStat, fiBar, inr } from "./shared.js";

const TARGET = 6;

export function renderEmergencyFund(model) {
    const { m } = model;
    const months = m.coverage;
    const shortfall = Math.max(TARGET * m.obligations - m.savings, 0);

    return fiCard({
        key: "emergency-fund",
        tier: "supporting",
        span: 4,
        half: true,
        title: "Emergency fund",
        subtitle: "How long your savings could last.",
        iconName: "landmark",
        body: `
            <div class="br-fi-figure">
                <span class="br-stat-label">Current coverage</span>
                <strong class="br-fi-value">${months.toFixed(1)} months</strong>
            </div>

            ${fiBar((months / TARGET) * 100)}
            <div class="br-fi-goal-meta"><span>0</span><span>Target ${TARGET} months</span></div>

            <div class="br-fi-stats">
                ${fiStat("Monthly bills", inr(m.obligations))}
                ${fiStat("Savings available", inr(m.savings))}
            </div>

            <div class="br-fi-note">
                <p>${shortfall > 0
                    ? `${inr(shortfall)} more would reach a ${TARGET}-month cushion.`
                    : `You already have a ${TARGET}-month cushion.`}</p>
            </div>
        `,
        how: how(
            "Coverage is how many months your savings could pay the bills you cannot skip if income stopped.",
            [
                `Monthly bills = rent ${inr(m.rent)} + everyday spending ${inr(m.variable)} + EMI ${inr(m.emi)} = ${inr(m.obligations)}. SIP is left out because it can be paused.`,
                `Coverage = ${inr(m.savings)} ÷ ${inr(m.obligations)} = ${months.toFixed(1)} months.`,
                `The usual target is ${TARGET} months: ${TARGET} × ${inr(m.obligations)} = ${inr(TARGET * m.obligations)}.`
            ]
        )
    });
}
