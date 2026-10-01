/* =========================================================
   BlackRoad V2 service worker  (Phase 15)
   - App shell is precached so the app opens offline.
   - Same-origin GET: cache-first, refreshed in the background.
   - Page navigations (/income, /stocks ...): network-first,
     falling back to the cached index.html (SPA fallback).
   - Cross-origin requests (stock LTP API, MFAPI) are NEVER
     cached or intercepted.
   - IndexedDB user data is never touched by the worker.
   Bump CACHE_VERSION whenever shell files change.
   ========================================================= */

const CACHE_VERSION = "v33";
const CACHE_NAME = "blackroad-v2-" + CACHE_VERSION;

const SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./assets/audio/click.mp3",
    "./assets/icons/android-icon-192x192.png",
    "./assets/icons/icon512_maskable.png",
    "./assets/icons/icon512_rounded.png",
    "./src/app/app.js",
    "./src/app/navigation.js",
    "./src/app/router.js",
    "./src/app/views.js",
    "./src/components/chart-colors.js",
    "./src/components/chart-tooltip.js",
    "./src/components/icons.js",
    "./src/components/skeleton.js",
    "./src/components/layout/mobile-nav.js",
    "./src/components/layout/sidebar.js",
    "./src/components/layout/topbar.js",
    "./src/data/data-service.js",
    "./src/data/database.js",
    "./src/data/db-registry.js",
    "./src/data/stores/accounting-store.js",
    "./src/data/stores/base-store.js",
    "./src/data/stores/deposit-store.js",
    "./src/data/stores/income-store.js",
    "./src/data/stores/lending-store.js",
    "./src/data/stores/stepup-store.js",
    "./src/data/stores/stocks-store.js",
    "./src/features/account/account.js",
    "./src/features/account/appearance.js",
    "./src/features/auth/auth-screen.js",
    "./src/features/auth/auth-background.js",
    "./src/components/confirm-dialog.js",
    "./src/features/accounting/accounting-service.js",
    "./src/features/accounting/accounting.js",
    "./src/features/dashboard/dashboard-service.js",
    "./src/features/dashboard/dashboard.js",
    "./src/features/dashboard/intelligence/cash-flow.js",
    "./src/features/dashboard/intelligence/debt.js",
    "./src/features/dashboard/intelligence/emergency-fund.js",
    "./src/features/dashboard/intelligence/engine.js",
    "./src/features/dashboard/intelligence/example-data.js",
    "./src/features/dashboard/intelligence/explainable-insights.js",
    "./src/features/dashboard/intelligence/financial-intelligence.js",
    "./src/features/dashboard/intelligence/goals.js",
    "./src/features/dashboard/intelligence/health.js",
    "./src/features/dashboard/intelligence/portfolio-concentration.js",
    "./src/features/dashboard/intelligence/risk.js",
    "./src/features/dashboard/intelligence/shared.js",
    "./src/features/dashboard/intelligence/subscriptions.js",
    "./src/features/dashboard/intelligence/timeline.js",
    "./src/features/dashboard/intelligence/what-changed.js",
    "./src/features/dashboard/intelligence/what-if.js",
    "./src/features/data/data-management.js",
    "./src/features/deposits/deposits-service.js",
    "./src/features/deposits/deposits.js",
    "./src/features/income/income-compare.js",
    "./src/features/income/income-expand.js",
    "./src/features/income/income-jumpto.js",
    "./src/features/income/income-search.js",
    "./src/features/income/income-service.js",
    "./src/features/income/income-shared.js",
    "./src/features/income/income-statement.js",
    "./src/features/income/income-statistics.js",
    "./src/features/income/income.js",
    "./src/features/lending/lending-service.js",
    "./src/features/lending/lending.js",
    "./src/features/notifications/notifications-service.js",
    "./src/features/notifications/notifications.js",
    "./src/features/stepup/stepup-charts.js",
    "./src/features/stepup/stepup-fund.js",
    "./src/features/stepup/stepup-service.js",
    "./src/features/stepup/stepup.js",
    "./src/features/stocks/stocks-live.js",
    "./src/features/stocks/stocks-print.js",
    "./src/features/stocks/stocks-service.js",
    "./src/features/stocks/stocks.js",
    "./src/services/auth.js",
    "./src/services/backup-service.js",
    "./src/services/legacy-import.js",
    "./src/services/preferences.js",
    "./src/styles/accounting.css",
    "./src/styles/auth.css",
    "./src/styles/chart-tooltip.css",
    "./src/styles/themes.css",
    "./src/styles/mobile.css",
    "./src/styles/components.css",
    "./src/styles/dashboard.css",
    "./src/styles/global.css",
    "./src/styles/income.css",
    "./src/styles/intelligence.css",
    "./src/styles/layout.css",
    "./src/styles/lending.css",
    "./src/styles/notifications.css",
    "./src/styles/skeleton.css",
    "./src/styles/stepup.css",
    "./src/styles/stocks.css",
    "./src/styles/theme.css",
    "./src/styles/tokens.css",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) =>
                Promise.all(
                    SHELL.map((url) =>
                        cache.add(new Request(url, { cache: "reload" }))
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter(
                            (n) =>
                                n.startsWith("blackroad-v2-") &&
                                n !== CACHE_NAME
                        )
                        .map((n) => caches.delete(n))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;

    if (req.method !== "GET") return;

    const url = new URL(req.url);

    // Never touch cross-origin traffic (live price / NAV APIs).
    if (url.origin !== self.location.origin) return;

    // Page navigation: network first, offline -> cached shell.
    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches
                        .open(CACHE_NAME)
                        .then((c) => c.put("./index.html", copy));
                    return res;
                })
                .catch(() =>
                    caches
                        .match("./index.html")
                        .then((r) => r || caches.match("./"))
                )
        );
        return;
    }

    // Static assets: cache first, refresh in background.
    event.respondWith(
        caches.match(req).then((cached) => {
            const refresh = fetch(req)
                .then((res) => {
                    if (res && res.status === 200 && res.type === "basic") {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
                    }
                    return res;
                })
                .catch(() => cached);

            return cached || refresh;
        })
    );
});

self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});
