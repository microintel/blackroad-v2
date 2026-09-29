import { BaseStore } from "./base-store.js";

/*
 * sip-compounder -> "settings" (keyPath id), "entries", "profiles"
 *
 * Multi-SIP: each SIP is a profile { id, name }.
 *   settings record id === profileId:
 *     { id, startDate, sipAmount, sipSchedule[], skippedSipDates[],
 *       sipAllocations{}, sipAllocationsMigrated, goalAmount?, goalDate?,
 *       linked fund fields (Phase 10 part 2) ... }
 *   entries carry profileId:
 *     { id, profileId, date, percentChange, nav, portfolioValue, investedAmount }
 *
 * Record shapes are unchanged from the old app.
 */
export class StepUpStore {
    constructor(database) {
        this.settings = new BaseStore(database, "settings");
        this.entries = new BaseStore(database, "entries");
        this.profiles = new BaseStore(database, "profiles");
    }

    /* ---------- reads (used by the Dashboard too) ---------- */

    async getSettings() {
        return this.settings.getAll();
    }

    async getEntries() {
        return this.entries.getAll();
    }

    async getProfiles() {
        const list = await this.profiles.getAll();
        return list.sort((a, b) => a.id - b.id);
    }

    getProfileSettings(profileId) {
        return this.settings.get(profileId);
    }

    async getProfileEntries(profileId) {
        const all = await this.entries.getAll();

        return all
            .filter((e) => e.profileId === profileId)
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /* ---------- profiles ---------- */

    saveProfile(profile) {
        return this.profiles.put(profile);
    }

    /* Removes the profile, its settings and all its entries. */
    async deleteProfile(profileId) {
        this.profiles.assertCanWrite();

        await this.clearEntries(profileId);
        await this.deleteSettings(profileId);
        await this.profiles.delete(profileId);
    }

    /* ---------- settings ---------- */

    saveSettings(profileId, data) {
        return this.settings.put({ ...data, id: profileId });
    }

    async deleteSettings(profileId) {
        try {
            await this.settings.delete(profileId);
        } catch (_) {
            /* nothing to delete */
        }
    }

    /* ---------- entries ---------- */

    saveEntry(profileId, entry) {
        return this.entries.put({ ...entry, profileId });
    }

    deleteEntry(id) {
        return this.entries.delete(id);
    }

    async clearEntries(profileId) {
        this.entries.assertCanWrite();

        const mine = await this.getProfileEntries(profileId);

        for (const e of mine) {
            await this.entries.delete(e.id);
        }
    }

    /*
     * Persist recalculated values back onto existing entries
     * (same fields the old saveCalcEntries wrote).
     */
    async saveCalculatedEntries(calc, profileId) {
        for (const e of calc) {
            await this.saveEntry(profileId, {
                id: e.id,
                date: e.date,
                percentChange: e.percentChange,
                nav: e.nav != null ? e.nav : null,
                portfolioValue: e.portfolioValue,
                investedAmount: e.investedAmount
            });
        }
    }
}
