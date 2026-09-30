# BlackRoad V2

Personal finance web application, rebuilt gradually from the original BlackRoad project.

**Stack (current):** HTML, CSS, vanilla JavaScript (ES modules), IndexedDB, PWA (later phase)
**Future migration target:** React, Next.js, Material UI, TypeScript (not started)

## Running

The app uses ES modules, so it must be served over HTTP (not opened as a `file://` page).
Routing is hash-based (`index.html#/income`), so **any static server works** and reloading,
bookmarking or resizing / toggling device mode never gives a 404:

```bash
python serve.py                 # http://localhost:8080
# or
python -m http.server 8080      # then open http://localhost:8080/index.html
# or VS Code Live Server, npx serve, GitHub Pages, ...
```

Older path-style links (`/income`) and `?go=/route` links are converted to the hash form on load.
Sign-in, sign-out, restore and account changes do a full reload of `index.html#/route`.

## Project structure

```text
blackroad-v2/
├── index.html
├── README.md
├── assets/
│   ├── icons/            app icons (from the original project)
│   └── audio/            click.mp3 (from the original project)
└── src/
    ├── app/
    │   ├── app.js        renders shell + current view
    │   ├── router.js     pathname router
    │   ├── navigation.js sidebar structure
    │   └── views.js      route -> view
    ├── components/layout/
    │   ├── sidebar.js
    │   └── topbar.js
    ├── data/
    │   ├── database.js       opens scoped IndexedDB databases (old schemas)
    │   ├── db-registry.js    database names / versions / stores
    │   ├── data-service.js   one store per module
    │   └── stores/           base-store + one store per module
    ├── features/
    │   ├── dashboard/        dashboard.js, dashboard-service.js
    │   ├── stocks/           stocks.js, stocks-service.js, stocks-live.js, stocks-print.js
    │   ├── deposits/         deposits.js, deposits-service.js
    │   ├── lending/          lending.js, lending-service.js
    │   ├── stepup/           stepup.js, stepup-service.js, stepup-fund.js, stepup-charts.js
    │   └── income/           income.js, income-service.js,
    │                         income-statement.js, income-statistics.js,
    │                         income-search.js, income-compare.js,
    │                         income-expand.js, income-jumpto.js,
    │                         income-shared.js
    └── styles/               tokens.css, global.css, layout.css,
                              components.css, dashboard.css, income.css, lending.css, stepup.css
```

## Databases (unchanged from the original app)

Names are scoped per signed-in user as `<name>::<scope>` (scope from `localStorage.br_active_scope`, default `anon`).

| Module | Database | Version | Object stores |
|---|---|---|---|
| Income & Expenses | `BlackRoad2` | 3 | `entries` (id), `meta` (key) |
| Stocks | `blackStocks` | 1 | `state` (no keyPath: keys `transactions`, `prices`, `seqCounter`) |
| Lending | `LendLedger` | 3 | `parties`, `entries` (index `partyId`), `loans` |
| Fixed Deposits | `BlackRoadFD` | 1 | `deposits` |
| StepUp | `sip-compounder` | 2 | `settings` (id), `entries`, `profiles` |
| Accounting | `BlackRoad Accounting` | 1 | `sst` (no keyPath: key `manual`) |

Do not rename databases, change stores or keys, or reset user data.

## Development phases

| Phase | Name | Status |
|---|---|---|
| 0 | Project inspection | Done |
| 1 | Project foundation | Done |
| 2 | Design system | Done |
| 3 | Application shell + routing | Done |
| 4 | Data layer / IndexedDB abstraction | Done (all six stores match the old schemas) |
| 5 | Dashboard | Done (live net worth, allocation, MF P/L, wealth lanes) |
| 6 | Income & Expenses | Done (Ledger, Statement, Statistics, Search, Compare, Expand, Jump-to) |
| 7 | Stocks | Done (stocks.js, stocks-service.js, stocks-live.js) |
| 8 | Fixed Deposits | Done (add / edit / close / delete, maturity math ported unchanged) |
| 9 | Lending | Done (Overview, People + person ledger, Loans / EMI) |
| 10 | StepUp | Done except PDF report: profiles, settings, step-ups, skips, entries, SIP ledger + allocation tracking, XIRR, fund link / NAV sync (mfapi.in), NAV auto-fill on allocation, charts (portfolio, fund history, projection, path to goal). PDF report pending |
| 11 | Accounting | Done |
| 12 | Notifications + Account | Done |
| 13 | Global data management (import / export) | Done |
| 14 | Migration / backward compatibility | Done (legacy per-module backup files accepted by global Restore) |
| 15 | PWA (manifest, service worker) | Done (manifest.json, sw.js, registered in index.html) |
| 16a | Mobile layout | Done (drawer, bottom tab bar, bottom-sheet modals, safe areas, no sideways scroll on all 10 routes at 390px; src/styles/mobile.css, src/components/layout/mobile-nav.js) |
| 16b | Dark = pure black | Done (bg, cards, sidebar, topbar, hero, modals all #000; borders separate; all 4 styles + 5 accents adapted; badges/pills/status colours restyled; theme-color meta follows mode) |
| 16c | Stocks print report + clear all data | Done (Reports tab: Print / Save as PDF via stocks-print.js, same design as old app, black-on-white even in dark mode; "Clear all stocks data" with confirm modal, blocked for guests) |
| 16d | Register | Done (Sign in / Register switch on both auth screens, prominent "Create an account" button, no-reload switching; validation and storage unchanged from services/auth.js) |
| 16e | 404 fix | Done (hardNavigate() in router.js; serve.py dev server) |
| 16 | Final testing | Automated pass done (see below); manual device checks + StepUp Part 2 remain |

## Rules

- The original app is the source of truth for calculations, business rules and data.
- One application: all modules share the sidebar, topbar and the design tokens/components.
- Import / export is one global system (Phase 13), not per module.
- No mock data, no invented schemas.

## Developer

**Microintel**

## Phase 16 test results

Headless Chromium (Playwright) against the served app:

- All 10 routes load with no JS errors: dashboard, income, stocks, deposits, lending, stepup, accounting, data, notifications, account.
- Service worker registers and activates.
- All 6 IndexedDB databases open with the same names and versions as the old app.
- Full backup -> wipe -> restore round-trip: identical data after restore.
- Legacy per-module files detected: Income, Stocks, Lending, Fixed Deposits, StepUp; unknown files rejected.

Still open: StepUp PDF report, and manual checks with real old-app data on a phone.
