import { icon } from "../../components/icons.js";

/* Indian brokers whose statements / reports you may want to read.
   Each card opens the broker's own site in a new tab.
   The logo is the broker's own icon, loaded from its domain. To use a
   local image instead, add  logo: "./assets/images/brokers/zerodha.png"
   to a broker below. If an image cannot load, the first letter is shown. */
const BROKERS = [
    { name: "Zerodha", domain: "zerodha.com", note: "Console: P&L, holdings and tradebook reports", url: "https://console.zerodha.com", cta: "Open Console" },
    { name: "Groww", domain: "groww.in", note: "Stocks and mutual fund statements", url: "https://groww.in", cta: "Open Groww" },
    { name: "Angel One", domain: "angelone.in", note: "Trading and portfolio reports", url: "https://www.angelone.in", cta: "Open Angel One" },
    { name: "Upstox", domain: "upstox.com", note: "Trade and P&L statements", url: "https://upstox.com", cta: "Open Upstox" },
    { name: "ICICI Direct", domain: "icicidirect.com", note: "Account and transaction statements", url: "https://www.icicidirect.com", cta: "Open ICICI Direct" },
    { name: "HDFC Securities", domain: "hdfcsec.com", note: "Contract notes and holdings", url: "https://www.hdfcsec.com", cta: "Open HDFC Securities" },
    { name: "Kotak Securities", domain: "kotaksecurities.com", note: "Reports and ledger statements", url: "https://www.kotaksecurities.com", cta: "Open Kotak Securities" }
];

const logoSrc = (b) =>
    b.logo || "https://www.google.com/s2/favicons?sz=128&domain=" + encodeURIComponent(b.domain);

/* Reports listed for every broker. Each one shows "working on it" for now. */
const REPORTS = [
    { id: "pnl", label: "Profit & Loss", note: "Realised and unrealised gains", icon: "trending-up" },
    { id: "trades", label: "Trades & Charges", note: "Every trade with brokerage and taxes", icon: "receipt" },
    { id: "mf", label: "Mutual Funds", note: "SIP and fund order statements", icon: "chart-pie" },
    { id: "holdings", label: "Holdings", note: "Stocks you currently hold", icon: "briefcase-business" },
    { id: "ledger", label: "Ledger", note: "Funds added, withdrawn and charged", icon: "banknote" }
];

/* Reports that have a working reader. Everything else shows "Working on it". */
const hasReader = (b, reportId) => b.name === "Angel One" && reportId === "pnl";

const esc = (v) =>
    String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

const logoHTML = (b, size = "") =>
    `<span class="bk-logo${size}" data-letter="${esc(b.name.charAt(0))}"><img class="bk-img" src="${esc(logoSrc(b))}" alt="${esc(b.name)} logo" loading="lazy" referrerpolicy="no-referrer"></span>`;

function listView() {
    return `
        <div class="br-page-heading">
            <div>
                <h2>Brokerage Report Readers</h2>
                <p>Indian brokers. Pick one to see its reports.</p>
            </div>
        </div>

        <div class="bk-grid">
            ${BROKERS.map(
                (b, i) => `
                <button type="button" class="br-card bk-card" data-broker="${i}">
                    ${logoHTML(b)}
                    <span class="bk-body">
                        <strong class="bk-name">${esc(b.name)}</strong>
                        <span class="br-muted bk-note">${esc(b.note)}</span>
                    </span>
                    <span class="bk-cta">View reports ${icon("chevron-right", { size: 16 })}</span>
                </button>`
            ).join("")}
        </div>
    `;
}

function detailView(b, activeReport) {
    const active = REPORTS.find((r) => r.id === activeReport);

    return `
        <div class="br-page-heading">
            <div>
                <h2>${esc(b.name)} reports</h2>
                <p>Choose a report.</p>
            </div>

            <button type="button" class="br-button" data-action="back">
                ${icon("arrow-left", { size: 16 })} All brokers
            </button>
        </div>

        <div class="br-income-tabs br-tabs-flat" role="group" aria-label="${esc(b.name)} reports">
            ${REPORTS.map(
                (r) => `
                <button type="button"
                    class="br-income-tab${r.id === activeReport ? " active" : ""}"
                    data-report="${r.id}"
                    aria-pressed="${r.id === activeReport}">${esc(r.label)}</button>`
            ).join("")}
        </div>

        ${
            active && hasReader(b, active.id)
                ? `<div data-reader-mount></div>`
                : active
                ? `<section class="br-card bk-working" role="status" aria-live="polite">
                    ${icon("clock", { size: 20 })}
                    <div>
                        <strong>Working on it</strong>
                        <p class="br-muted">${esc(b.name)} · ${esc(active.label)} is not available yet. It is coming soon.</p>
                    </div>
                </section>`
                : ""
        }
    `;
}

export async function Brokers() {
    const page = document.createElement("section");
    page.className = "br-page";

    let broker = -1;
    let report = "";

    // Created the first time Angel One -> Profit & Loss is opened, then reused
    // so an uploaded file is not lost when the page re-draws.
    let angelReader = null;

    async function mountReader() {
        const mount = page.querySelector("[data-reader-mount]");

        if (!mount) return;

        try {
            if (!angelReader) {
                const { AngelPnl } = await import("./angel-pnl/angel-pnl.js");
                angelReader = AngelPnl();
            }

            // The user may have moved on while the code was loading.
            const stillThere = page.querySelector("[data-reader-mount]");

            if (stillThere) stillThere.replaceChildren(angelReader);
        } catch (error) {
            console.error("BlackRoad: Angel One reader failed to load", error);

            mount.innerHTML = `<section class="br-card bk-working" role="status">
                ${icon("circle-alert", { size: 20 })}
                <div><strong>Could not load the reader</strong>
                <p class="br-muted">Please check your connection and try again.</p></div></section>`;
        }
    }

    function render() {
        page.innerHTML = broker < 0 ? listView() : detailView(BROKERS[broker], report);
        mountReader();
    }

    page.addEventListener("click", (event) => {
        const card = event.target.closest("[data-broker]");

        if (card) {
            broker = Number(card.dataset.broker);
            report = REPORTS[0].id;
            render();
            window.scrollTo(0, 0);
            return;
        }

        if (event.target.closest('[data-action="back"]')) {
            broker = -1;
            report = "";
            render();
            window.scrollTo(0, 0);
            return;
        }

        const item = event.target.closest("[data-report]");

        if (item) {
            report = item.dataset.report;
            render();
        }
    });

    // A logo that fails to load (offline, blocked) falls back to the letter.
    // Image errors do not bubble, so listen in the capture phase.
    page.addEventListener(
        "error",
        (event) => {
            const img = event.target;

            if (!(img instanceof HTMLImageElement) || !img.classList.contains("bk-img")) return;

            const box = img.parentElement;

            box.textContent = box.dataset.letter || "";
            box.classList.add("is-letter");
        },
        true
    );

    render();

    return page;
}
