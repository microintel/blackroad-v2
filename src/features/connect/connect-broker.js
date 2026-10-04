/* =========================================================
   CONNECT BROKER  (Overview -> Connect Broker)
   Step 1  pick an Indian broker (big logo cards)
   Step 2  see the broker's API name and a Connect button
   Step 3  Connect shows "We are working on it"

   Nothing is connected or stored yet; this is the front of the
   feature. When a broker is built, replace its `connect` flag
   below with a real connect flow.
   ========================================================= */

import { icon } from "../../components/icons.js";
import { AngelConnect, angelIsConnected, openLoginDialog, takeAngelNotice } from "./angel-connect.js";
import { BROKER_EVENT } from "../../services/angel-session.js";

/* `api` is the name of the broker's own developer API. */
const BROKERS = [
    { name: "Zerodha", domain: "zerodha.com", api: "Kite Connect", about: "Zerodha's trading and market data API." },
    { name: "Groww", domain: "groww.in", api: "Groww Trade API", about: "Groww's API for stocks orders, holdings and positions." },
    { name: "Angel One", domain: "angelone.in", api: "SmartAPI", about: "Angel One's free trading and market data API." },
    { name: "Upstox", domain: "upstox.com", api: "Upstox API", about: "Upstox's API for orders, portfolio and market data." },
    { name: "ICICI Direct", domain: "icicidirect.com", api: "Breeze API", about: "ICICI Securities' API for trading and market data." },
    { name: "HDFC Securities", domain: "hdfcsec.com", api: "InvestRight Open API", about: "HDFC Securities' API for orders, trades and holdings." },
    { name: "Kotak Securities", domain: "kotaksecurities.com", api: "Kotak Neo API", about: "Kotak Securities' API for trading on the Neo platform." }
];

/* "How to setup" guide for Angel One. Put your file in the assets folder with this
   name, or change the path here (an HTML page). */
const ANGEL_SETUP_GUIDE = "./assets/brokerage-connect-setup.html";

/* The broker's own icon, loaded from its domain (same approach as
   Brokerage Report Readers). Falls back to the first letter. */
const logoSrc = (b) =>
    b.logo || "https://www.google.com/s2/favicons?sz=256&domain=" + encodeURIComponent(b.domain);

const esc = (v) =>
    String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

const logoHTML = (b, size) =>
    `<span class="cb-logo cb-logo-${size}" data-letter="${esc(b.name.charAt(0))}"><img class="cb-img" src="${esc(logoSrc(b))}" alt="${esc(b.name)} logo" loading="lazy" referrerpolicy="no-referrer"></span>`;

const isAngel = (b) => b.name === "Angel One";

function listView() {
    return `
        <div class="br-page-heading">
            <div>
                <h2>Connect Broker</h2>
                <p>Choose your broker to link your account.</p>
            </div>
        </div>

        <div class="cb-grid">
            ${BROKERS.map(
                (b, i) => `
                <button type="button" class="br-card cb-card" data-broker="${i}">
                    ${logoHTML(b, "lg")}
                    <strong class="cb-name">${esc(b.name)}</strong>
                    ${
                        isAngel(b) && angelIsConnected()
                            ? `<span class="br-badge br-badge-success cb-connected">${icon("circle-check", { size: 14 })} Connected</span>`
                            : ""
                    }
                    <span class="cb-cta">${isAngel(b) && angelIsConnected() ? "View data" : "Select"} ${icon("chevron-right", { size: 16 })}</span>
                </button>`
            ).join("")}
        </div>
    `;
}

function detailView(b, connecting) {
    // Once Angel One is connected, only its data is shown (no logo card), so nothing sits above it.
    const angelOn = isAngel(b) && angelIsConnected();
    const notice = isAngel(b) && !angelOn ? takeAngelNotice() : "";

    return `
        <div class="br-page-heading">
            <div>
                <h2>${esc(b.name)}</h2>
                <p>${angelOn ? "Your connected account." : "Connect your account through the broker's API."}</p>
            </div>

            <button type="button" class="br-button" data-action="back">
                ${icon("arrow-left", { size: 16 })} All brokers
            </button>
        </div>

        ${
            angelOn
                ? `<div data-angel-mount></div>`
                : `${notice ? `<div class="ac-notice" role="status">${icon("circle-check", { size: 18 })}<span>${esc(notice)}</span></div>` : ""}

        <section class="br-card cb-detail">
            ${logoHTML(b, "xl")}

            <div class="cb-api">
                <span class="cb-api-label">API</span>
                <strong class="cb-api-name">${esc(b.api)}</strong>
                <p class="br-muted">${esc(b.about)}</p>
            </div>

            ${
                isAngel(b)
                    ? `<a class="br-button cb-setup" href="${esc(ANGEL_SETUP_GUIDE)}" target="_blank" rel="noopener">
                ${icon("file-chart-column", { size: 20 })} How to setup ${icon("arrow-up-right", { size: 20 })}
            </a>`
                    : ""
            }

            <button type="button" class="br-button br-button-primary cb-connect" data-action="connect">
                ${icon("plug", { size: 18 })} Connect ${esc(b.name)}
            </button>
        </section>`
        }

        ${
            connecting && !isAngel(b)
                ? `<section class="br-card cb-working" role="status" aria-live="polite">
                    ${icon("clock", { size: 20 })}
                    <div>
                        <strong>We are working on it</strong>
                        <p class="br-muted">Connecting ${esc(b.name)} is not available yet. It is coming soon.</p>
                    </div>
                </section>`
                : ""
        }
    `;
}

export async function ConnectBroker() {
    const page = document.createElement("section");
    page.className = "br-page";

    let broker = -1;
    let connecting = false;

    function render() {
        page.innerHTML = broker < 0 ? listView() : detailView(BROKERS[broker], connecting);

        // The Angel One panel keeps its own state, so the same element is re-attached each time.
        page.querySelector("[data-angel-mount]")?.replaceChildren(AngelConnect());
    }

    page.addEventListener("click", (event) => {
        const card = event.target.closest("[data-broker]");

        if (card) {
            broker = Number(card.dataset.broker);
            connecting = false;
            render();
            window.scrollTo(0, 0);
            return;
        }

        if (event.target.closest('[data-action="back"]')) {
            broker = -1;
            connecting = false;
            render();
            window.scrollTo(0, 0);
            return;
        }

        if (event.target.closest('[data-action="connect"]')) {
            // Angel One opens the login popup. Other brokers are not built yet.
            if (isAngel(BROKERS[broker])) {
                openLoginDialog();
                return;
            }

            connecting = true;
            render();
            page.querySelector(".cb-working")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    });

    // A logo that fails to load (offline, blocked) falls back to the letter.
    // Image errors do not bubble, so listen in the capture phase.
    page.addEventListener(
        "error",
        (event) => {
            const img = event.target;

            if (!(img instanceof HTMLImageElement) || !img.classList.contains("cb-img")) return;

            const box = img.parentElement;

            box.textContent = box.dataset.letter || "";
            box.classList.add("is-letter");
        },
        true
    );

    // Connecting / logging out redraws this page (and the Connected label on the list).
    const onBrokerChange = () => {
        if (!page.isConnected) {
            window.removeEventListener(BROKER_EVENT, onBrokerChange);
            return;
        }

        render();
        window.scrollTo(0, 0);
    };

    window.addEventListener(BROKER_EVENT, onBrokerChange);

    render();

    return page;
}
