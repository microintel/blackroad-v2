import { fiCard, fiStat, fiBar, inr } from "./shared.js";

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

            ${fiBar((months / TARGET) * 100, months < 3 ? "danger" : months < TARGET ? "warning" : "")}
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
        `
    });
}
