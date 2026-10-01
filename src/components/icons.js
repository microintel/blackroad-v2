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
    x: P("M18 6 6 18") + P("m6 6 12 12"),
    "circle-check": C(12, 12, 10) + P("m9 12 2 2 4-4"),
    "circle-alert": C(12, 12, 10) + P("M12 8v4") + P("M12 16h.01"),
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
    "refresh-cw":
        P("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8") + P("M21 3v5h-5") +
        P("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16") + P("M8 16H3v5")
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
