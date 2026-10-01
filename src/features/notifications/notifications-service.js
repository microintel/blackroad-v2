/* =========================================================
   NOTIFICATIONS — DATA
   Read-only. Uses the existing stores and services, so the
   numbers match the Stocks, Mutual Fund, Lending and Deposits pages.
   Live endpoints are the same ones the old page used
   (indian-stock-ltp for LTP, mfapi.in for NAV).
   ========================================================= */

import { dataService } from "../../data/data-service.js";

import { getActiveHoldings } from "../stocks/stocks-service.js";
import { fetchLTP } from "../stocks/stocks-live.js";
import { computeMetrics, daysUntil } from "../deposits/deposits-service.js";
import { outstanding, nextDue } from "../lending/lending-service.js";

export { formatINR } from "../dashboard/dashboard-service.js";

const MFAPI_BASE = "https://api.mfapi.in/mf";

export function formatPct(n) {
    const num = Number(n) || 0;
    return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
}

/* ---------------- Stocks (live LTP) ---------------- */

export async function loadStocks() {
    const store = await dataService.getStocksStore();

    const transactions = (await store.getState("transactions")) || [];
    const prices = (await store.getState("prices")) || {};

    const holdings = getActiveHoldings(transactions, prices);

    const rows = await Promise.all(
        holdings.map(async (h) => {
            let ltp = h.currentPrice;
            let live = false;

            try {
                const value = await fetchLTP(h.symbol);

                if (value !== null && value !== undefined) {
                    ltp = value;
                    live = true;
                }
            } catch { /* keep cached price */ }

            const currentValue = ltp * h.quantity;
            const pnl = currentValue - h.investedValue;

            return {
                symbol: h.symbol,
                name: h.name || h.symbol,
                quantity: h.quantity,
                avgPrice: h.avgPrice,
                ltp,
                live,
                currentValue,
                pnl,
                pnlPct: h.investedValue ? (pnl / h.investedValue) * 100 : 0
            };
        })
    );

    rows.sort((a, b) => b.currentValue - a.currentValue);

    return {
        rows,
        totalPnl: rows.reduce((s, r) => s + r.pnl, 0),
        liveCount: rows.filter((r) => r.live).length
    };
}

/* ---------------- Mutual funds (live NAV) ---------------- */

function mfapiDateToIso(d) {
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchNavHistory(schemeCode) {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`);

    if (!res.ok) throw new Error(`mfapi request failed (${res.status})`);

    const json = await res.json();

    return (Array.isArray(json.data) ? json.data.slice() : []).sort((a, b) =>
        mfapiDateToIso(a.date).localeCompare(mfapiDateToIso(b.date))
    );
}

export async function loadMutualFunds() {
    const store = await dataService.getStepUpStore();

    const [profiles, entries, settings] = await Promise.all([
        store.getProfiles(),
        store.getEntries(),
        store.getSettings()
    ]);

    const sips = [];

    for (const profile of profiles) {
        const own = entries
            .filter((e) => e.profileId === profile.id)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (!own.length) continue;

        const latest = own[own.length - 1];
        const s = settings.find((x) => x.id === profile.id) || null;

        sips.push({
            id: profile.id,
            name: s?.linkedFund?.schemeName || profile.name || "SIP",
            schemeCode: s?.linkedFund?.schemeCode || null,
            invested: latest.investedAmount || 0,
            currentValue: latest.portfolioValue || 0
        });
    }

    const rows = await Promise.all(
        sips.map(async (sip) => {
            let latestNav = null;
            let dayChangePct = 0;
            let dayPnl = 0;
            let live = false;

            if (sip.schemeCode) {
                try {
                    const nav = await fetchNavHistory(sip.schemeCode);

                    if (nav.length >= 2) {
                        latestNav = parseFloat(nav[nav.length - 1].nav);
                        const prev = parseFloat(nav[nav.length - 2].nav);

                        if (prev) {
                            dayChangePct = ((latestNav - prev) / prev) * 100;
                            dayPnl = sip.currentValue * (dayChangePct / 100);
                            live = true;
                        }
                    } else if (nav.length === 1) {
                        latestNav = parseFloat(nav[0].nav);
                    }
                } catch { /* show static figures */ }
            }

            return { ...sip, latestNav, dayChangePct, dayPnl, live };
        })
    );

    rows.sort((a, b) => b.currentValue - a.currentValue);

    return {
        rows,
        totalDayPnl: rows.reduce((s, r) => s + (r.dayPnl || 0), 0),
        liveCount: rows.filter((r) => r.live).length
    };
}

/* ---------------- Dues & reminders ---------------- */

export async function loadDues() {
    const items = [];

    try {
        const lending = await dataService.getLendingStore();

        const [loans, entries, people] = await Promise.all([
            lending.getLoans(),
            lending.getEntries(),
            lending.getPeople()
        ]);

        const names = {};
        people.forEach((p) => (names[p.id] = p.name || "Contact"));

        loans.forEach((loan) => {
            if (outstanding(loan) <= 0) return;

            const due = nextDue(loan);
            if (!due) return;

            items.push({
                title: `${loan.lender || "Loan"} — EMI due`,
                amount: Number(loan.emiAmount) || 0,
                date: due,
                path: "/lending"
            });
        });

        entries.forEach((entry) => {
            if (!entry.dueDate) return;

            const label = entry.type === "gave" ? "expected back from" : "you owe";

            items.push({
                title: `${label} ${names[entry.partyId] || "contact"}`,
                amount: Number(entry.amount) || 0,
                date: entry.dueDate,
                path: "/lending"
            });
        });
    } catch (error) {
        console.error("Notifications: lending dues failed", error);
    }

    try {
        const deposits = await dataService.getDepositStore();

        (await deposits.getDeposits()).forEach((row) => {
            if (row.status === "closed") return;

            const m = computeMetrics(row);
            if (!m.maturityDate) return;

            items.push({
                title: `${row.bankName || "Fixed Deposit"} — matures`,
                amount: m.maturityAmount,
                date: m.maturityDate,
                path: "/deposits"
            });
        });
    } catch (error) {
        console.error("Notifications: deposit dues failed", error);
    }

    return items
        .map((item) => {
            const days = daysUntil(item.date);

            return {
                ...item,
                days,
                status: days < 0 ? "overdue" : days <= 7 ? "due-soon" : "upcoming"
            };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}
