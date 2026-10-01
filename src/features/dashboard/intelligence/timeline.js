import { fiCard, inr, signedInr } from "./shared.js";

export function renderTimeline(model) {
    const { m } = model;
    const nodes = [
        ...m.events.map((e) => ({
            name: e.label,
            amount: signedInr(e.amount),
            tone: e.amount < 0 ? "br-text-danger" : "br-text-success",
            note: `Day ${e.day} · balance ${inr(e.balance)}`
        })),
        {
            name: "Projected balance",
            amount: inr(m.endBalance),
            tone: m.endBalance < 0 ? "br-text-danger" : "",
            note: "End of month",
            final: true
        }
    ];

    return fiCard({
        key: "timeline",
        tier: "analytical",
        span: 12,
        title: "Financial timeline",
        subtitle: "How money moves through your month.",
        iconName: "calendar-days",
        body: `
            <ol class="br-fi-timeline" style="--n:${nodes.length}">
                ${nodes.map((n) => `
                    <li class="br-fi-node${n.final ? " br-fi-node-final" : n.tone.includes("danger") ? " br-fi-node-out" : " br-fi-node-in"}">
                        <strong>${n.name}</strong>
                        <span class="br-fi-node-amount ${n.tone}">${n.amount}</span>
                        <small>${n.note}</small>
                    </li>`).join("")}
            </ol>
        `
    });
}
