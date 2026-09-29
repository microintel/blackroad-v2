function formatMoney(value) {
    const amount = Number(value) || 0;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function monthKey(date) {
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
    const [year, month] = key.split("-");

    return new Date(
        Number(year),
        Number(month) - 1,
        1
    ).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric"
    });
}

function getEntryAmount(entry, field) {
    return Number(entry?.[field]) || 0;
}

function calculateStatistics(entries) {
    const monthly = {};
    const categories = {};

    let income = 0;
    let expense = 0;
    let investment = 0;
    let investmentSales = 0;
    let realizedGainLoss = 0;

    entries.forEach((entry) => {
        const date =
            entry.date ||
            entry.createdAt ||
            entry.timestamp;

        const month = monthKey(date);

        if (!month) {
            return;
        }

        if (!monthly[month]) {
            monthly[month] = {
                income: 0,
                expense: 0,
                investment: 0,
                investmentSales: 0,
                realizedGainLoss: 0
            };
        }

        const calculated = entry.calculated || entry;

        const entryIncome =
            getEntryAmount(calculated, "income");

        const entryExpense =
            getEntryAmount(calculated, "expense");

        const entryInvestment =
            getEntryAmount(calculated, "investment");

        const entryInvestmentSale =
            getEntryAmount(calculated, "investmentSale");

        const entryGainLoss =
            getEntryAmount(calculated, "realizedGainLoss");

        income += entryIncome;
        expense += entryExpense;
        investment += entryInvestment;
        investmentSales += entryInvestmentSale;
        realizedGainLoss += entryGainLoss;

        monthly[month].income += entryIncome;
        monthly[month].expense += entryExpense;
        monthly[month].investment += entryInvestment;
        monthly[month].investmentSales += entryInvestmentSale;
        monthly[month].realizedGainLoss += entryGainLoss;

        const category =
            entry.category ||
            entry.type ||
            "Other";

        if (!categories[category]) {
            categories[category] = 0;
        }

        categories[category] += entryExpense;
    });

    return {
        income,
        expense,
        investment,
        investmentSales,
        realizedGainLoss,
        monthly,
        categories
    };
}

function renderMonthlyTable(monthly) {
    const months = Object.keys(monthly).sort().reverse();

    if (!months.length) {
        return `
            <div class="br-empty-state">
                <strong>No monthly data</strong>
                <p>Monthly statistics will appear when transactions are added.</p>
            </div>
        `;
    }

    return `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Income</th>
                        <th>Expenses</th>
                        <th>Investments</th>
                        <th>Net</th>
                    </tr>
                </thead>

                <tbody>
                    ${months.map((month) => {
                        const item = monthly[month];

                        const net =
                            item.income -
                            item.expense -
                            item.investment +
                            item.investmentSales +
                            item.realizedGainLoss;

                        return `
                            <tr>
                                <td>${escapeHtml(monthLabel(month))}</td>
                                <td>${formatMoney(item.income)}</td>
                                <td>${formatMoney(item.expense)}</td>
                                <td>${formatMoney(item.investment)}</td>
                                <td>${formatMoney(net)}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderCategoryTable(categories) {
    const items = Object.entries(categories)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    if (!items.length) {
        return `
            <div class="br-empty-state">
                <strong>No expense categories</strong>
                <p>Category statistics will appear when expenses are recorded.</p>
            </div>
        `;
    }

    return `
        <div class="br-table-wrap">
            <table class="br-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Expenses</th>
                    </tr>
                </thead>

                <tbody>
                    ${items.map(([category, amount]) => `
                        <tr>
                            <td>${escapeHtml(category)}</td>
                            <td>${formatMoney(amount)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

export function renderIncomeStatistics(entries = []) {
    const statistics = calculateStatistics(entries);

    const netCashFlow =
        statistics.income -
        statistics.expense;

    const investmentFlow =
        statistics.investment -
        statistics.investmentSales;

    return `
        <section class="br-statistics-view">

            <div class="br-page-heading">
                <div>
                    <h2>Statistics</h2>
                    <p>
                        Understand your income, expenses,
                        investments and financial activity.
                    </p>
                </div>
            </div>

            <div class="br-grid br-grid-4">

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Total Income
                    </span>

                    <strong class="br-stat-value">
                        ${formatMoney(statistics.income)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Total Expenses
                    </span>

                    <strong class="br-stat-value">
                        ${formatMoney(statistics.expense)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Net Cash Flow
                    </span>

                    <strong class="br-stat-value">
                        ${formatMoney(netCashFlow)}
                    </strong>
                </div>

                <div class="br-card br-stat">
                    <span class="br-stat-label">
                        Investment Flow
                    </span>

                    <strong class="br-stat-value">
                        ${formatMoney(investmentFlow)}
                    </strong>
                </div>

            </div>

            <div class="br-grid br-grid-2">

                <div class="br-card">

                    <div class="br-card-heading">
                        <div>
                            <h3>Monthly Overview</h3>
                            <p class="br-muted">
                                Income and spending by month.
                            </p>
                        </div>
                    </div>

                    ${renderMonthlyTable(statistics.monthly)}

                </div>

                <div class="br-card">

                    <div class="br-card-heading">
                        <div>
                            <h3>Expense Categories</h3>
                            <p class="br-muted">
                                Where your expenses are going.
                            </p>
                        </div>
                    </div>

                    ${renderCategoryTable(statistics.categories)}

                </div>

            </div>

            <div class="br-card">

                <div class="br-card-heading">
                    <div>
                        <h3>Investment Activity</h3>
                        <p class="br-muted">
                            Summary of investment purchases,
                            sales and realized gains or losses.
                        </p>
                    </div>
                </div>

                <div class="br-grid br-grid-3">

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Investments
                        </span>

                        <strong class="br-stat-value">
                            ${formatMoney(statistics.investment)}
                        </strong>
                    </div>

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Investment Sales
                        </span>

                        <strong class="br-stat-value">
                            ${formatMoney(statistics.investmentSales)}
                        </strong>
                    </div>

                    <div class="br-stat">
                        <span class="br-stat-label">
                            Realized Gain / Loss
                        </span>

                        <strong class="br-stat-value">
                            ${formatMoney(statistics.realizedGainLoss)}
                        </strong>
                    </div>

                </div>

            </div>

        </section>
    `;
}