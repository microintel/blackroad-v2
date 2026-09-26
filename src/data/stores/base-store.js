export class BaseStore {
    constructor(database, storeName) {
        this.database = database;
        this.storeName = storeName;
    }

    getAll() {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(this.storeName)) {
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

            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    count() {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(this.storeName)) {
                resolve(0);
                return;
            }

            const transaction = this.database.transaction(
                this.storeName,
                "readonly"
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const request = store.count();

            request.onsuccess = () => {
                resolve(request.result || 0);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    get(key) {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(this.storeName)) {
                resolve(undefined);
                return;
            }

            const transaction = this.database.transaction(
                this.storeName,
                "readonly"
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    put(value) {
        return new Promise((resolve, reject) => {
            if (
                typeof window !== "undefined" &&
                window.BRAuth &&
                typeof window.BRAuth.assertCanWrite === "function"
            ) {
                window.BRAuth.assertCanWrite();
            }

            const transaction = this.database.transaction(
                this.storeName,
                "readwrite"
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const request = store.put(value);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    delete(key) {
        return new Promise((resolve, reject) => {
            if (
                typeof window !== "undefined" &&
                window.BRAuth &&
                typeof window.BRAuth.assertCanWrite === "function"
            ) {
                window.BRAuth.assertCanWrite();
            }

            const transaction = this.database.transaction(
                this.storeName,
                "readwrite"
            );

            const store = transaction.objectStore(
                this.storeName
            );

            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}