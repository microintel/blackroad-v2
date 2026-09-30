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
