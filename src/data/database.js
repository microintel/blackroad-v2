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
    /*
     * Must match the OLD BlackRoad schemas exactly.
     * Stores without a keyPath use out-of-line keys.
     */
    switch (moduleName) {
        case "income":
            createIncomeStores(db);
            break;

        case "stocks":
            // old: createObjectStore("state")  (no keyPath)
            if (!db.objectStoreNames.contains("state")) {
                db.createObjectStore("state");
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
                const entries = db.createObjectStore(
                    "entries",
                    {
                        keyPath: "id",
                        autoIncrement: true
                    }
                );

                entries.createIndex(
                    "partyId",
                    "partyId",
                    { unique: false }
                );
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
            // old: settings keyPath "id"
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", {
                    keyPath: "id"
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
            // old: createObjectStore("sst")  (no keyPath)
            if (!db.objectStoreNames.contains("sst")) {
                db.createObjectStore("sst");
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


/* =========================================================
   LEGACY (UN-SCOPED) DATA MIGRATION  — Phase 14
   Ported from the old app. Before per-user scoping existed, every
   module used one shared database. The first account to open a
   module inherits that data ONCE, and only if its own scoped
   database is still empty. Nothing is ever overwritten or deleted.
   Same rules as the old app:
     - income  -> handled above (entries + meta)
     - stocks  -> skipped for guests, + old localStorage keys
     - lending -> all accounts
     - stepup  -> skipped for guests
   FD and Accounting had no legacy migration in the old app.
   ========================================================= */

const LEGACY_STORE_MIGRATIONS = {
    stocks: {
        stores: ["state"],
        probe: "state",
        skipGuest: true
    },
    lending: {
        stores: ["parties", "entries", "loans"],
        probe: "parties",
        skipGuest: false
    },
    stepup: {
        stores: ["settings", "entries", "profiles"],
        probe: "profiles",
        skipGuest: true
    }
};

const LEGACY_STOCKS_LS_KEYS = {
    transactions: "ledger_transactions_v1",
    prices: "ledger_prices_v1",
    seqCounter: "ledger_seq_v1"
};

function isGuestScope() {
    try {
        return localStorage.getItem(ACTIVE_SCOPE_KEY) === "guest";
    } catch {
        return false;
    }
}

function setMigrated(flag) {
    try {
        localStorage.setItem(flag, "1");
    } catch { /* ignore */ }
}

function idbCount(db, storeName) {
    return new Promise((resolve) => {
        try {
            const request = db
                .transaction(storeName, "readonly")
                .objectStore(storeName)
                .count();

            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => resolve(0);
        } catch {
            resolve(0);
        }
    });
}

/* Never creates the old database: the upgrade is aborted. */
function openLegacyDatabase(baseName) {
    return new Promise((resolve) => {
        const request = indexedDB.open(baseName);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);

        request.onupgradeneeded = (event) => {
            event.target.transaction.abort();
        };
    });
}

/* Reads a whole store as [{ key, value }] so keyless stores keep keys. */
function readStorePairs(db, storeName) {
    return new Promise((resolve) => {
        try {
            const store = db
                .transaction(storeName, "readonly")
                .objectStore(storeName);

            const pairs = [];
            const request = store.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;

                if (!cursor) {
                    resolve({ keyless: store.keyPath === null, pairs });
                    return;
                }

                pairs.push({ key: cursor.key, value: cursor.value });
                cursor.continue();
            };

            request.onerror = () => resolve({ keyless: false, pairs: [] });
        } catch {
            resolve({ keyless: false, pairs: [] });
        }
    });
}

async function migrateLegacyStores(scopedDb, moduleName) {
    const plan = LEGACY_STORE_MIGRATIONS[moduleName];

    if (!plan) return scopedDb;

    const baseName = DATABASES[moduleName].baseName;
    const scopedName = getDatabaseName(moduleName);

    if (scopedName === baseName) return scopedDb;
    if (plan.skipGuest && isGuestScope()) return scopedDb;

    const flag = `br_migrated::${scopedName}`;

    try {
        if (localStorage.getItem(flag)) return scopedDb;
    } catch { /* continue */ }

    // The scoped database already has data: never overwrite it.
    if ((await idbCount(scopedDb, plan.probe)) > 0) {
        setMigrated(flag);
        return scopedDb;
    }

    const legacyDb = await openLegacyDatabase(baseName);

    if (legacyDb) {
        try {
            const present = plan.stores.filter((name) =>
                legacyDb.objectStoreNames.contains(name) &&
                scopedDb.objectStoreNames.contains(name)
            );

            if (present.length) {
                const results = [];

                for (const name of present) {
                    results.push({
                        name,
                        ...(await readStorePairs(legacyDb, name))
                    });
                }

                if (results.some((r) => r.pairs.length)) {
                    await new Promise((resolve) => {
                        const tx = scopedDb.transaction(present, "readwrite");

                        results.forEach(({ name, keyless, pairs }) => {
                            const store = tx.objectStore(name);

                            pairs.forEach(({ key, value }) => {
                                if (keyless) store.put(value, key);
                                else store.put(value);
                            });
                        });

                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                        tx.onabort = () => resolve();
                    });
                }
            }
        } finally {
            legacyDb.close();
        }

        setMigrated(flag);
    }

    // Stocks only: very old builds kept data in localStorage.
    if (moduleName === "stocks" && (await idbCount(scopedDb, "state")) === 0) {
        await migrateLegacyStocksLocalStorage(scopedDb);
    }

    return scopedDb;
}

async function migrateLegacyStocksLocalStorage(scopedDb) {
    try {
        const raw = {};

        for (const [name, key] of Object.entries(LEGACY_STOCKS_LS_KEYS)) {
            raw[name] = localStorage.getItem(key);
        }

        if (!raw.transactions && !raw.prices && !raw.seqCounter) return;

        const values = {
            transactions: raw.transactions ? JSON.parse(raw.transactions) : [],
            prices: raw.prices ? JSON.parse(raw.prices) : {},
            seqCounter: raw.seqCounter ? parseInt(raw.seqCounter, 10) : 0
        };

        await new Promise((resolve, reject) => {
            const tx = scopedDb.transaction("state", "readwrite");
            const store = tx.objectStore("state");

            Object.entries(values).forEach(([key, value]) =>
                store.put(value, key)
            );

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });

        // Same as the old app: remove the old keys once they're safely copied.
        Object.values(LEGACY_STOCKS_LS_KEYS).forEach((key) =>
            localStorage.removeItem(key)
        );
    } catch (error) {
        console.error("BlackRoad: legacy stocks localStorage migration failed", error);
    }
}

/*
 * Opens a database at the version this app expects. If the database on
 * disk is NEWER (the old backup tool bumped versions to re-create
 * missing stores), open it at its real version instead of failing —
 * then make sure every store we need exists.
 */
function openAtCompatibleVersion(databaseName, moduleName, version) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, version);

        request.onupgradeneeded = (event) => {
            createModuleStores(moduleName, event.target.result);
        };

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => {
            if (request.error && request.error.name === "VersionError") {
                const plain = indexedDB.open(databaseName);

                plain.onsuccess = () => {
                    const db = plain.result;
                    const expected = Object.values(
                        DATABASES[moduleName].stores
                    );

                    const missing = expected.filter(
                        (name) => !db.objectStoreNames.contains(name)
                    );

                    if (!missing.length) {
                        resolve(db);
                        return;
                    }

                    const next = db.version + 1;
                    db.close();

                    const upgrade = indexedDB.open(databaseName, next);

                    upgrade.onupgradeneeded = (e) =>
                        createModuleStores(moduleName, e.target.result);
                    upgrade.onsuccess = () => resolve(upgrade.result);
                    upgrade.onerror = () => reject(upgrade.error);
                };

                plain.onerror = () => reject(plain.error);
                return;
            }

            reject(request.error);
        };

        request.onblocked = () => {
            console.warn(`BlackRoad database blocked: ${databaseName}`);
        };
    });
}

export async function openDatabase(moduleName) {
    const config = getDatabaseConfig(moduleName);
    const databaseName = getDatabaseName(moduleName);

    const database = await openAtCompatibleVersion(
        databaseName,
        moduleName,
        config.version
    );

    database.onversionchange = () => {
        database.close();
    };

    if (moduleName === "income") {
        return migrateLegacyIncomeData(database, moduleName);
    }

    return migrateLegacyStores(database, moduleName);
}
