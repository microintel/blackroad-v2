import { BaseStore } from "./base-store.js";

/*
 * BlackRoadFD -> "deposits" (keyPath "id", autoIncrement)
 *
 * Record shape (unchanged from the old app):
 *   { id, bankName, principal, interestRate, compounding,
 *     startDate, tenureMonths, notes,
 *     status: "active" | "closed",
 *     closedDate, closedAmount, createdAt, updatedAt }
 */
export class DepositStore extends BaseStore {
    constructor(database) {
        super(database, "deposits");
    }

    async getDeposits() {
        return this.getAll();
    }

    async countDeposits() {
        return this.count();
    }

    async add(fd) {
        this.assertCanWrite();

        const now = new Date().toISOString();
        const record = {
            status: "active",
            createdAt: now,
            updatedAt: now,
            ...fd
        };

        // Let IndexedDB assign the id
        delete record.id;

        return this.request(
            "readwrite",
            (store) => store.add(record),
            undefined
        );
    }

    async update(id, changes) {
        this.assertCanWrite();

        const existing = await this.get(id);
        if (!existing) throw new Error("Deposit not found");

        const merged = {
            ...existing,
            ...changes,
            id,
            updatedAt: new Date().toISOString()
        };

        await this.put(merged);
        return merged;
    }

    async remove(id) {
        return this.delete(id);
    }
}
