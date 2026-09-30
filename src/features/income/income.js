import { icon } from "../../components/icons.js";
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
    isInvestmentCategory,
    isInvestmentSaleIncomeEntry
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
let dateFrom = "";
let dateTo = "";
let editingEntryId = null;
let currentIncomeView = "ledger";
let isSaving = false;
let lastFocused = null;

/* Dialog modes: "income-new" (income + its transactions, for a brand-new
   entry), "income-edit" (income fields only), "txn" (one transaction only). */
let modalMode = "income-new";
let editingTxnIndex = null;   // null = adding a transaction, number = editing it

/* Ledger entries whose transactions are open. Survives reloads of the list. */
const expandedEntries = new Set();




const INCOME_TABS = [
    ["ledger", "Ledger"],
    ["statement", "Statement"],
    ["statistics", "Statistics"],
    ["search", "Search"],
    ["compare", "Compare"],
    ["expand", "Expand"],
    ["jumpto", "Jump to"]
];

export async function Income() {

    const page =
        document.createElement("section");

    page.className = "br-page br-income";

    page.innerHTML = `

        <!-- INCOME NAVIGATION -->
        <div
            class="br-income-tabs"
            role="group"
            aria-label="Income views"
        >
            ${INCOME_TABS.map(
                ([key, label]) => `
                    <button
                        type="button"
                        class="br-income-tab${key === "ledger" ? " active" : ""}"
                        data-income-tab="${key}"
                        aria-pressed="${key === "ledger"}"
                    >${label}</button>`
            ).join("")}
        </div>


        <!-- ========================= -->
        <!-- LEDGER VIEW -->
        <!-- ========================= -->

        <div
            class="inc-view"
            data-income-view-container="ledger"
        >

            <!-- SUMMARY -->

            <section
                class="inc-summary"
                data-summary
                aria-label="Income summary"
            ></section>


            <!-- INVESTMENT SUMMARY -->

            <section
                class="inc-section"
                aria-labelledby="inc-invested-title"
            >

                <div class="inc-section-head">

                    <div>

                        <h3 id="inc-invested-title">
                            Invested by category
                        </h3>

                        <p>
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
                class="inc-section"
                aria-labelledby="inc-ledger-title"
            >

                <div class="inc-section-head inc-ledger-head">

                    <div>

                        <h3 id="inc-ledger-title">
                            Income ledger
                        </h3>

                        <p data-ledger-status></p>

                    </div>


                    <div class="inc-tools">

                        <button
                            type="button"
                            class="br-button br-button-primary inc-add"
                            data-action="add-income"
                        >
                            ${icon("plus", { size: 18 })}
                            <span>Add income</span>
                        </button>

                        <div class="br-search-box">

                            <span class="br-search-icon">${icon("search", { size: 16 })}</span>

                            <input
                                type="search"
                                placeholder="Search source, description or category"
                                aria-label="Search income entries"
                                data-income-search
                            />

                        </div>


                        <button
                            type="button"
                            class="inc-icon-button"
                            data-action="refresh"
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            ${icon("refresh-cw", { size: 16 })}
                        </button>

                    </div>

                </div>


                <div class="inc-ledger-filters">

                    <input
                        type="date"
                        class="br-input"
                        aria-label="From date"
                        title="From date"
                        data-ledger-from
                    />

                    <input
                        type="date"
                        class="br-input"
                        aria-label="To date"
                        title="To date"
                        data-ledger-to
                    />

                    <button
                        type="button"
                        class="br-button"
                        data-action="collapse-all"
                    >
                        Collapse all
                    </button>

                </div>


                <div data-ledger></div>

            </section>

        </div>


        <!-- ========================= -->
        <!-- OTHER VIEWS -->
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
                class="br-modal inc-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="inc-modal-title"
                tabindex="-1"
            >

                <!-- MODAL HEADER -->

                <div class="br-modal-header">

                    <div>

                        <h3
                            id="inc-modal-title"
                            data-modal-title
                        >
                            Add income
                        </h3>

                        <p
                            class="br-muted"
                            data-modal-sub
                        >
                            Income and its related
                            transactions are stored
                            in the existing ledger.
                        </p>

                    </div>


                    <button
                        type="button"
                        class="br-modal-close"
                        data-action="close-modal"
                        aria-label="Close"
                        title="Close"
                    >
                        ${icon("x", { size: 18 })}
                    </button>

                </div>


                <!-- FORM -->

                <form
                    data-income-form
                    novalidate
                >

                    <div
                        class="inc-form-error"
                        data-form-error
                        role="alert"
                        hidden
                    ></div>


                    <!-- MAIN ENTRY: source, category, amount, date -->

                    <div
                        class="inc-fields"
                        data-income-fields
                    >

                        ${fieldHTML(
                            "Source",
                            `<input
                                name="from"
                                type="text"
                                placeholder="Salary, freelance..."
                                autocomplete="off"
                                required
                            />`
                        )}


                        ${fieldHTML(
                            "Category",
                            `<select
                                name="category"
                            ></select>`
                        )}


                        ${fieldHTML(
                            "Amount",
                            `<span class="inc-money">
                                <span
                                    class="inc-money-prefix"
                                    aria-hidden="true"
                                >₹</span>
                                <input
                                    name="income"
                                    type="number"
                                    inputmode="decimal"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    required
                                />
                            </span>`
                        )}


                        ${fieldHTML(
                            "Date",
                            `<input
                                name="date"
                                type="date"
                                required
                            />`
                        )}

                    </div>


                    <!-- TRANSACTIONS -->

                    <div
                        class="inc-modal-section"
                        data-txn-section
                    >

                        <div
                            class="inc-section-head"
                            data-txn-head
                        >

                            <div>

                                <h4>
                                    Transactions
                                </h4>

                                <p>
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
                                ${icon("plus", { size: 16 })}
                                <span>Transaction</span>
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
                            data-save
                        >
                            Save income
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
   FORM FIELD HELPER
   A label + control, with a slot right under
   it for that field's own validation message.
========================================= */

function fieldHTML(
    label,
    control,
    extraClass = ""
) {

    return `

        <div class="inc-field ${extraClass}">

            <label>

                <span class="inc-field-label">${label}</span>

                ${control}

            </label>

            <p
                class="inc-error"
                data-error
                hidden
            ></p>

        </div>

    `;

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
                !event.target.closest("select") &&
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


            /*
             * Click on an income row (not on one of its
             * buttons): open / close its transactions
             */

            if (!actionElement) {

                const row =
                    event.target.closest(
                        ".inc-row"
                    );

                if (
                    row &&
                    !event.target.closest(
                        "a, input, select, textarea"
                    )
                ) {

                    toggleEntry(
                        row.closest(
                            "[data-entry-id]"
                        )
                    );

                }

                return;
            }


            const action =
                actionElement.dataset.action;


            if (
                action ===
                "toggle-entry"
            ) {

                toggleEntry(
                    actionElement.closest(
                        "[data-entry-id]"
                    )
                );

                return;
            }


            if (
                action ===
                "add-entry-transaction" ||
                action ===
                "edit-transaction" ||
                action ===
                "delete-transaction"
            ) {

                const entryElement =
                    actionElement.closest(
                        "[data-entry-id]"
                    );

                if (!entryElement) {
                    return;
                }

                const entryId =
                    Number(
                        entryElement.dataset
                            .entryId
                    );

                if (
                    action ===
                    "add-entry-transaction"
                ) {

                    openTransactionModal(
                        page,
                        entryId
                    );

                    return;
                }

                const index =
                    Number(
                        actionElement
                            .closest(
                                "[data-txn-index]"
                            )
                            ?.dataset
                            .txnIndex
                    );

                if (
                    !Number.isInteger(
                        index
                    )
                ) {
                    return;
                }

                if (
                    action ===
                    "edit-transaction"
                ) {

                    openTransactionModal(
                        page,
                        entryId,
                        index
                    );

                } else {

                    await deleteTransaction(
                        page,
                        entryId,
                        index
                    );

                }

                return;
            }


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
                "clear-search"
            ) {

                currentSearch =
                    "";

                resetLedgerDates(
                    page
                );

                const searchBox =
                    page.querySelector(
                        "[data-income-search]"
                    );

                if (searchBox) {
                    searchBox.value =
                        "";
                    searchBox.focus();
                }

                renderLedger(
                    page
                );

                return;
            }


            if (
                action ===
                "collapse-all"
            ) {
                expandedEntries.clear();
                renderLedger(
                    page
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
     * Ledger date range
     */
    const fromInput =
        page.querySelector(
            "[data-ledger-from]"
        );

    const toInput =
        page.querySelector(
            "[data-ledger-to]"
        );

    [fromInput, toInput].forEach(
        (input) => {
            if (!input) {
                return;
            }

            input.addEventListener(
                "change",
                () => {
                    dateFrom =
                        fromInput.value;
                    dateTo =
                        toInput.value;
                    renderLedger(
                        page
                    );
                }
            );
        }
    );

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


    /*
     * Clear a field's message as soon as it is fixed
     */

    if (form) {

        const revalidate =
            (event) => {

                const field =
                    event.target;

                if (
                    !field.matches ||
                    !field.matches(
                        "input, select"
                    )
                ) {
                    return;
                }

                if (
                    field.hasAttribute(
                        "aria-invalid"
                    ) &&
                    !fieldErrorMessage(
                        field
                    )
                ) {

                    clearFieldError(
                        field
                    );

                }

            };

        form.addEventListener(
            "input",
            revalidate
        );

        form.addEventListener(
            "change",
            revalidate
        );

    }


    /*
     * Keyboard: Escape closes the dialog and Tab
     * stays inside it while it is open
     */

    if (modal) {

        modal.addEventListener(
            "keydown",
            (event) => {

                if (
                    event.key ===
                    "Escape"
                ) {

                    event.preventDefault();

                    closeIncomeModal(
                        page
                    );

                    return;
                }


                if (
                    event.key !==
                    "Tab"
                ) {
                    return;
                }


                const focusable =
                    [
                        ...modal.querySelectorAll(
                            "button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
                        )
                    ].filter(
                        (element) =>
                            !element.disabled &&
                            element.offsetParent !==
                                null
                    );


                if (!focusable.length) {
                    return;
                }


                const first =
                    focusable[0];

                const last =
                    focusable[
                        focusable.length - 1
                    ];


                if (
                    event.shiftKey &&
                    (document.activeElement ===
                        first ||
                        document.activeElement ===
                            modal.querySelector(
                                '[role="dialog"]'
                            ))
                ) {

                    event.preventDefault();

                    last.focus();

                } else if (
                    !event.shiftKey &&
                    document.activeElement ===
                        last
                ) {

                    event.preventDefault();

                    first.focus();

                }

            }
        );

    }


}


/* =========================================
   OPEN / CLOSE AN ENTRY'S TRANSACTIONS
   Only the clicked income opens; nothing is
   re-rendered, so scroll position is kept.
========================================= */

function toggleEntry(
    entryElement
) {

    if (!entryElement) {
        return;
    }


    const id =
        Number(
            entryElement.dataset
                .entryId
        );

    const panel =
        entryElement.querySelector(
            ".inc-txns-row"
        );

    const button =
        entryElement.querySelector(
            '[data-action="toggle-entry"]'
        );

    if (!panel) {
        return;
    }


    const open =
        panel.hidden;

    panel.hidden =
        !open;

    entryElement.classList.toggle(
        "is-open",
        open
    );


    if (open) {
        expandedEntries.add(
            id
        );
    } else {
        expandedEntries.delete(
            id
        );
    }


    if (button) {

        button.setAttribute(
            "aria-expanded",
            String(open)
        );

        button.setAttribute(
            "aria-label",
            button
                .getAttribute(
                    "aria-label"
                )
                .replace(
                    open
                        ? /^Show/
                        : /^Hide/,
                    open
                        ? "Hide"
                        : "Show"
                )
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

        tab.setAttribute(
            "aria-pressed",
            String(
                tab.dataset.incomeTab === view
            )
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

function resetLedgerDates(page) {
    dateFrom = "";
    dateTo = "";
    page.querySelectorAll("[data-ledger-from], [data-ledger-to]").forEach((input) => {
        input.value = "";
    });
}

function openEntryInLedger(page, entryId) {
    expandedEntries.add(Number(entryId));
    currentSearch = "";
    resetLedgerDates(page);
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
   Same four figures as before (Total income,
   Expenses, Invested, Cash balance), plus the
   current-month net that used to sit in the
   ledger subtitle. Nothing is recalculated here.
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

        <div class="inc-metric inc-metric-primary">

            <span class="inc-label">
                Total income
            </span>

            <strong class="inc-amount inc-amount-lg inc-c-income">
                ${formatMoney(
                    summary.income
                )}
            </strong>

            <span class="inc-hint">
                All recorded income
            </span>

        </div>


        <div class="inc-metrics">

            ${statCard(
                "Expenses",
                formatMoney(
                    summary.expense
                ),
                "Normal spending",
                "inc-c-expense"
            )}


            ${statCard(
                "Invested",
                formatMoney(
                    summary.contributions
                ),
                "Investment purchases",
                "inc-c-invested"
            )}


            ${statCard(
                "Cash balance",
                formatMoney(
                    summary.cash
                ),
                "Current cash flow",
                toneOf(
                    summary.cash
                )
            )}


            ${statCard(
                "This month",
                formatMoney(
                    month.net
                ),
                "Net for the current month",
                toneOf(
                    month.net
                )
            )}

        </div>

    `;

}


function toneOf(
    value
) {

    const number =
        Number(value) || 0;

    if (number > 0) {
        return "inc-c-balance";
    }

    if (number < 0) {
        return "inc-c-expense";
    }

    return "";

}


/* =========================================
   STAT (one summary figure)
========================================= */

function statCard(
    label,
    value,
    description,
    tone = ""
) {

    return `

        <div class="inc-metric">

            <span class="inc-label">
                ${label}
            </span>

            <strong class="inc-amount ${tone}">
                ${value}
            </strong>

            <span class="inc-hint">
                ${description}
            </span>

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

            <p class="inc-quiet">
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

    const autoOpen =
        new Set();


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


                    /*
                     * Matched only through its transactions:
                     * show them so the match is visible.
                     */

                    if (
                        !result.entryMatch &&
                        result
                            .transactionMatches
                            .length >
                            0
                    ) {
                        autoOpen.add(
                            entry.id
                        );
                    }


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
     * Date range (an entry passes if it or any of
     * its transactions falls inside the range)
     */
    const hasDateFilter =
        Boolean(dateFrom || dateTo);

    if (hasDateFilter) {
        const inRange = (d) => {
            if (!d) {
                return false;
            }
            if (dateFrom && d < dateFrom) {
                return false;
            }
            if (dateTo && d > dateTo) {
                return false;
            }
            return true;
        };

        entries =
            entries.filter(
                (entry) =>
                    inRange(entry.date) ||
                    (entry.transactions || [])
                        .some((t) =>
                            inRange(t.date)
                        )
            );
    }

    /*
     * Status line under the ledger heading
     */

    const status =
        page.querySelector(
            "[data-ledger-status]"
        );


    if (status) {

        const total =
            currentEntries.length;

        const noun =
            total === 1
                ? "entry"
                : "entries";

        status.textContent =
            currentSearch.trim() || hasDateFilter
                ? `Showing ${entries.length} of ${total} ${noun}`
                : `${total} ${noun}`;

    }


    /*
     * Empty
     */

    if (!entries.length) {

        const searching =
            Boolean(
                currentSearch.trim()
            ) || hasDateFilter;


        container.innerHTML = `

            <div class="inc-empty">

                ${icon(
                    searching
                        ? "search"
                        : "wallet",
                    { size: 22 }
                )}

                <h4>
                    ${
                        searching
                            ? "No matching income entries"
                            : "No income recorded yet"
                    }
                </h4>

                <p>
                    ${
                        searching
                            ? "Nothing matches your search. Try different words or clear the search."
                            : "Add your first income entry to start tracking your earnings."
                    }
                </p>

                ${
                    searching
                        ? `
                            <button
                                type="button"
                                class="br-button"
                                data-action="clear-search"
                            >
                                ${icon("x", { size: 16 })}
                                <span>Clear search</span>
                            </button>
                        `
                        : ""
                }

            </div>

        `;

        return;
    }


    container.innerHTML = `

        <div
            class="inc-table"
            role="table"
            aria-label="Income ledger"
        >

            <div
                class="inc-head"
                role="row"
            >
                <span role="columnheader">Source</span>
                <span role="columnheader">Category</span>
                <span role="columnheader">Date</span>
                <span role="columnheader" class="inc-num">Income</span>
                <span role="columnheader" class="inc-num">Expense</span>
                <span role="columnheader" class="inc-num">Invested</span>
                <span role="columnheader" class="inc-num">Balance</span>
                <span role="columnheader" class="inc-actions-head">Actions</span>
            </div>

            ${entries
                .map(
                    (entry) =>
                        renderEntry(
                            entry,
                            expandedEntries.has(
                                entry.id
                            ) ||
                                autoOpen.has(
                                    entry.id
                                )
                        )
                )
                .join("")}

        </div>

    `;

}


/* =========================================
   ENTRY
   One ledger entry: a table row on desktop,
   a compact stacked row on tablet and phone.
   Same fields and actions as before.
========================================= */

function renderEntry(
    entry,
    expanded = false
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


    const balance =
        Number(
            entry.balance
        ) || 0;


    const transactions =
        entry.transactions || [];


    const source =
        entry.from ||
        "Income";


    const dateText =
        formatDate(
            entry.date
        );


    /* Sale proceeds are shown in the Income column but are not income. */
    const isSaleIncome =
        isInvestmentSaleIncomeEntry(
            entry
        );


    const iconName =
        /salary/i.test(
            entry.category || ""
        )
            ? "briefcase-business"
            : "banknote";


    return `

        <article
            class="br-income-entry inc-entry${expanded ? " is-open" : ""}"
            data-entry-id="${entry.id}"
            role="rowgroup"
        >

            <div
                class="inc-row"
                role="row"
            >

                <div
                    class="inc-cell inc-source"
                    role="cell"
                >

                    <button
                        type="button"
                        class="inc-toggle"
                        data-action="toggle-entry"
                        aria-expanded="${expanded}"
                        aria-controls="inc-txns-${entry.id}"
                        aria-label="${
                            expanded
                                ? "Hide"
                                : "Show"
                        } transactions for ${escapeAttribute(
                            source
                        )}"
                        title="Transactions"
                    >
                        ${icon("chevron-right", { size: 16 })}
                    </button>

                    <span class="inc-source-icon">
                        ${icon(iconName, { size: 16 })}
                    </span>

                    <div class="inc-source-text">

                        <strong class="inc-title">
                            ${escapeHTML(
                                source
                            )}
                        </strong>

                        <span class="inc-meta">
                            ${
                                entry.category
                                    ? escapeHTML(
                                          entry.category
                                      ) + " · "
                                    : ""
                            }${dateText}
                        </span>

                        <span class="inc-count">
                            ${
                                transactions.length
                                    ? transactions.length +
                                      (transactions.length === 1
                                          ? " transaction"
                                          : " transactions")
                                    : "No transactions"
                            }
                        </span>

                    </div>

                </div>


                <div
                    class="inc-cell inc-category"
                    role="cell"
                >
                    ${
                        entry.category
                            ? escapeHTML(
                                  entry.category
                              )
                            : `<span class="inc-quiet">—</span>`
                    }
                </div>


                <div
                    class="inc-cell inc-date"
                    role="cell"
                >
                    ${dateText}
                </div>


                <div
                    class="inc-cell inc-num inc-income ${
                        isSaleIncome
                            ? "inc-c-sales"
                            : income > 0
                                ? "inc-c-income"
                                : ""
                    }"
                    role="cell"
                >
                    +${formatMoney(
                        income
                    )}
                </div>


                <div class="inc-stats">

                    <div
                        class="inc-cell inc-num inc-secondary${
                            expense === 0
                                ? " inc-zero"
                                : " inc-c-expense"
                        }"
                        role="cell"
                    >
                        <span class="inc-mlabel">Expense</span>
                        ${formatMoney(
                            expense
                        )}
                    </div>


                    <div
                        class="inc-cell inc-num inc-secondary${
                            investment === 0 &&
                            sale === 0
                                ? " inc-zero"
                                : ""
                        }${
                            investment > 0
                                ? " inc-c-invested"
                                : ""
                        }"
                        role="cell"
                    >
                        <span class="inc-mlabel">Invested</span>
                        ${formatMoney(
                            investment
                        )}
                        ${
                            sale > 0
                                ? `<span class="inc-sale"><span class="inc-mlabel-inline">Sale</span> ${formatMoney(
                                      sale
                                  )}</span>`
                                : ""
                        }
                    </div>


                    <div
                        class="inc-cell inc-num inc-secondary ${toneOf(
                            balance
                        )}"
                        role="cell"
                    >
                        <span class="inc-mlabel">Balance</span>
                        ${formatMoney(
                            entry.balance
                        )}
                    </div>

                </div>


                <div
                    class="inc-cell inc-actions"
                    role="cell"
                >

                    <button
                        type="button"
                        class="inc-icon-button"
                        data-action="edit-entry"
                        aria-label="Edit entry from ${escapeAttribute(
                            source
                        )}"
                        title="Edit"
                    >
                        ${icon("pencil", { size: 16 })}
                    </button>


                    <button
                        type="button"
                        class="inc-icon-button inc-icon-danger"
                        data-action="delete-entry"
                        aria-label="Delete entry from ${escapeAttribute(
                            source
                        )}"
                        title="Delete"
                    >
                        ${icon("trash-2", { size: 16 })}
                    </button>

                </div>

            </div>


            <div
                class="inc-txns-row"
                role="row"
                id="inc-txns-${entry.id}"
                ${
                    expanded
                        ? ""
                        : "hidden"
                }
            >

                <div
                    role="cell"
                    class="inc-txns-cell"
                >

                    ${
                        transactions.length
                            ? `
                                <ul
                                    class="inc-txns"
                                    aria-label="Transactions for ${escapeAttribute(
                                        source
                                    )}"
                                >

                                    ${transactions
                                        .map(
                                            (
                                                transaction,
                                                index
                                            ) =>
                                                renderTransaction(
                                                    transaction,
                                                    index
                                                )
                                        )
                                        .join("")}

                                </ul>
                            `
                            : `
                                <p class="inc-quiet inc-txns-empty">
                                    No transactions for this income yet.
                                </p>
                            `
                    }

                    <div class="inc-txns-foot">

                        <button
                            type="button"
                            class="br-button"
                            data-action="add-entry-transaction"
                        >
                            ${icon("plus", { size: 16 })}
                            <span>Transaction</span>
                        </button>

                    </div>

                </div>

            </div>

        </article>

    `;

}


/* =========================================
   TRANSACTION
========================================= */

function renderTransaction(
    transaction,
    index
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

        <li
            class="inc-txn"
            data-txn-index="${index}"
        >

            <div class="inc-txn-text">

                <strong>
                    ${escapeHTML(
                        transaction.description ||
                            transaction.note ||
                            transaction.category ||
                            "Transaction"
                    )}
                </strong>


                <span class="inc-meta">

                    ${escapeHTML(
                        transaction.category ||
                            "Uncategorized"
                    )}${
                        transaction.date
                            ? " · " +
                              formatDate(
                                  transaction.date
                              )
                            : ""
                    }${
                        investment
                            ? isSale
                                ? " · Sell"
                                : " · Buy"
                            : ""
                    }

                </span>

            </div>


            <strong
                class="inc-txn-amount ${
                    isSale
                        ? "inc-c-sales"
                        : investment
                            ? "inc-c-invested"
                            : "inc-c-expense"
                }"
            >

                ${
                    isSale
                        ? "+"
                        : "-"
                }${formatMoney(
                    transaction.amount
                )}

            </strong>


            <div class="inc-txn-actions">

                <button
                    type="button"
                    class="inc-icon-button"
                    data-action="edit-transaction"
                    aria-label="Edit transaction"
                    title="Edit transaction"
                >
                    ${icon("pencil", { size: 16 })}
                </button>


                <button
                    type="button"
                    class="inc-icon-button inc-icon-danger"
                    data-action="delete-transaction"
                    aria-label="Delete transaction"
                    title="Delete transaction"
                >
                    ${icon("trash-2", { size: 16 })}
                </button>

            </div>

        </li>

    `;

}


/* =========================================
   MODAL MODES
========================================= */

const MODE_TEXT = {

    "income-new": {
        sub: "Income and its related transactions are stored in the existing ledger.",
        save: "Save income"
    },

    "income-edit": {
        sub: "Update the source, category, amount or date. Transactions are not changed.",
        save: "Save income"
    },

    txn: {
        sub: "Only this transaction is changed.",
        save: "Save transaction"
    }

};


function setModalMode(
    page,
    mode
) {

    modalMode =
        mode;


    const modal =
        page.querySelector(
            "[data-income-modal]"
        );


    const text =
        MODE_TEXT[mode];


    modal.dataset.mode =
        mode;


    modal.querySelector(
        "[data-income-fields]"
    ).hidden =
        mode === "txn";


    const section =
        modal.querySelector(
            "[data-txn-section]"
        );


    section.hidden =
        mode === "income-edit";

    section.classList.toggle(
        "is-solo",
        mode === "txn"
    );


    modal.querySelector(
        "[data-txn-head]"
    ).hidden =
        mode === "txn";


    modal.querySelector(
        "[data-modal-sub]"
    ).textContent =
        text.sub;


    modal.querySelector(
        "[data-save]"
    ).textContent =
        text.save;

}


/* =========================================
   OPEN TRANSACTION MODAL
   Add a transaction to one income, or edit
   one existing transaction. Nothing else
   from the entry is shown or changed.
========================================= */

function openTransactionModal(
    page,
    entryId,
    index = null
) {

    const entry =
        currentEntries.find(
            (item) =>
                Number(
                    item.id
                ) ===
                Number(
                    entryId
                )
        );


    if (!entry) {
        return;
    }


    const existing =
        index === null
            ? null
            : (
                  entry.transactions ||
                  []
              )[index];


    if (
        index !== null &&
        !existing
    ) {
        return;
    }


    const modal =
        page.querySelector(
            "[data-income-modal]"
        );


    const form =
        page.querySelector(
            "[data-income-form]"
        );


    editingEntryId =
        entry.id;

    editingTxnIndex =
        index;


    form.reset();

    resetFormErrors(
        form
    );

    setModalMode(
        page,
        "txn"
    );


    page.querySelector(
        "[data-modal-title]"
    ).textContent =
        (
            existing
                ? "Edit transaction"
                : "Add transaction"
        ) +
        " · " +
        (
            entry.from ||
            "Income"
        );


    const container =
        page.querySelector(
            "[data-transactions]"
        );

    container.innerHTML =
        "";

    addTransactionRow(
        page,
        existing ||
            {
                date:
                    entry.date ||
                    todayISO()
            },
        {
            solo: true
        }
    );


    lastFocused =
        document.activeElement;

    modal.hidden =
        false;

    document.body.classList.add(
        "br-no-scroll"
    );


    if (
        window.matchMedia &&
        window.matchMedia(
            "(pointer: fine)"
        ).matches
    ) {

        container
            .querySelector(
                "input"
            )
            ?.focus();

    } else {

        modal
            .querySelector(
                '[role="dialog"]'
            )
            ?.focus();

    }

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

    resetFormErrors(
        form
    );


    /*
     * Editing an existing income shows only the income
     * fields; its transactions are managed from the ledger.
     * A brand-new income keeps the full form.
     */

    setModalMode(
        page,
        entry
            ? "income-edit"
            : "income-new"
    );


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


    lastFocused =
        document.activeElement;


    modal.hidden =
        false;


    document.body.classList.add(
        "br-no-scroll"
    );


    /*
     * Fine pointers: jump straight into the first
     * field. Touch: focus the dialog, so the on-screen
     * keyboard does not cover the form on open.
     */

    if (
        window.matchMedia &&
        window.matchMedia(
            "(pointer: fine)"
        ).matches
    ) {

        form.elements.from.focus();

    } else {

        modal
            .querySelector(
                '[role="dialog"]'
            )
            ?.focus();

    }

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


    document.body.classList.remove(
        "br-no-scroll"
    );


    editingEntryId =
        null;

    editingTxnIndex =
        null;


    if (
        lastFocused &&
        document.contains(
            lastFocused
        )
    ) {

        lastFocused.focus();

    }

    lastFocused =
        null;

}


/* =========================================
   FIELD ERRORS
   Messages sit directly under the field they
   belong to. The rules themselves are unchanged:
   they are the browser's own constraint checks
   (required / min / step) already on the inputs.
========================================= */

let errorCounter = 0;


function fieldErrorMessage(
    input
) {

    const state =
        input.validity;


    if (state.valid) {
        return "";
    }


    if (state.valueMissing) {

        if (input.name === "income") {
            return "Enter the income amount.";
        }

        if (input.name === "date") {
            return "Choose a date.";
        }

        if (input.name === "from") {
            return "Enter where this income came from.";
        }

        return "This field is required.";
    }


    if (state.badInput) {
        return "Enter a valid number.";
    }


    if (state.rangeUnderflow) {
        return "This amount can't be negative.";
    }


    if (state.stepMismatch) {
        return "Use no more than two decimal places.";
    }


    return input.validationMessage || "Check this value.";

}


function setFieldError(
    input,
    message
) {

    const field =
        input.closest(
            ".inc-field"
        );


    const slot =
        field?.querySelector(
            "[data-error]"
        );


    if (!slot) {
        return;
    }


    if (!slot.id) {

        errorCounter += 1;

        slot.id =
            "inc-error-" +
            errorCounter;

    }


    slot.textContent =
        message;

    slot.hidden =
        false;


    input.setAttribute(
        "aria-invalid",
        "true"
    );

    input.setAttribute(
        "aria-describedby",
        slot.id
    );

}


function clearFieldError(
    input
) {

    const slot =
        input
            .closest(
                ".inc-field"
            )
            ?.querySelector(
                "[data-error]"
            );


    if (slot) {

        slot.textContent = "";

        slot.hidden = true;

    }


    input.removeAttribute(
        "aria-invalid"
    );

    input.removeAttribute(
        "aria-describedby"
    );

}


function resetFormErrors(
    form
) {

    form
        .querySelectorAll(
            "input, select"
        )
        .forEach(
            clearFieldError
        );


    showFormError(
        form,
        ""
    );

}


function showFormError(
    form,
    message
) {

    const box =
        form.querySelector(
            "[data-form-error]"
        );


    if (!box) {
        return;
    }


    box.textContent =
        message;

    box.hidden =
        !message;

}


/*
 * Check every field. Returns true when the form
 * may be submitted; otherwise shows each message
 * beside its field and focuses the first problem.
 */

function validateIncomeForm(
    form
) {

    let firstInvalid =
        null;


    form
        .querySelectorAll(
            "input, select"
        )
        .forEach(
            (input) => {

                /*
                 * Fields in a hidden part of the dialog
                 * are not part of this edit
                 */

                if (
                    input.closest(
                        "[hidden]"
                    )
                ) {
                    return;
                }


                const message =
                    fieldErrorMessage(
                        input
                    );


                if (message) {

                    setFieldError(
                        input,
                        message
                    );

                    firstInvalid =
                        firstInvalid ||
                        input;

                } else {

                    clearFieldError(
                        input
                    );

                }

            }
        );


    if (firstInvalid) {

        showFormError(
            form,
            "Please fix the highlighted fields."
        );

        firstInvalid.focus();

        return false;
    }


    showFormError(
        form,
        ""
    );

    return true;

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
   Same fields, names and data-field hooks as
   before; only the layout and styling changed.
========================================= */

function addTransactionRow(
    page,
    existing = null,
    { solo = false } = {}
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

    row.className =
        "inc-txn-row" +
        (solo ? " is-solo" : "");


    row.innerHTML = `

        <div
            class="inc-fields"
        >

            ${fieldHTML(
                "Description",
                `<input
                    data-field="description"
                    type="text"
                    value="${escapeAttribute(
                        existing?.description ||
                            ""
                    )}"
                    placeholder="Groceries..."
                />`
            )}


            ${fieldHTML(
                "Category",
                `<select
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

                </select>`
            )}


            ${fieldHTML(
                "Amount",
                `<span class="inc-money">
                    <span
                        class="inc-money-prefix"
                        aria-hidden="true"
                    >₹</span>
                    <input
                        data-field="amount"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value="${escapeAttribute(
                            existing?.amount ??
                                ""
                        )}"
                    />
                </span>`
            )}


            ${fieldHTML(
                "Date",
                `<input
                    data-field="date"
                    type="date"
                    value="${escapeAttribute(
                        existing?.date ||
                            todayISO()
                    )}"
                />`
            )}


            ${fieldHTML(
                "Type",
                `<select
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

                </select>`
            )}


            ${fieldHTML(
                "Cost basis",
                `<span class="inc-money">
                    <span
                        class="inc-money-prefix"
                        aria-hidden="true"
                    >₹</span>
                    <input
                        data-field="costBasis"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        value="${escapeAttribute(
                            existing?.costBasis ??
                                ""
                        )}"
                        placeholder="Optional"
                    />
                </span>`
            )}

        </div>


        ${
            solo
                ? ""
                : `
                    <div
                        class="inc-txn-row-actions"
                    >

                        <button
                            type="button"
                            class="br-button"
                            data-action="remove-transaction"
                        >
                            ${icon("trash-2", { size: 16 })}
                            <span>Remove</span>
                        </button>

                    </div>
                `
        }

    `;


    container.appendChild(
        row
    );

}


/* =========================================
   SAVE INCOME
   Three kinds of save, each touching only what
   its dialog showed:
   - income-new  : the new income + its transactions
   - income-edit : source / category / amount / date;
                   existing transactions stay as they are
   - txn         : one transaction inside its income
   Derived totals are recalculated by the existing
   recalcEntry(), exactly as before. Fields are
   checked with messages next to each input, and a
   second click while a save runs is ignored.
========================================= */

/* Read one transaction row of the dialog. */

function readTransactionRow(
    row,
    fallbackDate
) {

    const costBasisValue =
        row.querySelector(
            '[data-field="costBasis"]'
        ).value;


    return {

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
            fallbackDate,

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

        costBasis:
            costBasisValue
                ? Number(
                      costBasisValue
                  )
                : undefined

    };

}


function findEntry(
    id
) {

    return currentEntries.find(
        (entry) =>
            Number(
                entry.id
            ) ===
            Number(
                id
            )
    );

}


/* Copy of an entry's transactions, safe to change. */

function copyTransactions(
    entry
) {

    return (
        entry?.transactions ||
        []
    ).map(
        (transaction) => ({
            ...transaction
        })
    );

}


async function saveIncome(
    page
) {

    if (isSaving) {
        return;
    }


    const form =
        page.querySelector(
            "[data-income-form]"
        );


    if (
        !validateIncomeForm(
            form
        )
    ) {
        return;
    }


    const mode =
        modalMode;


    if (mode !== "txn") {

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

            setFieldError(
                form.elements.income,
                "Enter a valid income amount."
            );

            form.elements.income.focus();

            return;
        }

    }


    const saveButton =
        form.querySelector(
            "[data-save]"
        );


    isSaving =
        true;

    if (saveButton) {

        saveButton.disabled =
            true;

        saveButton.textContent =
            "Saving…";

    }

    form.setAttribute(
        "aria-busy",
        "true"
    );


    try {

        const store =
            await dataService
                .getIncomeStore();


        const existing =
            editingEntryId ===
            null
                ? null
                : findEntry(
                      editingEntryId
                  );


        let entry;


        if (mode === "txn") {

            /*
             * One transaction: the income itself is untouched
             */

            if (!existing) {
                throw new Error(
                    "This income entry no longer exists."
                );
            }


            const transactions =
                copyTransactions(
                    existing
                );


            const row =
                page.querySelector(
                    "[data-transaction-row]"
                );


            const values =
                readTransactionRow(
                    row,
                    existing.date
                );


            if (
                editingTxnIndex ===
                null
            ) {

                const created = {

                    id:
                        uid(),

                    ...values

                };

                if (
                    created.costBasis ===
                    undefined
                ) {
                    delete created.costBasis;
                }

                transactions.push(
                    created
                );

            } else {

                const current =
                    transactions[
                        editingTxnIndex
                    ];

                if (!current) {
                    throw new Error(
                        "This transaction no longer exists."
                    );
                }

                const updated = {

                    ...current,

                    ...values,

                    id:
                        current.id ??
                        uid()

                };

                if (
                    updated.costBasis ===
                    undefined
                ) {
                    delete updated.costBasis;
                }

                transactions[
                    editingTxnIndex
                ] =
                    updated;

            }


            entry = {

                ...existing,

                transactions

            };

        } else if (
            mode ===
            "income-edit"
        ) {

            /*
             * Income fields only: transactions are kept as they are
             */

            if (!existing) {
                throw new Error(
                    "This income entry no longer exists."
                );
            }


            entry = {

                ...existing,

                income:
                    Number(
                        form.elements
                            .income
                            .value
                    ),

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

                transactions:
                    copyTransactions(
                        existing
                    )

            };

        } else {

            /*
             * New income, with any transactions added in the dialog
             */

            const transactions =
                [
                    ...page.querySelectorAll(
                        "[data-transaction-row]"
                    )
                ].map(
                    (row) => {

                        const values =
                            readTransactionRow(
                                row,
                                form.elements
                                    .date
                                    .value
                            );

                        const created = {

                            id:
                                uid(),

                            ...values

                        };

                        if (
                            created.costBasis ===
                            undefined
                        ) {
                            delete created.costBasis;
                        }

                        return created;

                    }
                );


            entry = {

                income:
                    Number(
                        form.elements
                            .income
                            .value
                    ),

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

        }


        /*
         * Recalculate all derived
         * values before storing.
         */

        recalcEntry(
            entry
        );


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


        showFormError(
            form,
            error.message ||
                "Could not save income."
        );

    } finally {

        isSaving =
            false;

        if (saveButton) {

            saveButton.disabled =
                false;

            saveButton.textContent =
                MODE_TEXT[
                    modalMode
                ].save;

        }

        form.removeAttribute(
            "aria-busy"
        );

    }

}


/* =========================================
   DELETE A WHOLE INCOME
========================================= */

async function deleteEntry(
    page,
    id
) {

    const entry =
        findEntry(
            id
        );


    if (!entry) {
        return;
    }


    const count =
        (
            entry.transactions ||
            []
        ).length;


    const confirmed =
        window.confirm(
            `Delete the income entry from ${
                entry.from ||
                "this source"
            }` +
                (
                    count
                        ? ` and its ${count} ${
                              count === 1
                                  ? "transaction"
                                  : "transactions"
                          }`
                        : ""
                ) +
                "?"
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


        expandedEntries.delete(
            Number(
                id
            )
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
   DELETE ONE TRANSACTION
   The income and its other transactions are
   kept; totals are recalculated as usual.
========================================= */

async function deleteTransaction(
    page,
    entryId,
    index
) {

    const entry =
        findEntry(
            entryId
        );


    const transaction =
        (
            entry?.transactions ||
            []
        )[index];


    if (!transaction) {
        return;
    }


    const label =
        transaction.description ||
        transaction.category ||
        "this transaction";


    const confirmed =
        window.confirm(
            `Delete the transaction "${label}" (${formatMoney(
                transaction.amount
            )}) from ${
                entry.from ||
                "this income"
            }? The income entry stays.`
        );


    if (!confirmed) {
        return;
    }


    try {

        const store =
            await dataService
                .getIncomeStore();


        const transactions =
            copyTransactions(
                entry
            );

        transactions.splice(
            index,
            1
        );


        const updated =
            recalcEntry({

                ...entry,

                transactions

            });


        await store.saveEntry(
            updated
        );


        await loadEntries(
            page
        );

    } catch (error) {

        console.error(
            "Could not delete transaction:",
            error
        );


        window.alert(
            error.message ||
                "Could not delete transaction."
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
