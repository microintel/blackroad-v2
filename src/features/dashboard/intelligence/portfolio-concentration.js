import { fiCard, how, inr } from "./shared.js";

const CIRC = 2 * Math.PI * 52;
const SERIES = [1, 2, 3, 6];

export function renderPortfolioConcentration(model) {
    const p = model.portfolio;
    let offset = 0;

    if (p.empty) {
        return fiCard({
            key: "portfolio-concentration", tier: "supporting", span: 4,
            title: "Portfolio concentration",
            subtitle: "Sector exposure across your investments.",
            iconName: "chart-pie",
            body: `<div class="br-fi-note"><p>No stock holdings yet. Once you add some in Stocks, you will see how much sits in each sector.</p></div>`
        });
    }

    const segs = p.sectors.map((s, i) => {
        const len = (s.pct / 100) * CIRC;
        const out = `<circle class="br-fi-seg br-fi-seg-${SERIES[i % 4]}" cx="66" cy="66" r="52"
            stroke-dasharray="${len.toFixed(1)} ${(CIRC - len).toFixed(1)}"
            stroke-dashoffset="${(-offset).toFixed(1)}"></circle>`;
        offset += len;
        return out;
    }).join("");

    return fiCard({
        key: "portfolio-concentration",
        tier: "supporting",
        span: 4,
        title: "Portfolio concentration",
        subtitle: "Sector exposure across your investments.",
        iconName: "chart-pie",
        body: `
            <div class="br-fi-portfolio">
                <div class="br-fi-ring br-fi-ring-sm" role="img"
                    aria-label="Sector split of ${inr(p.total)}">
                    <svg viewBox="0 0 132 132" aria-hidden="true">
                        <circle class="br-fi-ring-track" cx="66" cy="66" r="52"></circle>
                        ${segs}
                    </svg>
                    <div class="br-fi-ring-center"><small>Sectors</small></div>
                </div>

                <ul class="br-fi-rows">
                    ${p.sectors.map((s, i) => `
                        <li>
                            <span class="br-fi-key"><i class="br-fi-dot br-fi-dot-${SERIES[i % 4]}"></i>${s.name}</span>
                            <b>${Math.round(s.pct)}%</b>
                        </li>`).join("")}
                </ul>
            </div>

            <div class="br-fi-note">
                <p>${p.concentrated
                    ? `${Math.round(p.top.pct)}% of your investments are concentrated in one sector (${p.top.name}).`
                    : `No single sector holds more than 35%.`}</p>
            </div>
        `,
        how: how(
            "Each holding is added to its sector. A sector's share is its value divided by the whole portfolio. Any sector at 35% or more is flagged.",
            [
                `Portfolio total: ${inr(p.total)}.`,
                ...p.sectors.map((s) => `${s.name}: ${inr(s.value)} ÷ ${inr(p.total)} = ${Math.round(s.pct)}%.`)
            ]
        )
    });
}
