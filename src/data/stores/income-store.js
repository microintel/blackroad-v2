import { BaseStore } from "./base-store.js";

export class IncomeStore extends BaseStore {
    constructor(database) {
        super(database, "entries");

        this.metaStoreName = "meta";
    }

    async getEntries() {
        return this.getAll();
    }

    async getEntry(id) {
        return this.get(id);
    }

    async countEntries() {
        return this.count();
    }

    async saveEntry(entry) {
        return this.put(entry);
    }

    async deleteEntry(id) {
        return this.delete(id);
    }

    async getUpdateDate() {
        return new Promise((resolve, reject) => {
            if (
                !this.database.objectStoreNames.contains(
                    this.metaStoreName
                )
            ) {
                resolve("");
                return;
            }

            const transaction = this.database.transaction(
                this.metaStoreName,
                "readonly"
            );

            const store = transaction.objectStore(
                this.metaStoreName
            );

            const request = store.get("updateDate");

            request.onsuccess = () => {
                resolve(
                    request.result
                        ? request.result.value
                        : ""
                );
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async setUpdateDate(date) {
        return new Promise((resolve, reject) => {
            if (
                typeof window !== "undefined" &&
                window.BRAuth &&
                typeof window.BRAuth.assertCanWrite === "function"
            ) {
                window.BRAuth.assertCanWrite();
            }

            if (
                !this.database.objectStoreNames.contains(
                    this.metaStoreName
                )
            ) {
                reject(
                    new Error(
                        "Income meta store does not exist."
                    )
                );
                return;
            }

            const transaction = this.database.transaction(
                this.metaStoreName,
                "readwrite"
            );

            const store = transaction.objectStore(
                this.metaStoreName
            );

            const request = store.put({
                key: "updateDate",
                value: date
            });

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}