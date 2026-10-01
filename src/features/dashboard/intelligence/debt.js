import { fiCard, fiStat, fiBar, inr } from "./shared.js";

const label = (n) => (Number.isFinite(n) ? `${n} months` : "Never");

export function renderDebt(model) {
    const d = model.debt;
    const max = d.current.months || 1;
    const empty = (text) => fiCard({
        key: "debt", tier: "secondary", span: 6, half: true,
        title: "Debt payoff", subtitle: "See how extra payments change your loan.",
        iconName: "arrow-left-right",
        body: `<div class="br-fi-note"><p>${text}</p></div>`
    });

    if (!d.hasLoan) {
        return empty("No active loan with an EMI yet. Add one in Lending to see how extra payments shorten it.");
    }

    if (d.stuck) {
        return empty(`Your EMI of ${inr(d.loan.emi)} does not cover the monthly interest at ${d.loan.annualRate}%, so this loan would never clear. Check the rate and EMI in Lending.`);
    }

    return fiCard({
        key: "debt",
        tier: "secondary",
        span: 6,
        half: true,
        title: "Debt payoff",
        subtitle: "See how extra payments change your loan.",
        iconName: "arrow-left-right",
        body: `
            <div class="br-fi-stats br-fi-stats-3">
                ${fiStat("Current duration", label(d.current.months))}
                ${fiStat("Extra monthly payment", inr(d.extra))}
                ${fiStat("New duration", label(d.faster.months))}
            </div>

            <div class="br-fi-compare">
                <div>
                    <span>Today</span>
                    ${fiBar(100)}
                    <b>${inr(d.current.interest)} interest</b>
                </div>
                <div>
                    <span>With extra</span>
                    ${fiBar((d.faster.months / max) * 100)}
                    <b>${inr(d.faster.interest)} interest</b>
                </div>
            </div>

            <div class="br-fi-note">
                <p>Paying ${inr(d.extra)} extra each month finishes the loan ${d.monthsSaved} month${d.monthsSaved === 1 ? "" : "s"} sooner and saves about ${inr(d.interestSaved)} in interest.</p>
            </div>
        `
    });
}
