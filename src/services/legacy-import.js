/* =========================================================
   LEGACY BACKUP FORMATS  (Phase 14)
   The old app gave each module its own export file. The global
   Restore still accepts them, so nothing already backed up is
   stranded. Each legacy file is converted into the same shape
   the full-backup path uses.

   Same behaviour as the old importers:
     Stocks / Lending / Fixed Deposits  -> REPLACE module data
     Income entries                     -> ADD to the ledger
     StepUp (one SIP or all SIPs)       -> ADD as new SIPs
   ========================================================= */

import { dataService } from "../data/data-service.js";
import { DATABASES } from "../data/db-registry.js";

import { recalcEntry, uid, todayISO } from "../features/income/income-service.js";
import { normalizeSettings } from "../features/stepup/stepup-service.js";

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

function entryFor(module, extra) {
    return { module, label: DATABASES[module].label, ...extra };
}

/*
 * Returns { format, modules: [...] } or null if the payload is not a
 * recognised legacy file. Writes nothing.
 */
export function detectLegacy(payload) {
    /* ---- Income: { entries: [...] }  or a plain array (oldest) ---- */
    const incomeList = Array.isArray(payload)
        ? payload
        : isObject(payload) &&
          Array.isArray(payload.entries) &&
          !Array.isArray(payload.parties) &&
          !Array.isArray(payload.loans) &&
          typeof payload.profileName !== "string"
        ? payload.entries
        : null;

    if (incomeList) {
        return {
            format: "Income & Expenses export",
            modules: [
                entryFor("income", {
                    mode: "add",
                    records: incomeList.length,
                    stores: null,
                    apply: () => applyIncome(incomeList)
                })
            ]
        };
    }

    if (!isObject(payload)) return null;

    /* ---- Stocks: { transactions, prices, seqCounter } ---- */
    if (Array.isArray(payload.transactions) && isObject(payload.prices)) {
        const seq =
            typeof payload.seqCounter === "number"
                ? payload.seqCounter
                : payload.transactions.reduce(
                      (m, t) => Math.max(m, t.seq || 0),
                      0
                  );

        return {
            format: "Stocks backup",
            modules: [
                entryFor("stocks", {
                    mode: "replace",
                    records: payload.transactions.length,
                    stores: {
                        state: [
                            { key: "transactions", value: payload.transactions },
                            { key: "prices", value: payload.prices },
                            { key: "seqCounter", value: seq }
                        ]
                    }
                })
            ]
        };
    }

    /* ---- Lending: { parties, entries, loans } ---- */
    if (Array.isArray(payload.parties) || Array.isArray(payload.loans)) {
        const stores = {
            parties: payload.parties || [],
            entries: payload.entries || [],
            loans: payload.loans || []
        };

        return {
            format: "Lending backup",
            modules: [
                entryFor("lending", {
                    mode: "replace",
                    records:
                        stores.parties.length +
                        stores.entries.length +
                        stores.loans.length,
                    stores
                })
            ]
        };
    }

    /* ---- Fixed Deposits: { deposits } ---- */
    if (Array.isArray(payload.deposits)) {
        return {
            format: "Fixed Deposits backup",
            modules: [
                entryFor("deposits", {
                    mode: "replace",
                    records: payload.deposits.length,
                    stores: { deposits: payload.deposits }
                })
            ]
        };
    }

    /* ---- StepUp: all SIPs { profiles: [...] } ---- */
    if (Array.isArray(payload.profiles) && payload.profiles.length) {
        return stepupResult("StepUp — all SIPs export", payload.profiles);
    }

    /* ---- StepUp: one SIP { profileName, settings, entries } ---- */
    if (
        typeof payload.profileName === "string" &&
        (payload.settings || Array.isArray(payload.entries))
    ) {
        return stepupResult("StepUp — single SIP export", [
            {
                profileName: payload.profileName,
                settings: payload.settings || null,
                entries: payload.entries || []
            }
        ]);
    }

    return null;
}

function stepupResult(format, profiles) {
    return {
        format,
        modules: [
            entryFor("stepup", {
                mode: "add",
                records: profiles.reduce(
                    (n, p) => n + (Array.isArray(p.entries) ? p.entries.length : 0),
                    0
                ),
                stores: null,
                apply: () => applyStepUp(profiles)
            })
        ]
    };
}

/* ---------------- appliers ("add" mode) ---------------- */

async function applyIncome(list) {
    const store = await dataService.getIncomeStore();

    // Same normalisation as the old income importer.
    const entries = list.map((raw) =>
        recalcEntry({
            income: Number(raw.income) || 0,
            date: raw.date || todayISO(),
            from: raw.from || "Imported",
            category: raw.category || "",
            transactions: (raw.transactions || []).map((t) => ({
                id: uid(),
                amount: Number(t.amount) || 0,
                date: t.date || raw.date || todayISO(),
                description: t.description || "",
                category: t.category || "",
                type: t.type || "expense"
            }))
        })
    );

    // Skip records that are already stored, so importing the same file
    // twice does not create duplicates.
    const sig = (e) => JSON.stringify([
        Number(e.income) || 0,
        e.date || "",
        e.from || "",
        e.category || "",
        (e.transactions || []).map((t) => [
            Number(t.amount) || 0, t.date || "", t.description || "", t.category || "", t.type || ""
        ])
    ]);

    const seen = new Set((await store.getEntries()).map(sig));
    let added = 0;

    for (const entry of entries) {
        const key = sig(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        await store.saveEntry(entry);
        added += 1;
    }

    return added;
}

async function applyStepUp(profiles) {
    const store = await dataService.getStepUpStore();
    let written = 0;

    for (const item of profiles) {
        const name =
            (item.profileName || "Imported SIP").trim() || "Imported SIP";

        const existing = (await store.getProfiles()).find(
            (p) => (p.name || "").trim().toLowerCase() === name.toLowerCase()
        );

        const pid = existing ? existing.id : await store.saveProfile({ name });

        // Only a brand-new SIP takes the file's settings; an existing one keeps its own.
        if (item.settings && !existing) {
            await store.saveSettings(
                pid,
                normalizeSettings({ ...item.settings, id: pid })
            );
        }

        if (Array.isArray(item.entries)) {
            const dates = new Set(
                existing ? (await store.getProfileEntries(pid)).map((e) => e.date) : []
            );

            for (const en of item.entries) {
                const { id, profileId, ...rest } = en;
                if (rest.date && dates.has(rest.date)) continue;
                dates.add(rest.date);
                await store.saveEntry(pid, rest);
                written += 1;
            }
        }
    }

    return written;
}
