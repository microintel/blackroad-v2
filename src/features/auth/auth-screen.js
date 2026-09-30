import { login, register, loginGuest } from "../../services/auth.js";
import { navigate, hardNavigate } from "../../app/router.js";

/* Full-screen sign-in / register (rendered without the app shell).
   Scope changes on sign-in, and the data layer caches databases per
   scope, so we finish with a full page load (same as Account did). */

function enterApp() {
    hardNavigate("/dashboard");
}

export function AuthScreen(mode) {
    const isLogin = mode === "login";
    const el = document.createElement("div");
    el.className = "br-auth";

    el.innerHTML = `
        <div class="br-auth-card">
            <div class="br-auth-brand">
                <div class="br-brand-logo">B</div>
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
                ${isLogin ? "" : `<label>Full name<input name="name" class="br-input" autocomplete="name" required></label>`}
                <label>Email<input name="email" type="email" class="br-input" autocomplete="email" required></label>
                <label>Password<input name="password" type="password" class="br-input" autocomplete="${isLogin ? "current-password" : "new-password"}" required></label>
                ${isLogin ? "" : `<label>Confirm password<input name="confirmPassword" type="password" class="br-input" autocomplete="new-password" required></label>`}
                <p class="br-auth-error" role="alert" hidden></p>
                <button type="submit" class="br-button br-button-primary">${isLogin ? "Sign in" : "Create account"}</button>
            </form>

            <div class="br-auth-alt">
                ${isLogin
                    ? `<span>New to BlackRoad?</span>
                       <a href="#/register" data-go="/register" class="br-button">Create an account</a>`
                    : `<span>Already have an account?</span>
                       <a href="#/login" data-go="/login" class="br-button">Sign in</a>`}
                <button type="button" class="br-button br-auth-guest" data-guest>Continue as guest (read-only)</button>
            </div>
        </div>
    `;

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

    el.querySelector("[data-guest]").addEventListener("click", async () => {
        await loginGuest();
        enterApp();
    });

    return el;
}
