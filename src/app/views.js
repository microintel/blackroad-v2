/* Each page's code is loaded the first time it is needed (smaller startup),
   and warmed up in the background afterwards so moving between sections
   feels instant. The views themselves are unchanged. */

const loaders = {
    dashboard: () => import("../features/dashboard/dashboard.js").then((m) => m.Dashboard),
    networth: () => import("../features/networth/networth.js").then((m) => m.NetWorth),
    income: () => import("../features/income/income.js").then((m) => m.Income),
    stocks: () => import("../features/stocks/stocks.js").then((m) => m.Stocks),
    deposits: () => import("../features/deposits/deposits.js").then((m) => m.Deposits),
    lending: () => import("../features/lending/lending.js").then((m) => m.Lending),
    stepup: () => import("../features/stepup/stepup.js").then((m) => m.StepUp),
    intelligence: () =>
        import("../features/dashboard/intelligence/financial-intelligence.js").then(
            (m) => m.FinancialIntelligencePage
        ),
    calculators: () => import("../features/calculators/calculators.js").then((m) => m.Calculators),
    accounting: () => import("../features/accounting/accounting.js").then((m) => m.Accounting),
    connectbroker: () => import("../features/connect/connect-broker.js").then((m) => m.ConnectBroker),
    roadsync: () => import("../features/roadsync/roadsync.js").then((m) => m.RoadSync),
    brokers: () => import("../features/brokers/brokers.js").then((m) => m.Brokers),
    data: () => import("../features/data/data-management.js").then((m) => m.DataManagement),
    notifications: () => import("../features/notifications/notifications.js").then((m) => m.Notifications),
    account: () => import("../features/account/account.js").then((m) => m.Account)
};

/* Start loading a page's code ahead of time. Never throws. */
export function prefetchView(moduleName) {
    const load = loaders[moduleName];

    if (load) load().catch(() => {});
}

/* Warm every page, one per idle slice, once the first page is up. */
export function warmViews() {
    const names = Object.keys(loaders);
    const idle = window.requestIdleCallback
        ? (fn) => window.requestIdleCallback(fn, { timeout: 3000 })
        : (fn) => setTimeout(fn, 400);

    const next = () => {
        const name = names.shift();

        if (!name) return;

        prefetchView(name);
        idle(next);
    };

    idle(next);
}

export async function renderView(route) {
    const view = loaders[route.module];

    if (view) {
        return await (await view())();
    }

    return `
        <section class="br-page br-page-state">
            <div class="br-state br-state-error" role="alert">
                <div class="br-st-art" aria-hidden="true"><span class="br-st-ring"></span>
                    <svg class="br-st-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M9 9l4 4M13 9l-4 4"/></svg>
                </div>
                <div class="br-st-code">Error 404</div>
                <h3 class="br-st-title">Page not found</h3>
                <p class="br-st-text">The requested BlackRoad page does not exist. It may have moved, or the link is out of date.</p>
                <div class="br-st-actions">
                    <button type="button" class="br-button br-button-primary" data-st-home>Go to dashboard</button>
                </div>
            </div>
        </section>
    `;
}
