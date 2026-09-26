import { Dashboard } from "../features/dashboard/dashboard.js";
import { Income } from "../features/income/income.js";

export async function renderView(route) {
    switch (route.module) {
        case "dashboard":
            return Dashboard();

        case "income":
            return await Income();

        case "stocks":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Stocks</h2>
                            <p>
                                Stock portfolio and market data.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <h3>Stocks</h3>
                        <p class="br-muted">
                            The existing Stocks module will be
                            connected in the next phase.
                        </p>
                    </div>
                </section>
            `;

        case "deposits":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Fixed Deposits</h2>
                            <p>
                                Manage your fixed deposits.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <h3>Fixed Deposits</h3>
                        <p class="br-muted">
                            Existing FD data will be connected next.
                        </p>
                    </div>
                </section>
            `;

        case "lending":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Lending</h2>
                            <p>
                                Track money you lend and receive.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <h3>Lending</h3>
                        <p class="br-muted">
                            Existing Lending data will be connected next.
                        </p>
                    </div>
                </section>
            `;

        case "stepup":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>StepUp</h2>
                            <p>
                                Manage your StepUp investment planning.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <h3>StepUp</h3>
                        <p class="br-muted">
                            Existing StepUp data will be connected next.
                        </p>
                    </div>
                </section>
            `;

        case "accounting":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Accounting</h2>
                            <p>
                                Manual accounting and records.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <h3>Accounting</h3>
                        <p class="br-muted">
                            Existing Accounting data will be connected next.
                        </p>
                    </div>
                </section>
            `;

        case "notifications":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Notifications</h2>
                            <p>
                                Your BlackRoad notifications.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <p class="br-muted">
                            Notifications will be connected later.
                        </p>
                    </div>
                </section>
            `;

        case "account":
            return `
                <section class="br-page">
                    <div class="br-page-heading">
                        <div>
                            <h2>Account</h2>
                            <p>
                                BlackRoad account settings.
                            </p>
                        </div>
                    </div>

                    <div class="br-card">
                        <p class="br-muted">
                            Account settings will be connected later.
                        </p>
                    </div>
                </section>
            `;

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