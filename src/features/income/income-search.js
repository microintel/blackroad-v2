import { icon } from "../../components/icons.js";
/*
 * Income → Search (old search.js)
 * Flat, transaction-level search: every income row and every
 * expense/investment row is an independent result.
 * Text (word-prefix) + source/category chips + type + date range
 * + sort + saved presets + summary + CSV export of the results.
 * (PDF export of results is deferred to the global export phase.)
 */
import {
    entryIncomeAmount,
    entryInvestmentSaleDisplayAmount,
    isInvestmentCategory
} from "./income-service.js";
import { esc, formatMoney } from "./income-shared.js";

const PRESETS_KEY = "br-search-presets"; // same key as the old app

const norm = (v) => String(v || "").toLowerCase().trim();
const tokenize = (v) => norm(v).split(/[^a-z0-9]+/).filter(Boolean);

const filters = {
    term: "", sources: new Set(), expenseCategories: new Set(), incomeCategories: new Set(),
    from: "", to: "", type: "all", sort: "newest"
};

function buildItems(entries) {
    const items = [];
    entries.forEach((e) => {
        const from = e.from || "";
        const inc = entryIncomeAmount(e);
        const sale = entryInvestmentSaleDisplayAmount(e);
        const base = { entryId: e.id, from, fromNorm: norm(from), tokens: [...tokenize(from), ...tokenize(e.category)] };

        if (inc > 0) {
            items.push({ ...base, kind: "income", desc: from || "Income", category: e.category || "", amount: inc, date: e.date || "" });
        }
        if (sale > 0) {
            items.push({ ...base, kind: "investment-sale", desc: from || "Investment sale", category: e.category || "", amount: sale, date: e.date || "" });
        }
        (e.transactions || []).forEach((t) => {
            const inv = isInvestmentCategory(t.category);
            items.push({
                entryId: e.id, from, fromNorm: norm(from),
                tokens: [...tokenize(t.description), ...tokenize(t.category)],
                kind: inv ? "investment" : "expense",
                desc: t.description || (inv ? "Investment" : "Expense"),
                category: t.category || "",
                amount: Number(t.amount) || 0,
                date: t.date || e.date || ""
            });
        });
    });
    return items;
}

function matches(it) {
    const words = tokenize(filters.term);
    if (words.some((w) => !it.tokens.some((tk) => tk.startsWith(w)))) return false;

    if (filters.type !== "all") {
        const ok = filters.type === "expense"
            ? it.kind === "expense" || it.kind === "investment"
            : it.kind === filters.type;
        if (!ok) return false;
    }
    if (filters.sources.size && ![...filters.sources].some((s) => it.fromNorm.includes(norm(s)))) return false;
    if (filters.expenseCategories.size || filters.incomeCategories.size) {
        const cat = norm(it.category);
        const isIncomeSide = it.kind === "income" || it.kind === "investment-sale";
        const set = isIncomeSide ? filters.incomeCategories : filters.expenseCategories;
        if (![...set].some((c) => norm(c) === cat)) return false;
    }

    if (filters.from || filters.to) {
        const t = new Date(it.date + "T00:00:00").getTime();
        if (isNaN(t)) return false;
        if (filters.from && t < new Date(filters.from + "T00:00:00").getTime()) return false;
        if (filters.to && t > new Date(filters.to + "T23:59:59").getTime()) return false;
    }
    return true;
}

function sortItems(list) {
    const d = (x) => new Date(x.date || 0);
    return list.slice().sort((a, b) => {
        switch (filters.sort) {
            case "oldest": return d(a) - d(b);
            case "amount_desc": return b.amount - a.amount;
            case "amount_asc": return a.amount - b.amount;
            default: return d(b) - d(a);
        }
    });
}

const hasFilters = () =>
    filters.term.trim() || filters.sources.size || filters.expenseCategories.size || filters.incomeCategories.size ||
    filters.from || filters.to || filters.type !== "all";

function loadPresets() {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || []; } catch { return []; }
}
function savePresets(list) {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function summary(items) {
    let income = 0, expense = 0, investment = 0, sale = 0;
    items.forEach((i) => {
        if (i.kind === "income") income += i.amount;
        else if (i.kind === "investment-sale") sale += i.amount;
        else if (i.kind === "investment") investment += i.amount;
        else expense += i.amount;
    });
    const stat = (l, v, tone = "") => `<div class="br-stat"><div class="br-stat-label">${l}</div><div class="br-stat-value ${tone}">${v}</div></div>`;
    const net = income + sale - expense - investment;
    return `<div class="br-grid br-grid-4">
        ${stat("Results", items.length)}
        ${stat("Income", formatMoney(income), "inc-c-income")}
        ${stat("Expense", formatMoney(expense), "inc-c-expense")}
        ${investment > 0 ? stat("Investment", formatMoney(investment), "inc-c-invested") : ""}
        ${sale > 0 ? stat("Investment sale", formatMoney(sale), "inc-c-sales") : ""}
        ${stat("Net", formatMoney(net), net < 0 ? "inc-c-expense" : "inc-c-balance")}
    </div>`;
}

function csv(items) {
    const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [["Date", "Type", "Description", "Category", "Amount"]];
    items.forEach((i) => rows.push([i.date, i.kind, i.desc, i.category, i.amount]));
    return rows.map((r) => r.map(q).join(",")).join("\n");
}

const PICKER_NOUN = { sources: "sources", expenseCategories: "expenses", incomeCategories: "income categories" };

function pickerLabel(key, selected) {
    if (!selected.size) return `All ${PICKER_NOUN[key]}`;
    if (selected.size === 1) return [...selected][0];
    return `${selected.size} selected`;
}

/* A button that opens a checklist: pick one or more, no sideways scrolling */
function picker(key, values, selected) {
    return `
        <div class="br-multi" data-multi="${key}">
            <button type="button" class="br-select br-multi-btn" data-multi-toggle="${key}" aria-expanded="false">
                <span data-multi-label>${esc(pickerLabel(key, selected))}</span>
                <span aria-hidden="true">▾</span>
            </button>
            <div class="br-multi-panel" data-multi-panel hidden>
                ${values.length ? values.map((v) => `
                    <label class="br-multi-opt">
                        <input type="checkbox" data-multi-opt="${key}" value="${esc(v)}" ${selected.has(v) ? "checked" : ""}>
                        <span>${esc(v)}</span>
                    </label>`).join("") : `<span class="br-muted" style="padding:8px 4px;">None yet</span>`}
                <div class="br-multi-foot">
                    <button type="button" class="br-button" data-multi-clear="${key}">Clear</button>
                    <button type="button" class="br-button br-button-primary" data-multi-close>Done</button>
                </div>
            </div>
        </div>`;
}

export function mountIncomeSearch(container, entries, { onOpenEntry } = {}) {
    const items = buildItems(entries);
    const sources = [...new Set(entries.map((e) => e.from).filter(Boolean))].sort();
    const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const expenseCats = uniq(items.filter((i) => i.kind === "expense" || i.kind === "investment").map((i) => i.category));
    const incomeCats = uniq(items.filter((i) => i.kind === "income" || i.kind === "investment-sale").map((i) => i.category));
    const optionLists = { sources, expenseCategories: expenseCats, incomeCategories: incomeCats };
    let current = [];

    container.innerHTML = `
        <div class="br-card">
            <div class="br-toolbar">
                <div class="br-search-box">
                    <span class="br-search-icon">${icon("search", { size: 16 })}</span>
                    <input type="search" data-s="term" placeholder="Search description, source or category..." value="${esc(filters.term)}">
                </div>
                <select class="br-select" data-s="sort">
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="amount_desc">Amount: high to low</option>
                    <option value="amount_asc">Amount: low to high</option>
                </select>
            </div>

            <div class="br-search-filters">
                <div class="br-field"><label>Type</label>
                    <div class="br-chip-row inc-wrap-row" data-s="types">
                        ${["all", "income", "expense"].map((t) => `<button type="button" class="br-chip ${filters.type === t ? "active" : ""}" data-s-type="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
                    </div></div>
                <div class="br-field"><label>Date range</label>
                    <div class="br-chip-row">
                        <input type="date" class="br-input" data-s="from" value="${esc(filters.from)}">
                        <input type="date" class="br-input" data-s="to" value="${esc(filters.to)}">
                    </div></div>
                <div class="br-field"><label>Income source</label>
                    ${picker("sources", sources, filters.sources)}</div>
                <div class="br-field"><label>Expenses</label>
                    ${picker("expenseCategories", expenseCats, filters.expenseCategories)}</div>
                <div class="br-field"><label>Income category</label>
                    ${picker("incomeCategories", incomeCats, filters.incomeCategories)}</div>
            </div>

            <div class="br-toolbar" style="margin-top:12px;">
                <input class="br-input" data-s="preset-name" placeholder="Preset name">
                <button type="button" class="br-button" data-s-action="save-preset">Save filters</button>
                <button type="button" class="br-button" data-s-action="clear">Clear</button>
                <button type="button" class="br-button" data-s-action="csv" hidden>Download CSV</button>
            </div>
            <div class="br-chip-row inc-wrap-row" data-s="presets" style="margin-top:8px;"></div>
        </div>

        <div data-s="summary" style="margin:16px 0;"></div>
        <div data-s="results"></div>`;

    const $ = (name) => container.querySelector(`[data-s="${name}"]`);
    $("sort").value = filters.sort;

    function renderPresets() {
        const list = loadPresets();
        $("presets").innerHTML = list.length
            ? list.map((p, i) => `<span class="br-chip">
                <span data-s-preset="${i}">${esc(p.name)}</span>
                <span data-s-preset-del="${i}" title="Delete"> ×</span></span>`).join("")
            : `<span class="br-muted">No saved filters yet.</span>`;
    }

    function renderResults() {
        const csvBtn = container.querySelector('[data-s-action="csv"]');
        if (!hasFilters()) {
            current = [];
            $("summary").innerHTML = "";
            csvBtn.hidden = true;
            $("results").innerHTML = `<div class="br-card"><div class="br-empty-state">
                <p class="br-muted">Type a search or choose a filter to see transactions.</p></div></div>`;
            return;
        }
        current = sortItems(items.filter(matches));
        csvBtn.hidden = current.length === 0;

        if (!current.length) {
            $("summary").innerHTML = "";
            $("results").innerHTML = `<div class="br-card"><div class="br-empty-state">
                <h3>No matches</h3><p class="br-muted">Try different terms or filters.</p></div></div>`;
            return;
        }

        $("summary").innerHTML = summary(current);
        $("results").innerHTML = `<div class="br-card"><div class="br-list">${current.map((it, idx) => {
            const out = it.kind === "expense" || it.kind === "investment";
            const tone = it.kind === "investment" ? "inc-c-invested"
                : it.kind === "investment-sale" ? "inc-c-sales"
                : out ? "inc-c-expense" : "inc-c-income";
            return `<div class="br-list-item br-result-row" data-s-open="${idx}" tabindex="0">
                <div>
                    <strong>${esc(it.desc)}</strong>
                    <div class="br-muted">${esc(it.category || (it.kind === "income" ? "Income" : it.kind === "investment-sale" ? "Investment sale" : it.kind === "investment" ? "Investment" : ""))}</div>
                </div>
                <div style="text-align:right">
                    <strong class="${tone}">${out ? "-" : "+"}${formatMoney(it.amount)}</strong>
                    <div class="br-muted">${esc(it.date)}</div>
                </div></div>`;
        }).join("")}</div></div>`;
    }

    function syncPickers() {
        Object.keys(optionLists).forEach((key) => {
            const selected = filters[key];
            const box = container.querySelector(`[data-multi="${key}"]`);
            if (!box) return;
            box.querySelectorAll("[data-multi-opt]").forEach((cb) => { cb.checked = selected.has(cb.value); });
            box.querySelector("[data-multi-label]").textContent = pickerLabel(key, selected);
        });
    }

    function closePickers(except) {
        container.querySelectorAll("[data-multi]").forEach((box) => {
            if (box === except) return;
            box.querySelector("[data-multi-panel]").hidden = true;
            box.querySelector("[data-multi-toggle]").setAttribute("aria-expanded", "false");
        });
    }

    function rerenderChips() {
        syncPickers();
        container.querySelectorAll("[data-s-type]").forEach((b) =>
            b.classList.toggle("active", b.dataset.sType === filters.type));
    }

    container.addEventListener("input", (e) => {
        const k = e.target.dataset.s;
        if (k === "term") filters.term = e.target.value;
        else if (k === "from") filters.from = e.target.value;
        else if (k === "to") filters.to = e.target.value;
        else return;
        renderResults();
    });

    container.addEventListener("change", (e) => {
        const opt = e.target.closest?.("[data-multi-opt]");
        if (opt) {
            const set = filters[opt.dataset.multiOpt];
            if (opt.checked) set.add(opt.value); else set.delete(opt.value);
            syncPickers();
            renderResults();
            return;
        }
        if (e.target.dataset.s === "sort") {
            filters.sort = e.target.value;
            renderResults();
        }
    });

    container.addEventListener("click", (e) => {
        const t = e.target;
        const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

        const pickBtn = t.closest("[data-multi-toggle]");
        if (pickBtn) {
            const box = pickBtn.closest("[data-multi]");
            const panel = box.querySelector("[data-multi-panel]");
            closePickers(box);
            panel.hidden = !panel.hidden;
            pickBtn.setAttribute("aria-expanded", String(!panel.hidden));
            return;
        }

        const pickClear = t.closest("[data-multi-clear]");
        if (pickClear) {
            filters[pickClear.dataset.multiClear].clear();
            syncPickers();
            return renderResults();
        }

        if (t.closest("[data-multi-close]")) { return closePickers(); }

        const type = t.closest("[data-s-type]");
        if (type) { filters.type = type.dataset.sType; rerenderChips(); return renderResults(); }

        const del = t.closest("[data-s-preset-del]");
        if (del) {
            const list = loadPresets();
            list.splice(Number(del.dataset.sPresetDel), 1);
            savePresets(list);
            return renderPresets();
        }

        const preset = t.closest("[data-s-preset]");
        if (preset) {
            const p = loadPresets()[Number(preset.dataset.sPreset)];
            if (p) {
                Object.assign(filters, {
                    term: p.term || "", from: p.from || "", to: p.to || "",
                    type: p.type || "all", sort: p.sort || "newest",
                    sources: new Set(p.sources || []),
                    expenseCategories: new Set(p.expenseCategories || (p.categories || []).filter((c) => expenseCats.includes(c))),
                    incomeCategories: new Set(p.incomeCategories || (p.categories || []).filter((c) => incomeCats.includes(c)))
                });
                container.querySelector('[data-s="term"]').value = filters.term;
                container.querySelector('[data-s="from"]').value = filters.from;
                container.querySelector('[data-s="to"]').value = filters.to;
                $("sort").value = filters.sort;
                rerenderChips();
                renderResults();
            }
            return;
        }

        const action = t.closest("[data-s-action]")?.dataset.sAction;
        if (action === "clear") {
            Object.assign(filters, { term: "", from: "", to: "", type: "all", sort: "newest",
                sources: new Set(), expenseCategories: new Set(), incomeCategories: new Set() });
            mountIncomeSearch(container, entries, { onOpenEntry });
            return;
        }
        if (action === "save-preset") {
            const nameEl = $("preset-name");
            const name = nameEl.value.trim();
            if (!name || !hasFilters()) return;
            const list = loadPresets().filter((p) => p.name !== name);
            list.push({
                name, term: filters.term, from: filters.from, to: filters.to,
                type: filters.type, sort: filters.sort,
                sources: [...filters.sources],
                expenseCategories: [...filters.expenseCategories],
                incomeCategories: [...filters.incomeCategories]
            });
            savePresets(list);
            nameEl.value = "";
            return renderPresets();
        }
        if (action === "csv") {
            const blob = new Blob([csv(current)], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "blackroad-search-results.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            return;
        }

        const row = t.closest("[data-s-open]");
        if (row && onOpenEntry) onOpenEntry(current[Number(row.dataset.sOpen)].entryId);
    });

    renderPresets();
    renderResults();
}
