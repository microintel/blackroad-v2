/* =========================================================
   PROFILE AVATAR  (DiceBear)
   The avatar is a free DiceBear HTTP API link — only the URL is
   stored, never the image:

     https://api.dicebear.com/9.x/<style>/svg?seed=...&backgroundColor=...

   Where it lives: the income database "meta" store under the key
   "avatarUrl" (same place as "Data last updated"). That store is part
   of the global backup, so the avatar is exported and restored with
   the rest of the user's data, and each account keeps its own.

   Anything read from the database or from an imported file is
   treated as untrusted: it is only used if it is a DiceBear SVG URL.
   ========================================================= */

import { dataService } from "../data/data-service.js";

export const AVATAR_META_KEY = "avatarUrl";

const API_HOST = "api.dicebear.com";
const API_VERSION = "9.x";
const MAX_URL_LENGTH = 600;

/* Every DiceBear 9.x avatar style (all work with just a seed). */
export const AVATAR_STYLES = [
    { id: "adventurer", label: "Adventurer" },
    { id: "adventurer-neutral", label: "Adventurer Neutral" },
    { id: "avataaars", label: "Avataaars" },
    { id: "avataaars-neutral", label: "Avataaars Neutral" },
    { id: "big-ears", label: "Big Ears" },
    { id: "big-ears-neutral", label: "Big Ears Neutral" },
    { id: "big-smile", label: "Big Smile" },
    { id: "bottts", label: "Bottts" },
    { id: "bottts-neutral", label: "Bottts Neutral" },
    { id: "croodles", label: "Croodles" },
    { id: "croodles-neutral", label: "Croodles Neutral" },
    { id: "dylan", label: "Dylan" },
    { id: "fun-emoji", label: "Fun Emoji" },
    { id: "glass", label: "Glass" },
    { id: "icons", label: "Icons" },
    { id: "identicon", label: "Identicon" },
    { id: "initials", label: "Initials" },
    { id: "lorelei", label: "Lorelei" },
    { id: "lorelei-neutral", label: "Lorelei Neutral" },
    { id: "micah", label: "Micah" },
    { id: "miniavs", label: "Miniavs" },
    { id: "notionists", label: "Notionists" },
    { id: "notionists-neutral", label: "Notionists Neutral" },
    { id: "open-peeps", label: "Open Peeps" },
    { id: "personas", label: "Personas" },
    { id: "pixel-art", label: "Pixel Art" },
    { id: "pixel-art-neutral", label: "Pixel Art Neutral" },
    { id: "rings", label: "Rings" },
    { id: "shapes", label: "Shapes" },
    { id: "thumbs", label: "Thumbs" }
];

/* Background colours (hex without "#", as DiceBear expects). "" = none. */
export const AVATAR_BACKGROUNDS = [
    "", "b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "fde68a", "bbf7d0"
];

const STYLE_IDS = AVATAR_STYLES.map((s) => s.id);
const HEX = /^[0-9a-f]{6}$/i;

/* ---------------- URL build / check / parse ---------------- */

export function defaultAvatarConfig(seed) {
    return {
        style: "avataaars",
        seed: String(seed || "blackroad"),
        background: AVATAR_BACKGROUNDS[1],
        flip: false
    };
}

export function buildAvatarUrl({ style, seed, background, flip } = {}) {
    const styleId = STYLE_IDS.includes(style) ? style : STYLE_IDS[0];
    const params = new URLSearchParams();

    params.set("seed", String(seed || "blackroad").slice(0, 60));

    if (background && HEX.test(background)) {
        params.set("backgroundColor", background.toLowerCase());
    }

    if (flip) params.set("flip", "true");

    return `https://${API_HOST}/${API_VERSION}/${styleId}/svg?${params.toString()}`;
}

/* True only for a plain https DiceBear SVG link. Returns the clean URL or "". */
export function cleanAvatarUrl(value) {
    if (typeof value !== "string" || !value || value.length > MAX_URL_LENGTH) return "";

    let url;

    try { url = new URL(value); } catch { return ""; }

    if (url.protocol !== "https:" || url.hostname !== API_HOST) return "";
    if (url.username || url.password || url.port || url.hash) return "";
    if (!/^\/\d+\.x\/[a-z0-9-]+\/svg$/.test(url.pathname)) return "";

    return url.href;
}

/* Turns a stored URL back into editor settings (null if not usable). */
export function parseAvatarUrl(value) {
    const clean = cleanAvatarUrl(value);

    if (!clean) return null;

    const url = new URL(clean);
    const style = url.pathname.split("/")[2];
    const bg = url.searchParams.get("backgroundColor") || "";

    return {
        style: STYLE_IDS.includes(style) ? style : STYLE_IDS[0],
        seed: url.searchParams.get("seed") || "blackroad",
        background: HEX.test(bg) ? bg.toLowerCase() : "",
        flip: url.searchParams.get("flip") === "true"
    };
}

/* ---------------- database ---------------- */

/* The saved avatar URL for the current account, or "" if none / unusable. */
export async function loadAvatarUrl() {
    try {
        const store = await dataService.getIncomeStore();

        return cleanAvatarUrl(await store.getMeta(AVATAR_META_KEY));
    } catch {
        return "";
    }
}

/* Saves the URL (throws for guests, or if the URL is not a DiceBear link). */
export async function saveAvatarUrl(url) {
    const clean = cleanAvatarUrl(url);

    if (!clean) throw new Error("That avatar link is not valid.");

    const store = await dataService.getIncomeStore();

    await store.setMeta(AVATAR_META_KEY, clean);

    return clean;
}

/* Back to the built-in avatar. */
export async function clearAvatarUrl() {
    const store = await dataService.getIncomeStore();

    await store.setMeta(AVATAR_META_KEY, "");
}
