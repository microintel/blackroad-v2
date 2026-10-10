import { getDashboardData, replaySymbol, currentPrice } from "../dashboard/dashboard-service.js";
import { dataService } from "../../data/data-service.js";

/*
 * Rover data adapter (read-only).
 *
 * The only file in the Rover module that touches the rest of the app.
 * It reuses the Dashboard service, so every figure Rover quotes is the
 * same number the Dashboard shows. Nothing is written anywhere.
 */

async function loadHoldings() {
    try {
        const store = await dataService.getStocksStore();
        const transactions = (await store.getState("transactions")) || [];
        const prices = (await store.getState("prices")) || {};

        return [...new Set(transactions.map((t) => t.symbol))]
            .map((symbol) => {
                const { quantity, investedValue } = replaySymbol(symbol, transactions);
                const value = quantity * currentPrice(symbol, transactions, prices);

                return {
                    symbol,
                    quantity,
                    invested: investedValue,
                    value,
                    pnl: value - investedValue,
                    pnlPct: investedValue > 0 ? ((value - investedValue) / investedValue) * 100 : 0
                };
            })
            .filter((h) => h.quantity > 0)
            .sort((a, b) => b.value - a.value);
    } catch (error) {
        console.error("Rover: holdings unavailable:", error);
        return [];
    }
}

/* One consistent picture of the user's money, taken at question time. */
export async function getSnapshot() {
    const [data, holdings] = await Promise.all([getDashboardData(), loadHoldings()]);

    return { ...data, holdings };
}
