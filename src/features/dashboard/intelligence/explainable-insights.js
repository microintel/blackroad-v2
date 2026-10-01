import { fiCard } from "./shared.js";

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
        `
    });
}
