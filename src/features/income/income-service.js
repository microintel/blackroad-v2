const INVESTMENT_CATEGORIES = [
    "Mutual Fund",
    "SIP",
    "Stock",
    "FD"
];

const INVESTMENT_RETURN_CATEGORIES = [
    "Stock Return",
    "MF Return",
    "FD Return",
    "Mutual Fund Return"
];

export const EXPENSE_CATEGORIES = [
    "Apparel",
    "Baby",
    "Bakery / Pups",
    "Bank",
    "Beauty",
    "Borrow",
    "Bigbasket",
    "Biscuit",
    "Blinkit",
    "Brother / Sister",
    "Car",
    "Clothing",
    "Donate",
    "Dividend",
    "Drink / Juices",
    "Education",
    "Egg",
    "Electronics",
    "Entertainment",
    "Family",
    "FD",
    "Food",
    "Friends",
    "Gift",
    "Health",
    "Help",
    "Home",
    "Housing",
    "Little Heart",
    "Milk / Bread / Curd",
    "Mobile",
    "Mother / Dad",
    "Movie",
    "Mutual Fund",
    "Official Documents",
    "Party",
    "Personal Care",
    "Pet",
    "Penalty",
    "Recharges",
    "Receivable",
    "Repair",
    "Samosa / Outside Food",
    "Self",
    "Service",
    "Shopping",
    "Snacks",
    "SIP",
    "Stock",
    "Social",
    "Sport",
    "Style / Fashion",
    "Swiggy",
    "Tax",
    "Telephone",
    "Tiffin / Lunch / Parlour",
    "Tour",
    "Transportation",
    "Travel",
    "Vehicle",
    "Wine / Cigarette",
    "Zomato",
    "Zepto",
    "Others"
];

export const INCOME_CATEGORIES = [
    "Salary",
    "Stock Return",
    "MF Return",
    "FD Return",
    "Return",
    "Interest",
    "Profit",
    "Bonus",
    "Business",
    "Freelance",
    "Gift",
    "Investment",
    "Rent",
    "Others"
];

export function isInvestmentCategory(
    category
) {
    return INVESTMENT_CATEGORIES.includes(
        String(category || "").trim()
    );
}

export function isInvestmentReturnCategory(
    category
) {
    return INVESTMENT_RETURN_CATEGORIES.includes(
        String(category || "").trim()
    );
}

export function isInvestmentSaleIncomeEntry(
    entry
) {
    const category =
        String(
            entry?.category || ""
        )
            .trim()
            .toLowerCase();

    const source =
        String(
            entry?.from || ""
        )
            .trim()
            .toLowerCase();

    const saleWords =
        /\b(sell|sold|sale|redeem|redemption|withdraw|withdrawal|matur(?:e|ity))\b/;

    if (!saleWords.test(source)) {
        return false;
    }

    if (category === "stock return") {
        return true;
    }

    if (
        category === "mf return" ||
        category === "mutual fund return"
    ) {
        return true;
    }

    if (category === "fd return") {
        return true;
    }

    return false;
}

export function entryIncomeAmount(
    entry
) {
    if (
        isInvestmentSaleIncomeEntry(
            entry
        )
    ) {
        return 0;
    }

    return Math.max(
        0,
        Number(entry?.income) || 0
    );
}

export function entryInvestmentSaleAmount(
    entry
) {
    if (
        Number(entry?.investmentSale) > 0
    ) {
        return 0;
    }

    if (
        isInvestmentSaleIncomeEntry(
            entry
        )
    ) {
        return Math.max(
            0,
            Number(entry?.income) || 0
        );
    }

    return 0;
}

export function entryInvestmentSaleDisplayAmount(
    entry
) {
    const stored =
        Number(
            entry?.investmentSale
        ) || 0;

    return stored > 0
        ? stored
        : entryInvestmentSaleAmount(
              entry
          );
}

export function entryCashInflowAmount(
    entry
) {
    return (
        entryIncomeAmount(entry) +
        entryInvestmentSaleDisplayAmount(
            entry
        )
    );
}

export function entryGenuineIncomeAmount(
    entry
) {
    if (
        isInvestmentReturnCategory(
            entry?.category
        )
    ) {
        return 0;
    }

    return entryIncomeAmount(entry);
}

export function entryInvestmentReturnAmount(
    entry
) {
    if (
        !isInvestmentReturnCategory(
            entry?.category
        )
    ) {
        return 0;
    }

    return entryIncomeAmount(entry);
}

export function investmentDirection(
    transaction
) {
    const type =
        String(
            transaction?.type || ""
        )
            .trim()
            .toLowerCase();

    if (
        [
            "sell",
            "withdraw",
            "withdrawal",
            "redemption",
            "maturity"
        ].includes(type)
    ) {
        return "sell";
    }

    return "buy";
}

export function recalcEntry(
    entry
) {
    let totalExpense = 0;
    let totalInvestment = 0;
    let totalInvestmentSale = 0;
    let realizedGainLoss = 0;

    const transactions =
        entry.transactions || [];

    transactions.forEach(
        (transaction) => {
            const amount =
                Math.max(
                    0,
                    Number(
                        transaction.amount
                    ) || 0
                );

            if (
                isInvestmentCategory(
                    transaction.category
                )
            ) {
                if (
                    investmentDirection(
                        transaction
                    ) === "sell"
                ) {
                    totalInvestmentSale +=
                        amount;

                    const costBasis =
                        Number(
                            transaction.costBasis
                        );

                    if (
                        Number.isFinite(
                            costBasis
                        )
                    ) {
                        realizedGainLoss +=
                            amount -
                            costBasis;
                    }

                    transaction.type =
                        "sell";
                } else {
                    totalInvestment +=
                        amount;

                    transaction.type =
                        "investment";
                }

                return;
            }

            totalExpense += amount;

            transaction.type =
                "expense";
        }
    );

    const income =
        entryIncomeAmount(entry);

    if (
        totalInvestmentSale === 0
    ) {
        totalInvestmentSale +=
            entryInvestmentSaleAmount(
                entry
            );
    }

    entry.expense =
        totalExpense;

    entry.investment =
        totalInvestment;

    entry.investmentSale =
        totalInvestmentSale;

    entry.realizedGainLoss =
        realizedGainLoss;

    entry.balance =
        income -
        totalExpense -
        totalInvestment +
        totalInvestmentSale;

    return entry;
}

export function calculateLedgerSummary(
    entries
) {
    let income = 0;
    let expense = 0;
    let contributions = 0;
    let assetSales = 0;
    let realizedGainLoss = 0;

    (entries || []).forEach(
        (entry) => {
            const copy = {
                ...entry,
                transactions: (
                    entry.transactions ||
                    []
                ).map(
                    (transaction) => ({
                        ...transaction
                    })
                )
            };

            const calculated =
                recalcEntry(copy);

            income +=
                entryIncomeAmount(
                    calculated
                );

            expense +=
                Number(
                    calculated.expense
                ) || 0;

            contributions +=
                Number(
                    calculated.investment
                ) || 0;

            assetSales +=
                Number(
                    calculated.investmentSale
                ) || 0;

            realizedGainLoss +=
                Number(
                    calculated.realizedGainLoss
                ) || 0;
        }
    );

    const cash =
        income -
        expense -
        contributions +
        assetSales;

    return {
        income,
        expense,
        contributions,
        assetSales,
        realizedGainLoss,
        cash,
        netCashFlow: cash
    };
}

export function investmentBreakdownByCategory(
    entries
) {
    const totals =
        new Map();

    (entries || []).forEach(
        (entry) => {
            (
                entry.transactions ||
                []
            ).forEach(
                (transaction) => {
                    if (
                        !isInvestmentCategory(
                            transaction.category
                        )
                    ) {
                        return;
                    }

                    const category =
                        String(
                            transaction.category ||
                                ""
                        ).trim() ||
                        "Uncategorized";

                    const amount =
                        Math.max(
                            0,
                            Number(
                                transaction.amount
                            ) || 0
                        );

                    if (
                        !totals.has(
                            category
                        )
                    ) {
                        totals.set(
                            category,
                            {
                                invested: 0,
                                sold: 0
                            }
                        );
                    }

                    const row =
                        totals.get(
                            category
                        );

                    if (
                        investmentDirection(
                            transaction
                        ) === "sell"
                    ) {
                        row.sold +=
                            amount;
                    } else {
                        row.invested +=
                            amount;
                    }
                }
            );
        }
    );

    return [
        ...totals.entries()
    ]
        .map(
            ([category, value]) => ({
                category,
                invested:
                    value.invested,
                sold:
                    value.sold,
                net: Math.max(
                    0,
                    value.invested -
                        value.sold
                )
            })
        )
        .sort(
            (a, b) =>
                b.net - a.net
        );
}

export function totalNetInvested(
    entries
) {
    return investmentBreakdownByCategory(
        entries
    ).reduce(
        (sum, row) =>
            sum + row.net,
        0
    );
}

export function calculateCurrentMonth(
    entries
) {
    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        now.getMonth();

    let income = 0;
    let expense = 0;
    let investment = 0;
    let investmentSales = 0;

    (entries || []).forEach(
        (entry) => {
            if (!entry.date) {
                return;
            }

            const date =
                new Date(
                    entry.date +
                        "T00:00:00"
                );

            if (
                date.getFullYear() !==
                    year ||
                date.getMonth() !==
                    month
            ) {
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

            income +=
                entryIncomeAmount(
                    calculated
                );

            expense +=
                Number(
                    calculated.expense
                ) || 0;

            investment +=
                Number(
                    calculated.investment
                ) || 0;

            investmentSales +=
                Number(
                    calculated.investmentSale
                ) || 0;
        }
    );

    return {
        income,
        expense,
        investment,
        investmentSales,
        net:
            income -
            expense -
            investment +
            investmentSales
    };
}

export function matchesSearch(
    entry,
    search
) {
    const term =
        String(
            search || ""
        )
            .trim()
            .toLowerCase();

    if (!term) {
        return {
            entryMatch: true,
            transactionMatches:
                entry.transactions || []
        };
    }

    const entryMatch =
        String(
            entry.from || ""
        )
            .toLowerCase()
            .includes(term) ||
        String(
            entry.category || ""
        )
            .toLowerCase()
            .includes(term);

    const transactionMatches =
        (
            entry.transactions ||
            []
        ).filter(
            (transaction) =>
                String(
                    transaction.description ||
                        ""
                )
                    .toLowerCase()
                    .includes(term) ||
                String(
                    transaction.category ||
                        ""
                )
                    .toLowerCase()
                    .includes(term)
        );

    return {
        entryMatch,
        transactionMatches
    };
}

export function uid() {
    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 7)
    );
}

export function formatMoney(
    value
) {
    return (
        "₹" +
        Number(
            value || 0
        ).toLocaleString(
            "en-IN",
            {
                maximumFractionDigits: 2
            }
        )
    );
}

export function todayISO() {
    return new Date()
        .toISOString()
        .slice(0, 10);
}