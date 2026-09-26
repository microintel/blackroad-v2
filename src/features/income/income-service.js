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

export function isInvestmentCategory(category) {
    return INVESTMENT_CATEGORIES.includes(
        String(category || "").trim()
    );
}

export function isInvestmentReturnCategory(category) {
    return INVESTMENT_RETURN_CATEGORIES.includes(
        String(category || "").trim()
    );
}

export function isInvestmentSaleIncomeEntry(entry) {
    const category = String(
        entry?.category || ""
    ).trim().toLowerCase();

    const source = String(
        entry?.from || ""
    ).trim().toLowerCase();

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

export function entryIncomeAmount(entry) {
    if (isInvestmentSaleIncomeEntry(entry)) {
        return 0;
    }

    return Math.max(
        0,
        Number(entry?.income) || 0
    );
}

export function investmentDirection(transaction) {
    const type = String(
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

export function recalcEntry(entry) {
    let totalExpense = 0;
    let totalInvestment = 0;
    let totalInvestmentSale = 0;
    let realizedGainLoss = 0;

    const transactions = entry.transactions || [];

    transactions.forEach((transaction) => {
        const amount = Math.max(
            0,
            Number(transaction.amount) || 0
        );

        if (
            isInvestmentCategory(
                transaction.category
            )
        ) {
            if (
                investmentDirection(transaction) ===
                "sell"
            ) {
                totalInvestmentSale += amount;

                const costBasis = Number(
                    transaction.costBasis
                );

                if (Number.isFinite(costBasis)) {
                    realizedGainLoss +=
                        amount - costBasis;
                }

                transaction.type = "sell";
            } else {
                totalInvestment += amount;
                transaction.type = "investment";
            }

            return;
        }

        totalExpense += amount;
        transaction.type = "expense";
    });

    const income = entryIncomeAmount(entry);

    if (totalInvestmentSale === 0) {
        if (isInvestmentSaleIncomeEntry(entry)) {
            totalInvestmentSale += Math.max(
                0,
                Number(entry.income) || 0
            );
        }
    }

    entry.expense = totalExpense;
    entry.investment = totalInvestment;
    entry.investmentSale = totalInvestmentSale;
    entry.realizedGainLoss = realizedGainLoss;

    entry.balance =
        income -
        totalExpense -
        totalInvestment +
        totalInvestmentSale;

    return entry;
}

export function calculateLedgerSummary(entries) {
    let income = 0;
    let expense = 0;
    let contributions = 0;
    let assetSales = 0;
    let realizedGainLoss = 0;

    (entries || []).forEach((entry) => {
        const recalculated = recalcEntry({
            ...entry,
            transactions: (
                entry.transactions || []
            ).map((transaction) => ({
                ...transaction
            }))
        });

        income += entryIncomeAmount(
            recalculated
        );

        expense +=
            Number(recalculated.expense) || 0;

        contributions +=
            Number(recalculated.investment) || 0;

        assetSales +=
            Number(recalculated.investmentSale) || 0;

        realizedGainLoss +=
            Number(
                recalculated.realizedGainLoss
            ) || 0;
    });

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

export function calculateCurrentMonth(entries) {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();

    let income = 0;
    let expense = 0;
    let investment = 0;
    let investmentSales = 0;

    (entries || []).forEach((entry) => {
        if (!entry.date) {
            return;
        }

        const date = new Date(
            entry.date + "T00:00:00"
        );

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month
        ) {
            return;
        }

        const calculated = recalcEntry({
            ...entry,
            transactions: (
                entry.transactions || []
            ).map((transaction) => ({
                ...transaction
            }))
        });

        income += entryIncomeAmount(calculated);
        expense +=
            Number(calculated.expense) || 0;
        investment +=
            Number(calculated.investment) || 0;
        investmentSales +=
            Number(calculated.investmentSale) || 0;
    });

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

export function getRecentTransactions(
    entries,
    limit = 8
) {
    const result = [];

    (entries || []).forEach((entry) => {
        (entry.transactions || []).forEach(
            (transaction) => {
                result.push({
                    ...transaction,
                    entryId: entry.id,
                    entryDate: entry.date,
                    entryFrom: entry.from
                });
            }
        );
    });

    result.sort((a, b) => {
        const dateA = new Date(
            (a.date || a.entryDate || "") +
                "T00:00:00"
        );

        const dateB = new Date(
            (b.date || b.entryDate || "") +
                "T00:00:00"
        );

        return dateB - dateA;
    });

    return result.slice(0, limit);
}