/* Sidebar structure. Icons are Lucide names (see components/icons.js). */
export const navigation = [

    {
        title: "Overview",
        items: [
            { label: "Dashboard", path: "/dashboard", icon: "layout-dashboard" }
        ]
    },

    {
        title: "Finance",
        items: [
            { label: "Income & Expenses", path: "/income", icon: "wallet" },
            { label: "Stocks", path: "/stocks", icon: "chart-candlestick" },
            { label: "Fixed Deposits", path: "/deposits", icon: "landmark" },
            { label: "Lending", path: "/lending", icon: "arrow-left-right" },
            { label: "Mutual Fund", path: "/mutualfund", icon: "chart-no-axes-combined" }
        ]
    },

    {
        title: "Tools",
        items: [
            { label: "Financial Intelligence", path: "/intelligence", icon: "brain" },
            { label: "Accounting", path: "/accounting", icon: "receipt" },
            { label: "Data Management", path: "/data", icon: "database" },
            { label: "Notifications", path: "/notifications", icon: "bell" },
            { label: "Account", path: "/account", icon: "user-round" }
        ]
    }

];
