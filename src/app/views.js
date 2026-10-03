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
        <section class="br-page">
            <div class="br-card">
                <h2>Page not found</h2>

                <p class="br-muted">
                    The requested BlackRoad page
                    does not exist.
                </p>
            </div>
        </section>
    `;
}
