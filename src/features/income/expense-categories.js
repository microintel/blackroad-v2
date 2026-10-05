/*
 * Expense category icons + custom categories.
 *
 * - Every built-in expense category has an icon (emoji on a tinted tile).
 * - Users can create their own categories (name + icon + colour). They are
 *   stored in the income database ("meta" store), so they belong to the
 *   account and are included in the full backup export / restore. They are
 *   merged into the category list everywhere the Add / Edit dialog is used.
 * - The list is loaded once into memory by loadCustomCategories() (called
 *   when the Income page loads) so rendering stays synchronous.
 * - Nothing here changes stored transactions: a transaction still saves
 *   its category as a plain name string.
 */
import { EXPENSE_CATEGORIES } from "./income-service.js";
import { confirmDialog } from "../../components/confirm-dialog.js";
import { dataService } from "../../data/data-service.js";

/* Old (v1) location. Read once to migrate into the database, then removed. */
const LEGACY_KEY = "br-custom-expense-categories";
const FALLBACK = { emoji: "🏷️", hue: 220 };

/* name -> [emoji, hue] */
const DEFAULTS = {
    "Apparel": ["👕", 210], "Baby": ["🍼", 330], "Bakery / Pups": ["🥐", 32],
    "Bank": ["🏦", 215], "Beauty": ["💄", 335], "Borrow": ["🤝", 25],
    "Bigbasket": ["🧺", 140], "Biscuit": ["🍪", 30], "Blinkit": ["⚡", 52],
    "Brother / Sister": ["👫", 280], "Car": ["🚗", 8], "Clothing": ["👚", 300],
    "Donate": ["🎗️", 350], "Dividend": ["💹", 150], "Drink / Juices": ["🧃", 28],
    "Education": ["🎓", 240], "Egg": ["🥚", 45], "Electronics": ["🔌", 200],
    "Entertainment": ["🎭", 270], "Family": ["👪", 20], "FD": ["🏛️", 45],
    "Food": ["🍽️", 18], "Friends": ["🧑‍🤝‍🧑", 190], "Gift": ["🎁", 345],
    "Health": ["🩺", 165], "Help": ["🙌", 35], "Home": ["🏠", 38],
    "Housing": ["🏢", 220], "Little Heart": ["💖", 340], "Milk / Bread / Curd": ["🥛", 200],
    "Mobile": ["📱", 230], "Mother / Dad": ["👪", 310], "Movie": ["🎬", 0],
    "Mutual Fund": ["📊", 160], "Official Documents": ["📄", 215], "Party": ["🎉", 320],
    "Personal Care": ["🧴", 175], "Pet": ["🐾", 28], "Penalty": ["⚠️", 5],
    "Recharges": ["🔋", 120], "Receivable": ["🧾", 195], "Repair": ["🔧", 215],
    "Samosa / Outside Food": ["🥟", 22], "Self": ["🙂", 50], "Service": ["🛠️", 205],
    "Shopping": ["🛍️", 325], "Snacks": ["🍿", 40], "SIP": ["🔁", 155],
    "Stock": ["📈", 145], "Social": ["💬", 205], "Sport": ["⚽", 130],
    "Style / Fashion": ["👗", 295], "Swiggy": ["🛵", 24], "Tax": ["🧮", 10],
    "Telephone": ["☎️", 235], "Tiffin / Lunch / Parlour": ["🍱", 15], "Tour": ["🧳", 185],
    "Transportation": ["🚌", 210], "Travel": ["✈️", 200], "Vehicle": ["🏍️", 12],
    "Wine / Cigarette": ["🍷", 345], "Zomato": ["🍕", 4], "Zepto": ["🛒", 275],
    "Others": ["📦", 35]
};

/* Income side (used only to keep search rows aligned and consistent) */
const INCOME_DEFAULTS = {
    "Salary": ["💼", 150], "Stock Return": ["📈", 145], "MF Return": ["📊", 160],
    "FD Return": ["🏛️", 45], "Return": ["🔁", 155], "Interest": ["🏦", 215],
    "Profit": ["💹", 150], "Bonus": ["🎯", 35], "Business": ["🏪", 25],
    "Freelance": ["💻", 220], "Gift": ["🎁", 345], "Investment": ["📈", 145],
    "Rent": ["🏠", 38], "Others": ["💰", 140]
};

/* Icons a user can choose when making a category */
export const ICON_CHOICES = [
    "🛒", "🍽️", "☕", "🍔", "🍕", "🍜", "🍰", "🍎", "🥦", "🍷",
    "🚗", "🏍️", "🚌", "🚆", "✈️", "⛽", "🚕", "🛵", "🚲", "🧳",
    "🏠", "🛋️", "💡", "🚿", "🔧", "🧹", "📱", "💻", "🎧", "📷",
    "👕", "👟", "👜", "💄", "💍", "🧴", "💊", "🩺", "🏋️", "🧘",
    "🎓", "📚", "✏️", "🎬", "🎮", "🎵", "🎨", "🎉", "🎁", "🐶",
    "🐱", "🌱", "👶", "👪", "❤️", "💳", "🏦", "💰", "📈", "🧾",
    "📄", "⚖️", "🛡️", "🔒", "🌐", "📦", "⭐", "🔥", "🌍", "🏷️"
];

export const COLOR_CHOICES = [0, 20, 40, 75, 145, 175, 200, 225, 260, 290, 320, 345];

/* ---------------- storage ---------------- */

let cache = [];

const clean = (list) =>
    Array.isArray(list)
        ? list
            .filter((c) => c && typeof c.name === "string" && c.name.trim())
            .map((c) => ({ name: c.name.trim(), icon: c.icon || FALLBACK.emoji, hue: Number(c.hue) || FALLBACK.hue }))
        : [];

function readLegacy() {
    try {
        return clean(JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]"));
    } catch {
        return [];
    }
}

/*
 * Loads the saved list from the database into memory. Never throws.
 * First run after the update: any categories saved in the old
 * localStorage location are copied into the database, then removed.
 */
export async function loadCustomCategories() {
    try {
        const store = await dataService.getIncomeStore();
        const saved = await store.getCustomExpenseCategories();

        if (saved !== undefined) {
            cache = clean(saved);
            return cache;
        }

        const legacy = readLegacy();

        cache = legacy;

        if (legacy.length) {
            try {
                await store.setCustomExpenseCategories(legacy);
                localStorage.removeItem(LEGACY_KEY);
            } catch { /* read-only (guest): keep them in memory, retry next time */ }
        }
    } catch (error) {
        console.error("BlackRoad: could not load custom categories", error);
    }

    return cache;
}

export function getCustomCategories() {
    return cache.slice();
}

/* Writes to the database first; memory is updated only if that succeeds. */
async function saveCustomCategories(list) {
    const store = await dataService.getIncomeStore();
    const next = clean(list);

    await store.setCustomExpenseCategories(next);
    cache = next;
}

/* Built-in list plus the user's own, custom ones placed just before "Others". */
export function getExpenseCategoryList() {
    const custom = getCustomCategories().map((c) => c.name);
    const base = EXPENSE_CATEGORIES.filter((c) => !custom.includes(c));
    const at = base.indexOf("Others");

    if (at < 0) return [...base, ...custom];

    return [...base.slice(0, at), ...custom, ...base.slice(at)];
}

/* ---------------- icon lookup ---------------- */

const lower = (v) => String(v || "").trim().toLowerCase();

export function categoryMeta(name, kind = "expense") {
    const key = String(name || "").trim();

    if (!key) return { ...FALLBACK, custom: false };

    const custom = getCustomCategories().find((c) => lower(c.name) === lower(key));

    if (custom) {
        return { emoji: custom.icon || FALLBACK.emoji, hue: Number(custom.hue) || FALLBACK.hue, custom: true };
    }

    const table = kind === "income" ? INCOME_DEFAULTS : DEFAULTS;
    const hit = table[key] || DEFAULTS[key] || INCOME_DEFAULTS[key];

    return hit ? { emoji: hit[0], hue: hit[1], custom: false } : { ...FALLBACK, custom: false };
}

const esc = (v) =>
    String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

/* size: "sm" 32px | "md" 42px (lists) | "lg" 56px (picker) */
export function categoryIconHTML(name, { size = "md", kind = "expense" } = {}) {
    const m = categoryMeta(name, kind);

    return `<span class="cat-ico cat-ico-${size}" style="--cat-hue:${m.hue}" aria-hidden="true">${esc(m.emoji)}</span>`;
}

/* ---------------- picker ---------------- */

function firstGlyph(text) {
    const t = String(text || "").trim();

    if (!t) return "";

    if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
        for (const part of seg.segment(t)) return part.segment;
    }

    return Array.from(t)[0] || "";
}

function syncSelect(select) {
    const current = select.value;
    const list = getExpenseCategoryList();

    if (current && !list.includes(current)) list.push(current);

    select.innerHTML =
        `<option value="">Select category</option>` +
        list.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

    select.value = current;
}

function paintTrigger(root) {
    const select = root.querySelector("[data-field='category']");
    const trigger = root.querySelector("[data-cat-trigger]");
    const value = select.value;

    trigger.querySelector("[data-cat-trigger-icon]").innerHTML = value
        ? categoryIconHTML(value, { size: "lg" })
        : `<span class="cat-ico cat-ico-lg cat-ico-empty" aria-hidden="true">＋</span>`;

    trigger.querySelector("[data-cat-trigger-name]").textContent = value || "Select category";
    trigger.querySelector("[data-cat-trigger-hint]").textContent = value ? "Tap to change" : "Choose an icon";
}

/* Markup for the Category field control (the <select> stays the source of truth). */
export function categoryPickerHTML(selected = "") {
    return `
        <div class="cat-picker" data-cat-picker>
            <select data-field="category" class="cat-native" tabindex="-1" aria-hidden="true"></select>
            <button type="button" class="cat-trigger" data-cat-trigger aria-haspopup="dialog">
                <span data-cat-trigger-icon></span>
                <span class="cat-trigger-text">
                    <strong data-cat-trigger-name></strong>
                    <small data-cat-trigger-hint></small>
                </span>
                <span class="cat-trigger-caret" aria-hidden="true">▾</span>
            </button>
        </div>`;
}

export function initCategoryPicker(scope, selected = "") {
    const root = scope.querySelector("[data-cat-picker]");

    if (!root) return;

    const select = root.querySelector("[data-field='category']");

    select.innerHTML = `<option value="${esc(selected)}">${esc(selected)}</option>`;
    select.value = selected || "";
    syncSelect(select);
    select.value = selected || "";
    paintTrigger(root);

    const choose = (name) => {
        syncSelect(select);
        select.value = name;
        paintTrigger(root);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
    };

    root.querySelector("[data-cat-trigger]").addEventListener("click", (e) => {
        e.preventDefault();
        syncSelect(select);
        openSheet({ selected: select.value, onChoose: choose });
    });
}

function openSheet({ selected, onChoose }) {
    const previous = document.activeElement;
    const layer = document.createElement("div");

    layer.className = "cat-layer";
    layer.innerHTML = `<div class="cat-sheet" role="dialog" aria-modal="true" aria-label="Choose category"></div>`;
    document.body.appendChild(layer);

    const sheet = layer.querySelector(".cat-sheet");
    let query = "";
    let draft = null;

    const close = () => {
        document.removeEventListener("keydown", onKey, true);
        layer.remove();
        if (previous && previous.focus) previous.focus();
    };

    const onKey = (e) => {
        if (e.key !== "Escape") return;
        if (document.querySelector(".br-confirm-layer")) return;
        e.stopPropagation();
        draft ? ((draft = null), renderList()) : close();
    };

    document.addEventListener("keydown", onKey, true);
    layer.addEventListener("mousedown", (e) => { if (e.target === layer) close(); });

    /* ----- list view ----- */
    function renderList() {
        const customNames = new Set(getCustomCategories().map((c) => lower(c.name)));
        const all = getExpenseCategoryList().filter((c) => !query || lower(c).includes(lower(query)));

        sheet.innerHTML = `
            <div class="cat-sheet-head">
                <h3>Choose category</h3>
                <button type="button" class="cat-x" data-cat-close aria-label="Close">✕</button>
            </div>
            <input type="search" class="cat-search" data-cat-search placeholder="Search categories" value="${esc(query)}" autocomplete="off">
            <div class="cat-grid" role="listbox">
                <button type="button" class="cat-tile cat-tile-new" data-cat-new>
                    <span class="cat-ico cat-ico-lg cat-ico-empty" aria-hidden="true">＋</span>
                    <span class="cat-tile-name">New category</span>
                </button>
                ${all.map((name) => `
                    <div class="cat-tile-wrap">
                        <button type="button" role="option" class="cat-tile${name === selected ? " is-selected" : ""}" data-cat-pick="${esc(name)}" aria-selected="${name === selected}">
                            ${categoryIconHTML(name, { size: "lg" })}
                            <span class="cat-tile-name">${esc(name)}</span>
                        </button>
                        ${customNames.has(lower(name)) ? `<button type="button" class="cat-tile-del" data-cat-del="${esc(name)}" aria-label="Delete ${esc(name)}" title="Delete custom category">✕</button>` : ""}
                    </div>`).join("")}
            </div>
            ${all.length ? "" : `<p class="cat-empty">No category matches "${esc(query)}".</p>`}`;
    }

    /* ----- create view ----- */
    function renderCreate() {
        const m = { emoji: draft.icon, hue: draft.hue };

        sheet.innerHTML = `
            <div class="cat-sheet-head">
                <button type="button" class="cat-x" data-cat-back aria-label="Back">←</button>
                <h3>New category</h3>
                <button type="button" class="cat-x" data-cat-close aria-label="Close">✕</button>
            </div>

            <div class="cat-preview">
                <span class="cat-ico cat-ico-xl" data-cat-preview style="--cat-hue:${m.hue}">${esc(m.emoji)}</span>
                <span class="cat-preview-name" data-cat-preview-name>${esc(draft.name || "Category name")}</span>
            </div>

            <label class="cat-label" for="cat-name">Name</label>
            <input id="cat-name" class="cat-input" data-cat-name maxlength="28" placeholder="e.g. Coffee, Gym, Rent" value="${esc(draft.name)}" autocomplete="off">

            <span class="cat-label">Icon</span>
            <div class="cat-icons">
                ${ICON_CHOICES.map((e) => `<button type="button" class="cat-icon-btn${e === draft.icon ? " is-on" : ""}" data-cat-icon="${esc(e)}" aria-label="Icon ${esc(e)}">${esc(e)}</button>`).join("")}
            </div>
            <div class="cat-own">
                <label class="cat-label" for="cat-own">Or type / paste any emoji</label>
                <input id="cat-own" class="cat-input cat-own-input" data-cat-own placeholder="🙂" maxlength="8" autocomplete="off">
            </div>

            <span class="cat-label">Colour</span>
            <div class="cat-colors">
                ${COLOR_CHOICES.map((h) => `<button type="button" class="cat-color${h === draft.hue ? " is-on" : ""}" data-cat-hue="${h}" style="--cat-hue:${h}" aria-label="Colour ${h}"></button>`).join("")}
            </div>

            <p class="cat-error" data-cat-error hidden></p>

            <div class="cat-actions">
                <button type="button" class="br-button" data-cat-back>Cancel</button>
                <button type="button" class="br-button br-button-primary" data-cat-save>Save category</button>
            </div>`;

        sheet.querySelector("[data-cat-name]").focus();
    }

    function refreshPreview() {
        const el = sheet.querySelector("[data-cat-preview]");

        el.textContent = draft.icon;
        el.style.setProperty("--cat-hue", draft.hue);
        sheet.querySelector("[data-cat-preview-name]").textContent = draft.name.trim() || "Category name";
        sheet.querySelectorAll("[data-cat-icon]").forEach((b) => b.classList.toggle("is-on", b.dataset.catIcon === draft.icon));
        sheet.querySelectorAll("[data-cat-hue]").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.catHue) === draft.hue));
    }

    function showError(text) {
        const el = sheet.querySelector("[data-cat-error]");

        el.textContent = text;
        el.hidden = !text;
    }

    async function save() {
        const name = draft.name.trim().replace(/\s+/g, " ");

        if (!name) return showError("Give the category a name.");

        const exists = [...EXPENSE_CATEGORIES, ...getCustomCategories().map((c) => c.name)]
            .some((c) => lower(c) === lower(name));

        if (exists) return showError("A category with this name already exists.");

        const list = getCustomCategories();

        list.push({ name, icon: draft.icon, hue: draft.hue });

        const btn = sheet.querySelector("[data-cat-save]");

        btn.disabled = true;

        try {
            await saveCustomCategories(list);
        } catch (error) {
            btn.disabled = false;
            return showError(error && error.message ? error.message : "Could not save the category.");
        }

        onChoose(name);
        close();
    }

    /* ----- events ----- */
    sheet.addEventListener("input", (e) => {
        if (e.target.matches("[data-cat-search]")) {
            query = e.target.value;
            const pos = e.target.selectionStart;

            renderList();

            const box = sheet.querySelector("[data-cat-search]");

            box.focus();
            box.setSelectionRange(pos, pos);
            return;
        }
        if (e.target.matches("[data-cat-name]")) {
            draft.name = e.target.value;
            showError("");
            refreshPreview();
            return;
        }
        if (e.target.matches("[data-cat-own]")) {
            const g = firstGlyph(e.target.value);

            if (g) {
                draft.icon = g;
                refreshPreview();
            }
        }
    });

    sheet.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.matches("[data-cat-name]")) {
            e.preventDefault();
            save();
        }
    });

    sheet.addEventListener("click", async (e) => {
        const t = e.target;

        if (t.closest("[data-cat-close]")) return close();

        if (t.closest("[data-cat-back]")) {
            draft = null;
            return renderList();
        }

        const del = t.closest("[data-cat-del]");

        if (del) {
            const name = del.dataset.catDel;
            const ok = await confirmDialog({
                title: "Delete category?",
                message: `"${name}" will be removed from your category list. Existing transactions keep their category name.`,
                confirmLabel: "Delete"
            });

            if (ok) {
                try {
                    await saveCustomCategories(getCustomCategories().filter((c) => lower(c.name) !== lower(name)));
                } catch (error) {
                    await confirmDialog({
                        title: "Could not delete",
                        message: error && error.message ? error.message : "The category could not be deleted.",
                        confirmLabel: "OK",
                        cancelLabel: "Close"
                    });
                }
                renderList();
            }
            return;
        }

        const pick = t.closest("[data-cat-pick]");

        if (pick) {
            onChoose(pick.dataset.catPick);
            return close();
        }

        if (t.closest("[data-cat-new]")) {
            draft = { name: query.trim(), icon: ICON_CHOICES[0], hue: COLOR_CHOICES[7] };
            return renderCreate();
        }

        const ic = t.closest("[data-cat-icon]");

        if (ic) {
            draft.icon = ic.dataset.catIcon;
            const own = sheet.querySelector("[data-cat-own]");

            if (own) own.value = "";
            return refreshPreview();
        }

        const hue = t.closest("[data-cat-hue]");

        if (hue) {
            draft.hue = Number(hue.dataset.catHue);
            return refreshPreview();
        }

        if (t.closest("[data-cat-save]")) save();
    });

    renderList();
    sheet.querySelector("[data-cat-search]")?.focus();
}
