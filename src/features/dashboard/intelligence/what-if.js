import { fiCard, levelBadge, inr, signedInr } from "./shared.js";
import { core, scenarioFromControls } from "./engine.js";
import { EMERGENCIES } from "./example-data.js";

const DEFAULTS = { salary: -20, expense: 0, emergency: "none" };

const pctText = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n) + "%";

/* Result block, used for the first paint and after every change. */
function resultHtml(scenario, base) {
    const s = core(scenario.data, scenario.values);
    const diff = s.endBalance - base.endBalance;

    return `
        <span class="br-stat-label">Projected balance next month</span>
        <strong class="br-fi-value ${s.endBalance < 0 ? "br-text-danger" : ""}">${inr(s.endBalance)}</strong>
        <small class="${diff < 0 ? "br-text-danger" : diff > 0 ? "br-text-success" : "br-text-muted"}">
            ${diff === 0 ? "Same as today's forecast" : `${signedInr(diff)} vs today's forecast`}
        </small>
        <ul class="br-fi-rows">
            <li><span>Each month</span><b class="${s.net < 0 ? "br-text-danger" : ""}">${signedInr(s.net)}</b></li>
            <li><span>EMI share of income</span><b>${Math.round(s.emiRatio * 100)}%</b></li>
            <li><span>Overall risk</span><span class="br-badge ${levelBadge(s.overall)}">${s.overall}</span></li>
            <li><span>Financial health</span><b>${s.health.status} · ${s.health.score}</b></li>
        </ul>
    `;
}

export function renderWhatIf(model) {
    const { m, data } = model;
    const values = scenarioFromControls(DEFAULTS.salary, DEFAULTS.expense, DEFAULTS.emergency);

    return fiCard({
        key: "what-if",
        tier: "secondary",
        span: 7,
        title: "What-if simulator",
        subtitle: "Explore how changes could affect your finances.",
        iconName: "sliders-horizontal",
        body: `
            <div class="br-fi-whatif">
                <div class="br-fi-controls">
                    <div class="br-fi-control">
                        <label for="br-fi-salary">Salary change</label>
                        <output class="br-fi-pill" data-out="salary">${pctText(DEFAULTS.salary)}</output>
                        <input id="br-fi-salary" type="range" min="-50" max="50" step="5" value="${DEFAULTS.salary}">
                    </div>

                    <div class="br-fi-control">
                        <label for="br-fi-expense">Expense change</label>
                        <output class="br-fi-pill" data-out="expense">${pctText(DEFAULTS.expense)}</output>
                        <input id="br-fi-expense" type="range" min="-30" max="50" step="5" value="${DEFAULTS.expense}">
                    </div>

                    <div class="br-fi-control">
                        <label for="br-fi-emergency">Emergency scenario</label>
                        <select id="br-fi-emergency" class="br-select">
                            ${Object.entries(EMERGENCIES).map(([k, e]) =>
                                `<option value="${k}">${e.label}</option>`).join("")}
                        </select>
                    </div>
                </div>

                <div class="br-fi-result" data-fi-result aria-live="polite">
                    ${resultHtml({ data, values }, m)}
                </div>
            </div>
        `
    });
}

export function bindWhatIf(root, model) {
    const card = root.querySelector('[data-fi="what-if"]');
    if (!card) return;

    const salary = card.querySelector("#br-fi-salary");
    const expense = card.querySelector("#br-fi-expense");
    const emergency = card.querySelector("#br-fi-emergency");
    const result = card.querySelector("[data-fi-result]");

    function update() {
        card.querySelector('[data-out="salary"]').textContent = pctText(+salary.value);
        card.querySelector('[data-out="expense"]').textContent = pctText(+expense.value);

        const values = scenarioFromControls(+salary.value, +expense.value, emergency.value);
        result.innerHTML = resultHtml({ data: model.data, values }, model.m);
    }

    [salary, expense, emergency].forEach((el) => el.addEventListener("input", update));
}
