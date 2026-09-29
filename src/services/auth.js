/* =========================================================
   BLACKROAD AUTH
   Ported from the old auth.js. Storage keys and the password
   hashing are unchanged, so accounts and sessions created by
   the old app keep working in V2:
     br_shared_user:<email>   account record
     br_session               current session
     br_active_scope          database scope (used by database.js)
   Also exposes window.BRAuth so BaseStore.assertCanWrite()
   keeps blocking writes in guest mode.
   ========================================================= */

const ACTIVE_SCOPE_KEY = "br_active_scope";

function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const stGet = (key, shared) => lsGet((shared ? "br_shared_" : "br_") + key);
const stSet = (key, value, shared) =>
    lsSet(
        (shared ? "br_shared_" : "br_") + key,
        typeof value === "string" ? value : JSON.stringify(value)
    );
const stDelete = (key, shared) =>
    lsRemove((shared ? "br_shared_" : "br_") + key);

/* ---------------- crypto ---------------- */

function randSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(str) {
    if (crypto && crypto.subtle && crypto.subtle.digest) {
        const buf = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(str)
        );
        return Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h << 5) - h + str.charCodeAt(i);
        h |= 0;
    }
    return "fb" + Math.abs(h).toString(16);
}

async function hashPassword(password, salt) {
    let val = salt + ":" + password;
    for (let i = 0; i < 2000; i++) {
        val = await sha256Hex(val + salt);
    }
    return val;
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const userKey = (email) => "user:" + normEmail(email);

/* ---------------- scope ---------------- */

function getActiveScopeSync() {
    return lsGet(ACTIVE_SCOPE_KEY) || null;
}
export function isGuestSync() {
    return getActiveScopeSync() === "guest";
}
export function isLoggedInSync() {
    const s = getActiveScopeSync();
    return !!s && s !== "guest";
}
export function scopeSuffix() {
    const id = getActiveScopeSync();
    return id ? id.replace(/[^a-z0-9@._-]/gi, "_") : "anon";
}

/* ---------------- records ---------------- */

async function findUser(email) {
    const raw = stGet(userKey(email), true);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}
const saveUser = (user) => stSet(userKey(user.email), user, true);

const publicUser = (u) => ({
    name: u.name,
    email: u.email,
    plan: u.plan || "Free",
    provider: u.provider || "password",
    createdAt: u.createdAt
});

async function setSession(email) {
    stSet("session", { email: normEmail(email), guest: false, ts: Date.now() }, false);
    lsSet(ACTIVE_SCOPE_KEY, normEmail(email));
}

export async function getSession() {
    const raw = stGet("session", false);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

/* ---------------- actions ---------------- */

export async function logout() {
    stDelete("session", false);
    lsRemove(ACTIVE_SCOPE_KEY);
}

export async function loginGuest() {
    stSet("session", { guest: true, ts: Date.now() }, false);
    lsSet(ACTIVE_SCOPE_KEY, "guest");
}

export async function register({ name, email, password, confirmPassword }) {
    name = String(name || "").trim();
    email = normEmail(email);

    if (!name || !email || !password)
        throw new Error("Please fill in your name, email and password.");
    if (!/^\S+@\S+\.\S+$/.test(email))
        throw new Error("Please enter a valid email address.");
    if (password.length < 6)
        throw new Error("Password must be at least 6 characters.");
    if (confirmPassword !== undefined && password !== confirmPassword)
        throw new Error("Passwords do not match.");
    if (await findUser(email))
        throw new Error("An account with this email already exists — try signing in instead.");

    const salt = randSalt();

    const user = {
        name,
        email,
        salt,
        passwordHash: await hashPassword(password, salt),
        plan: "Free",
        provider: "password",
        createdAt: new Date().toISOString()
    };

    await saveUser(user);
    await setSession(email);
    return publicUser(user);
}

export async function login(email, password) {
    email = normEmail(email);

    if (!email || !password)
        throw new Error("Please enter both email and password.");

    const user = await findUser(email);
    if (!user)
        throw new Error("No account found for that email — try registering first.");

    if ((await hashPassword(password, user.salt)) !== user.passwordHash)
        throw new Error("Incorrect password. Please try again.");

    await setSession(email);
    return publicUser(user);
}

export async function currentUser() {
    const s = await getSession();
    if (!s || s.guest) return null;
    const user = await findUser(s.email);
    return user ? publicUser(user) : null;
}

async function signedInRecord(message) {
    const s = await getSession();
    if (!s || s.guest) throw new Error(message);
    const user = await findUser(s.email);
    if (!user) throw new Error("Account not found.");
    return user;
}

export async function updateProfile({ name }) {
    const user = await signedInRecord("You must be signed in to update your account.");
    if (name !== undefined && String(name).trim()) user.name = String(name).trim();
    await saveUser(user);
    return publicUser(user);
}

export async function changePassword(current, next, confirm) {
    const user = await signedInRecord("You must be signed in to change your password.");

    if ((await hashPassword(current || "", user.salt)) !== user.passwordHash)
        throw new Error("Current password is incorrect.");
    if (!next || next.length < 6)
        throw new Error("New password must be at least 6 characters.");
    if (confirm !== undefined && next !== confirm)
        throw new Error("New passwords do not match.");

    const salt = randSalt();
    user.salt = salt;
    user.passwordHash = await hashPassword(next, salt);
    await saveUser(user);
    return true;
}

export async function setPremiumDemo(isPremium) {
    const user = await signedInRecord("Sign in first.");
    user.plan = isPremium ? "Premium" : "Free";
    await saveUser(user);
    return publicUser(user);
}

export function assertCanWrite() {
    if (isGuestSync()) {
        const err = new Error("You're browsing as a guest — sign in to save changes.");
        err.code = "GUEST_READONLY";
        throw err;
    }
}

/* One-time self-heal, same as the old file: back-fill the scope marker
   from an existing session so the first load is already isolated. */
if (getActiveScopeSync() === null) {
    try {
        const raw = localStorage.getItem("br_session");
        if (raw) {
            const s = JSON.parse(raw);
            if (s && s.guest) lsSet(ACTIVE_SCOPE_KEY, "guest");
            else if (s && s.email) lsSet(ACTIVE_SCOPE_KEY, normEmail(s.email));
        }
    } catch { /* ignore */ }
}

window.BRAuth = {
    register, login, loginGuest, logout, getSession, currentUser,
    updateProfile, changePassword, setPremiumDemo, normEmail,
    scopeSuffix, isGuestSync, isLoggedInSync, assertCanWrite
};
