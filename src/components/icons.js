/* =========================================================
   BLACKROAD ICONS  (Lucide)
   The project is vanilla ES modules with no bundler, so the
   official Lucide shapes used by the app live here as static
   SVG data. Same 24x24 grid, round caps/joins, stroke-based.
   Usage:  icon("wallet")            -> inline <svg> string
           icon("plus", { size: 18 })
   Unknown names render an empty placeholder instead of
   throwing, so a missing icon can never break a screen.
   ========================================================= */

const P = (d) => `<path d="${d}"/>`;
const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const R = (x, y, w, h, rx) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ""}/>`;

const ICONS = {
    house:
        P("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8") +
        P("M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
    download: P("M12 15V3") + P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4") + P("m7 10 5 5 5-5"),
    "indian-rupee": P("M6 3h12") + P("M6 8h12") + P("m6 13 8.5 8") + P("M6 13h3") + P("M9 13c6.667 0 6.667-10 0-10"),
    "dollar-sign": '<line x1="12" x2="12" y1="2" y2="22"/>' + P("M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"),
    eye:
        P("M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0") + C(12, 12, 3),
    "eye-off":
        P("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49") +
        P("M14.084 14.158a3 3 0 0 1-4.242-4.242") +
        P("M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143") +
        P("m2 2 20 20"),
    brain:
        P("M12 18V5") + P("M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4") +
        P("M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5") +
        P("M17.997 5.125a4 4 0 0 1 2.526 5.77") + P("M18 18a4 4 0 0 0 2-7.464") +
        P("M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517") +
        P("M6 18a4 4 0 0 1-2-7.464") + P("M6.003 5.125a4 4 0 0 0-2.526 5.77"),
    "layout-dashboard": R(3, 3, 7, 9, 1) + R(14, 3, 7, 5, 1) + R(14, 12, 7, 9, 1) + R(3, 16, 7, 5, 1),
    wallet:
        P("M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1") +
        P("M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"),
    calculator:
        R(4, 2, 16, 20, 2) + P("M8 6h8") + P("M16 14v4") + P("M16 10h.01") + P("M12 10h.01") + P("M8 10h.01") + P("M12 14h.01") + P("M8 14h.01") + P("M12 18h.01") + P("M8 18h.01"),
    receipt:
        P("M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z") +
        P("M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8") +
        P("M12 17.5v-11"),
    "chart-no-axes-combined":
        P("M12 16v5") + P("M16 14v7") + P("M20 10v11") +
        P("m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15") +
        P("M4 18v3") + P("M8 14v7"),
    "chart-candlestick":
        P("M9 5v4") + R(7, 9, 4, 6, 1) + P("M9 15v2") +
        P("M17 3v2") + R(15, 5, 4, 8, 1) + P("M17 13v3") +
        P("M3 3v16a2 2 0 0 0 2 2h16"),
    "chart-pie":
        P("M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z") +
        P("M21.21 15.89A10 10 0 1 1 8 2.83"),
    landmark:
        P("M10 18v-7") +
        P("M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z") +
        P("M14 18v-7") + P("M18 18v-7") + P("M3 22h18") + P("M6 18v-7"),
    coins:
        C(8, 8, 6) + P("M18.09 10.37A6 6 0 1 1 10.34 18") + P("M7 6h1v4") + P("m16.71 13.88.7.71-2.82 2.82"),
    "arrow-left-right": P("M8 3 4 7l4 4") + P("M4 7h16") + P("m16 21 4-4-4-4") + P("M20 17H4"),
    "file-chart-column":
        P("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z") +
        P("M14 2v4a2 2 0 0 0 2 2h4") + P("M8 18v-2") + P("M12 18v-6") + P("M16 18v-4"),
    settings:
        P("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z") +
        C(12, 12, 3),
    copy: R(8, 8, 14, 14, 2) + P("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"),
    search: C(11, 11, 8) + P("m21 21-4.3-4.3"),
    plus: P("M5 12h14") + P("M12 5v14"),
    pencil:
        P("M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z") +
        P("m15 5 4 4"),
    "trash-2":
        P("M3 6h18") + P("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6") +
        P("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2") + P("M10 11v6") + P("M14 11v6"),
    "sliders-horizontal":
        P("M10 5H3") + P("M12 19H3") + P("M14 3v4") + P("M16 17v4") + P("M21 12h-9") +
        P("M21 19h-5") + P("M21 5h-7") + P("M8 10v4") + P("M8 12H3"),
    "calendar-days":
        P("M8 2v4") + P("M16 2v4") + R(3, 4, 18, 18, 2) + P("M3 10h18") +
        P("M8 14h.01") + P("M12 14h.01") + P("M16 14h.01") + P("M8 18h.01") + P("M12 18h.01") + P("M16 18h.01"),
    bell:
        P("M10.268 21a2 2 0 0 0 3.464 0") +
        P("M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"),
    "user-round": C(12, 8, 5) + P("M20 21a8 8 0 0 0-16 0"),
    "chevron-down": P("m6 9 6 6 6-6"),
    "chevron-up": P("m18 15-6-6-6 6"),
    "chevron-right": P("m9 18 6-6-6-6"),
    "chevron-left": P("m15 18-6-6 6-6"),
    "arrow-left": P("m12 19-7-7 7-7") + P("M19 12H5"),
    "arrow-right": P("M5 12h14") + P("m12 5 7 7-7 7"),
    "arrow-up-right": P("M7 7h10v10") + P("M7 17 17 7"),
    "arrow-down-right": P("m7 7 10 10") + P("M17 7v10H7"),
    /* Rover chat assistant */
    bot:
        P("M12 8V4H8") + `<rect width="16" height="12" x="4" y="8" rx="2"/>` + P("M2 14h2") + P("M20 14h2") + P("M15 13v2") + P("M9 13v2"),
    sparkles:
        P("M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z") +
        P("M20 3v4") + P("M22 5h-4") + P("M4 17v2") + P("M5 18H3"),
    send: P("M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z") + P("m21.854 2.147-10.94 10.939"),
    x: P("M18 6 6 18") + P("m6 6 12 12"),
    "circle-check": C(12, 12, 10) + P("m9 12 2 2 4-4"),
    "circle-alert": C(12, 12, 10) + P("M12 8v4") + P("M12 16h.01"),
    plug: P("M12 22v-5") + P("M9 8V2") + P("M15 8V2") + P("M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"),
    clock: C(12, 12, 10) + P("M12 6v6l4 2"),
    menu: P("M4 12h16") + P("M4 6h16") + P("M4 18h16"),
    "log-out": P("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4") + P("m16 17 5-5-5-5") + P("M21 12H9"),
    "trending-up": P("M16 7h6v6") + P("m22 7-8.5 8.5-5-5L2 17"),
    "trending-down": P("M16 17h6v-6") + P("m22 17-8.5-8.5-5 5L2 7"),
    database: `<ellipse cx="12" cy="5" rx="9" ry="3"/>` + P("M3 5V19A9 3 0 0 0 21 19V5") + P("M3 12A9 3 0 0 0 21 12"),
    "skip-forward": P("M21 4v16") + `<polygon points="5 4 15 12 5 20 5 4"/>`,
    check: P("M20 6 9 17l-5-5"),
    sun:
        C(12, 12, 4) + P("M12 2v2") + P("M12 20v2") + P("m4.93 4.93 1.41 1.41") +
        P("m17.66 17.66 1.41 1.41") + P("M2 12h2") + P("M20 12h2") +
        P("m6.34 17.66-1.41 1.41") + P("m19.07 4.93-1.41 1.41"),
    moon: P("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"),
    "list-filter": P("M3 6h18") + P("M7 12h10") + P("M10 18h4"),
    ellipsis: C(12, 12, 1) + C(19, 12, 1) + C(5, 12, 1),
    banknote: R(2, 6, 20, 12, 2) + C(12, 12, 2) + P("M6 12h.01M18 12h.01"),
    "briefcase-business":
        P("M12 12h.01") + P("M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2") +
        P("M22 13a18.15 18.15 0 0 1-20 0") + R(2, 6, 20, 14, 2),
    upload:
        P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4") + P("m17 8-5-5-5 5") + P("M12 3v12"),
    download:
        P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4") + P("m7 10 5 5 5-5") + P("M12 15V3"),
    "refresh-cw":
        P("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8") + P("M21 3v5h-5") +
        P("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16") + P("M8 16H3v5"),
    "piggy-bank":
        P("M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z") +
        P("M16 10h.01") + P("M2 8v1a2 2 0 0 0 2 2h1"),
    "hand-coins":
        P("M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17") +
        P("m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9") +
        P("m2 16 6 6") + C(16, 9, 2.9) + C(6, 5, 3),
    layers:
        P("M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z") +
        P("M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12") +
        P("M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"),
    gem: P("M6 3h12l4 6-10 13L2 9Z") + P("M11 3 8 9l4 13 4-13-3-6") + P("M2 9h20")
};

/* Feature -> icon, so every screen names the same thing the same way. */
export const FEATURE_ICON = {
    dashboard: "layout-dashboard",
    income: "wallet",
    expenses: "receipt",
    stocks: "chart-candlestick",
    stepup: "chart-no-axes-combined",
    mutualFunds: "chart-pie",
    deposits: "landmark",
    lending: "arrow-left-right",
    accounting: "receipt",
    data: "database",
    notifications: "bell",
    account: "user-round",
    settings: "settings",
    networth: "coins",
    intelligence: "brain",
    reports: "file-chart-column"
};

export function icon(name, opts = {}) {
    const size = opts.size || 18;
    const stroke = opts.stroke || 1.75;
    const body = ICONS[name] || "";
    const cls = `br-icon${opts.cls ? " " + opts.cls : ""}`;
    return (
        `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
        `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
    );
}

/* Standalone SVG with a fixed colour (no currentColor), for places that
   cannot inherit CSS - e.g. drawing the icon onto a canvas for the PDF. */
export function iconSvg(name, opts = {}) {
    const size = opts.size || 96;
    const color = opts.color || "#000000";
    const stroke = opts.stroke || 1.9;

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
        `fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">` +
        `${ICONS[name] || ""}</svg>`
    );
}


/* Rover symbol: a ring of 8 dots (also the loading animation). Filled, so it
   has its own helper instead of the stroke-based icon(). */
export function roverMark(size = 24, cls = "") {
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12.00" cy="3.80" r="1.8"/><circle cx="17.80" cy="6.20" r="1.55"/><circle cx="20.20" cy="12.00" r="1.3"/><circle cx="17.80" cy="17.80" r="1.5"/><circle cx="12.00" cy="20.20" r="1.8"/><circle cx="6.20" cy="17.80" r="2.1"/><circle cx="3.80" cy="12.00" r="2.35"/><circle cx="6.20" cy="6.20" r="2.05"/></svg>`;
}
