/* =========================================================
   LIVE SYNC
   Keeps stock prices and mutual fund values fresh in the
   background, on every page, so the Dashboard, Net Worth,
   Notifications and Calculators follow the market without
   the Stocks / Mutual Funds page having to be open.

   It only does what those two pages already do:
     Stocks  - same LTP endpoint and the same stored "prices"
               (the Stocks page keeps polling by itself).
     Funds   - same mfapi.in sync as the StepUp page (new NAV
               days are added, then values are recalculated).
   After a change it fires "br:live-data" so open pages redraw
   in place. Guests are read-only: their live prices are only
   held in memory (see livePriceOverlay) and never saved.
   ========================================================= */

import { dataService } from "../data/data-service.js";
import { livePriceOverlay } from "../data/stores/stocks-store.js";
import { isGuestSync } from "./auth.js";
import { currentPath } from "../app/router.js";
import { getActiveHoldings } from "../features/stocks/stocks-service.js";
import { fetchLTPs, LIVE_PRICE_POLL_MS } from "../features/stocks/stocks-live.js";
import { recalcAll, normalizeSettings } from "../features/stepup/stepup-service.js";
import { fetchSchemeFromMfapi, buildSyncDelta, ddmmyyyyToIso } from "../features/stepup/stepup-fund.js";

export const LIVE_EVENT = "br:live-data";

const MF_POLL_MS = 5 * 60 * 1000;
const MFAPI_BASE = "https://api.mfapi.in/mf";

/* Latest price per symbol seen by this updater: { SYM: { ltp, at } }. */
const lastSeen = {};

let started = false;
let stocksBusy = false;
let mfBusy = false;

/* Fresh live price (not older than maxAgeMs), or null. */
export function getLivePrice(symbol, maxAgeMs = 15000) {
    const hit = lastSeen[symbol];

    return hit && Date.now() - hit.at <= maxAgeMs ? hit.ltp : null;
}

function emit(detail) {
    window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail }));
}

const canRun = () => !document.hidden && navigator.onLine !== false;

/* ---------------- stocks ---------------- */

async function tickStocks() {
    // The Stocks page runs its own poll and writes its own state.
    if (stocksBusy || !canRun() || currentPath() === "/stocks") return;

    stocksBusy = true;

    try {
        const store = await dataService.getStocksStore();
        const transactions = (await store.getState("transactions")) || [];
        const stored = (await store.getState("prices")) || {};

        const symbols = getActiveHoldings(transactions, stored).map((h) => h.symbol);

        if (!symbols.length) return;

        const { updates } = await fetchLTPs(symbols);
        const now = Date.now();

        Object.entries(updates).forEach(([sym, ltp]) => {
            lastSeen[sym] = { ltp, at: now };
        });

        const changed = Object.keys(updates).filter((k) => stored[k] !== updates[k]);

        if (!changed.length) return;

        if (isGuestSync()) {
            Object.assign(livePriceOverlay, updates);
        } else {
            // Re-read just before writing so nothing saved meanwhile is lost.
            const latest = (await store.getState("prices")) || {};
            await store.savePrices({ ...latest, ...updates });
        }

        emit({ stocks: true });
    } catch (error) {
        console.warn("BlackRoad live sync (stocks):", error);
    } finally {
        stocksBusy = false;
    }
}

/* ---------------- mutual funds ---------------- */

/* Cheap check: has the fund published a NAV newer than our last entry? */
async function hasNewNav(schemeCode, lastDate) {
    try {
        const res = await fetch(`${MFAPI_BASE}/${schemeCode}/latest`);

        if (!res.ok) return true;

        const json = await res.json();
        const date = json && json.data && json.data[0] && json.data[0].date;

        return date ? ddmmyyyyToIso(date) > lastDate : true;
    } catch {
        return true;
    }
}

async function tickFunds() {
    // The Mutual Funds page syncs (and keeps state) by itself.
    if (mfBusy || !canRun() || isGuestSync() || currentPath() === "/mutualfund") return;

    mfBusy = true;

    try {
        const store = await dataService.getStepUpStore();
        const profiles = await store.getProfiles();
        let changed = false;

        for (const profile of profiles) {
            if (profile.status === "closed") continue;

            const settings = await store.getProfileSettings(profile.id);
            const link = settings && settings.linkedFund;

            // Not migrated yet: leave it to the Mutual Funds page.
            if (!link || !link.schemeCode || !settings.sipAllocationsMigrated) continue;

            const entries = await store.getProfileEntries(profile.id);

            if (!entries.length) continue;

            if (!(await hasNewNav(link.schemeCode, entries[entries.length - 1].date))) continue;

            const fresh = await fetchSchemeFromMfapi(link.schemeCode);
            const delta = buildSyncDelta(entries, fresh.navHistory);

            if (!delta || !delta.length) continue;

            for (const e of delta) {
                await store.saveEntry(profile.id, {
                    date: e.date,
                    percentChange: e.percentChange,
                    nav: e.nav,
                    portfolioValue: 0,
                    investedAmount: 0
                });
            }

            normalizeSettings(settings);

            const all = await store.getProfileEntries(profile.id);

            await store.saveCalculatedEntries(recalcAll(all, settings), profile.id);

            settings.linkedFund.schemeName = fresh.schemeName || link.schemeName;
            settings.linkedFund.fundHouse = fresh.fundHouse || link.fundHouse;
            settings.linkedFund.lastSync = all[all.length - 1].date;

            await store.saveSettings(profile.id, settings);

            changed = true;
        }

        if (changed) emit({ mf: true });
    } catch (error) {
        console.warn("BlackRoad live sync (funds):", error);
    } finally {
        mfBusy = false;
    }
}

/* ---------------- start ---------------- */

export function startLiveSync() {
    if (started) return;
    started = true;

    setInterval(tickStocks, LIVE_PRICE_POLL_MS);
    setInterval(tickFunds, MF_POLL_MS);

    // Catch up right away when the tab or the network comes back.
    const catchUp = () => {
        tickStocks();
        tickFunds();
    };

    document.addEventListener("visibilitychange", () => { if (!document.hidden) catchUp(); });
    window.addEventListener("online", catchUp);

    setTimeout(catchUp, 1500);
}
