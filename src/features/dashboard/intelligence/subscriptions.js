import { fiCard, how, inr } from "./shared.js";

export function renderSubscriptions(model) {
    const s = model.subs;

    return fiCard({
        key: "subscriptions",
        tier: "supporting",
        span: 4,
        half: true,
        title: "Subscription detector",
        subtitle: "Recurring payments found in your transactions.",
        iconName: "refresh-cw",
        body: `
            <ul class="br-fi-rows br-fi-subs">
                ${s.found.map((x) => `
                    <li>
                        <div>
                            <b>${x.name}</b>
                            <small>Every month · ${x.count} months</small>
                        </div>
                        <strong>${inr(x.amount)}</strong>
                    </li>`).join("")}
            </ul>

            <div class="br-fi-stats">
                <div class="br-fi-stat"><span class="br-stat-label">Per month</span><strong>${inr(s.monthly)}</strong></div>
                <div class="br-fi-stat"><span class="br-stat-label">Per year</span><strong>${inr(s.yearly)}</strong></div>
            </div>
        `,
        how: how(
            `${s.checked} merchants in the example transactions were checked. A merchant counts as a subscription only if all three rules pass.`,
            [
                `At least 3 payments to the same merchant.`,
                `Every payment is the same amount (within 5%).`,
                `Payments arrive about a month apart (26 to 35 days), and no gap differs from the average by more than 4 days.`,
                `FoodNow and CityCab are skipped: their amounts and dates vary.`
            ]
        )
    });
}
