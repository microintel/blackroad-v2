import { fiCard, how, fiBar, inr } from "./shared.js";

export function renderGoals(model) {
    const { goals, surplus } = model.goals;

    return fiCard({
        key: "goals",
        tier: "secondary",
        span: 6,
        half: true,
        title: "Goal intelligence",
        subtitle: "What it takes to reach what you're saving for.",
        iconName: "coins",
        body: !goals.length
            ? `<div class="br-fi-note"><p>No savings goals yet. Goals you add will show the monthly amount needed and whether your surplus covers it.</p></div>`
            : `
            ${goals.map((g) => `
                <div class="br-fi-goal">
                    <div class="br-fi-goal-head">
                        <strong>${g.name}</strong>
                        <span class="br-fi-goal-amount">${inr(g.target)}</span>
                    </div>
                    ${fiBar(g.progress)}
                    <div class="br-fi-goal-meta">
                        <span>${inr(g.saved)} saved · ${g.progress}%</span>
                        <span>Target ${g.months} months</span>
                    </div>
                    <div class="br-fi-goal-need">
                        <span>Save <b>${inr(g.required)}</b> a month</span>
                        <span class="br-badge ${g.fits ? "br-badge-success" : "br-badge-warning"}">
                            ${g.fits ? "Fits your surplus" : `Short by ${inr(g.short)}/mo`}
                        </span>
                    </div>
                </div>`).join("")}
        `,
        how: how(
            "For each goal: what is still missing, spread evenly over the months left. Goals are checked in order against the monthly surplus.",
            goals.map((g) =>
                `<b>${g.name}:</b> (${inr(g.target)} − ${inr(g.saved)}) ÷ ${g.months} months = ${inr(g.required)} a month.`
            ).concat([
                `Monthly surplus available: ${inr(surplus)}. Each goal uses part of it, so later goals see what is left.`
            ])
        )
    });
}
