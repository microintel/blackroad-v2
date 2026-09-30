import { fiCard, how, inr, signedInr } from "./shared.js";

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
                    <li class="br-fi-node${n.final ? " br-fi-node-final" : ""}">
                        <strong>${n.name}</strong>
                        <span class="br-fi-node-amount ${n.tone}">${n.amount}</span>
                        <small>${n.note}</small>
                    </li>`).join("")}
            </ol>
        `,
        how: how(
            "Every income and payment is placed on its day of the month, and the balance is updated after each one.",
            [
                `Start of month: ${inr(m.opening)}.`,
                ...m.events.map((e) => `Day ${e.day}, ${e.label}: ${signedInr(e.amount)} → balance ${inr(e.balance)}.`),
                `The last step is the projected balance at the end of the month.`
            ]
        )
    });
}
