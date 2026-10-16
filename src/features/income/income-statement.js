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

    const chips = [
        ["Income", summary.income, "inc-dot-income"],
        ["Expenses", summary.expense, "inc-dot-expense"],
        ["Invested", summary.contributions, "inc-dot-invested"],
        ["Sales", summary.assetSales, "inc-dot-sales"]
    ];

    return `
        <section class="br-statement st">

            <div class="st-hero">
                <span class="st-hero-label">Cash flow</span>
                <strong class="st-hero-value ${balanceClass(summary.cash)}">${formatMoney(summary.cash)}</strong>
                ${
                    Math.abs(Number(summary.realizedGainLoss) || 0) >= 0.005
                        ? `<span class="st-hero-sub ${signClass(summary.realizedGainLoss)}">${signed(summary.realizedGainLoss)} realized</span>`
                        : ""
                }
            </div>

            <div class="st-chips">
                ${chips.map(([label, value, dot]) => `
                    <div class="st-chip">
                        <span class="st-chip-label"><i class="st-dot ${dot}"></i>${label}</span>
                        <strong>${amount(value)}</strong>
                    </div>
                `).join("")}
            </div>

            ${
                rows.length
                    ? renderPeriodViews(rows, yearRows)
                    : emptyStatement()
            }

            ${renderInvestmentList(
                investmentBreakdownByCategory(
                    entries
                )
            )}

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

/* A dash instead of "₹0" keeps the lists quiet. */
function amount(
    value
) {
    return Math.abs(Number(value) || 0) < 0.005
        ? "–"
        : formatMoney(value);
}

/* One coloured figure. Zero ones are hidden on phones to keep rows short. */
function fig(
    cls,
    dot,
    title,
    value
) {
    const zero =
        Math.abs(Number(value) || 0) < 0.005
            ? " st-zero"
            : "";

    return `<span class="${cls}${zero}" title="${title}"><i class="st-dot ${dot}"></i>${amount(value)}</span>`;
}

function signed(
    value
) {
    const number =
        Number(value) || 0;

    return (
        (number > 0 ? "+" : number < 0 ? "−" : "") +
        formatMoney(Math.abs(number))
    );
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
 * Months / Years toggle. Both lists are drawn and a CSS-only radio
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
        <div class="br-statement-toggle st-toggle" role="group"
            aria-label="Statement period">
            <label for="statement-unit-month">Months</label>
            <label for="statement-unit-year">Years</label>
        </div>
        <div class="br-statement-view br-statement-view-month">
            ${renderPeriodList(monthRows)}
        </div>
        <div class="br-statement-view br-statement-view-year">
            ${renderPeriodList(yearRows, "year")}
        </div>
    `;
}

function cashOf(
    row
) {
    return (
        row.income -
        row.expense -
        row.investment +
        row.sales
    );
}

function renderPeriodList(
    rows,
    unit = "month"
) {
    const total = rows.reduce(
        (sum, row) => ({
            income: sum.income + row.income,
            expense: sum.expense + row.expense,
            investment: sum.investment + row.investment,
            sales: sum.sales + row.sales,
            gainLoss: sum.gainLoss + row.gainLoss
        }),
        { income: 0, expense: 0, investment: 0, sales: 0, gainLoss: 0 }
    );

    const line = (
        row,
        title,
        attrs = "",
        extraClass = ""
    ) => {
        const cash = cashOf(row);
        const gain = Number(row.gainLoss) || 0;

        return `
            <div class="st-row ${extraClass}" ${attrs}>
                <div class="st-row-title">${title}</div>
                <div class="st-row-figs">
                    ${fig("inc-c-income", "inc-dot-income", "Income", row.income)}
                    ${fig("inc-c-expense", "inc-dot-expense", "Expenses", row.expense)}
                    ${fig("inc-c-invested", "inc-dot-invested", "Invested", row.investment)}
                    ${fig("inc-c-sales", "inc-dot-sales", "Sales", row.sales)}
                </div>
                <div class="st-row-cash">
                    <strong class="${balanceClass(cash)}">${formatMoney(cash)}</strong>
                    ${
                        Math.abs(gain) >= 0.005
                            ? `<small class="${signClass(gain)}">${signed(gain)}</small>`
                            : ""
                    }
                </div>
            </div>
        `;
    };

    return `
        <div class="st-list">
            ${rows.map((row) => {
                const mk = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;

                return line(
                    row,
                    unit === "year"
                        ? row.date.getFullYear()
                        : formatMonth(row.date),
                    unit === "year"
                        ? `data-year-key="${row.key}" role="button" tabindex="0"`
                        : `data-month-key="${mk}" role="button" tabindex="0"`,
                    "st-row-tap"
                );
            }).join("")}
            ${line(total, "Total", "", "st-row-total")}
        </div>
    `;
}

function renderInvestmentList(
    rows
) {
    if (!rows.length) {
        return "";
    }

    return `
        <div class="st-section">
            <h3 class="st-section-title">Investments</h3>
            <div class="st-list">
                ${rows.map((row) => `
                    <div class="st-row st-row-invest">
                        <div class="st-row-title">${escapeHTML(row.category)}</div>
                        <div class="st-row-figs">
                            ${fig("inc-c-invested", "inc-dot-invested", "Bought", row.invested)}
                            ${fig("inc-c-sales", "inc-dot-sales", "Sold", row.sold)}
                        </div>
                        <div class="st-row-cash">
                            <strong class="inc-c-invested">${formatMoney(row.net)}</strong>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function emptyStatement() {
    return `<div class="st-empty">No data yet</div>`;
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