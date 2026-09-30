import { fiCard, how, inr, signedInr } from "./shared.js";

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
        <svg class="br-fi-line ${down ? "is-down" : ""}" viewBox="0 0 ${W} ${H}"
            preserveAspectRatio="none" role="img"
            aria-label="Projected balance over the next six months">
            <line class="zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"></line>
            <polyline points="${pts}" fill="none"></polyline>
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
        `,
        how: how(
            "The forecast repeats this month's income and payments. Each month's change is income minus every payment. It does not include one-off costs or changes in income.",
            [
                `Income ${inr(m.income)} − EMI ${inr(m.emi)} − SIP ${inr(m.sip)} − rent ${inr(m.rent)} − everyday spending ${inr(m.variable)} = <b>${signedInr(m.net)}</b> a month.`,
                `Balance today ${inr(m.opening)} + ${signedInr(m.net)} = <b>${inr(next)}</b> next month; the chart adds the same amount again for each month after.`,
                `Lowest point: the balance is checked after every payment date in the timeline below, and the smallest value is shown.`
            ]
        )
    });
}
