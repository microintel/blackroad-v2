import { fiCard, how } from "./shared.js";

export function renderExplainableInsights(model) {
    return fiCard({
        key: "explainable-insights",
        tier: "analytical",
        span: 7,
        title: "Explainable insights",
        subtitle: "The reasons behind changes in your finances.",
        iconName: "search",
        body: `
            <div class="br-fi-insights">
                ${model.insights.map((i) => `
                    <article class="br-fi-insight">
                        <h4>${i.title}</h4>
                        <p>${i.body}</p>
                        ${i.factors.length ? `<ul>${i.factors.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
                    </article>`).join("")}
            </div>
        `,
        how: how(
            "Each insight is written from the numbers in the other cards, so every sentence can be traced back to a figure. Nothing is guessed.",
            [
                `<b>Health change:</b> the score is calculated twice, once with last month's spending and once with this month's. The gap and the biggest category changes are reported.`,
                `<b>Risk:</b> lists the risk checks that are Medium or High, using the same wording as the Risk card.`,
                `<b>Subscriptions and portfolio:</b> shown only when the detector finds recurring payments or a sector reaches 35%.`
            ]
        )
    });
}
