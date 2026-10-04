/* =========================================================
   ANGEL ONE CONNECT  (Overview -> Connect Broker -> Angel One)

   1. Connect opens a popup with four inputs:
      API Key, Client ID, PIN, TOTP  ->  Login.
      The popup closes only with Cancel or the close button
      (not by clicking outside it, and not with Escape).
   2. Login signs in through Angel One SmartAPI, then fetches
      account, holdings, positions, funds, orders and trades
      (read-only) and shows them in BlackRoad's own style.
   3. The connection stays until the user clicks Logout.
      Logout clears the connection and every loaded value.

   Storage: nothing goes to BlackRoad's database (IndexedDB) or
   localStorage. The session (API key, Client ID, token) is kept
   in this tab only by services/angel-session.js and is removed
   on Logout. PIN and TOTP are used for the login request only.
   ========================================================= */

import { icon } from "../../components/icons.js";
import { confirmDialog } from "../../components/confirm-dialog.js";
import {
    BROKER_EVENT,
    getAngelSession,
    saveAngelSession,
    clearAngelSession,
    isAngelConnected
} from "../../services/angel-session.js";

const API = "https://apiconnect.angelone.in/rest";

const URLS = {
    login: API + "/auth/angelbroking/user/v1/loginByPassword",
    logout: API + "/secure/angelbroking/user/v1/logout",
    profile: API + "/secure/angelbroking/user/v1/getProfile",
    holdings: API + "/secure/angelbroking/portfolio/v1/getAllHolding",
    positions: API + "/secure/angelbroking/order/v1/getPosition",
    funds: API + "/secure/angelbroking/user/v1/getRMS",
    orders: API + "/secure/angelbroking/order/v1/getOrderBook",
    trades: API + "/secure/angelbroking/order/v1/getTradeBook"
};

/* Same client details the original Angel One dashboard sent. */
const LOCAL_IP = "127.0.0.1";
const PUBLIC_IP = "127.0.0.1";
const MAC_ADDRESS = "00:00:00:00:00:00";

/* ---------- State (memory only; the session itself is in angel-session.js) ---------- */

let phase = isAngelConnected() ? "loading" : "off"; // "off" | "loading" | "data"
let data = null; // { profile, holdings, positions, funds, orders, trades } each { ok, value, error }
let loadedAt = null;
let fetching = false;
let refreshing = false;
let epoch = 0; // bumped on logout so late responses are ignored
let notice = ""; // one-time message shown after logout

let root = null;
let dialog = null;

/* True while an account is connected. */
export const angelIsConnected = () => isAngelConnected();

/* The page asks for this once, to show "Logged out" after a logout. */
export function takeAngelNotice() {
    const n = notice;

    notice = "";

    return n;
}

/* ---------- Helpers ---------- */

const esc = (v) =>
    String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const safe = (v) => (v === null || v === undefined || v === "" ? "-" : esc(String(v)));

const fmt = (v) => {
    const n = Number(v);

    if (!Number.isFinite(n)) return "-";

    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const rupee = (v) => {
    const s = fmt(v);

    return s === "-" ? "-" : "\u20B9" + s;
};

const pct = (v) => {
    const s = fmt(v);

    return s === "-" ? "-" : s + "%";
};

const pnlClass = (v) => {
    const n = Number(v);

    if (!Number.isFinite(n)) return "";

    return n > 0 ? "br-pnl-pos" : n < 0 ? "br-pnl-neg" : "";
};

function headers(apiKey, jwt) {
    const h = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-PrivateKey": apiKey,
        "X-ClientLocalIP": LOCAL_IP,
        "X-ClientPublicIP": PUBLIC_IP,
        "X-MACAddress": MAC_ADDRESS
    };

    if (jwt) h.Authorization = "Bearer " + jwt;

    return h;
}

async function call(url, { method = "GET", body, apiKey, jwt, signal }) {
    let response;

    try {
        response = await fetch(url, {
            method,
            headers: headers(apiKey, jwt),
            body: body ? JSON.stringify(body) : undefined,
            signal
        });
    } catch (error) {
        if (error?.name === "AbortError") throw error;

        throw new Error("Could not reach Angel One. Check your internet connection and try again.");
    }

    const text = await response.text();
    let json;

    try {
        json = JSON.parse(text);
    } catch {
        throw new Error("HTTP " + response.status + ": " + (text.slice(0, 120) || "Invalid server response"));
    }

    if (!json.status) throw new Error(json.message || "Request failed");

    return json;
}

/* ---------- Load / refresh ---------- */

async function loadAll() {
    const s = getAngelSession();

    if (!s) return false;

    const mine = epoch;
    const get = (url) => call(url, { apiKey: s.apiKey, jwt: s.jwt });

    const [profile, holdings, positions, funds, orders, trades] = await Promise.allSettled([
        get(URLS.profile),
        get(URLS.holdings),
        get(URLS.positions),
        get(URLS.funds),
        get(URLS.orders),
        get(URLS.trades)
    ]);

    // The user logged out while this was loading: drop the result.
    if (mine !== epoch || !getAngelSession()) return false;

    const pack = (r, pick) =>
        r.status === "fulfilled"
            ? { ok: true, value: pick(r.value), error: "" }
            : { ok: false, value: null, error: r.reason?.message || "Request failed" };

    data = {
        profile: pack(profile, (r) => r.data || {}),
        holdings: pack(holdings, (r) => r.data || {}),
        positions: pack(positions, (r) => (Array.isArray(r.data) ? r.data : [])),
        funds: pack(funds, (r) => r.data || {}),
        orders: pack(orders, (r) => (Array.isArray(r.data) ? r.data : [])),
        trades: pack(trades, (r) => (Array.isArray(r.data) ? r.data : []))
    };
    loadedAt = new Date();

    return true;
}

/* First load after login, or after the page / tab was reloaded while connected. */
async function startLoad() {
    if (fetching || phase === "data" || !isAngelConnected()) return;

    fetching = true;
    phase = "loading";
    render();

    const ok = await loadAll();

    fetching = false;

    if (!ok) return;

    phase = "data";
    render();
}

async function refresh() {
    if (refreshing || phase !== "data") return;

    refreshing = true;
    render();

    const ok = await loadAll();

    refreshing = false;

    if (ok) render();
}

/* ---------- Logout ---------- */

function resetMemory() {
    epoch += 1;
    phase = "off";
    data = null;
    loadedAt = null;
    fetching = false;
    refreshing = false;
}

function logout() {
    const s = getAngelSession();

    // Wipe everything first, so nothing lingers even if the network is slow.
    resetMemory();
    closeDialog();
    notice = "Logged out. The connection and all loaded data were cleared.";
    clearAngelSession(); // removes the stored session and tells the page + sidebar
    render();

    // Best-effort sign-out on Angel One's side.
    if (s) {
        call(URLS.logout, {
            method: "POST",
            apiKey: s.apiKey,
            jwt: s.jwt,
            body: { clientcode: s.clientCode }
        }).catch(() => {});
    }
}

let asking = false;

/* Asks first. Only "Logout" in the confirmation clears the connection. */
async function askLogout() {
    if (asking) return;

    asking = true;

    try {
        const ok = await confirmDialog({
            title: "Logout from Angel One",
            message: "This will disconnect Angel One and clear all the loaded data from BlackRoad. You will need to enter your details again to reconnect.",
            confirmLabel: "Logout",
            cancelLabel: "Cancel"
        });

        if (ok && isAngelConnected()) logout();
    } finally {
        asking = false;
    }
}

// The session can also disappear from outside (the user signs out of BlackRoad).
window.addEventListener(BROKER_EVENT, () => {
    if (!isAngelConnected() && phase !== "off") {
        resetMemory();
        closeDialog();
        render();
    }
});

/* ---------- Login popup ---------- */

function closeDialog() {
    if (!dialog) return;

    dialog.abort?.abort();
    document.removeEventListener("keydown", dialog.onKey, true);
    dialog.layer.remove();

    const previous = dialog.previous;

    dialog = null;

    if (previous && previous.isConnected && previous.focus) previous.focus();
}

export function openLoginDialog() {
    if (dialog || isAngelConnected()) return;

    const layer = document.createElement("div");

    layer.className = "br-modal-layer ac-layer";
    layer.innerHTML = `
        <div class="br-modal ac-dialog" role="dialog" aria-modal="true" aria-labelledby="ac-title">
            <div class="br-modal-header">
                <div>
                    <h3 id="ac-title">Connect Angel One</h3>
                    <p class="br-muted">Enter your SmartAPI details. Your PIN and TOTP are never saved.</p>
                </div>
                <button type="button" class="br-modal-close" data-ac-close aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>

            <form class="ac-form" autocomplete="off" novalidate>
                <div class="br-modal-body">
                    <div class="br-field">
                        <label for="ac-api-key">API Key</label>
                        <input class="br-input" id="ac-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Angel One API Key">
                    </div>

                    <div class="br-field">
                        <label for="ac-client-id">Client ID</label>
                        <input class="br-input" id="ac-client-id" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Client ID">
                    </div>

                    <div class="br-field">
                        <label for="ac-pin">PIN</label>
                        <input class="br-input" id="ac-pin" type="password" autocomplete="off" inputmode="numeric" placeholder="PIN">
                    </div>

                    <div class="br-field">
                        <label for="ac-totp">TOTP</label>
                        <input class="br-input" id="ac-totp" type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="Current 6-digit TOTP">
                    </div>

                    <div class="ac-error" role="alert" hidden>
                        ${icon("circle-alert", { size: 18 })}<span data-ac-error></span>
                    </div>
                </div>

                <div class="br-modal-footer">
                    <button type="button" class="br-button" data-ac-cancel>Cancel</button>
                    <button type="submit" class="br-button br-button-primary" data-ac-login>Login</button>
                </div>
            </form>
        </div>
    `;

    const form = layer.querySelector(".ac-form");
    const errorBox = layer.querySelector(".ac-error");
    const errorText = layer.querySelector("[data-ac-error]");
    const loginBtn = layer.querySelector("[data-ac-login]");
    const inputs = [...layer.querySelectorAll(".br-input")];
    const closeBtn = layer.querySelector("[data-ac-close]");
    const cancelBtn = layer.querySelector("[data-ac-cancel]");
    const field = (id) => layer.querySelector("#" + id);

    let busy = false;

    const showError = (message, focusId) => {
        errorText.textContent = message;
        errorBox.hidden = false;
        if (focusId) field(focusId)?.focus();
    };

    const setBusy = (on) => {
        busy = on;
        inputs.forEach((el) => (el.disabled = on));
        loginBtn.disabled = on;
        loginBtn.textContent = on ? "Logging in\u2026" : "Login";
    };

    // Only the two buttons close the popup: not a click outside it, and not Escape.
    const dismiss = () => closeDialog();

    closeBtn.addEventListener("click", dismiss);
    cancelBtn.addEventListener("click", dismiss);

    const onKey = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.key !== "Tab") return;

        // Keep keyboard focus inside the popup.
        const items = [...layer.querySelectorAll("input:not(:disabled), button:not(:disabled)")];

        if (!items.length) return;

        const i = items.indexOf(document.activeElement);
        const next = event.shiftKey ? items[i <= 0 ? items.length - 1 : i - 1] : items[(i + 1) % items.length];

        event.preventDefault();
        next.focus();
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (busy) return;

        const apiKey = field("ac-api-key").value.trim();
        const clientCode = field("ac-client-id").value.trim();
        const pin = field("ac-pin").value.trim();
        const totp = field("ac-totp").value.trim();

        errorBox.hidden = true;

        if (!apiKey) return showError("Enter your Angel One API Key.", "ac-api-key");
        if (!clientCode) return showError("Enter your Client ID.", "ac-client-id");
        if (!pin) return showError("Enter your PIN.", "ac-pin");
        if (!/^\d{6}$/.test(totp)) return showError("Enter the current 6-digit TOTP.", "ac-totp");

        const me = dialog;
        const controller = new AbortController();

        me.abort = controller;
        setBusy(true);

        try {
            const result = await call(URLS.login, {
                method: "POST",
                apiKey,
                signal: controller.signal,
                body: { clientcode: clientCode, password: pin, totp }
            });

            const jwt = result.data?.jwtToken;

            if (!jwt) throw new Error("Login failed. No session token was returned.");

            // The popup was cancelled while the request was finishing: close the new session again.
            if (dialog !== me) {
                call(URLS.logout, { method: "POST", apiKey, jwt, body: { clientcode: clientCode } }).catch(() => {});
                return;
            }

            // Connected. Memory first, so the page draws the loading state, then store + announce.
            epoch += 1;
            data = null;
            phase = "loading";
            fetching = false;
            closeDialog();
            saveAngelSession({ apiKey, clientCode, jwt });
            startLoad();
        } catch (error) {
            if (dialog !== me || error?.name === "AbortError") return;

            setBusy(false);
            field("ac-totp").value = "";
            showError(error.message || "Login failed", "ac-totp");
        }
    });

    dialog = { layer, onKey, abort: null, previous: document.activeElement };

    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(layer);

    field("ac-api-key").focus();
}

/* ---------- Views ---------- */

function table(columns, rows, { small = false } = {}) {
    return `
        <div class="br-table-wrap">
            <table class="br-table ac-table${small ? " ac-table-sm" : ""}">
                <thead><tr>${columns.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
                <tbody>
                    ${rows
                        .map(
                            (row) =>
                                `<tr>${columns
                                    .map((c) => {
                                        const cell = c[1](row);

                                        return `<td${cell.cls ? ` class="${cell.cls}"` : ""}>${cell.html}</td>`;
                                    })
                                    .join("")}</tr>`
                        )
                        .join("")}
                </tbody>
            </table>
        </div>
    `;
}

const text = (v) => ({ html: safe(v) });
const money = (v) => ({ html: rupee(v) });
const pnl = (v) => ({ html: rupee(v), cls: pnlClass(v) });
const pnlPct = (v) => ({ html: pct(v), cls: pnlClass(v) });

function statusBadge(v) {
    const s = String(v ?? "").toLowerCase();
    const kind = s === "complete" ? "success" : s === "rejected" || s === "cancelled" ? "danger" : "";

    return { html: v ? `<span class="br-badge${kind ? " br-badge-" + kind : ""}">${esc(v)}</span>` : "-" };
}

function section(title, note, part, body) {
    return `
        <section class="br-card ac-section">
            <div class="br-card-heading">
                <div>
                    <h3>${esc(title)}</h3>
                    ${note ? `<p class="br-muted">${esc(note)}</p>` : ""}
                </div>
            </div>
            ${
                part.ok
                    ? body
                    : `<div class="ac-error" role="alert">${icon("circle-alert", { size: 18 })}<span>${esc(title)} error: ${esc(part.error)}</span></div>`
            }
        </section>
    `;
}

const empty = (message) => `<p class="br-muted">${esc(message)}</p>`;

function accountView(part) {
    const d = part.value || {};
    const list = (v) => (Array.isArray(v) ? v.join(", ") : "");

    const items = [
        ["Client Code", d.clientcode],
        ["Name", d.name],
        ["Email", d.email],
        ["Mobile", d.mobileno],
        ["Broker", d.broker],
        ["Last Login", d.lastlogintime],
        ["Exchanges", list(d.exchanges)],
        ["Products", list(d.products)]
    ];

    return section(
        "Account Information",
        "",
        part,
        `<div class="br-detail-grid ac-account">${items
            .map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${safe(v)}</div></div>`)
            .join("")}</div>`
    );
}

function summaryView(part) {
    if (!part.ok) return "";

    const total = part.value.totalholding || {};
    const count = (part.value.holdings || []).length;

    const stats = [
        ["Invested Value", rupee(total.totalinvvalue), ""],
        ["Current Holding Value", rupee(total.totalholdingvalue), ""],
        ["Total P&L", rupee(total.totalprofitandloss), pnlClass(total.totalprofitandloss)],
        ["P&L %", pct(total.totalpnlpercentage), pnlClass(total.totalpnlpercentage)],
        ["Number of Holdings", String(count), ""]
    ];

    return `
        <div class="ac-stats">
            ${stats
                .map(
                    ([label, value, cls]) => `
                <div class="br-card br-stat">
                    <span class="br-stat-label">${esc(label)}</span>
                    <span class="br-stat-value ${cls}">${esc(value)}</span>
                </div>`
                )
                .join("")}
        </div>
    `;
}

function holdingsView(part) {
    const list = part.ok ? part.value.holdings || [] : [];

    const columns = [
        ["Trading Symbol", (s) => text(s.tradingsymbol)],
        ["Exchange", (s) => text(s.exchange)],
        ["ISIN", (s) => text(s.isin)],
        ["Symbol Token", (s) => text(s.symboltoken)],
        ["Product", (s) => text(s.product)],
        ["Quantity", (s) => text(s.quantity)],
        ["T1 Quantity", (s) => text(s.t1quantity)],
        ["Realised Quantity", (s) => text(s.realisedquantity)],
        ["Authorised Quantity", (s) => text(s.authorisedquantity)],
        ["Average Price", (s) => money(s.averageprice)],
        ["LTP", (s) => money(s.ltp)],
        ["Close", (s) => money(s.close)],
        ["Current Value", (s) => money(Number(s.ltp || 0) * Number(s.quantity || 0))],
        ["P&L", (s) => pnl(s.profitandloss)],
        ["P&L %", (s) => pnlPct(s.pnlpercentage)]
    ];

    return section("Holdings", "", part, list.length ? table(columns, list) : empty("No holdings found."));
}

function positionsView(part) {
    const list = part.ok ? part.value : [];

    const columns = [
        ["Symbol", (p) => text(p.tradingsymbol)],
        ["Exchange", (p) => text(p.exchange)],
        ["Product", (p) => text(p.producttype)],
        ["Net Qty", (p) => text(p.netqty)],
        ["Buy Qty", (p) => text(p.buyqty)],
        ["Sell Qty", (p) => text(p.sellqty)],
        ["Buy Avg", (p) => money(p.buyavgprice)],
        ["Sell Avg", (p) => money(p.sellavgprice)],
        ["Avg Net Price", (p) => money(p.avgnetprice)],
        ["Net Value", (p) => money(p.netvalue)],
        ["LTP", (p) => money(p.ltp)],
        ["Close", (p) => money(p.close)],
        ["P&L", (p) => pnl(p.pnl)],
        ["Realised", (p) => pnl(p.realised)],
        ["Unrealised", (p) => pnl(p.unrealised)]
    ];

    return section("Positions", "", part, list.length ? table(columns, list) : empty("No open positions found."));
}

function fundsView(part) {
    const d = part.ok ? part.value : {};

    const fields = [
        ["Available Cash", "availablecash"],
        ["Available Limit Margin", "availablelimitmargin"],
        ["Available Intraday Payin", "availableintradaypayin"],
        ["Collateral", "collateral"],
        ["Net", "net"],
        ["Utilised Debits", "utiliseddebits"],
        ["Utilised Exposure", "utilisedexposure"],
        ["Utilised Holdings Sales", "utilisedholdingsales"],
        ["Utilised Option Premium", "utilisedoptionpremium"],
        ["Utilised Payout", "utilisedpayout"],
        ["Utilised Span", "utilisedspan"],
        ["Utilised Turnover", "utilisedturnover"],
        ["M2M Unrealized", "m2munrealized"],
        ["M2M Realized", "m2mrealized"]
    ];

    const columns = [
        ["Fund / Margin Field", (f) => ({ html: esc(f[0]) })],
        ["Value", (f) => money(d[f[1]])]
    ];

    return section("Funds / Margin", "", part, table(columns, fields, { small: true }));
}

function ordersView(part) {
    const list = part.ok ? part.value : [];

    const columns = [
        ["Order ID", (o) => text(o.orderid)],
        ["Unique Order ID", (o) => text(o.uniqueorderid)],
        ["Symbol", (o) => text(o.tradingsymbol)],
        ["Exchange", (o) => text(o.exchange)],
        ["Transaction", (o) => text(o.transactiontype)],
        ["Order Type", (o) => text(o.ordertype)],
        ["Product", (o) => text(o.producttype)],
        ["Quantity", (o) => text(o.quantity)],
        ["Filled", (o) => text(o.filledshares)],
        ["Unfilled", (o) => text(o.unfilledshares)],
        ["Price", (o) => money(o.price)],
        ["Average Price", (o) => money(o.averageprice)],
        ["Status", (o) => statusBadge(o.status)],
        ["Order Time", (o) => text(o.updatetime)],
        ["Exchange Order ID", (o) => text(o.exchangeorderid)]
    ];

    return section("Order Book", "", part, list.length ? table(columns, list) : empty("No orders found."));
}

function tradesView(part) {
    const list = part.ok ? part.value : [];

    const columns = [
        ["Trade ID", (t) => text(t.fillid)],
        ["Order ID", (t) => text(t.orderid)],
        ["Symbol", (t) => text(t.tradingsymbol)],
        ["Exchange", (t) => text(t.exchange)],
        ["Transaction", (t) => text(t.transactiontype)],
        ["Product", (t) => text(t.producttype)],
        ["Fill Price", (t) => money(t.fillprice)],
        ["Fill Size", (t) => text(t.fillsize)],
        ["Trade Value", (t) => money(t.tradevalue)],
        ["Fill Time", (t) => text(t.filltime)],
        ["Expiry", (t) => text(t.expirydate)],
        ["Option Type", (t) => text(t.optiontype)]
    ];

    return section("Trade Book", "", part, list.length ? table(columns, list) : empty("No trades found for today."));
}

function dataView() {
    const d = data;
    const failed = Object.values(d).filter((p) => !p.ok).length;
    const allFailed = failed === Object.keys(d).length;
    const s = getAngelSession();
    const clientCode = s?.clientCode || "";
    const name = d.profile.ok ? d.profile.value.name : "";
    const time = loadedAt ? loadedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

    return `
        <section class="br-card ac-bar">
            <div class="ac-bar-info">
                <span class="br-badge br-badge-success">${icon("circle-check", { size: 14 })} Connected</span>
                <strong>${esc(name || clientCode)}</strong>
                <span class="br-muted">Client ${esc(clientCode)}${time ? " \u00B7 Updated " + esc(time) : ""}</span>
            </div>

            <div class="ac-bar-actions">
                <button type="button" class="br-button" data-ac="refresh" ${refreshing ? "disabled" : ""}>
                    <span class="${refreshing ? "ac-spin" : ""}">${icon("refresh-cw", { size: 16 })}</span> ${refreshing ? "Refreshing" : "Refresh"}
                </button>
                <button type="button" class="br-button br-button-danger" data-ac="logout">
                    ${icon("log-out", { size: 16 })} Logout
                </button>
            </div>
        </section>

        ${
            allFailed
                ? `<div class="ac-error" role="alert">${icon("circle-alert", { size: 18 })}<span>Nothing could be loaded. Your Angel One session may have expired. Tap Logout, then connect again.</span></div>`
                : failed
                ? `<div class="ac-error" role="alert">${icon("circle-alert", { size: 18 })}<span>${failed} section${failed > 1 ? "s" : ""} could not be loaded. Details are shown in each section.</span></div>`
                : ""
        }

        ${accountView(d.profile)}
        ${summaryView(d.holdings)}
        ${holdingsView(d.holdings)}
        ${positionsView(d.positions)}
        ${fundsView(d.funds)}
        ${ordersView(d.orders)}
        ${tradesView(d.trades)}
    `;
}

function loadingView() {
    return `
        <section class="br-card ac-loading" role="status" aria-live="polite">
            <span class="ac-spin">${icon("refresh-cw", { size: 20 })}</span>
            <div>
                <strong>Fetching your account details</strong>
                <p class="br-muted">Loading profile, holdings, positions, funds, orders and trades.</p>
            </div>
        </section>
    `;
}

function render() {
    if (!root) return;

    root.innerHTML = phase === "data" && data ? dataView() : phase === "loading" ? loadingView() : "";
}

/* ---------- Public: the connected-data panel ---------- */

export function AngelConnect() {
    if (!root) {
        root = document.createElement("div");
        root.className = "ac-root";

        root.addEventListener("click", (event) => {
            if (event.target.closest('[data-ac="logout"]')) {
                askLogout();
                return;
            }

            if (event.target.closest('[data-ac="refresh"]')) refresh();
        });
    }

    render();

    // Connected but not loaded yet (first login, or the tab was reloaded): fetch now.
    if (isAngelConnected() && phase !== "data") startLoad();

    return root;
}
