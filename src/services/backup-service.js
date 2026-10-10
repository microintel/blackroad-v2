/* =========================================================
   GLOBAL BACKUP SERVICE  (Phase 13)
   ONE export / ONE restore for every module.

   File format is the OLD dashboard format, so old and new
   backups are interchangeable:
     {
       exportedAt, app: "BlackRoad", exportedBy,
       databases: {
         "<BaseName>::<scope>": { version, stores: {
             storeName: [ records ]                    (keyPath stores)
             storeName: [ { key, value } ]             (keyless stores)
         } }
       }
     }

   Uses the data layer's already-open connections (dataService),
   so no version bumps or "blocked" upgrades can happen.
   On restore the scope part of the database name is ignored and
   data is written into the CURRENT user's databases.
   ========================================================= */

import { dataService } from "../data/data-service.js";
import { DATABASES } from "../data/db-registry.js";
import { getDatabaseName } from "../data/database.js";
import { detectLegacy } from "./legacy-import.js";
import { AVATAR_META_KEY } from "./avatar-service.js";

const MODULES = Object.keys(DATABASES);
const LAST_BACKUP_KEY = "br_lastBackup";

function moduleForBaseName(baseName) {
    return MODULES.find((m) => DATABASES[m].baseName === baseName) || null;
}

function storeIsKeyless(store) {
    return store.keyPath === null && !store.autoIncrement;
}

function idbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/*
 * The profile avatar link lives in the income "meta" store, so it is
 * exported and restored with the backup. A backup that has no avatar
 * (older files) must not wipe the current one: carry it over.
 * Returns the stores to write (the original object when nothing changes).
 */
async function storesKeepingAvatar(db, entry) {
    const stores = entry.stores;

    if (entry.module !== "income" || !Array.isArray(stores.meta)) return stores;
    if (stores.meta.some((r) => r && r.key === AVATAR_META_KEY)) return stores;
    if (!db.objectStoreNames.contains("meta")) return stores;

    try {
        const current = await idbRequest(
            db.transaction("meta", "readonly")
                .objectStore("meta")
                .get(AVATAR_META_KEY)
        );

        if (current && current.value) {
            return { ...stores, meta: [...stores.meta, current] };
        }
    } catch { /* nothing to keep */ }

    return stores;
}

/* ---------------- overview (record counts) ---------------- */

export async function getOverview() {
    const rows = [];

    for (const module of MODULES) {
        const config = DATABASES[module];

        try {
            const db = await dataService.getDatabase(module);
            const stores = [];

            for (const storeName of Object.values(config.stores)) {
                if (!db.objectStoreNames.contains(storeName)) continue;

                const count = await idbRequest(
                    db.transaction(storeName, "readonly")
                        .objectStore(storeName)
                        .count()
                );

                stores.push({ name: storeName, count });
            }

            rows.push({
                module,
                label: config.label,
                database: getDatabaseName(module),
                stores,
                records: stores.reduce((s, x) => s + x.count, 0)
            });
        } catch (error) {
            rows.push({
                module,
                label: config.label,
                database: getDatabaseName(module),
                stores: [],
                records: 0,
                error: error.message
            });
        }
    }

    return rows;
}

/* ---------------- export ---------------- */

export async function exportAll(onProgress) {
    const databases = {};
    let step = 0;

    const total = MODULES.reduce(
        (n, m) => n + Object.keys(DATABASES[m].stores).length,
        0
    );

    for (const module of MODULES) {
        const config = DATABASES[module];
        const db = await dataService.getDatabase(module);
        const stores = {};

        for (const storeName of Object.values(config.stores)) {
            step += 1;

            if (onProgress) {
                await onProgress(step, total, `${config.label} / ${storeName}`);
            }

            if (!db.objectStoreNames.contains(storeName)) {
                stores[storeName] = [];
                continue;
            }

            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);

            if (storeIsKeyless(store)) {
                const [keys, values] = await Promise.all([
                    idbRequest(store.getAllKeys()),
                    idbRequest(store.getAll())
                ]);

                stores[storeName] = keys.map((key, i) => ({
                    key,
                    value: values[i]
                }));
            } else {
                stores[storeName] = await idbRequest(store.getAll());
            }
        }

        databases[getDatabaseName(module)] = {
            version: db.version,
            stores
        };
    }

    let exportedBy = null;

    try {
        const user = window.BRAuth
            ? await window.BRAuth.currentUser()
            : null;

        exportedBy = user ? { name: user.name, email: user.email } : null;
    } catch { /* guest / signed out */ }

    return {
        exportedAt: new Date().toISOString(),
        app: "BlackRoad",
        exportedBy,
        databases
    };
}

export function downloadBackup(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `blackroad-backup-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    setLastBackup(new Date().toISOString());
}

export function getLastBackup() {
    try {
        return localStorage.getItem(LAST_BACKUP_KEY);
    } catch {
        return null;
    }
}

function setLastBackup(iso) {
    try {
        localStorage.setItem(LAST_BACKUP_KEY, iso);
    } catch { /* ignore */ }
}

/* ---------------- read + validate (writes nothing) ---------------- */

/*
 * Returns { payload, modules: [{ module, label, records, stores }],
 *           skipped: [names], exportedBy, exportedAt }
 * Throws a readable Error if the file is not a BlackRoad backup.
 */
export async function readBackupFile(file) {
    let payload;

    try {
        payload = JSON.parse(await file.text());
    } catch {
        throw new Error("That file is not valid JSON.");
    }

    if (payload === null || typeof payload !== "object") {
        throw new Error("That file is not a BlackRoad backup.");
    }

    const isFull =
        !Array.isArray(payload) &&
        payload.databases &&
        typeof payload.databases === "object";

    // Older single-module exports (Income, Stocks, Lending, FD, StepUp).
    if (!isFull) {
        const legacy = detectLegacy(payload);

        if (!legacy) {
            throw new Error(
                "This file isn't a BlackRoad backup or a recognised older export."
            );
        }

        return {
            payload,
            format: legacy.format,
            legacy: true,
            modules: legacy.modules,
            skipped: [],
            exportedBy: (!Array.isArray(payload) && payload.exportedBy) || null,
            exportedAt: (!Array.isArray(payload) && payload.exportedAt) || null
        };
    }

    const found = {};
    const skipped = [];

    for (const [name, data] of Object.entries(payload.databases)) {
        const module = moduleForBaseName(name.split("::")[0]);

        if (!module) {
            skipped.push(name);
            continue;
        }

        if (!data || typeof data.stores !== "object") {
            throw new Error("Part of this backup file is damaged.");
        }

        const known = Object.values(DATABASES[module].stores);
        const stores = {};

        for (const [storeName, records] of Object.entries(data.stores)) {
            if (!known.includes(storeName)) {
                skipped.push(`${name}.${storeName}`);
                continue;
            }

            if (!Array.isArray(records)) {
                throw new Error("Part of this backup file is damaged.");
            }

            stores[storeName] = records;
        }

        found[module] = stores;
    }

    const modules = Object.keys(found).map((module) => ({
        module,
        label: DATABASES[module].label,
        mode: "replace",
        stores: found[module],
        records: Object.values(found[module]).reduce(
            (s, list) => s + list.length,
            0
        )
    }));

    if (!modules.length) {
        throw new Error("No BlackRoad data was found in this file.");
    }

    // "Data last updated" lives in the income meta store, so it is
    // exported and restored with the rest; read it only for the preview.
    const metaRec = (found.income?.meta || []).find(
        (r) => r && r.key === "updateDate"
    );

    return {
        payload,
        format: "Full BlackRoad backup",
        legacy: false,
        dataUpdated: metaRec ? metaRec.value : "",
        modules,
        skipped,
        exportedBy: payload.exportedBy || null,
        exportedAt: payload.exportedAt || null
    };
}

/* ---------------- restore ---------------- */

/*
 * Replaces the contents of every store present in the backup.
 * One transaction per database, so a database is either fully
 * restored or left exactly as it was.
 * Returns { restored, skipped }.
 */
export async function restoreBackup(parsed, onProgress) {
    if (window.BRAuth && typeof window.BRAuth.assertCanWrite === "function") {
        window.BRAuth.assertCanWrite();
    }

    const result = { restored: 0, skipped: [...parsed.skipped] };
    const total = parsed.modules.length;
    let step = 0;

    for (const entry of parsed.modules) {
        step += 1;

        if (onProgress) {
            await onProgress(step, total, `Restoring ${entry.label}…`);
        }

        // "Add" mode (legacy Income / StepUp files): append through the module store.
        if (typeof entry.apply === "function") {
            result.restored += await entry.apply();
            continue;
        }

        const db = await dataService.getDatabase(entry.module);

        const names = Object.keys(entry.stores).filter((name) => {
            const ok = db.objectStoreNames.contains(name);
            if (!ok) result.skipped.push(`${entry.label}.${name}`);
            return ok;
        });

        if (!names.length) continue;

        const toWrite = await storesKeepingAvatar(db, entry);

        await new Promise((resolve, reject) => {
            const tx = db.transaction(names, "readwrite");

            try {
                names.forEach((name) => {
                    const store = tx.objectStore(name);
                    const keyless = storeIsKeyless(store);

                    store.clear();

                    toWrite[name].forEach((record) => {
                        if (keyless) store.put(record.value, record.key);
                        else store.put(record);
                    });
                });
            } catch (error) {
                tx.abort();
                reject(error);
                return;
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () =>
                reject(tx.error || new Error("Restore was cancelled."));
        });

        result.restored += names.reduce(
            (s, name) => s + entry.stores[name].length,
            0
        );
    }

    return result;
}
