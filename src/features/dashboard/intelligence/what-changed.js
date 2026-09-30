import { fiCard, how, inr, signedInr, signedPct } from "./shared.js";
import { icon } from "../../../components/icons.js";

export function renderWhatChanged(model) {
    const c = model.changes;
    const max = Math.max(...c.rows.map((r) => Math.max(r.before, r.after)));
    const names = c.drivers.map((d) => d.name.toLowerCase()).join(" and ");

    return fiCard({
        key: "what-changed",
        tier: "analytical",
        span: 5,
        title: "What changed",
        subtitle: "This month vs previous month.",
        iconName: "refresh-cw",
        body: `
            <ul class="br-fi-changes">
                ${c.rows.map((r) => `
                    <li>
                        <div class="br-fi-change-head">
                            <span>${r.name}</span>
                            <b class="br-fi-change ${r.delta > 0 ? "br-text-danger" : r.delta < 0 ? "br-text-success" : ""}">
                                ${icon(r.delta >= 0 ? "arrow-up-right" : "arrow-down-right", { size: 14 })}${signedPct(r.pct)}
                            </b>
                        </div>
                        <div class="br-fi-pair" role="img"
                            aria-label="${r.name}: ${inr(r.before)} before, ${inr(r.after)} now">
                            <span class="before" style="width:${(r.before / max) * 100}%"></span>
                            <span class="after" style="width:${(r.after / max) * 100}%"></span>
                        </div>
                        <small class="br-text-muted">${inr(r.before)} → ${inr(r.after)} (${signedInr(r.delta)})</small>
                    </li>`).join("")}
            </ul>

            <div class="br-fi-note">
                <p>Your everyday spending ${c.delta >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(c.pct))}% (${signedInr(c.delta)})${names ? `, mainly because ${names} increased` : ""}.</p>
            </div>
        `,
        how: how(
            "Each category is compared with the same category last month. The summary names the two categories that added the most rupees.",
            [
                `Change % = this month ÷ last month − 1, per category.`,
                `Total everyday spending: ${inr(c.before)} → ${inr(c.after)} = ${signedInr(c.delta)} (${signedPct(c.pct)}). Rent and EMI are fixed and not included.`,
                `Bars: pale = last month, gold = this month, on the same scale.`
            ]
        )
    });
}
