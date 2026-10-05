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

    /*
     * Generic read/write of one record in the "meta" store
     * ({ key, value }). The meta store is part of the full backup,
     * so anything kept here is exported and restored with it.
     */
    getMeta(key) {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(this.metaStoreName)) {
                resolve(undefined);
                return;
            }

            const request = this.database
                .transaction(this.metaStoreName, "readonly")
                .objectStore(this.metaStoreName)
                .get(key);

            request.onsuccess = () =>
                resolve(request.result ? request.result.value : undefined);
            request.onerror = () => reject(request.error);
        });
    }

    setMeta(key, value) {
        return new Promise((resolve, reject) => {
            if (
                typeof window !== "undefined" &&
                window.BRAuth &&
                typeof window.BRAuth.assertCanWrite === "function"
            ) {
                try {
                    window.BRAuth.assertCanWrite();
                } catch (error) {
                    reject(error);
                    return;
                }
            }

            if (!this.database.objectStoreNames.contains(this.metaStoreName)) {
                reject(new Error("Income meta store does not exist."));
                return;
            }

            const tx = this.database.transaction(this.metaStoreName, "readwrite");

            tx.objectStore(this.metaStoreName).put({ key, value });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    /* Custom expense categories: [{ name, icon, hue }], or undefined if never saved. */
    getCustomExpenseCategories() {
        return this.getMeta("customExpenseCategories");
    }

    setCustomExpenseCategories(list) {
        return this.setMeta("customExpenseCategories", list);
    }
}
