import { fiCard, inr, signedInr } from "./shared.js";
import { tipAttr } from "../../../components/chart-tooltip.js";

const LABELS = ["Next month", "+2", "+3", "+4", "+5", "+6"];

function chart(values) {
    const W = 400, H = 150, padX = 16, padTop = 14, padBottom = 14;
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const span = hi - lo || 1;
    const x = (i) => padX + (i / (values.length - 1)) * (W - padX * 2);
    const y = (v) => padTop + (1 - (v - lo) / span) * (H - padTop - padBottom);

    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const down = values[values.length - 1] < values[0];

    return `
        <svg class="br-fi-line br-tip-scrub ${down ? "is-down" : ""}" viewBox="0 0 ${W} ${H}"
            preserveAspectRatio="none" role="img"
            aria-label="Projected balance over the next six months">
            <line class="zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"></line>
            <polygon class="area" points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${pts} ${x(values.length - 1).toFixed(1)},${y(0).toFixed(1)}"></polygon>
            <polyline points="${pts}" fill="none"></polyline>
            ${values.map((v, i) => {
                const bw = (W - padX * 2) / Math.max(values.length - 1, 1);
                return `<rect class="br-tip-hit" x="${(x(i) - bw / 2).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" ${tipAttr(LABELS[i] || "", [["Projected balance", inr(v)]])}></rect>`;
            }).join("")}
        </svg>
        <div class="br-fi-axis">${LABELS.map((l) => `<span>${l}</span>`).join("")}</div>
    `;
}

export function renderCashFlow(model) {
    const { m } = model;
    const next = m.forecast[0];
    const low = m.lowest;
    const dips = low.balance < m.opening;

    return fiCard({
        key: "cash-flow",
        tier: "primary",
        span: 7,
        title: "Cash flow forecast",
        subtitle: "Where your balance is heading.",
        iconName: "trending-up",
        body: `
            <div class="br-fi-figure">
                <span class="br-stat-label">Projected balance, end of next month</span>
                <strong class="br-fi-value ${next < 0 ? "br-text-danger" : ""}">${inr(next)}</strong>
            </div>

            <div class="br-fi-chart">${chart(m.forecast)}</div>

            <div class="br-fi-stats">
                <div class="br-fi-stat">
                    <span class="br-stat-label">Each month</span>
                    <strong class="${m.net < 0 ? "br-text-danger" : "br-text-success"}">${signedInr(m.net)}</strong>
                </div>
                <div class="br-fi-stat">
                    <span class="br-stat-label">Lowest point next month</span>
                    <strong>${inr(low.balance)}</strong>
                    <small class="br-text-muted">${dips ? low.label : "Never dips below today's balance"}</small>
                </div>
            </div>
        `
    });
}
