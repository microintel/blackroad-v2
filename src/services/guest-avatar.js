/* =========================================================
   GUEST AVATAR  (randomuser.me portraits)
   Guests get a random person's photo instead of a cartoon.
   Only the image LINK is kept (localStorage "br_guest_avatar"),
   and it is removed when the guest signs out. Nothing is written
   to the databases, so guest mode stays read-only.

     https://randomuser.me/api/portraits/<men|women>/<0-99>.jpg
   ========================================================= */

const KEY = "br_guest_avatar";
const HOST = "randomuser.me";
const PATH = /^\/api\/portraits\/(men|women)\/\d{1,2}\.jpg$/;

/* The link if it is a plain https randomuser.me portrait, otherwise "". */
export function cleanPortraitUrl(value) {
    if (typeof value !== "string" || value.length > 120) return "";

    let url;

    try { url = new URL(value); } catch { return ""; }

    if (url.protocol !== "https:" || url.hostname !== HOST) return "";
    if (url.username || url.password || url.port || url.search || url.hash) return "";
    if (!PATH.test(url.pathname)) return "";

    return url.href;
}

/* Four different random portraits: always two men and two women, shuffled. */
export function randomPortraitSet() {
    const pick = (group, count) => {
        const used = new Set();

        while (used.size < count) used.add(Math.floor(Math.random() * 100));

        return [...used].map((n) => `https://${HOST}/api/portraits/${group}/${n}.jpg`);
    };

    const list = [...pick("men", 2), ...pick("women", 2)];

    // Fisher-Yates shuffle so the men / women land on random cards.
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [list[i], list[j]] = [list[j], list[i]];
    }

    return list;
}

export function saveGuestAvatar(url) {
    const clean = cleanPortraitUrl(url);

    try {
        if (clean) localStorage.setItem(KEY, clean);
        else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
}

export function loadGuestAvatar() {
    try {
        return cleanPortraitUrl(localStorage.getItem(KEY) || "");
    } catch {
        return "";
    }
}
