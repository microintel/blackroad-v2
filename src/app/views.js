import { Dashboard } from "../features/dashboard/dashboard.js";
import { Income } from "../features/income/income.js";
import { Stocks } from "../features/stocks/stocks.js";
import { Deposits } from "../features/deposits/deposits.js";
import { Lending } from "../features/lending/lending.js";
import { StepUp } from "../features/stepup/stepup.js";
import { Accounting } from "../features/accounting/accounting.js";
import { Notifications } from "../features/notifications/notifications.js";
import { Account } from "../features/account/account.js";
import { DataManagement } from "../features/data/data-management.js";

export async function renderView(route) {
    switch (route.module) {
        case "dashboard":
            return Dashboard();

        case "income":
            return await Income();

        case "stocks":
            return await Stocks();

        case "deposits":
            return await Deposits();

        case "lending":
            return await Lending();

        case "stepup":
            return await StepUp();

        case "accounting":
            return await Accounting();

        case "data":
            return await DataManagement();

        case "notifications":
            return await Notifications();

        case "account":
            return await Account();

        default:
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
}