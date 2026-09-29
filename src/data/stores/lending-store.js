import { BaseStore } from "./base-store.js";

/*
 * LendLedger -> "parties", "entries", "loans"
 *
 * parties: { id, name, phone, note }
 * entries: { id, partyId, type: "gave" | "got", amount, date, dueDate, note }
 * loans:   { id, lender, principal, emiAmount, tenureMonths,
 *            interestRate, date, notes, payments: [{ id, amount, date, note }] }
 *
 * Record shapes are unchanged from the old app.
 */
export class LendingStore {
    constructor(database) {
        this.database = database;
        this.parties = new BaseStore(database, "parties");
        this.entries = new BaseStore(database, "entries");
        this.loans = new BaseStore(database, "loans");
    }

    /* ---------- reads ---------- */

    async getPeople() {
        return this.parties.getAll();
    }

    async getEntries() {
        return this.entries.getAll();
    }

    async getLoans() {
        return this.loans.getAll();
    }

    async countPeople() {
        return this.parties.count();
    }

    async countEntries() {
        return this.entries.count();
    }

    async countLoans() {
        return this.loans.count();
    }

    /* ---------- people ---------- */

    // put() with no id lets IndexedDB assign one (autoIncrement)
    savePerson(party) {
        return this.parties.put(party);
    }

    /* Deletes the person AND all their entries (old behaviour). */
    async deletePerson(id) {
        this.parties.assertCanWrite();

        await this.deleteEntriesForParty(id);
        await this.parties.delete(id);
    }

    /* ---------- entries ---------- */

    saveEntry(entry) {
        return this.entries.put(entry);
    }

    deleteEntry(id) {
        return this.entries.delete(id);
    }

    deleteEntriesForParty(partyId) {
        this.entries.assertCanWrite();

        return new Promise((resolve, reject) => {
            if (!this.entries.hasStore()) {
                resolve();
                return;
            }

            const tx = this.database.transaction(
                "entries",
                "readwrite"
            );

            const index = tx
                .objectStore("entries")
                .index("partyId");

            const req = index.openCursor(
                IDBKeyRange.only(partyId)
            );

            req.onsuccess = () => {
                const cursor = req.result;

                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            req.onerror = () => reject(req.error);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /* ---------- loans ---------- */

    saveLoan(loan) {
        return this.loans.put(loan);
    }

    deleteLoan(id) {
        return this.loans.delete(id);
    }
}
