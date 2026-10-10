import { confirmLogout } from "../../components/confirm-dialog.js";
import { hardNavigate } from "../../app/router.js";
import { AppearanceCard } from "./appearance.js";
import { dataService } from "../../data/data-service.js";
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

    page.innerHTML = `
        ${HEADING}

        <div class="ac-account-grid">
            <div class="ac-side">
                <section class="br-card">
                    <div class="ac-head">
                        <div class="ac-avatar" data-avatar>${escapeHTML(initials(user.name))}</div>
                        <div>
                            <h3 data-name>${escapeHTML(user.name || "BlackRoad User")}</h3>
                            <p class="br-muted">${escapeHTML(user.email)}</p>
                        </div>
                        <span class="br-badge br-badge-info" data-plan>${escapeHTML(user.plan)}</span>
                    </div>
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
        page.querySelector("[data-avatar]").textContent = initials(updated.name);

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
