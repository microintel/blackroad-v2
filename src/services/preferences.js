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

const THEME_COLOR = { light: "#EEECE7", dark: "#000000" };

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

let activeTransition = null;
let fadeTimer = 0;

const WIPE_MS = 520;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const prefersReducedMotion = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Flip the attribute and tell the rest of the app. */
function commitTheme(next, persist) {
    root().setAttribute("data-theme", next);
    if (persist) set(K.theme, next);
    syncThemeColor(next);

    window.dispatchEvent(new CustomEvent("br:theme-change", { detail: { theme: next } }));
}

/* Radius that reaches the farthest corner from the origin, so the circle
   always covers the whole screen. */
function revealRadius(x, y) {
    return Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
    );
}

/* Centre of an element in viewport pixels, or null if it is not on screen. */
function centreOf(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* Where the circle starts. Always the theme button itself: the live position
   of the element that was pressed, else the click point, else whichever
   theme button is on the page. It never falls back to a fixed corner while a
   toggle exists. Read again when the animation starts, so a layout shift
   during the switch (scrollbar, header reflow) cannot move the start point
   away from the icon. */
function resolveOrigin(origin) {
    return (
        centreOf(origin && origin.el) ||
        (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
            ? { x: origin.x, y: origin.y }
            : null) ||
        centreOf(document.querySelector('[data-action="toggle-theme"]')) || {
            x: window.innerWidth - 40,
            y: 32
        }
    );
}

/* Manual toggle: the new theme opens as a circle from the button that was
   pressed (View Transitions API). Returns false when the browser cannot do
   it, so the caller falls back to a cheap cross-fade. */
function revealTheme(next, persist, origin) {
    if (
        prefersReducedMotion() ||
        typeof document.startViewTransition !== "function"
    ) {
        return false;
    }

    // A second tap mid-animation jumps the first to its end, then starts fresh,
    // so the toggle can never get stuck waiting on an old transition.
    if (activeTransition) {
        try { activeTransition.skipTransition(); } catch { /* already finished */ }
    }

    // Fix the circle on the icon BEFORE the snapshot is taken. theme.css
    // starts the new snapshot as a zero-size circle at this point, so there is
    // no frame where the new theme shows anywhere else.
    const { x, y } = resolveOrigin(origin);
    const r = revealRadius(x, y);
    const rs = root().style;
    rs.setProperty("--br-vt-x", x + "px");
    rs.setProperty("--br-vt-y", y + "px");
    rs.setProperty("--br-vt-r", r + "px");
    rs.setProperty("--br-vt-ms", WIPE_MS + "ms");

    // Per-element colour transitions would be caught half-way in the new
    // snapshot, so they are switched off for the length of the reveal.
    root().classList.add("br-vt-switching");

    const transition = document.startViewTransition(() => commitTheme(next, persist));

    activeTransition = transition;

    transition.finished.finally(() => {
        if (activeTransition === transition) {
            activeTransition = null;
            root().classList.remove("br-vt-switching");
            ["--br-vt-x", "--br-vt-y", "--br-vt-r", "--br-vt-ms"].forEach((k) =>
                root().style.removeProperty(k)
            );
        }
    });

    return true;
}

/* Fallback for browsers without View Transitions: cover the screen with the
   old background, swap the theme underneath, and fade the cover away. One
   composited layer, so it stays smooth on long pages. */
function fadeTheme(next, persist) {
    const old = getComputedStyle(root()).getPropertyValue("--background").trim() || "#000";

    const cover = document.createElement("div");
    cover.className = "br-theme-fade";
    cover.style.background = old;
    document.body.appendChild(cover);

    commitTheme(next, persist);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        cover.style.opacity = "0";
    }));

    clearTimeout(fadeTimer);
    const done = () => cover.remove();
    cover.addEventListener("transitionend", done, { once: true });
    fadeTimer = setTimeout(done, 600);
}

/* Apply a theme to the page. `persist` is true only for a user choice. */
function applyTheme(theme, { persist = false, animate = false, origin = null } = {}) {
    const next = theme === "light" ? "light" : "dark";

    if (!animate || prefersReducedMotion()) {
        commitTheme(next, persist);
        return next;
    }

    if (!revealTheme(next, persist, origin)) {
        fadeTheme(next, persist);
    }

    return next;
}

/* User picked a theme: apply, save, and remember it. */
export function setTheme(theme, origin = null) {
    return applyTheme(theme, { persist: true, animate: true, origin });
}

/* `origin` is {el, x, y}: the pressed button and its centre in viewport pixels. */
export function toggleTheme(origin = null) {
    return setTheme(getTheme() === "dark" ? "light" : "dark", origin);
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
