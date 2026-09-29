import { BaseStore } from "./base-store.js";

/*
 * BlackRoad Accounting -> "sst" (out-of-line keys).
 * The whole manual accounting record lives under the key "manual".
 *
 * Record shape (unchanged from the old app):
 * { banks: number[], customs: [{ name, amt }], cash, fd, stock,
 *   demat, pending, other, updatedAt }
 */
export class AccountingStore extends BaseStore {
    constructor(database) {
        super(database, "sst");
    }

    async getAccountingData() {
        return (await this.get("manual")) || null;
    }

    async saveAccountingData(data) {
        await this.put(data, "manual");
    }
}
