import { dataService } from "../../data/data-service.js";

import {
    calculateLedgerSummary,
    calculateCurrentMonth,
    getRecentTransactions
} from "./income-service.js";

function formatMoney(value) {
    return (
        "₹" +
        Number(value || 0).toLocaleString(
            "en-IN",
            {
                maximumFractionDigits: 2
            }
        )
    );
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(date) {
    if (!date) {
        return "No date";
    }

    const parsed = new Date(
        date + "T00:00:00"
    );

    if (Number.isNaN(parsed.getTime())) {
        return date;
    }

    return parsed.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}

function createStatCard(
    label,
    value,
    description
) {
    return `
        <div class="br-card br-stat">
            <span class="br-stat-label">
                ${label}
            </span>

            <strong class="br-stat-value">
                ${value}
            </strong>

            <span class="br-muted">
                ${description}
            </span>
        </div>
    `;
}

export async function Income() {
    const page = document.createElement("section");

    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>Income & Expenses</h2>
                <p>
                    Your income, expenses, investments and
                    cash flow in one place.
                </p>
            </div>

            <div class="br-page-heading-actions">
                <button
                    class="br-button br-button-primary"
                    id="incomeAddButton"
                    type="button"
                >
                    + Add income
                </button>
            </div>
        </div>

        <div
            id="incomeError"
            class="br-card"
            hidden
        ></div>

        <div
            id="incomeLoading"
            class="br-card"
        >
            Loading your financial data...
        </div>

        <div
            id="incomeContent"
            hidden
        >
            <div
                class="br-grid br-grid-4"
                id="incomeStats"
            ></div>

            <div
                class="br-grid br-grid-2"
                style="margin-top: 20px;"
            >
                <section class="br-card">
                    <div class="br-card-header">
                        <div>
                            <h3>Recent transactions</h3>
                            <p class="br-muted">
                                Latest recorded activity.
                            </p>
                        </div>
                    </div>

                    <div id="recentTransactions">
                    </div>
                </section>

                <section class="br-card">
                    <div class="br-card-header">
                        <div>
                            <h3>This month</h3>
                            <p class="br-muted">
                                Current month's cash activity.
                            </p>
                        </div>
                    </div>

                    <div id="currentMonth">
                    </div>
                </section>
            </div>

            <section
                class="br-card"
                style="margin-top: 20px;"
            >
                <div class="br-card-header">
                    <div>
                        <h3>Income entries</h3>
                        <p class="br-muted">
                            Data is read directly from your
                            existing BlackRoad ledger.
                        </p>
                    </div>

                    <span
                        class="br-muted"
                        id="incomeEntryCount"
                    >
                    </span>
                </div>

                <div id="incomeEntries">
                </div>
            </section>
        </div>
    `;

    const loading =
        page.querySelector("#incomeLoading");

    const content =
        page.querySelector("#incomeContent");

    const error =
        page.querySelector("#incomeError");

    try {
        const store =
            await dataService.getIncomeStore();

        const entries =
            await store.getEntries();

        const summary =
            calculateLedgerSummary(entries);

        const currentMonth =
            calculateCurrentMonth(entries);

        const recentTransactions =
            getRecentTransactions(entries);

        renderStats(
            page,
            summary,
            entries
        );

        renderRecentTransactions(
            page,
            recentTransactions
        );

        renderCurrentMonth(
            page,
            currentMonth
        );

        renderEntries(
            page,
            entries
        );

        page.querySelector(
            "#incomeAddButton"
        ).addEventListener(
            "click",
            () => openAddIncome(store, page)
        );

        loading.hidden = true;
        content.hidden = false;
    } catch (err) {
        console.error(
            "BlackRoad Income error:",
            err
        );

        loading.hidden = true;

        error.hidden = false;

        error.innerHTML = `
            <h3>Could not load Income & Expenses</h3>
            <p class="br-muted">
                ${escapeHTML(
                    err.message ||
                    "Unknown database error."
                )}
            </p>
        `;
    }

    return page;
}

function renderStats(
    page,
    summary,
    entries
) {
    const container =
        page.querySelector("#incomeStats");

    container.innerHTML = [
        createStatCard(
            "Total income",
            formatMoney(summary.income),
            "All recorded income"
        ),

        createStatCard(
            "Expenses",
            formatMoney(summary.expense),
            "Recorded spending"
        ),

        createStatCard(
            "Invested",
            formatMoney(summary.contributions),
            "Money moved into investments"
        ),

        createStatCard(
            "Cash balance",
            formatMoney(summary.cash),
            `${entries.length} income entries`
        )
    ].join("");
}

function renderRecentTransactions(
    page,
    transactions
) {
    const container =
        page.querySelector(
            "#recentTransactions"
        );

    if (!transactions.length) {
        container.innerHTML = `
            <p class="br-muted">
                No transactions recorded yet.
            </p>
        `;

        return;
    }

    container.innerHTML =
        transactions
            .map(
                (transaction) => `
                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            gap:16px;
                            padding:12px 0;
                            border-bottom:1px solid var(--line-soft);
                        "
                    >
                        <div>
                            <strong>
                                ${escapeHTML(
                                    transaction.description ||
                                    "Transaction"
                                )}
                            </strong>

                            <div class="br-muted">
                                ${
                                    formatDate(
                                        transaction.date ||
                                        transaction.entryDate
                                    )
                                }

                                ${
                                    transaction.category
                                        ? " · " +
                                          escapeHTML(
                                              transaction.category
                                          )
                                        : ""
                                }
                            </div>
                        </div>

                        <strong>
                            ${formatMoney(
                                transaction.amount
                            )}
                        </strong>
                    </div>
                `
            )
            .join("");
}

function renderCurrentMonth(
    page,
    month
) {
    const container =
        page.querySelector("#currentMonth");

    container.innerHTML = `
        <div style="display:grid;gap:14px;">
            <div style="display:flex;justify-content:space-between;">
                <span class="br-muted">
                    Income
                </span>
                <strong>
                    ${formatMoney(month.income)}
                </strong>
            </div>

            <div style="display:flex;justify-content:space-between;">
                <span class="br-muted">
                    Expenses
                </span>
                <strong>
                    ${formatMoney(month.expense)}
                </strong>
            </div>

            <div style="display:flex;justify-content:space-between;">
                <span class="br-muted">
                    Investments
                </span>
                <strong>
                    ${formatMoney(month.investment)}
                </strong>
            </div>

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    padding-top:12px;
                    border-top:1px solid var(--line-soft);
                "
            >
                <span>
                    Net cash flow
                </span>

                <strong>
                    ${formatMoney(month.net)}
                </strong>
            </div>
        </div>
    `;
}

function renderEntries(
    page,
    entries
) {
    const container =
        page.querySelector("#incomeEntries");

    const count =
        page.querySelector("#incomeEntryCount");

    count.textContent =
        `${entries.length} entries`;

    if (!entries.length) {
        container.innerHTML = `
            <p class="br-muted">
                No income entries found.
            </p>
        `;

        return;
    }

    const sorted = [...entries].sort(
        (a, b) =>
            new Date(
                b.date || "1900-01-01"
            ) -
            new Date(
                a.date || "1900-01-01"
            )
    );

    container.innerHTML =
        sorted
            .map(
                (entry) => `
                    <div
                        style="
                            padding:16px 0;
                            border-bottom:1px solid var(--line-soft);
                        "
                    >
                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:16px;
                            "
                        >
                            <div>
                                <strong>
                                    ${escapeHTML(
                                        entry.from ||
                                        "Income"
                                    )}
                                </strong>

                                <div class="br-muted">
                                    ${formatDate(
                                        entry.date
                                    )}

                                    ${
                                        entry.category
                                            ? " · " +
                                              escapeHTML(
                                                  entry.category
                                              )
                                            : ""
                                    }
                                </div>
                            </div>

                            <strong>
                                +${formatMoney(
                                    entry.income
                                )}
                            </strong>
                        </div>

                        <div
                            class="br-muted"
                            style="margin-top:8px;"
                        >
                            Expense:
                            ${formatMoney(
                                entry.expense
                            )}
                            · Investment:
                            ${formatMoney(
                                entry.investment
                            )}
                            · Balance:
                            ${formatMoney(
                                entry.balance
                            )}
                        </div>
                    </div>
                `
            )
            .join("");
}

async function openAddIncome(
    store,
    page
) {
    const amount =
        window.prompt(
            "Income amount:"
        );

    if (amount === null) {
        return;
    }

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(
            numericAmount
        ) ||
        numericAmount <= 0
    ) {
        window.alert(
            "Please enter a valid amount."
        );

        return;
    }

    const from =
        window.prompt(
            "Income source:"
        );

    if (from === null) {
        return;
    }

    const category =
        window.prompt(
            "Income category:"
        ) || "";

    const date =
        window.prompt(
            "Date (YYYY-MM-DD):",
            new Date()
                .toISOString()
                .slice(0, 10)
        );

    if (date === null) {
        return;
    }

    const entry = {
        income: numericAmount,
        from: from.trim(),
        category: category.trim(),
        date: date.trim(),
        expense: 0,
        investment: 0,
        investmentSale: 0,
        realizedGainLoss: 0,
        balance: numericAmount,
        transactions: []
    };

    await store.saveEntry(entry);

    /*
     * Re-render the whole route so the new data becomes
     * visible immediately.
     */
    window.dispatchEvent(
        new PopStateEvent("popstate")
    );
}