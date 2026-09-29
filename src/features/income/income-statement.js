import {
    calculateLedgerSummary,
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

    return `
        <section class="br-statement">

            <div class="br-statement-summary">

                ${summaryCard(
                    "Income",
                    summary.income,
                    "Money received"
                )}

                ${summaryCard(
                    "Expenses",
                    summary.expense,
                    "Money spent"
                )}

                ${summaryCard(
                    "Investments",
                    summary.contributions,
                    "Money moved into assets"
                )}

                ${summaryCard(
                    "Investment sales",
                    summary.assetSales,
                    "Money returned from assets"
                )}

                ${summaryCard(
                    "Realized gain / loss",
                    summary.realizedGainLoss,
                    "Investment performance"
                )}

                ${summaryCard(
                    "Closing cash flow",
                    summary.cash,
                    "Income − expenses − investments + sales",
                    summary.cash >= 0
                        ? "positive"
                        : "negative"
                )}

            </div>

            <div class="br-card br-statement-card">

                <div class="br-card-header">
                    <div>
                        <h3>Financial statement</h3>

                        <p class="br-muted">
                            Monthly cash-flow breakdown from your
                            existing Income ledger.
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
                        ? renderMonthlyTable(rows)
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

function summaryCard(
    label,
    value,
    description,
    tone = ""
) {
    return `
        <div
            class="br-card br-statement-stat ${tone}"
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

            row.income +=
                Number(
                    calculated.income ??
                        calculatedIncome(
                            calculated
                        )
                ) || 0;

            row.expense +=
                Number(
                    calculated.expense
                ) || 0;

            row.investment +=
                Number(
                    calculated.investment
                ) || 0;

            row.sales +=
                Number(
                    calculated.investmentSale
                ) || 0;

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

function calculatedIncome(
    entry
) {
    const value =
        Number(entry.income);

    return Number.isFinite(
        value
    )
        ? Math.max(
              0,
              value
          )
        : 0;
}

function renderMonthlyTable(
    rows
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
                                    <tr data-month-key="${mk}">

                                        <td>
                                            <strong>
                                                ${formatMonth(
                                                    row.date
                                                )}
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

                                        <td>
                                            ${formatMoney(
                                                row.income
                                            )}
                                        </td>

                                        <td>
                                            ${formatMoney(
                                                row.expense
                                            )}
                                        </td>

                                        <td>
                                            ${formatMoney(
                                                row.investment
                                            )}
                                        </td>

                                        <td>
                                            ${formatMoney(
                                                row.sales
                                            )}
                                        </td>

                                        <td>
                                            <strong>
                                                ${formatMoney(
                                                    cash
                                                )}
                                            </strong>
                                        </td>

                                        <td>
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

            <th>
                ${formatMoney(
                    total.income
                )}
            </th>

            <th>
                ${formatMoney(
                    total.expense
                )}
            </th>

            <th>
                ${formatMoney(
                    total.investment
                )}
            </th>

            <th>
                ${formatMoney(
                    total.sales
                )}
            </th>

            <th>
                ${formatMoney(
                    cash
                )}
            </th>

            <th>
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

                                    <td>
                                        ${formatMoney(
                                            row.invested
                                        )}
                                    </td>

                                    <td>
                                        ${formatMoney(
                                            row.sold
                                        )}
                                    </td>

                                    <td>
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