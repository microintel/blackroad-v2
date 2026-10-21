import { shortcutsHTML } from "./shortcuts.js";
import { confirmLogout } from "../../components/confirm-dialog.js";
import { hardNavigate } from "../../app/router.js";
import { AppearanceCard } from "./appearance.js";
import { dataService } from "../../data/data-service.js";
import { avatarMarkup } from "../../components/avatars.js";
import {
    AVATAR_STYLES,
    AVATAR_BACKGROUNDS,
    buildAvatarUrl,
    parseAvatarUrl,
    defaultAvatarConfig,
    loadAvatarUrl,
    saveAvatarUrl,
    clearAvatarUrl
} from "../../services/avatar-service.js";
import { chooseGuestProfile } from "../auth/auth-screen.js";
import {
    getSession,
    currentUser,
    register,
    login,
    loginGuest,
    logout,
    updateProfile,
    changePassword,
    setPremiumDemo
} from "../../services/auth.js";

let toastTimer = null;

const ACCOUNT_TABS = [
    ["profile", "Profile"],
    ["avatar", "Avatar"],
    ["security", "Security"],
    ["plan", "Plan"],
    ["appearance", "Appearance"],
    ["shortcuts", "Shortcuts"]
];

let currentAccountTab = "profile";

export async function Account() {
    const page = document.createElement("section");
    page.className = "br-page br-account";

    const session = await getSession();

    if (!session) {
        renderSignedOut(page);
    } else if (session.guest) {
        renderGuest(page);
    } else {
        const user = await currentUser();

        if (user) {
            await renderProfile(page, user);
        } else {
            await logout();
            renderSignedOut(page);
        }
    }

    /* Page title, kept in the same narrow column as the content. */
    page.insertAdjacentHTML("afterbegin", HEADING.replace("br-page-heading", "br-page-heading acx-heading"));

    /* Signed-in users get Appearance as its own tab (see renderProfile). */
    if (!page.querySelector("[data-account-panel]")) {
        const card = AppearanceCard();
        card.classList.add("acx-appearance-out");
        page.appendChild(card);
    }

    return page;
}

/* Scope changes on sign-in / sign-out, and the data layer caches its
   databases per scope — so a full reload is the safe way to switch. */
function reloadApp() {
    hardNavigate("/dashboard");
}

const HEADING = `
    <div class="br-page-heading">
        <div>
            <h2>Settings</h2>
        </div>
    </div>
`;

const tabsHTML = (tabs, attr, active, label) => `
    <div class="br-income-tabs br-tabs-flat acx-tabs" role="group" aria-label="${label}">
        ${tabs.map(([key, text]) => `
            <button type="button" class="br-income-tab${key === active ? " active" : ""}"
                ${attr}="${key}" aria-pressed="${key === active}">${text}</button>`).join("")}
    </div>`;

/* Shows one panel, hides the rest. Returns nothing; calls onShow(key) so panels can load lazily. */
function bindTabs(page, tabAttr, panelAttr, onShow) {
    const camel = (a) => a.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const tk = camel(tabAttr);
    const pk = camel(panelAttr);

    page.addEventListener("click", (event) => {
        const btn = event.target.closest(`[${tabAttr}]`);
        if (!btn) return;

        const key = btn.dataset[tk];

        page.querySelectorAll(`[${tabAttr}]`).forEach((t) => {
            const on = t.dataset[tk] === key;
            t.classList.toggle("active", on);
            t.setAttribute("aria-pressed", String(on));
        });

        page.querySelectorAll(`[${panelAttr}]`).forEach((p) => {
            p.hidden = p.dataset[pk] !== key;
        });

        onShow(key);
    });
}

/* ---------------- signed out ---------------- */

function renderSignedOut(page) {
    page.innerHTML = `
        <div class="acx acx-narrow">
            <div class="acx-title">
                <h2>Welcome to BlackRoad</h2>
                <p>Sign in to save your data, or just look around.</p>
            </div>

            ${tabsHTML([["login", "Sign in"], ["register", "Create account"]], "data-auth-tab", "login", "Sign in or create account")}

            <div class="acx-panel" data-auth-panel="login">
                <form class="ac-stack" data-form="login">
                    <label><span>Email</span><input name="email" type="email" class="br-input" autocomplete="email" required></label>
                    <label><span>Password</span><input name="password" type="password" class="br-input" autocomplete="current-password" required></label>
                    <p class="br-field-help ac-error" data-error="login" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Sign in</button>
                </form>
            </div>

            <div class="acx-panel" data-auth-panel="register" hidden>
                <form class="ac-stack" data-form="register">
                    <label><span>Full name</span><input name="name" type="text" class="br-input" autocomplete="name" required></label>
                    <label><span>Email</span><input name="email" type="email" class="br-input" autocomplete="email" required></label>
                    <label><span>Password</span><input name="password" type="password" class="br-input" autocomplete="new-password" required></label>
                    <label><span>Confirm password</span><input name="confirmPassword" type="password" class="br-input" autocomplete="new-password" required></label>
                    <p class="br-field-help ac-error" data-error="register" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Create account</button>
                </form>
            </div>

            <p class="acx-alt">Just looking around? <button type="button" class="acx-link" data-action="guest">Continue as guest</button></p>
        </div>

        <div class="br-toast" data-toast></div>
    `;

    bindTabs(page, "data-auth-tab", "data-auth-panel", () => {});

    bindForm(page, "login", async (data) => {
        await login(data.email, data.password);
        reloadApp();
    });

    bindForm(page, "register", async (data) => {
        await register(data);
        reloadApp();
    });

    page.querySelector('[data-action="guest"]').addEventListener("click", () => {
        chooseGuestProfile(async (profile) => {
            await loginGuest(profile);
            reloadApp();
        });
    });
}

/* ---------------- guest ---------------- */

function renderGuest(page) {
    page.innerHTML = `
        <div class="acx acx-narrow">
            <div class="acx-title">
                <h2>Guest session</h2>
                <p>Guest sessions can't manage an account. Sign in or create one to save your data and change your password.</p>
            </div>
            <button type="button" class="br-button br-button-primary" data-action="leave-guest">Sign in / create account</button>
            <div class="acx-section"><h3>Keyboard shortcuts</h3>${shortcutsHTML()}</div>
        </div>
    `;

    page.querySelector('[data-action="leave-guest"]').addEventListener("click", async () => {
        await logout();
        reloadApp();
    });
}

/* ---------------- signed in ---------------- */

function memberSince(iso) {
    if (!iso) return "—";

    try {
        return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } catch {
        return "—";
    }
}

/* Stored in the income database "meta" store under the old app's
   "updateDate" key, so it travels with the global backup. */
async function loadDataUpdated() {
    try {
        const store = await dataService.getIncomeStore();
        const v = await store.getUpdateDate();
        if (!v) return "";
        return String(v).length === 10 ? v + "T00:00:00" : String(v);
    } catch {
        return "";
    }
}

function nowLocalInput() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function renderProfile(page, user) {
    /* both reads are independent: run them together */
    const [dataUpdated, savedAvatar] = await Promise.all([loadDataUpdated(), loadAvatarUrl()]);
    const avatarSeed = user.email || user.name;
    const panel = (key, inner) =>
        `<div class="acx-panel" data-account-panel="${key}" ${currentAccountTab === key ? "" : "hidden"}>${inner}</div>`;

    page.innerHTML = `
        <div class="acx">
            <header class="acx-head">
                <div class="ac-avatar acx-avatar" data-avatar>${avatarMarkup(savedAvatar, avatarSeed)}</div>
                <div class="acx-who">
                    <h2 data-name>${escapeHTML(user.name || "BlackRoad User")}</h2>
                    <p>${escapeHTML(user.email)}</p>
                </div>
                <span class="acx-plan" data-plan>${escapeHTML(user.plan)}</span>
            </header>

            ${tabsHTML(ACCOUNT_TABS, "data-account-tab", currentAccountTab, "Settings sections")}

            ${panel("profile", `
                <form class="ac-stack" data-form="profile">
                    <label><span>Full name</span><input name="name" type="text" class="br-input" value="${escapeAttr(user.name)}"></label>
                    <dl class="acx-meta">
                        <div><dt>Email</dt><dd>${escapeHTML(user.email)}</dd></div>
                        <div><dt>Member since</dt><dd>${memberSince(user.createdAt)}</dd></div>
                    </dl>
                    <p class="br-field-help ac-error" data-error="profile" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Save changes</button>
                </form>

                <form class="ac-stack acx-section" data-form="dataUpdated">
                    <h3>Data last updated</h3>
                    <label><span>Date &amp; time your data is up to date as of</span><input name="updated" type="datetime-local" step="1" class="br-input" value="${escapeAttr(dataUpdated)}"></label>
                    <p class="br-field-help ac-error" data-error="dataUpdated" hidden></p>
                    <div class="acx-actions">
                        <button type="submit" class="br-button br-button-primary">Save</button>
                        <button type="button" class="br-button" data-action="updated-now">Set to now</button>
                    </div>
                </form>
            `)}

            ${panel("avatar", `<div data-avatar-mount></div>`)}

            ${panel("security", `
                <form class="ac-stack" data-form="password">
                    <label><span>Current password</span><input name="current" type="password" class="br-input" autocomplete="current-password"></label>
                    <label><span>New password</span><input name="next" type="password" class="br-input" autocomplete="new-password"></label>
                    <label><span>Confirm new password</span><input name="confirm" type="password" class="br-input" autocomplete="new-password"></label>
                    <p class="br-field-help ac-error" data-error="password" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Update password</button>
                </form>

                <div class="acx-section acx-session">
                    <div>
                        <h3>Session</h3>
                        <p>Signed in as ${escapeHTML(user.email)}</p>
                    </div>
                    <button type="button" class="br-button br-button-danger" data-action="logout">Log out</button>
                </div>
            `)}

            ${panel("plan", `
                <div class="acx-row">
                    <div>
                        <b>Premium plan</b>
                        <p>Demo toggle. Switch it on to try Premium features.</p>
                    </div>
                    <label class="ac-switch-label">
                        <input type="checkbox" data-premium ${user.plan === "Premium" ? "checked" : ""} aria-label="Premium plan">
                    </label>
                </div>
            `)}

            ${panel("appearance", `<div data-appearance-mount></div>`)}

            ${panel("shortcuts", shortcutsHTML())}
        </div>

        <div class="br-toast" data-toast></div>
    `;

    /* panels that cost something are built only when first opened */
    const built = new Set();
    const build = (key) => {
        if (built.has(key)) return;
        built.add(key);

        if (key === "avatar") {
            page.querySelector("[data-avatar-mount]").innerHTML = avatarEditorHTML();
            bindAvatarEditor(page, savedAvatar, avatarSeed);
        } else if (key === "appearance") {
            const card = AppearanceCard();
            card.classList.add("acx-appearance");
            page.querySelector("[data-appearance-mount]").appendChild(card);
        }
    };

    bindTabs(page, "data-account-tab", "data-account-panel", (key) => {
        currentAccountTab = key;
        build(key);
    });

    build(currentAccountTab);

    bindForm(page, "profile", async (data) => {
        const updated = await updateProfile({ name: data.name });

        page.querySelector("[data-name]").textContent = updated.name;

        toast(page, "Profile updated");
    });

    bindForm(page, "password", async (data, form) => {
        await changePassword(data.current, data.next, data.confirm);
        form.reset();
        toast(page, "Password updated");
    });

    bindForm(page, "dataUpdated", async (data) => {
        const store = await dataService.getIncomeStore();
        await store.setUpdateDate(data.updated || "");
        toast(page, data.updated ? "Data last updated saved" : "Data last updated cleared");
    });

    page.querySelector('[data-action="updated-now"]').addEventListener("click", () => {
        page.querySelector('[name="updated"]').value = nowLocalInput();
    });

    page.querySelector("[data-premium]").addEventListener("change", async (event) => {
        const box = event.currentTarget;

        try {
            const updated = await setPremiumDemo(box.checked);
            page.querySelector("[data-plan]").textContent = updated.plan;
            toast(page, box.checked ? "Premium (demo) enabled" : "Back to Free plan");
        } catch (error) {
            box.checked = !box.checked;
            toast(page, error.message || "Could not update your plan.");
        }
    });

    page.querySelector('[data-action="logout"]').addEventListener("click", async () => {
        if (await confirmLogout()) reloadApp();
    });
}

/* Avatar tab markup. Only the preview loads an image up front; the style
   list, looks gallery and fine-tune options open on demand. */
function avatarEditorHTML() {
    return `
        <form class="ac-stack" data-form="avatar">
            <div class="acx-av-top">
                <div class="ac-av-preview" data-av-preview></div>
                <div class="acx-chips" role="group" aria-label="Customise avatar">
                    <button type="button" class="acx-chip" data-av-open="styles" aria-expanded="false">Style</button>
                    <button type="button" class="acx-chip" data-av-open="looks" aria-expanded="false">Looks</button>
                    <button type="button" class="acx-chip" data-av-open="tune" aria-expanded="false">Fine-tune</button>
                </div>
            </div>

            <div class="acx-drawer" data-av-drawer="styles" hidden>
                <div class="ac-av-styles" data-av-styles></div>
            </div>

            <div class="acx-drawer" data-av-drawer="looks" hidden>
                <div class="ac-av-looks" data-av-looks></div>
                <button type="button" class="br-button ac-av-more" data-action="av-more">Show more looks</button>
            </div>

            <div class="acx-drawer ac-stack" data-av-drawer="tune" hidden>
                <label>
                    <span>Seed (any text changes the look)</span>
                    <input name="seed" type="text" class="br-input" maxlength="60" autocomplete="off" data-av-seed>
                </label>

                <div>
                    <span class="ac-av-label">Background</span>
                    <div class="ac-av-swatches" data-av-swatches></div>
                </div>

                <label class="ac-switch-label">
                    <input type="checkbox" data-av-flip>
                    Flip horizontally
                </label>
            </div>

            <p class="br-field-help ac-error" data-error="avatar" hidden></p>

            <div class="acx-actions">
                <button type="submit" class="br-button br-button-primary">Save avatar</button>
                <button type="button" class="br-button" data-action="av-reset">Use default</button>
            </div>
        </form>
    `;
}

/* ---------------- avatar editor (DiceBear) ---------------- */

function bindAvatarEditor(page, savedUrl, avatarSeed) {
    const form = page.querySelector('[data-form="avatar"]');
    const error = page.querySelector('[data-error="avatar"]');
    const preview = page.querySelector("[data-av-preview]");
    const stylesBox = page.querySelector("[data-av-styles]");
    const looksBox = page.querySelector("[data-av-looks]");
    const moreBtn = page.querySelector('[data-action="av-more"]');
    const swatchBox = page.querySelector("[data-av-swatches]");
    const seedInput = page.querySelector("[data-av-seed]");
    const flipInput = page.querySelector("[data-av-flip]");
    const headAvatar = page.querySelector("[data-avatar]");

    // Start from the saved avatar, otherwise from the account's own seed.
    const state = parseAvatarUrl(savedUrl) || defaultAvatarConfig(avatarSeed);

    seedInput.value = state.seed;
    flipInput.checked = state.flip;

    let thumbTimer = null;
    let open = "";                              /* which drawer is open: styles | looks | tune | "" */

    // Looks gallery: the same style with seeds 1, 2, 3 ... (24 more per tap).
    const LOOKS_STEP = 24;
    const LOOKS_MAX = 480;
    let looksShown = LOOKS_STEP;

    const current = () => buildAvatarUrl(state);

    function drawPreview() {
        preview.innerHTML = avatarMarkup(current(), state.seed);
    }

    function drawStyles() {
        stylesBox.innerHTML = AVATAR_STYLES.map((st) => {
            const url = buildAvatarUrl({ ...state, style: st.id });

            return `<button type="button" class="ac-av-style${st.id === state.style ? " is-active" : ""}" data-style="${st.id}" title="${st.label}" aria-label="${st.label}" aria-pressed="${st.id === state.style}">${avatarMarkup(url, state.seed)}<small>${st.label}</small></button>`;
        }).join("");

        stylesBox.querySelectorAll("img").forEach((img) => { img.loading = "lazy"; });
    }

    function drawLooks() {
        let html = "";

        for (let n = 1; n <= looksShown; n++) {
            const seed = String(n);
            const url = buildAvatarUrl({ ...state, seed });
            const on = seed === state.seed;

            html += `<button type="button" class="ac-av-look${on ? " is-active" : ""}" data-look="${seed}" aria-label="Look ${seed}" aria-pressed="${on}">${avatarMarkup(url, seed)}</button>`;
        }

        looksBox.innerHTML = html;
        looksBox.querySelectorAll("img").forEach((img) => { img.loading = "lazy"; });
        moreBtn.hidden = looksShown >= LOOKS_MAX;
    }

    function drawSwatches() {
        swatchBox.innerHTML = AVATAR_BACKGROUNDS.map((hex) => {
            const label = hex ? "#" + hex : "No background";
            const bg = hex ? `style="background:#${hex}"` : "";

            return `<button type="button" class="ac-av-swatch${hex ? "" : " is-none"}${hex === state.background ? " is-active" : ""}" data-bg="${hex}" ${bg} title="${label}" aria-label="${label}" aria-pressed="${hex === state.background}"></button>`;
        }).join("");
    }

    /* Only draw what is on screen: the galleries fetch many images. */
    function redraw() {
        drawPreview();
        if (open === "styles") drawStyles();
        if (open === "looks") drawLooks();
        if (open === "tune") drawSwatches();
    }

    function setHead(url) {
        headAvatar.innerHTML = avatarMarkup(url, avatarSeed);
    }

    function toggleDrawer(name) {
        open = open === name ? "" : name;

        page.querySelectorAll("[data-av-drawer]").forEach((d) => {
            d.hidden = d.dataset.avDrawer !== open;
        });

        page.querySelectorAll("[data-av-open]").forEach((c) => {
            const on = c.dataset.avOpen === open;
            c.classList.toggle("is-on", on);
            c.setAttribute("aria-expanded", String(on));
        });

        redraw();
    }

    page.querySelector(".acx-chips").addEventListener("click", (event) => {
        const chip = event.target.closest("[data-av-open]");
        if (chip) toggleDrawer(chip.dataset.avOpen);
    });

    stylesBox.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-style]");

        if (!btn) return;

        state.style = btn.dataset.style;
        redraw();
    });

    looksBox.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-look]");

        if (!btn) return;

        state.seed = btn.dataset.look;
        seedInput.value = state.seed;
        redraw();
    });

    moreBtn.addEventListener("click", () => {
        looksShown = Math.min(looksShown + LOOKS_STEP, LOOKS_MAX);
        drawLooks();
    });

    swatchBox.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-bg]");

        if (!btn) return;

        state.background = btn.dataset.bg;
        redraw();
    });

    seedInput.addEventListener("input", () => {
        state.seed = seedInput.value.trim() || "blackroad";
        drawPreview();

        // Gallery thumbnails each fetch an image: wait until typing pauses.
        clearTimeout(thumbTimer);
        thumbTimer = setTimeout(redraw, 450);
    });

    flipInput.addEventListener("change", () => {
        state.flip = flipInput.checked;
        redraw();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.hidden = true;

        try {
            const saved = await saveAvatarUrl(current());

            setHead(saved);
            toast(page, "Avatar saved");
        } catch (err) {
            error.textContent = err.message || "Could not save your avatar.";
            error.hidden = false;
        }
    });

    page.querySelector('[data-action="av-reset"]').addEventListener("click", async () => {
        error.hidden = true;

        try {
            await clearAvatarUrl();

            Object.assign(state, defaultAvatarConfig(avatarSeed));
            seedInput.value = state.seed;
            flipInput.checked = false;

            redraw();
            setHead("");
            toast(page, "Back to the default avatar");
        } catch (err) {
            error.textContent = err.message || "Could not reset your avatar.";
            error.hidden = false;
        }
    });

    drawPreview();
}

/* ---------------- helpers ---------------- */

function bindForm(page, name, onSubmit) {
    const form = page.querySelector(`[data-form="${name}"]`);
    const error = page.querySelector(`[data-error="${name}"]`);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.hidden = true;

        try {
            await onSubmit(Object.fromEntries(new FormData(form)), form);
        } catch (err) {
            error.textContent = err.message || "Something went wrong.";
            error.hidden = false;
        }
    });
}

function toast(page, message) {
    const el = page.querySelector("[data-toast]");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

const escapeAttr = escapeHTML;
