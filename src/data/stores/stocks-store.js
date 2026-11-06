import { BaseStore } from "./base-store.js";

/*
 * Live prices for guests (read-only accounts can't save them), filled by
 * services/live-sync.js and layered over the stored prices when reading.
 */
export const livePriceOverlay = {};

/*
 * blackStocks -> "state" (out-of-line keys).
 * Known keys: "transactions", "prices", "seqCounter", "ipos", "dreams".
 */
export class StocksStore extends BaseStore {
    constructor(database) {
        super(database, "state");
    }

    async getState(key) {
        const value = await this.get(key);

        if (key === "prices" && Object.keys(livePriceOverlay).length) {
            return { ...(value || {}), ...livePriceOverlay };
        }

        return value;
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
        return { ...(value || {}), ...livePriceOverlay };
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
     * IPO applications (separate key, so loadAll/saveAll and every other
     * module that reads the three core keys are untouched).
     */
    async getIpos() {
        const value = await this.get("ipos");
        return Array.isArray(value) ? value : [];
    }

    async saveIpos(ipos) {
        return this.put(ipos, "ipos");
    }

    /*
     * Dream stocks wishlist (separate key; never part of the portfolio).
     */
    async getDreams() {
        const value = await this.get("dreams");
        return Array.isArray(value) ? value : [];
    }

    async saveDreams(dreams) {
        return this.put(dreams, "dreams");
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
