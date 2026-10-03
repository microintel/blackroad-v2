import {
    calculateLedgerSummary,
    entryIncomeAmount,
    entryInvestmentSaleDisplayAmount,
    investmentBreakdownByCategory,
    recalcEntry,
    formatMoney
} from "./income-service.js";

export function renderIncomeStatement(
    entries = []
) {
    const summary =
        calculateLedgerSummary(
            entries
        );

    const rows =
        buildMonthlyRows(entries);

    const yearRows =
        buildYearlyRows(rows);

    return `
        <section class="br-statement">

            <div class="br-statement-summary">

                ${summaryCard(
                    "Income",
                    summary.income,
                    "Money received",
                    "",
                    "inc-c-income"
                )}

                ${summaryCard(
                    "Expenses",
                    summary.expense,
                    "Money spent",
                    "",
                    "inc-c-expense"
                )}

                ${summaryCard(
                    "Investments",
                    summary.contributions,
                    "Money moved into assets",
                    "",
                    "inc-c-invested"
                )}

                ${summaryCard(
                    "Investment sales",
                    summary.assetSales,
                    "Money returned from assets",
                    "",
                    "inc-c-sales"
                )}

                ${summaryCard(
                    "Realized gain / loss",
                    summary.realizedGainLoss,
                    "Investment performance",
                    "",
                    signClass(summary.realizedGainLoss)
                )}

                ${summaryCard(
                    "Closing cash flow",
                    summary.cash,
                    "Income − expenses − investments + sales",
                    summary.cash >= 0
                        ? "positive"
                        : "negative",
                    summary.cash >= 0
                        ? "inc-c-balance"
                        : "inc-c-expense"
                )}

            </div>

            <div class="br-card br-statement-card">

                <div class="br-card-header">
                    <div>
                        <h3>Financial statement</h3>

                        <p class="br-muted">
                            Monthly and yearly cash-flow breakdown
                            from your existing Income ledger.
                        </p>
                    </div>

                    <div class="br-statement-period">
                        ${entries.length}
                        ${
                            entries.length === 1
                                ? "entry"
                                : "entries"
                        }
                    </div>
                </div>

                ${
                    rows.length
                        ? renderPeriodViews(rows, yearRows)
                        : emptyStatement()
                }

            </div>

            <div
                class="br-card"
                style="margin-top:20px;"
            >
                <div class="br-card-header">
                    <div>
                        <h3>Investment positions</h3>

                        <p class="br-muted">
                            Net invested amount by category.
                        </p>
                    </div>
                </div>

                ${renderInvestmentTable(
                    investmentBreakdownByCategory(
                        entries
                    )
                )}
            </div>

        </section>
    `;
}

/*
 * Colour helper: green for a gain, red for a loss, none at zero.
 */
function signClass(
    value
) {
    const number =
        Number(value) || 0;

    if (number > 0) {
        return "inc-c-income";
    }

    if (number < 0) {
        return "inc-c-expense";
    }

    return "";
}

/*
 * Balance / cash flow: blue when available, red when overdrawn.
 */
function balanceClass(
    value
) {
    return (Number(value) || 0) < 0
        ? "inc-c-expense"
        : "inc-c-balance";
}

function summaryCard(
    label,
    value,
    description,
    tone = "",
    kind = ""
) {
    return `
        <div
            class="br-card br-statement-stat ${tone} ${kind}"
        >
            <span class="br-muted">
                ${label}
            </span>

            <strong>
                ${formatMoney(value)}
            </strong>

            <small class="br-muted">
                ${description}
            </small>
        </div>
    `;
}

function buildMonthlyRows(
    entries
) {
    const months =
        new Map();

    entries.forEach(
        (entry) => {
            if (!entry.date) {
                return;
            }

            const calculated =
                recalcEntry({
                    ...entry,

                    transactions: (
                        entry.transactions ||
                        []
                    ).map(
                        (transaction) => ({
                            ...transaction
                        })
                    )
                });

            const date =
                new Date(
                    entry.date +
                        "T00:00:00"
                );

            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return;
            }

            const key =
                `${date.getFullYear()}-${String(
                    date.getMonth() + 1
                ).padStart(2, "0")}`;

            if (
                !months.has(key)
            ) {
                months.set(
                    key,
                    {
                        key,
                        date,

                        income: 0,
                        expense: 0,
                        investment: 0,
                        sales: 0,
                        gainLoss: 0,

                        entries: 0,
                        transactions: 0
                    }
                );
            }

            const row =
                months.get(key);

            /*
             * Income uses the same rule as the Income search and
             * Compare views (entryIncomeAmount): investment-sale
             * proceeds are not income. Reading the raw stored
             * `income` here counted them as income.
             */
            row.income +=
                entryIncomeAmount(
                    entry
                );

            row.expense +=
                Number(
                    calculated.expense
                ) || 0;

            row.investment +=
                Number(
                    calculated.investment
                ) || 0;

            /*
             * Sales come from the entry as loaded. `calculated` is a
             * second recalculation of an already-calculated entry,
             * which drops sale-entry proceeds (they were being
             * counted as income instead).
             */
            row.sales +=
                entryInvestmentSaleDisplayAmount(
                    entry
                );

            row.gainLoss +=
                Number(
                    calculated.realizedGainLoss
                ) || 0;

            row.entries += 1;

            row.transactions +=
                (
                    calculated.transactions ||
                    []
                ).length;
        }
    );

    return [
        ...months.values()
    ].sort(
        (a, b) =>
            b.key.localeCompare(
                a.key
            )
    );
}

/* One row per calendar year: the monthly rows added together. */
function buildYearlyRows(
    monthRows
) {
    const years = new Map();

    monthRows.forEach((row) => {
        const year = row.date.getFullYear();

        if (!years.has(year)) {
            years.set(year, {
                key: String(year),
                date: new Date(year, 0, 1),
                income: 0,
                expense: 0,
                investment: 0,
                sales: 0,
                gainLoss: 0,
                entries: 0,
                transactions: 0
            });
        }

        const total = years.get(year);

        total.income += row.income;
        total.expense += row.expense;
        total.investment += row.investment;
        total.sales += row.sales;
        total.gainLoss += row.gainLoss;
        total.entries += row.entries;
        total.transactions += row.transactions;
    });

    return [...years.values()].sort((a, b) =>
        b.key.localeCompare(a.key)
    );
}

/*
 * Months / Years toggle. Both tables are drawn and a CSS-only radio
 * switch shows one of them, so it keeps working when the Statement
 * view is served from the render cache.
 */
function renderPeriodViews(
    monthRows,
    yearRows
) {
    return `
        <input type="radio" class="br-statement-radio"
            name="statement-unit" id="statement-unit-month"
            value="month" checked>
        <input type="radio" class="br-statement-radio"
            name="statement-unit" id="statement-unit-year"
            value="year">

        <div class="br-statement-toggle" role="group"
            aria-label="Statement period">
            <label for="statement-unit-month">Months</label>
            <label for="statement-unit-year">Years</label>
        </div>

        <div class="br-statement-view br-statement-view-month">
            ${renderMonthlyTable(monthRows)}
        </div>

        <div class="br-statement-view br-statement-view-year">
            ${renderMonthlyTable(yearRows, "year")}
        </div>
    `;
}

function renderMonthlyTable(
    rows,
    unit = "month"
) {
    return `
        <div
            class="br-table-wrap"
        >
            <table
                class="br-table br-statement-table"
            >
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Income</th>
                        <th>Expenses</th>
                        <th>Invested</th>
                        <th>Sales</th>
                        <th>Cash flow</th>
                        <th>Gain / Loss</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows
                        .map(
                            (
                                row
                            ) => {
                                const cash =
                                    row.income -
                                    row.expense -
                                    row.investment +
                                    row.sales;

                                const mk = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;

                                return `
                                    <tr ${unit === "year" ? `data-year-key="${row.key}"` : `data-month-key="${mk}"`}>

                                        <td>
                                            <strong>
                                                ${
                                                    unit === "year"
                                                        ? row.date.getFullYear()
                                                        : formatMonth(
                                                              row.date
                                                          )
                                                }
                                            </strong>

                                            <small
                                                class="br-muted"
                                            >
                                                ${
                                                    row.entries
                                                }
                                                ${
                                                    row.entries ===
                                                    1
                                                        ? "entry"
                                                        : "entries"
                                                }
                                                ·
                                                ${
                                                    row.transactions
                                                }
                                                ${
                                                    row.transactions ===
                                                    1
                                                        ? "transaction"
                                                        : "transactions"
                                                }
                                            </small>
                                        </td>

                                        <td class="inc-c-income">
                                            ${formatMoney(
                                                row.income
                                            )}
                                        </td>

                                        <td class="inc-c-expense">
                                            ${formatMoney(
                                                row.expense
                                            )}
                                        </td>

                                        <td class="inc-c-invested">
                                            ${formatMoney(
                                                row.investment
                                            )}
                                        </td>

                                        <td class="inc-c-sales">
                                            ${formatMoney(
                                                row.sales
                                            )}
                                        </td>

                                        <td class="${balanceClass(cash)}">
                                            <strong>
                                                ${formatMoney(
                                                    cash
                                                )}
                                            </strong>
                                        </td>

                                        <td class="${signClass(row.gainLoss)}">
                                            ${formatMoney(
                                                row.gainLoss
                                            )}
                                        </td>

                                    </tr>
                                `;
                            }
                        )
                        .join("")}
                </tbody>

                <tfoot>
                    ${renderTotals(rows)}
                </tfoot>

            </table>
        </div>
    `;
}

function renderTotals(
    rows
) {
    const total = rows.reduce(
        (result, row) => {
            result.income +=
                row.income;

            result.expense +=
                row.expense;

            result.investment +=
                row.investment;

            result.sales +=
                row.sales;

            result.gainLoss +=
                row.gainLoss;

            return result;
        },
        {
            income: 0,
            expense: 0,
            investment: 0,
            sales: 0,
            gainLoss: 0
        }
    );

    const cash =
        total.income -
        total.expense -
        total.investment +
        total.sales;

    return `
        <tr>

            <th>Total</th>

            <th class="inc-c-income">
                ${formatMoney(
                    total.income
                )}
            </th>

            <th class="inc-c-expense">
                ${formatMoney(
                    total.expense
                )}
            </th>

            <th class="inc-c-invested">
                ${formatMoney(
                    total.investment
                )}
            </th>

            <th class="inc-c-sales">
                ${formatMoney(
                    total.sales
                )}
            </th>

            <th class="${balanceClass(cash)}">
                ${formatMoney(
                    cash
                )}
            </th>

            <th class="${signClass(total.gainLoss)}">
                ${formatMoney(
                    total.gainLoss
                )}
            </th>

        </tr>
    `;
}

function renderInvestmentTable(
    rows
) {
    if (!rows.length) {
        return `
            <p class="br-muted">
                No investment activity recorded yet.
            </p>
        `;
    }

    return `
        <div
            class="br-table-wrap"
        >
            <table
                class="br-table"
            >
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Total bought</th>
                        <th>Total sold</th>
                        <th>Currently invested</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows
                        .map(
                            (
                                row
                            ) => `
                                <tr>

                                    <td>
                                        <strong>
                                            ${escapeHTML(
                                                row.category
                                            )}
                                        </strong>
                                    </td>

                                    <td class="inc-c-invested">
                                        ${formatMoney(
                                            row.invested
                                        )}
                                    </td>

                                    <td class="inc-c-sales">
                                        ${formatMoney(
                                            row.sold
                                        )}
                                    </td>

                                    <td class="inc-c-invested">
                                        <strong>
                                            ${formatMoney(
                                                row.net
                                            )}
                                        </strong>
                                    </td>

                                </tr>
                            `
                        )
                        .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function emptyStatement() {
    return `
        <div
            style="
                padding:40px 20px;
                text-align:center;
            "
        >
            <h3>
                No statement data
            </h3>

            <p class="br-muted">
                Add income and transactions to
                generate your statement.
            </p>
        </div>
    `;
}

function formatMonth(
    date
) {
    return date.toLocaleDateString(
        "en-IN",
        {
            month: "long",
            year: "numeric"
        }
    );
}

function escapeHTML(
    value
) {
    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}