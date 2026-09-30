/* =========================================================
   BLACKROAD PREFERENCES
   Theme (light / dark), click sound.
   Storage keys match the old app where they existed:
     br-theme   'light' | 'dark'   (absent = follow the system)
     br_style   'flat'             (legacy, single value)
     br_accent  'gold'             (legacy, single value)
     br_sound   '1' | '0'

   Theme rules
   - First visit (no saved value): follow prefers-color-scheme,
     and keep following it if the system setting changes.
   - After the user picks a theme with the toggle, that choice is
     saved and always wins over the system setting.
   - index.html applies the same rule before first paint; this
     module takes over once the app boots.
   ========================================================= */

/* One flat look. The lists keep a single entry so callers and
   stored keys keep working. */
export const STYLES = [{ id: "flat", label: "Flat" }];

export const ACCENTS = [{ id: "gold", label: "Gold", color: "#D4AF37" }];

export const THEMES = ["light", "dark"];

const K = { theme: "br-theme", style: "br_style", accent: "br_accent", sound: "br_sound" };

const THEME_COLOR = { light: "#FFFFFF", dark: "#000000" };

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const root = () => document.documentElement;

const systemQuery = () =>
    typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)")
        : null;

/* The user's explicit choice, or null when they have not made one. */
export function getSavedTheme() {
    const saved = get(K.theme);
    return saved === "light" || saved === "dark" ? saved : null;
}

export function getSystemTheme() {
    const q = systemQuery();
    return q && q.matches ? "light" : "dark";
}

/* The theme currently in effect. */
export function getTheme() {
    return getSavedTheme() || getSystemTheme();
}

export const getStyle = () => "flat";
export const getAccent = () => "gold";
export const isSoundOn = () => get(K.sound) === "1";

function syncThemeColor(theme) {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.dark);
}

let themingTimer = 0;

/* Apply a theme to the page. `persist` is true only for a user choice. */
function applyTheme(theme, { persist = false, animate = false } = {}) {
    const next = theme === "light" ? "light" : "dark";

    if (animate) {
        // Short colour ease for the manual toggle only (see theme.css).
        root().classList.add("br-theming");
        clearTimeout(themingTimer);
        themingTimer = setTimeout(() => root().classList.remove("br-theming"), 250);
    }

    root().setAttribute("data-theme", next);
    if (persist) set(K.theme, next);
    syncThemeColor(next);

    window.dispatchEvent(new CustomEvent("br:theme-change", { detail: { theme: next } }));
    return next;
}

/* User picked a theme: apply, save, and remember it. */
export function setTheme(theme) {
    return applyTheme(theme, { persist: true, animate: true });
}

export function toggleTheme() {
    return setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function setStyle() {
    root().setAttribute("data-style", "flat");
    set(K.style, "flat");
}
export function setAccent() {
    root().setAttribute("data-accent", "gold");
    set(K.accent, "gold");
}
export function setSound(on) {
    set(K.sound, on ? "1" : "0");
    if (on) playClick();
}

/* ---------------- click sound ---------------- */

let audio = null;

function playClick() {
    try {
        if (!audio) {
            audio = new Audio(
                new URL("../../assets/audio/click.mp3", import.meta.url).href
            );
            audio.preload = "auto";
        }
        audio.currentTime = 0;
        audio.play().catch(() => { /* autoplay/interrupt errors are harmless */ });
    } catch { /* no-op */ }
}

let systemListenerAttached = false;

export function initPreferences() {
    applyTheme(getTheme());
    root().setAttribute("data-style", "flat");
    root().setAttribute("data-accent", "gold");

    // Follow live system theme changes, but only until the user has chosen.
    // initPreferences() runs once at boot; the flag keeps it that way even
    // if it were ever called again.
    if (!systemListenerAttached) {
        systemListenerAttached = true;
        const q = systemQuery();
        const onSystemChange = () => { if (!getSavedTheme()) applyTheme(getSystemTheme()); };
        if (q) {
            if (q.addEventListener) q.addEventListener("change", onSystemChange);
            else if (q.addListener) q.addListener(onSystemChange);
        }
    }

    // Single delegated listener; reads the preference on every tap so the
    // toggle takes effect immediately.
    document.addEventListener(
        "click",
        (e) => {
            if (!isSoundOn()) return;
            if (e.target.closest("button, a, [role='button'], .br-nav-item, select, label, summary")) {
                playClick();
            }
        },
        true
    );
}
