import { login, register, loginGuest, GUEST_PROFILES } from "../../services/auth.js";
import { navigate, hardNavigate } from "../../app/router.js";
import { authBackground, startParticles } from "./auth-background.js";

/* Full-screen sign-in / register (rendered without the app shell).
   Scope changes on sign-in, and the data layer caches databases per
   scope, so we finish with a full page load (same as Account did). */

function enterApp() {
    hardNavigate("/dashboard");
}

/* Each screen has its own slogan so Sign in and Register feel different. */
const COPY = {
    login: {
        title: `Welcome back.<br><span class="br-auth-hl">Your numbers await.</span>`,
        text: "Pick up exactly where you left off.",
        points: ["Your numbers, just as you left them", "Private: data stays on this device", "Opens fast, even offline"]
    },
    register: {
        title: `Start fresh.<br><span class="br-auth-hl">Own your finances.</span>`,
        text: "Set up in under a minute. No cloud, no card.",
        points: ["Income, stocks, deposits, lending and SIPs", "Works offline as an installed app", "Light and dark themes"]
    }
};

const GOOGLE_ICON = `<svg class="br-auth-google-icon" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

/* Small "coming soon" popup (self-contained, closes on OK, Escape or outside click). */
function comingSoon(feature) {
    const previous = document.activeElement;
    const layer = document.createElement("div");
    layer.className = "br-auth-popup-layer";
    layer.innerHTML = `
        <div class="br-auth-popup" role="alertdialog" aria-modal="true" aria-labelledby="br-auth-popup-title" aria-describedby="br-auth-popup-text">
            <h3 id="br-auth-popup-title">Coming soon</h3>
            <p id="br-auth-popup-text"></p>
            <button type="button" class="br-button br-button-primary" data-popup-ok>OK</button>
        </div>
    `;
    layer.querySelector("#br-auth-popup-text").textContent = `${feature} is coming soon. For now, please use your email and password.`;

    const close = () => {
        document.removeEventListener("keydown", onKey, true);
        layer.remove();
        if (previous && previous.isConnected && previous.focus) previous.focus();
    };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); }
    };

    layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
    layer.querySelector("[data-popup-ok]").addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(layer);
    layer.querySelector("[data-popup-ok]").focus();
}

/* Plain profile icons for the guest picker, one solid colour per tier. */
const AVATAR = (color) => `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="24" r="10" fill="${color}"/><path d="M11 60c0-14 9-21 21-21s21 7 21 21z" fill="${color}"/></svg>`;
const TIER_COLOR = { "bottom-50": "#6B7280", "middle-40": "#3B82F6", "top-10": "#8B5CF6", "top-1": "#D4AF37" };
const AVATARS = {
    "bottom-50": AVATAR("#6B7280"),
    "middle-40": AVATAR("#3B82F6"),
    "top-10": AVATAR("#8B5CF6"),
    "top-1": AVATAR("#D4AF37")
};

/* Guest login: ask which sample portfolio to explore, then enter the app with it. */
export function chooseGuestProfile(onPick) {
    const previous = document.activeElement;
    const layer = document.createElement("div");
    layer.className = "br-auth-popup-layer";
    layer.innerHTML = `
        <div class="br-auth-popup br-auth-popup--wide" role="dialog" aria-modal="true" aria-labelledby="br-guest-title" aria-describedby="br-guest-text">
            <h3 id="br-guest-title">Explore with sample data</h3>
            <p id="br-guest-text">Pick a portfolio to explore. Everything is fictional and read-only.</p>
            <div class="br-guest-options">
                ${Object.entries(GUEST_PROFILES).map(([id, p]) => `
                    <button type="button" class="br-guest-option" data-profile="${id}" style="--tier:${TIER_COLOR[id] || '#6B7280'}">
                        <span class="br-guest-avatar">${AVATARS[id] || ""}</span>
                        <span class="br-guest-option-name">${p.label}</span>
                        <span class="br-guest-option-range">${p.range}</span>
                    </button>`).join("")}
            </div>
            <button type="button" class="br-button" data-popup-cancel>Cancel</button>
        </div>
    `;

    const close = () => {
        document.removeEventListener("keydown", onKey, true);
        layer.remove();
        if (previous && previous.isConnected && previous.focus) previous.focus();
    };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); }
    };

    layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
    layer.querySelector("[data-popup-cancel]").addEventListener("click", close);
    layer.querySelectorAll("[data-profile]").forEach((btn) =>
        btn.addEventListener("click", () => {
            layer.querySelectorAll("button").forEach((b) => { b.disabled = true; });
            onPick(btn.dataset.profile);
        })
    );
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(layer);
    layer.querySelector("[data-profile]").focus();
}

export function AuthScreen(mode) {
    const isLogin = mode === "login";
    const copy = isLogin ? COPY.login : COPY.register;
    const el = document.createElement("div");
    el.className = `br-auth br-auth--${isLogin ? "login" : "register"}`;

    el.innerHTML = `
        ${authBackground()}
        <div class="br-auth-shell">
        <aside class="br-auth-aside" aria-hidden="false">
            <div class="br-auth-aside-brand">
                <div class="br-brand-logo">BR</div>
                <div class="br-brand-name">BlackRoad</div>
            </div>
            <h1>${copy.title}</h1>
            <p>${copy.text}</p>
            <ul class="br-auth-points">
                ${copy.points.map((t) => `<li>${t}</li>`).join("")}
            </ul>
        </aside>
        <div class="br-auth-card">
            <div class="br-auth-brand">
                <div class="br-brand-logo">BR</div>
                <div>
                    <div class="br-brand-name">BlackRoad</div>
                    <div class="br-brand-subtitle">Finance</div>
                </div>
            </div>

            <div class="br-auth-tabs" role="tablist">
                <a href="#/login" data-go="/login" role="tab" class="${isLogin ? "is-active" : ""}" aria-selected="${isLogin}">Sign in</a>
                <a href="#/register" data-go="/register" role="tab" class="${isLogin ? "" : "is-active"}" aria-selected="${!isLogin}">Register</a>
            </div>

            <h2>${isLogin ? "Sign in" : "Create account"}</h2>
            <p>${isLogin ? "Welcome back. Sign in to see your data." : "Your data stays on this device."}</p>

            <form class="br-auth-form" novalidate>
                ${isLogin ? "" : `<label class="br-field"><input name="name" class="br-input" autocomplete="name" placeholder=" " required><span class="br-field-label">Full name</span></label>`}
                <label class="br-field"><input name="email" type="email" class="br-input" autocomplete="email" placeholder=" " required><span class="br-field-label">Email</span></label>
                ${isLogin ? "" : `<div class="br-auth-row">`}
                <label class="br-field"><span class="br-auth-pw"><input name="password" type="password" class="br-input" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder=" " required><span class="br-field-label">Password</span><button type="button" class="br-auth-eye" data-eye aria-label="Show password" aria-pressed="false">Show</button></span></label>
                ${isLogin ? "" : `<label class="br-field"><input name="confirmPassword" type="password" class="br-input" autocomplete="new-password" placeholder=" " required><span class="br-field-label">Confirm password</span></label></div>`}
                <p class="br-auth-error" role="alert" hidden></p>
                <button type="submit" class="br-button br-button-primary">${isLogin ? "Sign in" : "Create account"}</button>
            </form>

            <div class="br-auth-divider"><span>or</span></div>
            <button type="button" class="br-auth-google" data-google>${GOOGLE_ICON}<span>${isLogin ? "Sign in with Google" : "Register with Google"}</span></button>

            <div class="br-auth-alt">
                ${isLogin
                    ? `<span>New to BlackRoad?</span>
                       <a href="#/register" data-go="/register" class="br-button">Create an account</a>`
                    : `<span>Already have an account?</span>
                       <a href="#/login" data-go="/login" class="br-button">Sign in</a>`}
                <button type="button" class="br-button br-auth-guest" data-guest>Continue as guest (read-only)</button>
            </div>

            <div class="br-auth-credit">Developed by <strong>Microintel</strong></div>
        </div>
        </div>
    `;

    startParticles(el);

    // Show / hide password (display only; the value is submitted as before).
    const eye = el.querySelector("[data-eye]");
    eye.addEventListener("click", () => {
        const pw = el.querySelector('input[name="password"]');
        const show = pw.type === "password";
        pw.type = show ? "text" : "password";
        eye.textContent = show ? "Hide" : "Show";
        eye.setAttribute("aria-pressed", String(show));
        eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });

    // Desktop: start typing straight away. Skipped on touch so the keyboard doesn't jump up.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        requestAnimationFrame(() => el.querySelector("input")?.focus({ preventScroll: true }));
    }

    const form = el.querySelector("form");
    const err = el.querySelector(".br-auth-error");
    const submit = form.querySelector("button[type=submit]");

    const showError = (msg) => { err.textContent = msg; err.hidden = !msg; };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        showError("");
        const data = Object.fromEntries(new FormData(form).entries());
        submit.disabled = true;
        try {
            if (isLogin) await login(data.email, data.password);
            else await register(data);
            enterApp();
        } catch (ex) {
            showError(ex.message || "Something went wrong.");
            submit.disabled = false;
        }
    });

    // Switch between Sign in / Register without a full reload.
    el.querySelectorAll("[data-go]").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(a.dataset.go);
        })
    );

    el.querySelector("[data-google]").addEventListener("click", () => {
        comingSoon(isLogin ? "Google sign-in" : "Google registration");
    });

    el.querySelector("[data-guest]").addEventListener("click", () => {
        chooseGuestProfile(async (profile) => {
            await loginGuest(profile);
            enterApp();
        });
    });

    return el;
}
