import { DATABASES } from "./db-registry.js";

const ACTIVE_SCOPE_KEY = "br_active_scope";

function getScopeSuffix() {
    try {
        const scope = localStorage.getItem(ACTIVE_SCOPE_KEY);

        if (!scope) {
            return "anon";
        }

        return scope.replace(/[^a-z0-9@._-]/gi, "_");
    } catch (error) {
        return "anon";
    }
}

export function getDatabaseName(moduleName) {
    const config = DATABASES[moduleName];

    if (!config) {
        throw new Error(`Unknown database module: ${moduleName}`);
    }

    return `${config.baseName}::${getScopeSuffix()}`;
}

export function getDatabaseConfig(moduleName) {
    const config = DATABASES[moduleName];

    if (!config) {
        throw new Error(`Unknown database module: ${moduleName}`);
    }

    return config;
}

export function getCurrentScope() {
    return getScopeSuffix();
}

export function openDatabase(moduleName) {
    const config = getDatabaseConfig(moduleName);
    const databaseName = getDatabaseName(moduleName);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(
            databaseName,
            config.version
        );

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            /*
             * Income & Expenses
             *
             * This exactly follows the legacy database structure:
             *
             * entries:
             * {
             *   id,
             *   income,
             *   date,
             *   from,
             *   category,
             *   expense,
             *   investment,
             *   investmentSale,
             *   realizedGainLoss,
             *   balance,
             *   transactions: []
             * }
             */
            if (
                moduleName === "income" &&
                !db.objectStoreNames.contains("entries")
            ) {
                db.createObjectStore("entries", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (
                moduleName === "income" &&
                !db.objectStoreNames.contains("meta")
            ) {
                db.createObjectStore("meta", {
                    keyPath: "key"
                });
            }

            /*
             * Other databases are created only with their
             * known legacy structure.
             */
            if (
                moduleName === "stocks" &&
                !db.objectStoreNames.contains("state")
            ) {
                db.createObjectStore("state", {
                    keyPath: "key"
                });
            }

            if (moduleName === "lending") {
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
            }

            if (
                moduleName === "deposits" &&
                !db.objectStoreNames.contains("deposits")
            ) {
                db.createObjectStore("deposits", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (moduleName === "stepup") {
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
            }

            if (
                moduleName === "accounting" &&
                !db.objectStoreNames.contains("sst")
            ) {
                db.createObjectStore("sst", {
                    keyPath: "key"
                });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;

            db.onversionchange = () => {
                db.close();
            };

            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn(
                `BlackRoad: database "${databaseName}" is blocked.`
            );
        };
    });
}