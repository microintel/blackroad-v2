import { DATABASES } from "./db-registry.js";

const ACTIVE_SCOPE_KEY = "br_active_scope";

function getScopeSuffix() {
    try {
        const scope = localStorage.getItem(
            ACTIVE_SCOPE_KEY
        );

        if (!scope) {
            return "anon";
        }

        return scope.replace(
            /[^a-z0-9@._-]/gi,
            "_"
        );
    } catch {
        return "anon";
    }
}

export function getCurrentScope() {
    return getScopeSuffix();
}

export function getDatabaseName(moduleName) {
    const config = DATABASES[moduleName];

    if (!config) {
        throw new Error(
            `Unknown database module: ${moduleName}`
        );
    }

    return `${config.baseName}::${getScopeSuffix()}`;
}

export function getDatabaseConfig(moduleName) {
    const config = DATABASES[moduleName];

    if (!config) {
        throw new Error(
            `Unknown database module: ${moduleName}`
        );
    }

    return config;
}

function createIncomeStores(db) {
    if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", {
            keyPath: "id",
            autoIncrement: true
        });
    }

    if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", {
            keyPath: "key"
        });
    }
}

function createModuleStores(
    moduleName,
    db
) {
    switch (moduleName) {
        case "income":
            createIncomeStores(db);
            break;

        case "stocks":
            if (!db.objectStoreNames.contains("state")) {
                db.createObjectStore("state", {
                    keyPath: "key"
                });
            }
            break;

        case "lending":
            if (!db.objectStoreNames.contains("parties")) {
                db.createObjectStore("parties", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (!db.objectStoreNames.contains("entries")) {
                db.createObjectStore("entries", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (!db.objectStoreNames.contains("loans")) {
                db.createObjectStore("loans", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
            break;

        case "deposits":
            if (!db.objectStoreNames.contains("deposits")) {
                db.createObjectStore("deposits", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
            break;

        case "stepup":
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", {
                    keyPath: "key"
                });
            }

            if (!db.objectStoreNames.contains("entries")) {
                db.createObjectStore("entries", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (!db.objectStoreNames.contains("profiles")) {
                db.createObjectStore("profiles", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
            break;

        case "accounting":
            if (!db.objectStoreNames.contains("sst")) {
                db.createObjectStore("sst", {
                    keyPath: "key"
                });
            }
            break;
    }
}

async function migrateLegacyIncomeData(
    scopedDb,
    moduleName
) {
    if (moduleName !== "income") {
        return scopedDb;
    }

    const baseName =
        DATABASES.income.baseName;

    const scopedName =
        getDatabaseName("income");

    if (scopedName === baseName) {
        return scopedDb;
    }

    const migrationKey =
        `br_migrated::${scopedName}`;

    try {
        if (
            localStorage.getItem(
                migrationKey
            )
        ) {
            return scopedDb;
        }
    } catch {
        // Continue safely.
    }

    /*
     * If the scoped database already contains data,
     * never overwrite it.
     */
    const scopedCount =
        await new Promise(
            (resolve) => {
                try {
                    const transaction =
                        scopedDb.transaction(
                            "entries",
                            "readonly"
                        );

                    const request =
                        transaction
                            .objectStore("entries")
                            .count();

                    request.onsuccess = () => {
                        resolve(
                            request.result || 0
                        );
                    };

                    request.onerror = () => {
                        resolve(0);
                    };
                } catch {
                    resolve(0);
                }
            }
        );

    if (scopedCount > 0) {
        try {
            localStorage.setItem(
                migrationKey,
                "1"
            );
        } catch {}

        return scopedDb;
    }

    /*
     * Open the old unscoped database.
     */
    const legacyDb =
        await new Promise(
            (resolve) => {
                const request =
                    indexedDB.open(
                        baseName
                    );

                request.onsuccess = () => {
                    resolve(
                        request.result
                    );
                };

                request.onerror = () => {
                    resolve(null);
                };

                /*
                 * Do not create the old DB accidentally.
                 */
                request.onupgradeneeded = (
                    event
                ) => {
                    event.target.transaction.abort();
                };
            }
        );

    if (!legacyDb) {
        return scopedDb;
    }

    try {
        if (
            !legacyDb.objectStoreNames.contains(
                "entries"
            )
        ) {
            legacyDb.close();

            try {
                localStorage.setItem(
                    migrationKey,
                    "1"
                );
            } catch {}

            return scopedDb;
        }

        const entries =
            await new Promise(
                (resolve) => {
                    const request =
                        legacyDb
                            .transaction(
                                "entries",
                                "readonly"
                            )
                            .objectStore(
                                "entries"
                            )
                            .getAll();

                    request.onsuccess =
                        () => {
                            resolve(
                                request.result ||
                                []
                            );
                        };

                    request.onerror =
                        () => {
                            resolve([]);
                        };
                }
            );

        if (entries.length) {
            await new Promise(
                (resolve) => {
                    const transaction =
                        scopedDb.transaction(
                            "entries",
                            "readwrite"
                        );

                    const store =
                        transaction.objectStore(
                            "entries"
                        );

                    entries.forEach(
                        (entry) => {
                            store.put(entry);
                        }
                    );

                    transaction.oncomplete =
                        () => resolve();

                    transaction.onerror =
                        () => resolve();

                    transaction.onabort =
                        () => resolve();
                }
            );
        }

        /*
         * Migrate meta/update date too.
         */
        if (
            legacyDb.objectStoreNames.contains(
                "meta"
            ) &&
            scopedDb.objectStoreNames.contains(
                "meta"
            )
        ) {
            const meta =
                await new Promise(
                    (resolve) => {
                        const request =
                            legacyDb
                                .transaction(
                                    "meta",
                                    "readonly"
                                )
                                .objectStore(
                                    "meta"
                                )
                                .getAll();

                        request.onsuccess =
                            () => {
                                resolve(
                                    request.result ||
                                    []
                                );
                            };

                        request.onerror =
                            () => {
                                resolve([]);
                            };
                    }
                );

            if (meta.length) {
                await new Promise(
                    (resolve) => {
                        const transaction =
                            scopedDb.transaction(
                                "meta",
                                "readwrite"
                            );

                        const store =
                            transaction.objectStore(
                                "meta"
                            );

                        meta.forEach(
                            (item) => {
                                store.put(item);
                            }
                        );

                        transaction.oncomplete =
                            () => resolve();

                        transaction.onerror =
                            () => resolve();
                    }
                );
            }
        }

        try {
            localStorage.setItem(
                migrationKey,
                "1"
            );
        } catch {}
    } finally {
        legacyDb.close();
    }

    return scopedDb;
}

export async function openDatabase(
    moduleName
) {
    const config =
        getDatabaseConfig(
            moduleName
        );

    const databaseName =
        getDatabaseName(
            moduleName
        );

    const database =
        await new Promise(
            (resolve, reject) => {
                const request =
                    indexedDB.open(
                        databaseName,
                        config.version
                    );

                request.onupgradeneeded =
                    (event) => {
                        createModuleStores(
                            moduleName,
                            event.target.result
                        );
                    };

                request.onsuccess =
                    () => {
                        const db =
                            request.result;

                        db.onversionchange =
                            () => {
                                db.close();
                            };

                        resolve(db);
                    };

                request.onerror =
                    () => {
                        reject(
                            request.error
                        );
                    };

                request.onblocked =
                    () => {
                        console.warn(
                            `BlackRoad database blocked: ${databaseName}`
                        );
                    };
            }
        );

    return migrateLegacyIncomeData(
        database,
        moduleName
    );
}