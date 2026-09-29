export const DATABASES = {
    income: {
        baseName: "BlackRoad2",
        version: 3,
        stores: {
            entries: "entries",
            meta: "meta"
        },
        label: "Income & Expenses"
    },

    stocks: {
        baseName: "blackStocks",
        version: 1,
        stores: {
            state: "state"
        },
        label: "Stocks"
    },

    lending: {
        baseName: "LendLedger",
        version: 3,
        stores: {
            parties: "parties",
            entries: "entries",
            loans: "loans"
        },
        label: "Lending"
    },

    deposits: {
        baseName: "BlackRoadFD",
        version: 1,
        stores: {
            deposits: "deposits"
        },
        label: "Fixed Deposits"
    },

    stepup: {
        baseName: "sip-compounder",
        version: 2,
        stores: {
            settings: "settings",
            entries: "entries",
            profiles: "profiles"
        },
        label: "StepUp"
    },

    accounting: {
        baseName: "BlackRoad Accounting",
        version: 1,
        stores: {
            accounting: "sst"
        },
        label: "Accounting"
    }
};