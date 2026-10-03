/* =========================================================
   GUEST SAMPLE DATA
   Guests are read-only, so they would otherwise see an empty app.
   When a guest session starts, this loads /sample.json (a normal
   BlackRoad backup file) into the GUEST databases so every module
   shows demo data straight away.

   - Runs only for the "guest" scope; real accounts are never touched.
   - Writes straight to IndexedDB: guests cannot write through the
     normal stores (BRAuth.assertCanWrite), and must not be able to.
   - Seeds once per sample.json version (its exportedAt stamp) and
     re-seeds automatically if the file changes or the data is gone.
   ========================================================= */

import { dataService } from "../data/data-service.js";
import { DATABASES } from "../data/db-registry.js";
import { isGuestSync } from "./auth.js";

const SAMPLE_URL = new URL("../../sample.json", import.meta.url).href;
const SEEDED_KEY = "br_guest_seeded";

const MODULES = Object.keys(DATABASES);

let running = null;

const moduleForBaseName = (baseName) =>
    MODULES.find((m) => DATABASES[m].baseName === baseName) || null;

const isKeyless = (store) => store.keyPath === null && !store.autoIncrement;

function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

async function fetchSample() {
    const res = await fetch(SAMPLE_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`sample.json: HTTP ${res.status}`);

    const payload = await res.json();

    if (!payload || typeof payload.databases !== "object") {
        throw new Error("sample.json is not a BlackRoad backup.");
    }

    return payload;
}

async function hasData() {
    try {
        const db = await dataService.getDatabase("income");
        if (!db.objectStoreNames.contains("entries")) return false;

        return await new Promise((resolve) => {
            const req = db
                .transaction("entries", "readonly")
                .objectStore("entries")
                .count();
            req.onsuccess = () => resolve((req.result || 0) > 0);
            req.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

async function writeModule(module, stores) {
    const db = await dataService.getDatabase(module);

    const names = Object.keys(stores).filter(
        (name) =>
            Object.values(DATABASES[module].stores).includes(name) &&
            db.objectStoreNames.contains(name)
    );

    if (!names.length) return 0;

    await new Promise((resolve, reject) => {
        const tx = db.transaction(names, "readwrite");

        names.forEach((name) => {
            const store = tx.objectStore(name);
            const keyless = isKeyless(store);

            store.clear();

            stores[name].forEach((record) => {
                if (keyless) store.put(record.value, record.key);
                else store.put(record);
            });
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Seeding was cancelled."));
    });

    return names.reduce((n, name) => n + stores[name].length, 0);
}

async function seed() {
    if (!isGuestSync()) return false;

    const payload = await fetchSample();
    const version = String(payload.exportedAt || "1");

    if (lsGet(SEEDED_KEY) === version && (await hasData())) return false;

    for (const [name, data] of Object.entries(payload.databases)) {
        const module = moduleForBaseName(name.split("::")[0]);

        if (!module || !data || typeof data.stores !== "object") continue;

        await writeModule(module, data.stores);
    }

    lsSet(SEEDED_KEY, version);
    return true;
}

/*
 * Call before the first page renders. Safe to call repeatedly (it runs
 * once per page load) and never throws: if sample.json is missing the
 * guest simply sees empty modules, as before.
 */
export function seedGuestData() {
    if (!isGuestSync()) return Promise.resolve(false);

    if (!running) {
        running = seed().catch((error) => {
            console.warn("BlackRoad: guest sample data not loaded:", error);
            return false;
        });
    }

    return running;
}
