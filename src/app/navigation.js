/* Sidebar structure. Icons are Lucide names (see components/icons.js); `color` tints each menu icon. */
export const navigation = [

    {
        title: "Overview",
        items: [
            { label: "Dashboard", path: "/dashboard", icon: "layout-dashboard", color: "#3B82F6" },
            { label: "Net Worth", path: "/networth", icon: "trending-up", color: "#10B981" },
            { label: "Connect Broker", path: "/connect-broker", icon: "plug", color: "#F59E0B" }
        ]
    },

    {
        title: "Finance",
        items: [
            { label: "Income Statement", path: "/income", icon: "wallet", color: "#22C55E" },
            { label: "Stocks", path: "/stocks", icon: "chart-candlestick", color: "#EF4444" },
            { label: "Fixed Deposits", path: "/deposits", icon: "landmark", color: "#8B5CF6" },
            { label: "Lending", path: "/lending", icon: "arrow-left-right", color: "#06B6D4" },
            { label: "Mutual Fund", path: "/mutualfund", icon: "chart-no-axes-combined", color: "#F97316" }
        ]
    },

    {
        title: "Tools",
        items: [
            { label: "Financial Intelligence", path: "/intelligence", icon: "brain", color: "#EC4899" },
            { label: "Calculators", path: "/calculators", icon: "calculator", color: "#14B8A6" },
            { label: "Accounting", path: "/accounting", icon: "receipt", color: "#EAB308" },
            { label: "Brokerage Report Readers", path: "/brokers", icon: "file-chart-column", color: "#6366F1" },
            { label: "Data Management", path: "/data", icon: "database", color: "#0EA5E9" },
            { label: "Notifications", path: "/notifications", icon: "bell", color: "#F43F5E" },
            { label: "Account", path: "/account", icon: "user-round", color: "#A855F7" }
        ]
    }

];
