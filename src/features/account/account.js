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

    page.appendChild(AppearanceCard());

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
            <h2>Account</h2>
            <p>BlackRoad account settings.</p>
        </div>
    </div>
`;

/* ---------------- signed out ---------------- */

function renderSignedOut(page) {
    page.innerHTML = `
        ${HEADING}

        <div class="br-grid br-grid-2">
            <section class="br-card">
                <div class="br-card-heading"><h3>Sign in</h3></div>
                <form class="ac-stack" data-form="login">
                    <label><span>Email</span><input name="email" type="email" class="br-input" autocomplete="email" required></label>
                    <label><span>Password</span><input name="password" type="password" class="br-input" autocomplete="current-password" required></label>
                    <p class="br-field-help ac-error" data-error="login" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Sign in</button>
                </form>
            </section>

            <section class="br-card">
                <div class="br-card-heading"><h3>Create account</h3></div>
                <form class="ac-stack" data-form="register">
                    <label><span>Full name</span><input name="name" type="text" class="br-input" autocomplete="name" required></label>
                    <label><span>Email</span><input name="email" type="email" class="br-input" autocomplete="email" required></label>
                    <label><span>Password</span><input name="password" type="password" class="br-input" autocomplete="new-password" required></label>
                    <label><span>Confirm password</span><input name="confirmPassword" type="password" class="br-input" autocomplete="new-password" required></label>
                    <p class="br-field-help ac-error" data-error="register" hidden></p>
                    <button type="submit" class="br-button br-button-primary">Create account</button>
                </form>
            </section>
        </div>

        <section class="br-card" style="margin-top:20px;">
            <div class="br-card-heading"><h3>Just looking around?</h3></div>
            <p class="br-muted">Guest mode lets you browse BlackRoad but not save changes.</p>
            <button type="button" class="br-button" data-action="guest">Continue as guest</button>
        </section>

        <div class="br-toast" data-toast></div>
    `;

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
        ${HEADING}

        <section class="br-card">
            <div class="br-card-heading"><h3>Guest session</h3></div>
            <p class="br-muted">
                Guest sessions can't manage an account. Sign in or create an
                account to save your data, change your password and more.
            </p>
            <button type="button" class="br-button br-button-primary" data-action="leave-guest">Sign in / create account</button>
        </section>
    `;

    page.querySelector('[data-action="leave-guest"]').addEventListener("click", async () => {
        await logout();
        reloadApp();
    });
}

/* ---------------- signed in ---------------- */

function initials(name) {
    return (name || "G").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

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
    const dataUpdated = await loadDataUpdated();
    const savedAvatar = await loadAvatarUrl();
    const avatarSeed = user.email || user.name;

    page.innerHTML = `
        ${HEADING}

        <div class="ac-account-grid">
            <div class="ac-side">
                <section class="br-card">
                    <div class="ac-head">
                        <div class="ac-avatar" data-avatar>${avatarMarkup(savedAvatar, avatarSeed)}</div>
                        <div>
                            <h3 data-name>${escapeHTML(user.name || "BlackRoad User")}</h3>
                            <p class="br-muted">${escapeHTML(user.email)}</p>
                        </div>
                        <span class="br-badge br-badge-info" data-plan>${escapeHTML(user.plan)}</span>
                    </div>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Avatar</h3></div>
                    <form class="ac-stack" data-form="avatar">
                        <div class="ac-av-preview" data-av-preview></div>

                        <div>
                            <span class="ac-av-label">Style</span>
                            <div class="ac-av-styles" data-av-styles></div>
                        </div>

                        <div>
                            <span class="ac-av-label">Looks in this style — tap one</span>
                            <div class="ac-av-looks" data-av-looks></div>
                            <button type="button" class="br-button ac-av-more" data-action="av-more">Show more looks</button>
                        </div>

                        <label>
                            <span>Seed (any text — changes the look)</span>
                            <div class="ac-av-seed">
                                <input name="seed" type="text" class="br-input" maxlength="60" autocomplete="off" data-av-seed>
                            </div>
                        </label>

                        <div>
                            <span class="ac-av-label">Background</span>
                            <div class="ac-av-swatches" data-av-swatches></div>
                        </div>

                        <label class="ac-switch-label">
                            <input type="checkbox" data-av-flip>
                            Flip horizontally
                        </label>

                        <p class="br-muted">Powered by DiceBear. Only the link is saved, and it is included in your backups.</p>
                        <p class="br-field-help ac-error" data-error="avatar" hidden></p>

                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="submit" class="br-button br-button-primary">Save avatar</button>
                            <button type="button" class="br-button" data-action="av-reset">Use default</button>
                        </div>
                    </form>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Session</h3></div>
                    <p class="br-muted">Signed in as ${escapeHTML(user.email)}</p>
                    <button type="button" class="br-button br-button-danger" data-action="logout">Log out</button>
                </section>
            </div>

            <div class="ac-side">
                <section class="br-card">
                    <div class="br-card-heading"><h3>Profile</h3></div>
                    <form class="ac-stack" data-form="profile">
                        <label><span>Full name</span><input name="name" type="text" class="br-input" value="${escapeAttr(user.name)}"></label>
                        <label><span>Email address</span><input type="email" class="br-input" value="${escapeAttr(user.email)}" disabled></label>
                        <label><span>Member since</span><input type="text" class="br-input" value="${memberSince(user.createdAt)}" disabled></label>
                        <p class="br-field-help ac-error" data-error="profile" hidden></p>
                        <button type="submit" class="br-button br-button-primary">Save changes</button>
                    </form>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Data last updated</h3></div>
                    <form class="ac-stack" data-form="dataUpdated">
                        <label><span>Date &amp; time your BlackRoad data is up to date as of</span><input name="updated" type="datetime-local" step="1" class="br-input" value="${escapeAttr(dataUpdated)}"></label>
                        <p class="br-muted">Saved with your data, so it is included in every backup and restore.</p>
                        <p class="br-field-help ac-error" data-error="dataUpdated" hidden></p>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="submit" class="br-button br-button-primary">Save</button>
                            <button type="button" class="br-button" data-action="updated-now">Set to now</button>
                        </div>
                    </form>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Security</h3></div>
                    <form class="ac-stack" data-form="password">
                        <label><span>Current password</span><input name="current" type="password" class="br-input" autocomplete="current-password"></label>
                        <label><span>New password</span><input name="next" type="password" class="br-input" autocomplete="new-password"></label>
                        <label><span>Confirm new password</span><input name="confirm" type="password" class="br-input" autocomplete="new-password"></label>
                        <p class="br-field-help ac-error" data-error="password" hidden></p>
                        <button type="submit" class="br-button">Update password</button>
                    </form>
                </section>

                <section class="br-card">
                    <div class="br-card-heading"><h3>Plan</h3></div>
                    <div class="ac-plan-row">
                        <div>
                            <b>Premium plan (demo toggle)</b>
                            <p class="br-muted">Flips your plan locally to preview Premium-only UI.</p>
                        </div>
                        <label class="ac-switch-label">
                            <input type="checkbox" data-premium ${user.plan === "Premium" ? "checked" : ""}>
                            Premium
                        </label>
                    </div>
                    <p class="br-muted">Google Sign-In: reserved for Premium members (under development).</p>
                </section>
            </div>
        </div>

        <div class="br-toast" data-toast></div>
    `;

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

    bindAvatarEditor(page, savedAvatar, avatarSeed);

    page.querySelector('[data-action="logout"]').addEventListener("click", async () => {
        if (await confirmLogout()) reloadApp();
    });
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

        // 30 thumbnails: only fetch the ones scrolled into view.
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

    function redraw() {
        drawPreview();
        drawStyles();
        drawLooks();
        drawSwatches();
    }

    function setHead(url) {
        headAvatar.innerHTML = avatarMarkup(url, avatarSeed);
    }

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

        // Style thumbnails each fetch an image: wait until typing pauses.
        clearTimeout(thumbTimer);
        thumbTimer = setTimeout(() => { drawStyles(); drawLooks(); }, 450);
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

    redraw();
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
