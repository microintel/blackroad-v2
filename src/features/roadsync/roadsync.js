/* =========================================================
   ROADSYNC  (own page under Overview)
   Tabs, same pattern as Income / Stocks / MF:
     Statement Reader  - the Statement Reader, running natively here
     Stocks History    - placeholder tab (content comes later)
     MF History        - placeholder tab (content comes later)
   The reader gets BlackRoad's existing income entries so expenses
   and investments can be added to them, and can save its result
   straight into BlackRoad's income data.
   ========================================================= */

import { dataService } from "../../data/data-service.js";
import { recalcEntry, uid, todayISO } from "../income/income-service.js";
import { emptyState } from "../../components/states.js";
import { mountStatementReader } from "./statement-reader.js";

const TABS = [
    ["reader", "Statement Reader"],
    ["stocks", "Stocks History"],
    ["mf", "MF History"]
];

const sigOf = (e) => JSON.stringify([
    Number(e.income) || 0,
    e.date || "",
    e.from || "",
    e.category || "",
    (e.transactions || []).map((t) => [
        Number(t.amount) || 0, t.date || "", t.description || "", t.category || "", t.type || ""
    ])
]);

const txSig = (t) => JSON.stringify([
    Number(t.amount) || 0, t.date || "", t.description || "", t.category || ""
]);

async function loadIncomes() {
    try {
        const store = await dataService.getIncomeStore();
        return (await store.getEntries()) || [];
    } catch (err) {
        console.error("RoadSync: could not read income entries", err);
        return [];
    }
}

/* Bridge the reader uses: read existing incomes, save its result. */
function createHost() {
    const host = {
        incomes: [],
        reader: null,

        async refresh() {
            host.incomes = await loadIncomes();
            try { host.reader?.refresh(); } catch (e) { /* reader not mounted yet */ }
        },

        async save({ entries = [], customExpenseCategories = [], existing = [] } = {}) {
            const store = await dataService.getIncomeStore();
            const stored = (await store.getEntries()) || [];
            const seen = new Set(stored.map(sigOf));
            const byId = new Map(stored.map((e) => [String(e.id), e]));
            let added = 0, updated = 0, skipped = 0;

            // 1. Transactions added to incomes that already exist in BlackRoad
            for (const item of existing) {
                const entry = byId.get(String(item.id));
                if (!entry) continue;

                const have = new Set((entry.transactions || []).map(txSig));
                const fresh = (item.add || []).filter((t) => !have.has(txSig(t)));
                skipped += (item.add || []).length - fresh.length;
                if (!fresh.length) continue;

                const next = {
                    ...entry,
                    transactions: [
                        ...(entry.transactions || []),
                        ...fresh.map((t) => ({
                            id: uid(),
                            amount: Number(t.amount) || 0,
                            date: t.date || entry.date || todayISO(),
                            description: t.description || "",
                            category: t.category || "",
                            type: t.type || "expense"
                        }))
                    ]
                };
                recalcEntry(next);
                await store.saveEntry(next);
                updated += 1;
            }

            // 2. New income entries (same de-duplication as Restore)
            for (const raw of entries) {
                const entry = recalcEntry({
                    id: uid(),
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
                });
                const key = sigOf(entry);
                if (seen.has(key)) { skipped += 1; continue; }
                seen.add(key);
                await store.saveEntry(entry);
                added += 1;
            }

            // 3. Custom expense categories the statements introduced
            if (customExpenseCategories.length) {
                try {
                    const saved = (await store.getCustomExpenseCategories()) || [];
                    const names = new Set(saved.map((c) => String(c.name).toLowerCase()));
                    const extra = customExpenseCategories.filter((c) => c?.name && !names.has(String(c.name).toLowerCase()));
                    if (extra.length) await store.setCustomExpenseCategories([...saved, ...extra]);
                } catch (e) { /* categories are optional */ }
            }

            await host.refresh();
            return { added, updated, skipped };
        }
    };
    return host;
}

function placeholder(title, text) {
    return `<section class="br-card rs-soon">${emptyState({ icon: "empty", title, text })}</section>`;
}

export async function RoadSync() {
    const page = document.createElement("section");
    page.className = "br-page br-income rs-page";

    page.innerHTML = `
        <div class="br-income-tabs" role="group" aria-label="RoadSync views">
            ${TABS.map(([key, label], i) => `
                <button type="button" class="br-income-tab${i === 0 ? " active" : ""}" data-rs-tab="${key}" aria-pressed="${i === 0}">${label}</button>`).join("")}
        </div>

        <div class="rs-view" data-rs-view="reader">
            <div class="rs-reader" data-rs-reader></div>
        </div>
        <div class="rs-view" data-rs-view="stocks" hidden>
            ${placeholder("Stocks History", "This tab is coming soon.")}
        </div>
        <div class="rs-view" data-rs-view="mf" hidden>
            ${placeholder("MF History", "This tab is coming soon.")}
        </div>
    `;

    page.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-rs-tab]");
        if (!btn) return;
        const tab = btn.dataset.rsTab;
        page.querySelectorAll("[data-rs-tab]").forEach((b) => {
            const on = b.dataset.rsTab === tab;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
        });
        page.querySelectorAll("[data-rs-view]").forEach((v) => {
            v.hidden = v.dataset.rsView !== tab;
        });
    });

    // The reader runs right here on the page (no iframe).
    const host = createHost();
    host.incomes = await loadIncomes();
    host.reader = await mountStatementReader(page.querySelector("[data-rs-reader]"), host);

    return page;
}
