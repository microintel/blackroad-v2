/*
 * BaseStore
 * Thin wrapper around ONE IndexedDB object store.
 *
 * Works with both kinds of legacy stores:
 *   - in-line key stores  (keyPath: "id" / "key")  -> put(value)
 *   - out-of-line key stores (no keyPath: stocks "state",
 *     accounting "sst")                            -> put(value, key)
 */
export class BaseStore {
    constructor(database, storeName) {
        this.database = database;
        this.storeName = storeName;
    }

    hasStore() {
        return this.database.objectStoreNames.contains(
            this.storeName
        );
    }

    assertCanWrite() {
        if (
            typeof window !== "undefined" &&
            window.BRAuth &&
            typeof window.BRAuth.assertCanWrite === "function"
        ) {
            window.BRAuth.assertCanWrite();
        }
    }

    request(mode, action, emptyValue) {
        return new Promise((resolve, reject) => {
            if (!this.hasStore()) {
                resolve(emptyValue);
                return;
            }

            const transaction = this.database.transaction(
                this.storeName,
                mode
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const request = action(store);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAll() {
        return (
            (await this.request(
                "readonly",
                (store) => store.getAll(),
                []
            )) || []
        );
    }

    /*
     * Returns [{ key, value }] for every record.
     * Needed for out-of-line key stores, where getAll()
     * returns values without their keys.
     */
    getAllWithKeys() {
        return new Promise((resolve, reject) => {
            if (!this.hasStore()) {
                resolve([]);
                return;
            }

            const transaction = this.database.transaction(
                this.storeName,
                "readonly"
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const records = [];

            const request = store.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;

                if (!cursor) {
                    resolve(records);
                    return;
                }

                records.push({
                    key: cursor.key,
                    value: cursor.value
                });

                cursor.continue();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async count() {
        return (
            (await this.request(
                "readonly",
                (store) => store.count(),
                0
            )) || 0
        );
    }

    get(key) {
        return this.request(
            "readonly",
            (store) => store.get(key),
            undefined
        );
    }

    put(value, key) {
        this.assertCanWrite();

        return this.request(
            "readwrite",
            (store) =>
                key === undefined
                    ? store.put(value)
                    : store.put(value, key),
            undefined
        );
    }

    async delete(key) {
        this.assertCanWrite();

        await this.request(
            "readwrite",
            (store) => store.delete(key),
            undefined
        );
    }
}
