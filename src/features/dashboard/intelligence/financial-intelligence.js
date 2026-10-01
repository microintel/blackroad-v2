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
                    ? "Calculated from your income, loans, deposits and holdings, using your last full months."
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


/* =========================================================
   FINANCIAL INTELLIGENCE PAGE (Tools > Financial Intelligence)
   One tab per group, like Income's Ledger / Statement / Compare,
   so only one group is on screen at a time.
   ========================================================= */

const TAB_LABEL = {
    health: "Health",
    risk: "Risk",
    planning: "Planning",
    supporting: "Savings",
    timeline: "Timeline",
    explanations: "Insights"
};

let currentFiTab = GROUPS[0].key;

export async function FinancialIntelligencePage() {
    const root = await FinancialIntelligence();

    const page = document.createElement("section");
    page.className = "br-page";

    const heading = root.querySelector(".br-fi-heading");
    const groups = [...root.querySelectorAll("[data-fi-group]")];

    if (!groups.some((g) => g.dataset.fiGroup === currentFiTab)) {
        currentFiTab = GROUPS[0].key;
    }

    page.innerHTML = `
        <div class="br-income-tabs br-tabs-flat" role="group" aria-label="Financial intelligence views">
            ${GROUPS.map((g) => `
                <button type="button"
                    class="br-income-tab${g.key === currentFiTab ? " active" : ""}"
                    data-fi-tab="${g.key}"
                    aria-pressed="${g.key === currentFiTab}">${TAB_LABEL[g.key] || g.title}</button>`).join("")}
        </div>
    `;

    root.style.marginTop = "0";
    root.insertBefore(page.firstElementChild, heading);

    const show = (key) => {
        currentFiTab = key;
        groups.forEach((g) => { g.hidden = g.dataset.fiGroup !== key; });
        root.querySelectorAll("[data-fi-tab]").forEach((b) => {
            const on = b.dataset.fiTab === key;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
        });
    };

    root.querySelectorAll("[data-fi-tab]").forEach((b) => {
        b.addEventListener("click", () => show(b.dataset.fiTab));
    });

    show(currentFiTab);

    page.innerHTML = "";
    page.appendChild(root);

    return page;
}
