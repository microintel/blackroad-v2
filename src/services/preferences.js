/* =========================================================
   BLACKROAD PREFERENCES
   Theme (light/dark), UI style, accent colour, click sound.
   Storage keys match the old app where they existed:
     br-theme   'light' | 'dark'
     br_style   'neumo' | 'glass' | 'flat' | 'skeuo'
   New in V2:
     br_accent  'graphite' | 'gold' | 'green' | 'blue' | 'violet' | 'rose'
     br_sound   '1' | '0'
   ========================================================= */

export const STYLES = [
    { id: "neumo", label: "Soft" },
    { id: "glass", label: "Glass" },
    { id: "flat", label: "Flat" },
    { id: "skeuo", label: "Realistic" }
];

export const ACCENTS = [
    { id: "graphite", label: "Graphite", color: "#17191d" },
    { id: "gold", label: "Gold", color: "#c9962b" },
    { id: "green", label: "Green", color: "#16845b" },
    { id: "blue", label: "Blue", color: "#3867d6" },
    { id: "violet", label: "Violet", color: "#7c5cd6" },
    { id: "rose", label: "Rose", color: "#d6457a" }
];

const K = { theme: "br-theme", style: "br_style", accent: "br_accent", sound: "br_sound" };

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const root = () => document.documentElement;

export const getTheme = () => (get(K.theme) === "dark" ? "dark" : "light");
export const getStyle = () => {
    const s = get(K.style);
    return STYLES.some((x) => x.id === s) ? s : "flat";
};
export const getAccent = () => {
    const a = get(K.accent);
    return ACCENTS.some((x) => x.id === a) ? a : "graphite";
};
export const isSoundOn = () => get(K.sound) === "1";

export function setTheme(mode) {
    mode = mode === "dark" ? "dark" : "light";
    root().setAttribute("data-theme", mode);
    set(K.theme, mode);
    syncThemeColor(mode);
    return mode;
}
function syncThemeColor(mode) {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", mode === "dark" ? "#000000" : "#ffffff");
}
export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");

export function setStyle(id) {
    root().setAttribute("data-style", id);
    set(K.style, id);
}
export function setAccent(id) {
    root().setAttribute("data-accent", id);
    set(K.accent, id);
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

export function initPreferences() {
    root().setAttribute("data-theme", getTheme());
    syncThemeColor(getTheme());
    root().setAttribute("data-style", getStyle());
    root().setAttribute("data-accent", getAccent());

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
