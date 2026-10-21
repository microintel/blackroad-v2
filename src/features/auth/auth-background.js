/* Login / Register visuals (desktop).
   - The page background is a flat, faint dot grid.
   - The left panel carries a looping showcase under the tagline "A Road to Your
     Financial Wealth": seven feature icons orbit the BlackRoad mark; each one
     lights up in turn while its name and a one-line description change beside it. Flat colour only (the
     logo's green and white; no gradients, glow or blur). It is decoration only:
     aria-hidden, never takes clicks that matter, and cannot affect the forms.
   The animation itself is CSS (see auth.css); the small script below only
   moves the highlight from one feature to the next. */

import { icon, roverMark } from "../../components/icons.js";

const STEP_MS = 2600;      // how long each feature stays highlighted

const FEATURES = [
    { name: "Mutual Fund",      icon: "chart-no-axes-combined", text: "SIPs, step-ups and fund returns, tracked in one place." },
    { name: "Stocks",           icon: "chart-candlestick",      text: "Holdings, trades and profit & loss, always up to date." },
    { name: "Income Statement", icon: "wallet",                 text: "Record income and expenses and see where your money goes." },
    { name: "Calculators",      icon: "calculator",             text: "SIP, step-up, lumpsum, goal and withdrawal planners." },
    { name: "Lending",          icon: "arrow-left-right",       text: "Keep track of money you lend and money you owe." },
    { name: "Reports",          icon: "file-chart-column",      text: "Read brokerage reports and keep clean statements." },
    { name: "Rover",            rover: true,                    text: "Ask your money questions in plain words and get answers." }
];

export function authBackground() {
    return `<div class="br-auth-bg" aria-hidden="true"></div>`;
}

export function authShowcase() {
    const n = FEATURES.length;
    const pad = (v) => String(v).padStart(2, "0");

    const nodes = FEATURES.map((f, i) => `
        <div class="br-orbit-node" data-i="${i}" style="--a:${(360 / n) * i - 90}deg">
            <div class="br-orbit-tile">
                <div class="br-orbit-chip${f.rover ? " is-rover" : ""}">${f.rover ? roverMark(20) : icon(f.icon, { size: 20, stroke: 1.8 })}</div>
            </div>
        </div>`).join("");

    const dots = FEATURES.map((_, i) => `<i data-dot="${i}"></i>`).join("");

    return `<div class="br-auth-stage" aria-hidden="true" data-showcase>
        <div class="br-stage-title">A Road to Your <span>Financial Wealth</span></div>
        <div class="br-orbit">
            <div class="br-orbit-core"><div class="br-brand-logo"></div></div>
            <div class="br-orbit-ring">${nodes}</div>
        </div>
        <div class="br-stage-info">
            <div class="br-stage-swap" data-swap>
                <span class="br-stage-count" data-count>${pad(1)} / ${pad(n)}</span>
                <div class="br-stage-name" data-name>${FEATURES[0].name}</div>
                <p class="br-stage-text" data-text>${FEATURES[0].text}</p>
            </div>
            <div class="br-stage-dots">${dots}</div>
        </div>
    </div>`;
}

/* Moves the highlight on every STEP_MS, and lets a hover pick a feature
   (rotation pauses while the pointer is over the orbit). */
export function startShowcase(root) {
    const stage = root.querySelector("[data-showcase]");
    if (!stage) return;

    const nodes = [...stage.querySelectorAll(".br-orbit-node")];
    const dots = [...stage.querySelectorAll("[data-dot]")];
    const swap = stage.querySelector("[data-swap]");
    const nameEl = stage.querySelector("[data-name]");
    const textEl = stage.querySelector("[data-text]");
    const countEl = stage.querySelector("[data-count]");
    const n = FEATURES.length;

    let index = -1;
    let timer = 0;
    let hovering = false;

    const restart = (el) => {          // replay a CSS animation
        el.style.animation = "none";
        void el.offsetWidth;
        el.style.animation = "";
    };

    const show = (i) => {
        if (i === index) return;
        index = i;
        const f = FEATURES[i];

        nodes.forEach((el, k) => el.classList.toggle("is-on", k === i));
        dots.forEach((el, k) => el.classList.toggle("is-on", k === i));

        nameEl.textContent = f.name;
        textEl.textContent = f.text;
        countEl.textContent = `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;

        restart(swap);
    };

    const next = () => {
        if (!root.isConnected) return stop();
        if (hovering || document.hidden || !stage.offsetParent) return;
        show((index + 1) % n);
    };

    function stop() { clearInterval(timer); }

    stage.querySelector(".br-orbit").addEventListener("pointerenter", () => { hovering = true; stage.classList.add("is-paused"); });
    stage.querySelector(".br-orbit").addEventListener("pointerleave", () => { hovering = false; stage.classList.remove("is-paused"); });
    nodes.forEach((el, i) => el.addEventListener("pointerenter", () => show(i)));

    show(0);
    timer = setInterval(next, STEP_MS);
}
