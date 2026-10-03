# BlackRoad V2 - visual redesign notes

Scope: presentation only. No stores, services, calculations, routes or data schemas were touched.

## Design system
- src/styles/tokens.css is the single source of colour, type, spacing, radius and icon size. Pure black #000000 page; surfaces #0A0A0A / #101010 / #171717 / #1C1C1C; gold #D4AF37; semantic green / red / blue / amber.
- src/styles/themes.css is now flat-only. The Soft, Glass and Realistic styles (gradients, blur, glow) and the coloured accents are retired.
- src/components/icons.js holds the Lucide shapes the app uses (no bundler or network here, so they are inlined). Names match Lucide's kebab-case, so swapping in the package later only means changing the body of icon().
- src/components/chart-colors.js mirrors token colours for canvas / inline-SVG charts.

## Behaviour changes worth knowing
- (Superseded by the Income redesign below: Light and Dark themes are back.)
- Allocation donut and category breakdowns use a neutral series palette instead of green / red / amber, so semantic colours only mean gain / loss.
- The Stocks print report (white paper) keeps its own print stylesheet.

## Verification
Headless Chromium, guest session, all 10 routes at 1280px and 375px: no console errors, no computed gradients or box-shadows, no horizontal overflow, body background rgb(0,0,0). Tested with empty data only.

## Income redesign + Light / Dark themes

Scope: the Income module UI and a reusable theme foundation. No stores, services, calculations, routes, data schemas or other modules were changed.

### Theme system
- src/styles/theme.css is the single home of every colour. It defines semantic tokens (--background, --foreground, --surface, --surface-secondary, --text-primary/-secondary/-muted, --border, --accent, --success, --danger, --input-background, --input-border, --hover-background) for `:root[data-theme="dark"]` (pure #000000) and `:root[data-theme="light"]` (#FFFFFF). The legacy --br-* colour tokens are defined there too and now resolve per theme, so other modules already follow the switch.
- tokens.css keeps only non-colour tokens (type, spacing, radius, layout).
- index.html applies the saved theme (key `br-theme`) or the system theme before first paint. preferences.js owns runtime switching, persistence, theme-color meta, and follows live system changes until the user picks a theme.
- The toggle (Sun / Moon, Lucide) lives in the shared topbar.
- chart-colors.js reads the active theme's tokens when a chart is drawn.
- Future modules: use the semantic tokens only; scope a module root class (see `.br-income` in income.css) if a module needs its own accent.

### Income
- income.js: new markup for header, summary, ledger (table on wide, stacked rows on narrow), add/edit dialog with per-field validation messages, duplicate-submit guard, Escape / focus trap, empty and no-match states. Data flow, calculations and store calls are unchanged.
- income.css: everything new is scoped under `.br-income`.

### Known limits
- Other modules were not redesigned. They follow the theme through the shared tokens, but some were not tuned for Light mode.
- Charts already on screen keep their colours until the view re-renders.

### Navigation fix (hash routing)
- Routes are now `index.html#/income` (router.js: currentPath / hrefFor / replaceRoute). Reloading or resizing no longer depends on a server-side SPA fallback, so no 404 on any static host. Old `/income` and `?go=` URLs are migrated by the inline script in index.html.
- The mobile drawer now releases the page scroll lock and closes when the window is widened past 768px, and its document listeners are removed on every re-render.

### Income ledger: separate income and transaction editing
- Ledger rows show the income only; clicking a row (or its chevron) opens just that income's transactions.
- Income edit shows only source / category / amount / date and leaves its transactions untouched. Transaction edit shows only that one transaction; transaction delete removes only that transaction. Totals are recalculated by the existing recalcEntry().
- "+ Transaction" inside an open income adds a transaction to that income. "Add income" still creates an income together with optional transactions. Deleting an income still removes it with its transactions (the confirmation now says how many).

## Financial Intelligence layout foundation (Dashboard)

Scope: presentation only. No stores, services, calculations, routes, APIs or data schemas were touched. All values are static samples; the What-If controls sit in a disabled fieldset.

- `src/features/dashboard/intelligence/` holds one file per feature area (health, cash-flow, risk, what-if, goals, debt, subscriptions, emergency-fund, portfolio-concentration, timeline, explainable-insights, what-changed). Each exports a `renderX()` returning one card with a stable `data-fi="<key>"`, so a feature can later replace its own file's body without touching the others. `financial-intelligence.js` composes them into six groups; `shared.js` has the card / slot / bar helpers.
- `src/styles/intelligence.css` is scoped under `.br-fi` and uses theme tokens only, so Light and Dark both work. Hierarchy is set by surface tone and type: primary (Health, Cash flow) > secondary > supporting > analytical.
- Layout: 12-column grid on desktop; pairs stack at <=1100px (planning and supporting cards stay two-up); single column at <=768px, where the timeline turns vertical.
- Integration: `dashboard.js` imports and appends `FinancialIntelligence()` after the wealth lanes (2 added lines). `index.html` links the stylesheet; `sw.js` precaches the new files (CACHE_VERSION v17 -> v18).

### Update: Financial Intelligence now runs on example data
- `intelligence/example-data.js` is a made-up household (income ₹60,000, EMI ₹27,000, etc.). It is not read from any store or service.
- `intelligence/engine.js` holds every rule and threshold as plain functions (no DOM, storage or network): health score, risk levels, cash-flow forecast, goal maths, month-by-month loan payoff, subscription detection, sector concentration, what-changed, and the sentences behind the insights.
- Each card shows a "How this works" panel with the rule and this example's own numbers. The What-If sliders recalculate a copy of the month and change nothing else.
- To go live later: build an object with the shape of `EXAMPLE_DATA` from real data and pass it to `FinancialIntelligence(data)`. The engine and cards need no changes.
- sw.js CACHE_VERSION is now v19.

## Stocks: Income-style UI + MTF "my amount" vs "MTF funded"

Scope: Stocks module only (stocks.js, stocks-service.js, stocks-print.js, stocks.css), the `copy` icon, and the service-worker cache bump (v46 -> v47). No store, schema, route or IndexedDB change.

- The page now carries `.br-income`, so tabs, buttons, inputs, modals and tables follow the Income look and both themes.
- MTF buys can record the margin: new optional field `mtfOwn` on a BUY transaction (what you paid). Trade value - mtfOwn = broker-funded. Transactions without it behave exactly as before (fully your money; shown as "MTF · margin not set").
- Selling releases "my amount" and "MTF funded" in proportion to the quantity sold. P&L, average price and invested value are unchanged.
- New figures (derived, never stored): my amount, MTF funded, leverage, net equity (value - MTF funded), return on my amount. CSV gets two columns appended at the end.

## Theme circle origin + Mutual Fund (StepUp) restyle

Scope: presentation only. No store, service, calculation, route or schema was touched. Service-worker cache v47 -> v48.

- **Theme circle:** `preferences.js` now resolves the circle's centre from the live theme button (`origin.el`, falling back to the click point, then to any `[data-action="toggle-theme"]` on the page, never a fixed corner while a toggle exists). The centre is read again when the animation starts, so a layout shift during the switch cannot move it away from the icon. `app.js` passes the pressed button along with its coordinates.
- **Mutual Fund:** the page carries `.br-income .br-stepup`, so tabs, buttons, inputs, cards, tables and modals follow the Income look in Light and Dark (same approach as Stocks). `stepup.css` adds a `.br-stepup` block: tabular numbers, stat-card hover lift with a gain/loss arrow, gain/loss colours that survive the Income table rules, sticky table headers with row hover, animated goal progress, soft entrance on tab / SIP change (replayed only when the view changes, not on every data refresh), keyboard focus rings, scrollable tabs and stacked forms on phones. All motion respects `prefers-reduced-motion`.
- `stepup.js`: page class, plus a `lastViewKey` flag that toggles `su-enter` on the content wrapper. Nothing else changed.

### Update: circle is now CSS-driven and starts at zero size on the icon
- The reveal used to be started from JS after the browser reported the transition ready, so the new theme could show for a frame or two before the circle began. `preferences.js` now sets `--br-vt-x / --br-vt-y / --br-vt-r` (icon centre, radius to the farthest corner) before the snapshot, and `theme.css` gives `::view-transition-new(root)` a `circle(0)` at that point plus a keyframe animation to full size. The vars are removed when the transition ends. Cache v48 -> v49.
- Verified by sampling the pseudo-element's clip-path on every frame after a click: on desktop and phone, on Dashboard, Mutual Fund and Income, dark to light and back, the centre never leaves the icon and the radius starts at 0.
