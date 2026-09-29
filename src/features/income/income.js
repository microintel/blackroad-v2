import { dataService } from "../../data/data-service.js";

import {
    calculateLedgerSummary,
    calculateCurrentMonth,
    investmentBreakdownByCategory,
    recalcEntry,
    matchesSearch,
    uid,
    formatMoney,
    todayISO,
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    isInvestmentCategory
} from "./income-service.js";

import {
    renderIncomeStatement
} from "./income-statement.js";

import { renderIncomeStatistics } from "./income-statistics.js";
import { mountIncomeSearch } from "./income-search.js";
import { renderIncomeCompare, handleCompareEvent } from "./income-compare.js";
import { renderIncomeExpand } from "./income-expand.js";
import { renderIncomeJumpTo } from "./income-jumpto.js";
let currentExpandPanel = "expense";
let currentEntries = [];
let currentSearch = "";
let editingEntryId = null;
let currentIncomeView = "ledger";


export async function Income() {

    const page =
        document.createElement("section");

    page.className = "br-page";

    page.innerHTML = `

        <!-- PAGE HEADER -->
        <div class="br-page-heading">

            <div>

                <h2>Income & Expenses</h2>

                <p>
                    Manage your complete income,
                    expenses and investments.
                </p>

            </div>


            <button
                type="button"
                class="br-button br-button-primary"
                data-action="add-income"
            >
                <span>+</span>
                Add income
            </button>

        </div>


        <!-- INCOME NAVIGATION -->
        <div class="br-income-tabs">
    <button
        type="button"
        class="br-income-tab active"
        data-income-tab="ledger"
    >
        Ledger
    </button>

    <button
        type="button"
        class="br-income-tab"
        data-income-tab="statement"
    >
        Statement
    </button>

    <button
        type="button"
        class="br-income-tab"
        data-income-tab="statistics"
    >
        Statistics
    </button>
    <button
        type="button"
        class="br-income-tab"
        data-income-tab="search"
    >
        Search
    </button>
    <button
        type="button"
        class="br-income-tab"
        data-income-tab="compare"
    >
        Compare
    </button>
    <button
        type="button"
        class="br-income-tab"
        data-income-tab="expand"
    >
        Expand
    </button>
    <button
        type="button"
        class="br-income-tab"
        data-income-tab="jumpto"
    >
        Jump to
    </button>
</div>


        <!-- ========================= -->
        <!-- LEDGER VIEW -->
        <!-- ========================= -->

        <div
            data-income-view-container="ledger"
        >

            <!-- SEARCH TOOLBAR -->

            <div class="br-income-toolbar">

                <div class="br-search-box">

                    <span>⌕</span>

                    <input
                        type="search"
                        placeholder="Search source, description or category..."
                        data-income-search
                    />

                </div>


                <button
                    type="button"
                    class="br-button"
                    data-action="refresh"
                >
                    Refresh
                </button>

            </div>


            <!-- SUMMARY -->

            <div
                class="br-grid br-grid-4"
                data-summary
            ></div>


            <!-- INVESTMENT SUMMARY -->

            <section
                class="br-card"
                style="margin-top:20px;"
            >

                <div class="br-card-header">

                    <div>

                        <h3>
                            Invested by category
                        </h3>

                        <p class="br-muted">
                            Current money still parked
                            in each investment category.
                        </p>

                    </div>

                </div>


                <div
                    class="br-investment-strip"
                    data-investments
                ></div>

            </section>


            <!-- LEDGER -->

            <section
                class="br-card"
                style="margin-top:20px;"
            >

                <div class="br-card-header">

                    <div>

                        <h3>
                            Income ledger
                        </h3>

                        <p
                            class="br-muted"
                            data-ledger-status
                        ></p>

                    </div>

                </div>


                <div data-ledger></div>

            </section>

        </div>


        <!-- ========================= -->
        <!-- STATEMENT VIEW -->
        <!-- ========================= -->

        <div
            data-income-view-container="statement"
            hidden
        ></div>
        <div data-income-view-container="statistics" hidden></div>
        <div data-income-view-container="search" hidden></div>
        <div data-income-view-container="compare" hidden></div>
        <div data-income-view-container="expand" hidden></div>
        <div data-income-view-container="jumpto" hidden></div>


        <!-- ========================= -->
        <!-- ADD / EDIT MODAL -->
        <!-- ========================= -->

        <div
            class="br-modal-layer"
            data-income-modal
            hidden
        >

            <div
                class="br-modal"
                role="dialog"
                aria-modal="true"
            >

                <!-- MODAL HEADER -->

                <div class="br-modal-header">

                    <div>

                        <h3 data-modal-title>
                            Add income
                        </h3>

                        <p class="br-muted">
                            Income and its related
                            transactions are stored
                            in the existing ledger.
                        </p>

                    </div>


                    <button
                        type="button"
                        class="br-button"
                        data-action="close-modal"
                    >
                        ×
                    </button>

                </div>


                <!-- FORM -->

                <form data-income-form>

                    <!-- MAIN ENTRY -->

                    <div class="br-form-grid">

                        <label>

                            <span>
                                Amount
                            </span>

                            <input
                                name="income"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                            />

                        </label>


                        <label>

                            <span>
                                Date
                            </span>

                            <input
                                name="date"
                                type="date"
                                required
                            />

                        </label>


                        <label>

                            <span>
                                Source
                            </span>

                            <input
                                name="from"
                                type="text"
                                placeholder="Salary, freelance..."
                                required
                            />

                        </label>


                        <label>

                            <span>
                                Category
                            </span>

                            <select
                                name="category"
                            ></select>

                        </label>

                    </div>


                    <!-- TRANSACTIONS -->

                    <div
                        class="br-modal-section"
                    >

                        <div
                            class="br-card-header"
                        >

                            <div>

                                <h4>
                                    Transactions
                                </h4>

                                <p class="br-muted">
                                    Add expenses or
                                    investment movements
                                    belonging to this entry.
                                </p>

                            </div>


                            <button
                                type="button"
                                class="br-button"
                                data-action="add-transaction"
                            >
                                + Transaction
                            </button>

                        </div>


                        <div
                            data-transactions
                        ></div>

                    </div>


                    <!-- MODAL FOOTER -->

                    <div
                        class="br-modal-footer"
                    >

                        <button
                            type="button"
                            class="br-button"
                            data-action="close-modal"
                        >
                            Cancel
                        </button>


                        <button
                            type="submit"
                            class="br-button br-button-primary"
                        >
                            Save
                        </button>

                    </div>

                </form>

            </div>

        </div>

    `;


    attachEvents(page);

    await loadEntries(page);

    return page;
}


/* =========================================
   EVENTS
========================================= */

function attachEvents(page) {

    page.addEventListener("change", (event) => {
        if (
            event.target.closest("[data-compare-select]") &&
            handleCompareEvent(event.target)
        ) {
            renderActiveView(page);
        }
    });

    page.addEventListener(
        "click",
        async (event) => {

            /*
             * Income tab
             */

            const incomeViewButton =
    event.target.closest(
        "[data-income-tab]"
    );


            if (incomeViewButton) {

                switchIncomeView(
    page,
    incomeViewButton.dataset
        .incomeTab
);

                return;
            }


            const expandBtn = event.target.closest("[data-expand-panel]");
            if (expandBtn) {
                currentExpandPanel = expandBtn.dataset.expandPanel;
                renderActiveView(page);
                return;
            }

            const jumpBtn = event.target.closest("[data-jump-month]");
            if (jumpBtn) {
                jumpToMonth(page, jumpBtn.dataset.jumpMonth);
                return;
            }

            const compareBox = page.querySelector('[data-income-view-container="compare"]');
            if (
                compareBox &&
                compareBox.contains(event.target) &&
                handleCompareEvent(event.target)
            ) {
                renderActiveView(page);
                return;
            }

            /*
             * Actions
             */

            const actionElement =
                event.target.closest(
                    "[data-action]"
                );


            if (!actionElement) {
                return;
            }


            const action =
                actionElement.dataset.action;


            if (
                action ===
                "add-income"
            ) {

                openIncomeModal(
                    page
                );

                return;
            }


            if (
                action ===
                "close-modal"
            ) {

                closeIncomeModal(
                    page
                );

                return;
            }


            if (
                action ===
                "add-transaction"
            ) {

                addTransactionRow(
                    page
                );

                return;
            }


            if (
                action ===
                "remove-transaction"
            ) {

                const row =
                    actionElement.closest(
                        "[data-transaction-row]"
                    );

                if (row) {
                    row.remove();
                }

                return;
            }


            if (
                action ===
                "edit-entry"
            ) {

                const entryElement =
                    actionElement.closest(
                        "[data-entry-id]"
                    );

                if (!entryElement) {
                    return;
                }

                const id =
                    Number(
                        entryElement.dataset
                            .entryId
                    );

                openIncomeModal(
                    page,
                    id
                );

                return;
            }


            if (
                action ===
                "delete-entry"
            ) {

                const entryElement =
                    actionElement.closest(
                        "[data-entry-id]"
                    );

                if (!entryElement) {
                    return;
                }

                const id =
                    Number(
                        entryElement.dataset
                            .entryId
                    );

                await deleteEntry(
                    page,
                    id
                );

                return;
            }


            if (
                action ===
                "refresh"
            ) {

                await loadEntries(
                    page
                );

                return;
            }

        }
    );


    /*
     * Search
     */

    const search =
        page.querySelector(
            "[data-income-search]"
        );


    if (search) {

        search.addEventListener(
            "input",
            () => {

                currentSearch =
                    search.value;

                renderLedger(
                    page
                );

            }
        );

    }


    /*
     * Form submit
     */

    const form =
        page.querySelector(
            "[data-income-form]"
        );


    if (form) {

        form.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();

                await saveIncome(
                    page
                );

            }
        );

    }


    /*
     * Close modal when clicking backdrop
     */

    const modal =
        page.querySelector(
            "[data-income-modal]"
        );


    if (modal) {

        modal.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    modal
                ) {

                    closeIncomeModal(
                        page
                    );

                }

            }
        );

    }

}


/* =========================================
   VIEW SWITCHING
========================================= */
function switchIncomeView(page, view) {
    currentIncomeView = view;

    page.querySelectorAll("[data-income-tab]").forEach((tab) => {
        tab.classList.toggle(
            "active",
            tab.dataset.incomeTab === view
        );
    });

    page.querySelectorAll("[data-income-view-container]").forEach((container) => {
        container.hidden =
            container.dataset.incomeViewContainer !== view;
    });

    renderActiveView(page);
}

/*
 * Render the non-ledger view that is currently open.
 * Used when switching tabs AND after data reloads.
 */
function renderActiveView(page) {
    const view = currentIncomeView;
    const container = page.querySelector(
        `[data-income-view-container="${view}"]`
    );

    if (!container) return;

    if (view === "statement") {
        container.innerHTML = renderIncomeStatement(currentEntries);
    } else if (view === "statistics") {
        container.innerHTML = renderIncomeStatistics(currentEntries);
    } else if (view === "search") {
        mountIncomeSearch(container, currentEntries, {
            onOpenEntry: (id) => openEntryInLedger(page, id)
        });
    } else if (view === "compare") {
        container.innerHTML = renderIncomeCompare(currentEntries);
    } else if (view === "expand") {
        container.innerHTML = renderIncomeExpand(currentEntries, currentExpandPanel);
    } else if (view === "jumpto") {
        container.innerHTML = renderIncomeJumpTo(currentEntries);
    }
}

function openEntryInLedger(page, entryId) {
    currentSearch = "";
    const box = page.querySelector("[data-income-search]");
    if (box) box.value = "";
    switchIncomeView(page, "ledger");
    renderLedger(page);

    const el = page.querySelector(`[data-entry-id="${entryId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("br-flash");
        setTimeout(() => el.classList.remove("br-flash"), 2000);
    }
}

function jumpToMonth(page, monthKey) {
    switchIncomeView(page, "statement");
    const row = page.querySelector(`[data-month-key="${monthKey}"]`);
    if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("br-flash");
        setTimeout(() => row.classList.remove("br-flash"), 2000);
    }
}

/* =========================================
   LOAD ENTRIES
========================================= */

async function loadEntries(
    page
) {

    try {

        const store =
            await dataService
                .getIncomeStore();


        currentEntries =
            await store.getEntries();


        /*
         * Newest first
         */

        currentEntries.sort(
            (a, b) =>
                new Date(
                    b.date ||
                        "1900-01-01"
                ) -
                new Date(
                    a.date ||
                        "1900-01-01"
                )
        );


        /*
         * Recalculate entries
         * in memory.
         */

        currentEntries =
            currentEntries.map(
                (entry) =>
                    recalcEntry({

                        ...entry,

                        transactions:
                            (
                                entry.transactions ||
                                []
                            ).map(
                                (
                                    transaction
                                ) => ({
                                    ...transaction
                                })
                            )

                    })
            );


        /*
         * Render ledger
         */

        renderSummary(
            page
        );


        renderInvestments(
            page
        );


        renderLedger(
            page
        );


        /*
         * If Statement is currently
         * open, refresh it too.
         */

        if (currentIncomeView !== "ledger") {
            renderActiveView(page);
        }

    } catch (error) {

        console.error(
            "Income data error:",
            error
        );


        const ledger =
            page.querySelector(
                "[data-ledger]"
            );


        if (ledger) {

            ledger.innerHTML = `

                <div
                    class="br-card"
                >

                    <h3>
                        Unable to load ledger
                    </h3>

                    <p class="br-muted">
                        ${escapeHTML(
                            error.message
                        )}
                    </p>

                </div>

            `;

        }

    }

}


/* =========================================
   SUMMARY
========================================= */

function renderSummary(
    page
) {

    const summary =
        calculateLedgerSummary(
            currentEntries
        );


    const month =
        calculateCurrentMonth(
            currentEntries
        );


    const container =
        page.querySelector(
            "[data-summary]"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        ${statCard(
            "Total income",
            formatMoney(
                summary.income
            ),
            "All recorded income"
        )}


        ${statCard(
            "Expenses",
            formatMoney(
                summary.expense
            ),
            "Normal spending"
        )}


        ${statCard(
            "Invested",
            formatMoney(
                summary.contributions
            ),
            "Investment purchases"
        )}


        ${statCard(
            "Cash balance",
            formatMoney(
                summary.cash
            ),
            "Current cash flow"
        )}

    `;


    const status =
        page.querySelector(
            "[data-ledger-status]"
        );


    if (status) {

        status.textContent =
            `${currentEntries.length} ${
                currentEntries.length === 1
                    ? "entry"
                    : "entries"
            } · This month: ${formatMoney(
                month.net
            )} net`;

    }

}


/* =========================================
   STAT CARD
========================================= */

function statCard(
    label,
    value,
    description
) {

    return `

        <div class="br-card">

            <span class="br-muted">
                ${label}
            </span>


            <strong
                style="
                    display:block;
                    font-size:1.35rem;
                    margin-top:7px;
                "
            >
                ${value}
            </strong>


            <small class="br-muted">
                ${description}
            </small>

        </div>

    `;

}


/* =========================================
   INVESTMENTS
========================================= */

function renderInvestments(
    page
) {

    const container =
        page.querySelector(
            "[data-investments]"
        );


    if (!container) {
        return;
    }


    const rows =
        investmentBreakdownByCategory(
            currentEntries
        );


    if (!rows.length) {

        container.innerHTML = `

            <p class="br-muted">
                No investments recorded yet.
            </p>

        `;

        return;
    }


    container.innerHTML =
        rows
            .map(
                (row) => `

                    <div
                        class="br-investment-chip"
                    >

                        <span>
                            ${escapeHTML(
                                row.category
                            )}
                        </span>


                        <strong>
                            ${formatMoney(
                                row.net
                            )}
                        </strong>

                    </div>

                `
            )
            .join("");

}


/* =========================================
   LEDGER
========================================= */

function renderLedger(
    page
) {

    const container =
        page.querySelector(
            "[data-ledger]"
        );


    if (!container) {
        return;
    }


    let entries =
        currentEntries;


    /*
     * Search
     */

    if (
        currentSearch.trim()
    ) {

        entries =
            currentEntries.filter(
                (entry) => {

                    const result =
                        matchesSearch(
                            entry,
                            currentSearch
                        );


                    return (
                        result.entryMatch ||
                        result
                            .transactionMatches
                            .length >
                            0
                    );

                }
            );

    }


    /*
     * Empty
     */

    if (!entries.length) {

        container.innerHTML = `

            <div
                style="
                    padding:40px 20px;
                    text-align:center;
                "
            >

                <h3>
                    ${
                        currentSearch
                            ? "No matches"
                            : "Your ledger is empty"
                    }
                </h3>


                <p class="br-muted">

                    ${
                        currentSearch
                            ? "Try another search."
                            : "Add your first income entry."
                    }

                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        entries
            .map(
                (entry) =>
                    renderEntry(
                        entry
                    )
            )
            .join("");

}


/* =========================================
   ENTRY
========================================= */

function renderEntry(
    entry
) {

    const income =
        Number(
            entry.income
        ) || 0;


    const expense =
        Number(
            entry.expense
        ) || 0;


    const investment =
        Number(
            entry.investment
        ) || 0;


    const sale =
        Number(
            entry.investmentSale
        ) || 0;


    const transactions =
        entry.transactions || [];


    return `

        <article
            class="br-income-entry"
            data-entry-id="${entry.id}"
            style="
                padding:18px 0;
                border-bottom:
                    1px solid var(--line-soft);
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    gap:20px;
                    align-items:flex-start;
                "
            >

                <div
                    style="
                        min-width:0;
                    "
                >

                    <div
                        style="
                            display:flex;
                            align-items:center;
                            gap:10px;
                            flex-wrap:wrap;
                        "
                    >

                        <strong>
                            ${escapeHTML(
                                entry.from ||
                                    "Income"
                            )}
                        </strong>


                        ${
                            entry.category
                                ? `
                                    <span
                                        class="br-badge"
                                    >
                                        ${escapeHTML(
                                            entry.category
                                        )}
                                    </span>
                                `
                                : ""
                        }

                    </div>


                    <div
                        class="br-muted"
                        style="
                            margin-top:5px;
                        "
                    >
                        ${formatDate(
                            entry.date
                        )}
                    </div>

                </div>


                <div
                    style="
                        text-align:right;
                        flex-shrink:0;
                    "
                >

                    <strong>
                        +${formatMoney(
                            income
                        )}
                    </strong>


                    <div
                        class="br-muted"
                        style="
                            margin-top:4px;
                        "
                    >
                        Balance:
                        ${formatMoney(
                            entry.balance
                        )}
                    </div>

                </div>

            </div>


            <div
                style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:8px 18px;
                    margin-top:14px;
                    font-size:.85rem;
                "
            >

                <span>
                    Expense:
                    <strong>
                        ${formatMoney(
                            expense
                        )}
                    </strong>
                </span>


                <span>
                    Investment:
                    <strong>
                        ${formatMoney(
                            investment
                        )}
                    </strong>
                </span>


                ${
                    sale > 0
                        ? `
                            <span>
                                Sale:
                                <strong>
                                    ${formatMoney(
                                        sale
                                    )}
                                </strong>
                            </span>
                        `
                        : ""
                }

            </div>


            ${
                transactions.length
                    ? `

                        <div
                            style="
                                margin-top:14px;
                                padding-left:14px;
                            "
                        >

                            ${transactions
                                .map(
                                    (
                                        transaction
                                    ) =>
                                        renderTransaction(
                                            transaction
                                        )
                                )
                                .join("")}

                        </div>

                    `
                    : ""
            }


            <div
                style="
                    display:flex;
                    gap:8px;
                    margin-top:14px;
                "
            >

                <button
                    type="button"
                    class="br-button"
                    data-action="edit-entry"
                >
                    Edit
                </button>


                <button
                    type="button"
                    class="br-button"
                    data-action="delete-entry"
                >
                    Delete
                </button>

            </div>

        </article>

    `;

}


/* =========================================
   TRANSACTION
========================================= */

function renderTransaction(
    transaction
) {

    const investment =
        isInvestmentCategory(
            transaction.category
        );


    const direction =
        String(
            transaction.type || ""
        )
            .toLowerCase();


    const isSale =
        [
            "sell",
            "withdraw",
            "withdrawal",
            "redemption",
            "maturity"
        ].includes(
            direction
        );


    return `

        <div
            style="
                display:flex;
                justify-content:space-between;
                gap:12px;
                padding:8px 0;
                border-bottom:
                    1px dashed var(--line-soft);
            "
        >

            <div>

                <strong>
                    ${escapeHTML(
                        transaction.description ||
                            transaction.note ||
                            transaction.category ||
                            "Transaction"
                    )}
                </strong>


                <div class="br-muted">

                    ${escapeHTML(
                        transaction.category ||
                            "Uncategorized"
                    )}


                    ${
                        transaction.date
                            ? " · " +
                              formatDate(
                                  transaction.date
                              )
                            : ""
                    }


                    ${
                        investment
                            ? isSale
                                ? " · Sell"
                                : " · Buy"
                            : ""
                    }

                </div>

            </div>


            <strong>

                ${
                    isSale
                        ? "+"
                        : "-"
                }${formatMoney(
                    transaction.amount
                )}

            </strong>

        </div>

    `;

}


/* =========================================
   OPEN MODAL
========================================= */

function openIncomeModal(
    page,
    id = null
) {

    editingEntryId =
        id;


    const modal =
        page.querySelector(
            "[data-income-modal]"
        );


    const form =
        page.querySelector(
            "[data-income-form]"
        );


    const title =
        page.querySelector(
            "[data-modal-title]"
        );


    const entry =
        id === null
            ? null
            : currentEntries.find(
                  (item) =>
                      Number(
                          item.id
                      ) ===
                      Number(id)
              );


    title.textContent =
        entry
            ? "Edit income"
            : "Add income";


    form.reset();


    form.elements.income.value =
        entry?.income ??
        "";


    form.elements.date.value =
        entry?.date ||
        todayISO();


    form.elements.from.value =
        entry?.from ||
        "";


    populateCategorySelect(
        form.elements.category,
        INCOME_CATEGORIES,
        entry?.category
    );


    const transactions =
        page.querySelector(
            "[data-transactions]"
        );


    transactions.innerHTML = "";


    (
        entry?.transactions ||
        []
    ).forEach(
        (transaction) => {

            addTransactionRow(
                page,
                transaction
            );

        }
    );


    modal.hidden =
        false;

}


/* =========================================
   CLOSE MODAL
========================================= */

function closeIncomeModal(
    page
) {

    const modal =
        page.querySelector(
            "[data-income-modal]"
        );


    if (modal) {
        modal.hidden = true;
    }


    editingEntryId =
        null;

}


/* =========================================
   CATEGORY SELECT
========================================= */

function populateCategorySelect(
    select,
    categories,
    selected
) {

    select.innerHTML = `

        <option value="">
            Select category
        </option>

        ${categories
            .map(
                (category) => `

                    <option
                        value="${escapeAttribute(
                            category
                        )}"

                        ${
                            category ===
                            selected
                                ? "selected"
                                : ""
                        }
                    >
                        ${escapeHTML(
                            category
                        )}
                    </option>

                `
            )
            .join("")}

    `;

}


/* =========================================
   ADD TRANSACTION ROW
========================================= */

function addTransactionRow(
    page,
    existing = null
) {

    const container =
        page.querySelector(
            "[data-transactions]"
        );


    const row =
        document.createElement(
            "div"
        );


    row.dataset.transactionRow =
        "true";


    row.style.cssText = `
        border:1px solid var(--line-soft);
        border-radius:12px;
        padding:14px;
        margin-bottom:10px;
    `;


    row.innerHTML = `

        <div
            class="br-form-grid"
        >

            <label>

                <span>
                    Amount
                </span>

                <input
                    data-field="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value="${escapeAttribute(
                        existing?.amount ??
                            ""
                    )}"
                />

            </label>


            <label>

                <span>
                    Date
                </span>

                <input
                    data-field="date"
                    type="date"
                    value="${escapeAttribute(
                        existing?.date ||
                            todayISO()
                    )}"
                />

            </label>


            <label>

                <span>
                    Description
                </span>

                <input
                    data-field="description"
                    type="text"
                    value="${escapeAttribute(
                        existing?.description ||
                            ""
                    )}"
                    placeholder="Groceries..."
                />

            </label>


            <label>

                <span>
                    Category
                </span>

                <select
                    data-field="category"
                >

                    <option value="">
                        Select category
                    </option>

                    ${EXPENSE_CATEGORIES
                        .map(
                            (
                                category
                            ) => `

                                <option
                                    value="${escapeAttribute(
                                        category
                                    )}"

                                    ${
                                        category ===
                                        existing?.category
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    ${escapeHTML(
                                        category
                                    )}
                                </option>

                            `
                        )
                        .join("")}

                </select>

            </label>


            <label>

                <span>
                    Type
                </span>

                <select
                    data-field="type"
                >

                    <option value="expense">
                        Expense
                    </option>


                    <option
                        value="investment"
                        ${
                            existing?.type ===
                            "investment"
                                ? "selected"
                                : ""
                        }
                    >
                        Investment Buy
                    </option>


                    <option
                        value="sell"
                        ${
                            existing?.type ===
                            "sell"
                                ? "selected"
                                : ""
                        }
                    >
                        Investment Sell
                    </option>

                </select>

            </label>


            <label>

                <span>
                    Cost basis
                </span>

                <input
                    data-field="costBasis"
                    type="number"
                    min="0"
                    step="0.01"
                    value="${escapeAttribute(
                        existing?.costBasis ??
                            ""
                    )}"
                    placeholder="Optional"
                />

            </label>

        </div>


        <div
            style="
                display:flex;
                justify-content:flex-end;
                margin-top:10px;
            "
        >

            <button
                type="button"
                class="br-button"
                data-action="remove-transaction"
            >
                Remove
            </button>

        </div>

    `;


    container.appendChild(
        row
    );

}


/* =========================================
   SAVE INCOME
========================================= */

async function saveIncome(
    page
) {

    const store =
        await dataService
            .getIncomeStore();


    const form =
        page.querySelector(
            "[data-income-form]"
        );


    const amount =
        Number(
            form.elements.income.value
        );


    if (
        !Number.isFinite(
            amount
        ) ||
        amount < 0
    ) {

        window.alert(
            "Enter a valid income amount."
        );

        return;
    }


    const transactionRows =
        [
            ...page.querySelectorAll(
                "[data-transaction-row]"
            )
        ];


    const transactions =
        transactionRows.map(
            (row) => {

                const costBasisValue =
                    row.querySelector(
                        '[data-field="costBasis"]'
                    ).value;


                return {

                    id:
                        uid(),

                    amount:
                        Number(
                            row.querySelector(
                                '[data-field="amount"]'
                            ).value
                        ) || 0,

                    date:
                        row.querySelector(
                            '[data-field="date"]'
                        ).value ||
                        form.elements
                            .date
                            .value,

                    description:
                        row.querySelector(
                            '[data-field="description"]'
                        ).value
                            .trim(),

                    category:
                        row.querySelector(
                            '[data-field="category"]'
                        ).value,

                    type:
                        row.querySelector(
                            '[data-field="type"]'
                        ).value,

                    ...(costBasisValue
                        ? {
                              costBasis:
                                  Number(
                                      costBasisValue
                                  )
                          }
                        : {})

                };

            }
        );


    const existing =
        editingEntryId ===
        null
            ? null
            : currentEntries.find(
                  (entry) =>
                      Number(
                          entry.id
                      ) ===
                      Number(
                          editingEntryId
                      )
              );


    const entry = {

        ...(existing || {}),

        income:
            amount,

        date:
            form.elements
                .date
                .value,

        from:
            form.elements
                .from
                .value
                .trim(),

        category:
            form.elements
                .category
                .value,

        transactions

    };


    /*
     * Recalculate all derived
     * values before storing.
     */

    recalcEntry(
        entry
    );


    try {

        await store.saveEntry(
            entry
        );


        await loadEntries(
            page
        );


        closeIncomeModal(
            page
        );

    } catch (error) {

        console.error(
            "Could not save income:",
            error
        );


        window.alert(
            error.message ||
                "Could not save income."
        );

    }

}


/* =========================================
   DELETE
========================================= */

async function deleteEntry(
    page,
    id
) {

    const entry =
        currentEntries.find(
            (item) =>
                Number(
                    item.id
                ) ===
                Number(id)
        );


    if (!entry) {
        return;
    }


    const confirmed =
        window.confirm(
            `Delete the income entry from ${
                entry.from ||
                "this source"
            }?`
        );


    if (!confirmed) {
        return;
    }


    try {

        const store =
            await dataService
                .getIncomeStore();


        await store.deleteEntry(
            id
        );


        await loadEntries(
            page
        );

    } catch (error) {

        console.error(
            "Could not delete entry:",
            error
        );


        window.alert(
            error.message ||
                "Could not delete entry."
        );

    }

}


/* =========================================
   DATE
========================================= */

function formatDate(
    date
) {

    if (!date) {
        return "No date";
    }


    const value =
        new Date(
            date +
                "T00:00:00"
        );


    if (
        Number.isNaN(
            value.getTime()
        )
    ) {

        return date;

    }


    return value.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


/* =========================================
   ESCAPE HTML
========================================= */

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


/* =========================================
   ESCAPE ATTRIBUTE
========================================= */

function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );

}