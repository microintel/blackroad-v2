/* =========================================================
   ROADSYNC  (own page under Overview)
   Explains the RoadSync workflow.
   Display only for now: nothing is processed or imported yet.
   ========================================================= */

import { icon } from "../../components/icons.js";

const STEPS = [
    { icon: "file-up", who: "you", title: "Upload documents + prompt", sub: "Statements, reports and history images, plus the BlackRoad prompt" },
    { icon: "brain-circuit", who: "ai", title: "AI process", sub: "AI reads the documents and extracts the data" },
    { icon: "file-check", who: "ai", title: "Extracted data file", sub: "AI returns one BlackRoad data file" },
    { icon: "shield-check", who: "br", title: "Validation", sub: "Dates, amounts and duplicates are checked" },
    { icon: "list-checks", who: "br", title: "Preview & review", sub: "See every record before it is saved" },
    { icon: "circle-check", who: "you", title: "User approval", sub: "You approve what gets imported" },
    { icon: "download", who: "br", title: "Import to BlackRoad", sub: "Approved records are added to your data" },
    { icon: "clipboard-check", who: "br", title: "Import summary", sub: "What was added, skipped or left out" }
];

const WHO = { you: "You", ai: "AI", br: "BlackRoad" };

function esc(v) {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/* ---------------- Roadmap ---------------- */

const ROW = 150;

function roadmapHTML() {
    const n = STEPS.length;
    const xs = STEPS.map((_, i) => (i % 2 === 0 ? 20 : 80));
    const ys = STEPS.map((_, i) => ROW * i + ROW / 2);

    let d = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < n; i++) {
        const mid = (ys[i - 1] + ys[i]) / 2;
        d += ` C ${xs[i - 1]} ${mid}, ${xs[i]} ${mid}, ${xs[i]} ${ys[i]}`;
    }

    return `
        <div class="rs-road" style="--rows:${n}; --row:${ROW}px">
            <svg class="rs-road-svg" viewBox="0 0 100 ${ROW * n}" preserveAspectRatio="none" aria-hidden="true">
                <path class="rs-road-bed" d="${d}" pathLength="1" vector-effect="non-scaling-stroke"/>
                <path class="rs-road-line" d="${d}" pathLength="1" vector-effect="non-scaling-stroke"/>
            </svg>
            <ol class="rs-stops">
                ${STEPS.map((st, i) => `
                    <li class="rs-stop who-${st.who} ${i % 2 === 0 ? "is-left" : "is-right"}" style="--i:${i}; --x:${xs[i]}%">
                        <span class="rs-node">${icon(st.icon, { size: 34 })}<em>${i + 1}</em></span>
                        <span class="rs-stop-text">
                            <span class="rs-who who-${st.who}">${WHO[st.who]}</span>
                            <b>${esc(st.title)}</b>
                            <small>${esc(st.sub)}</small>
                        </span>
                    </li>`).join("")}
            </ol>
        </div>`;
}

/* ---------------- Page ---------------- */

export async function RoadSync() {
    const page = document.createElement("section");
    page.className = "br-page rs-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>RoadSync</h2>
                <p>Turn statements, reports and screenshots into BlackRoad data with AI.</p>
            </div>
        </div>

        <section class="br-card rs-page-card">
            <div class="rs-head">
                <span class="rs-ai-badge rs-ai-badge--sm" aria-hidden="true">${icon("brain-circuit", { size: 18 })}<i>AI</i></span>
                <div class="rs-head-text">
                    <h3>How it works</h3>
                    <p>Eight steps from your documents to your data. Nothing is saved until you approve it.</p>
                </div>
            </div>
            <div class="rs-body">
                ${roadmapHTML()}
            </div>
        </section>
    `;

    return page;
}
