/* =========================================================
   FINANCIAL INTELLIGENCE
   Each feature lives in its own file and renders one card.
   Numbers come from engine.js, run on EXAMPLE_DATA. Nothing
   here reads your accounts, stores or services.
   ========================================================= */

import { EXAMPLE_DATA } from "./example-data.js";
import { analyze } from "./engine.js";
import { loadLiveData } from "./live-data.js";

import { renderHealth } from "./health.js";
import { renderCashFlow } from "./cash-flow.js";
import { renderRisk } from "./risk.js";
import { renderWhatIf, bindWhatIf } from "./what-if.js";
import { renderGoals } from "./goals.js";
import { renderDebt } from "./debt.js";
import { renderSubscriptions } from "./subscriptions.js";
import { renderEmergencyFund } from "./emergency-fund.js";
import { renderPortfolioConcentration } from "./portfolio-concentration.js";
import { renderTimeline } from "./timeline.js";
import { renderExplainableInsights } from "./explainable-insights.js";
import { renderWhatChanged } from "./what-changed.js";

const GROUPS = [
    { key: "health", title: "Health and cash flow", cards: [renderHealth, renderCashFlow] },
    { key: "risk", title: "Risk and scenarios", cards: [renderRisk, renderWhatIf] },
    { key: "planning", title: "Planning", cards: [renderGoals, renderDebt] },
    {
        key: "supporting",
        title: "Savings, subscriptions and investments",
        cards: [renderEmergencyFund, renderSubscriptions, renderPortfolioConcentration]
    },
    { key: "timeline", title: "Month ahead", cards: [renderTimeline] },
    {
        key: "explanations",
        title: "What is driving your numbers",
        cards: [renderExplainableInsights, renderWhatChanged]
    }
];

export async function FinancialIntelligence(data) {
    let live = data || null;

    if (!live) {
        try {
            live = await loadLiveData();
        } catch (error) {
            console.error("BlackRoad financial intelligence:", error);
        }
    }

    const isLive = Boolean(live);
    const model = analyze(live || EXAMPLE_DATA);
    const section = document.createElement("section");

    section.className = "br-fi";
    section.setAttribute("aria-labelledby", "br-fi-title");
    section.dataset.fiRoot = "";

    section.innerHTML = `
        <div class="br-page-heading br-fi-heading">
            <div>
                <h2 id="br-fi-title">Financial intelligence</h2>
                <p>${isLive
                    ? "Calculated from your income, loans, deposits and holdings, using your last full months. Open “How this works” on any card to see the rule and the numbers behind it."
                    : "Not enough of your data yet, so these cards show an example household. Add at least one full month of income entries to see your own numbers."}</p>
            </div>
            <span class="br-badge ${isLive ? "br-badge-success" : "br-badge-info"}">${isLive ? "Your data" : "Example data"}</span>
        </div>

        ${GROUPS.map((group) => `
            <div class="br-fi-group" data-fi-group="${group.key}">
                <h3 class="br-fi-group-title">${group.title}</h3>
                <div class="br-grid br-fi-grid">
                    ${group.cards.map((render) => render(model)).join("")}
                </div>
            </div>`).join("")}
    `;

    bindWhatIf(section, model);

    return section;
}
