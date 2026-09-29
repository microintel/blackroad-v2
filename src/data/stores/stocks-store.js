import { BaseStore } from "./base-store.js";

/*
 * blackStocks -> "state" (out-of-line keys).
 * Known keys: "transactions", "prices", "seqCounter".
 */
export class StocksStore extends BaseStore {
    constructor(database) {
        super(database, "state");
    }

    async getState(key) {
        return this.get(key);
    }

    async getAllState() {
        return this.getAllWithKeys();
    }

    async getTransactions() {
        const value = await this.get("transactions");
        return value || [];
    }

    async saveTransactions(transactions) {
        return this.put(transactions, "transactions");
    }

    async getPrices() {
        const value = await this.get("prices");
        return value || {};
    }

    async savePrices(prices) {
        return this.put(prices, "prices");
    }

    async getSeqCounter() {
        const value = await this.get("seqCounter");
        return value || 0;
    }

    async saveSeqCounter(seqCounter) {
        return this.put(seqCounter, "seqCounter");
    }

    /*
     * Loads all three pieces of portfolio state at once.
     */
    async loadAll() {
        const [transactions, prices, seqCounter] =
            await Promise.all([
                this.getTransactions(),
                this.getPrices(),
                this.getSeqCounter()
            ]);

        return { transactions, prices, seqCounter };
    }

    /*
     * Persists all three pieces of portfolio state at once.
     */
    async saveAll({ transactions, prices, seqCounter }) {
        await Promise.all([
            this.saveTransactions(transactions),
            this.savePrices(prices),
            this.saveSeqCounter(seqCounter)
        ]);
    }
}
