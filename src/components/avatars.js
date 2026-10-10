/* =========================================================
   PROFILE AVATARS
   Small friendly cartoon faces drawn as inline SVG, so there are
   no image files to load. The look (background, skin, hair, shirt)
   is picked from a hash of the seed (the person's email), so the
   same person always gets the same avatar everywhere.
   ========================================================= */

const BACKGROUNDS = ["#FDE68A", "#BFDBFE", "#BBF7D0", "#FBCFE8", "#DDD6FE", "#FED7AA", "#A5F3FC", "#FECACA"];
const SKINS = ["#F5D0B0", "#E8B58F", "#D39A72", "#B87A55", "#8D5A3C", "#6B4128"];
const HAIRS = ["#1F2937", "#3B2314", "#6B3F1D", "#B45309", "#9CA3AF", "#111827"];
const SHIRTS = ["#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#EF4444", "#14B8A6"];

function hash(text) {
    let h = 2166136261;
    const s = String(text || "blackroad");

    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
}

/* Hair drawn behind (back) and in front of (front) the face. */
function hair(style, color) {
    switch (style) {
        case 0: // short
            return {
                back: "",
                front: `<path d="M26 40c0-14 10-22 24-22s24 8 24 22c-6-8-14-11-24-11s-18 3-24 11z" fill="${color}"/>`
            };
        case 1: // long
            return {
                back: `<path d="M24 42c0-16 11-25 26-25s26 9 26 25v30H24z" fill="${color}"/>`,
                front: `<path d="M28 40c4-8 12-12 22-12s18 4 22 12c-6-4-14-6-22-6s-16 2-22 6z" fill="${color}"/>`
            };
        case 2: // bun
            return {
                back: `<circle cx="50" cy="14" r="9" fill="${color}"/>`,
                front: `<path d="M26 42c0-14 10-22 24-22s24 8 24 22c-7-9-15-12-24-12s-17 3-24 12z" fill="${color}"/>`
            };
        case 3: // curly
            return {
                back: "",
                front: `<g fill="${color}"><circle cx="30" cy="34" r="9"/><circle cx="42" cy="26" r="10"/><circle cx="58" cy="26" r="10"/><circle cx="70" cy="34" r="9"/></g>`
            };
        default: // bald
            return { back: "", front: "" };
    }
}

export function avatarSVG(seed, { size } = {}) {
    const h = hash(seed);
    const pick = (list, shift) => list[(h >>> shift) % list.length];

    const bg = pick(BACKGROUNDS, 0);
    const skin = pick(SKINS, 3);
    const hairColor = pick(HAIRS, 6);
    const shirt = pick(SHIRTS, 9);
    const style = (h >>> 12) % 5;
    const smile = (h >>> 15) % 2 === 0;
    const glasses = (h >>> 17) % 3 === 0;
    const id = "av" + (h % 100000);
    const { back, front } = hair(style, hairColor);

    const dim = size ? ` width="${size}" height="${size}"` : "";

    return `<svg class="br-avatar-img" viewBox="0 0 100 100"${dim} role="img" aria-hidden="true" focusable="false">
        <defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
        <g clip-path="url(#${id})">
            <rect width="100" height="100" fill="${bg}"/>
            ${back}
            <path d="M14 100c0-18 16-28 36-28s36 10 36 28z" fill="${shirt}"/>
            <rect x="43" y="58" width="14" height="16" rx="6" fill="${skin}"/>
            <ellipse cx="50" cy="46" rx="21" ry="24" fill="${skin}"/>
            ${front}
            <circle cx="42" cy="46" r="2.4" fill="#1F2937"/>
            <circle cx="58" cy="46" r="2.4" fill="#1F2937"/>
            ${glasses ? `<g fill="none" stroke="#1F2937" stroke-width="1.6"><circle cx="42" cy="46" r="6"/><circle cx="58" cy="46" r="6"/><path d="M48 46h4"/></g>` : ""}
            ${smile
                ? `<path d="M43 56c3 4 11 4 14 0" fill="none" stroke="#7C2D12" stroke-width="2" stroke-linecap="round"/>`
                : `<path d="M44 57h12" stroke="#7C2D12" stroke-width="2" stroke-linecap="round"/>`}
        </g>
    </svg>`;
}

/* =========================================================
   DICEBEAR AVATAR (image link)
   avatarMarkup() shows the user's saved DiceBear URL when there is
   one, otherwise the built-in avatar above. If the image cannot load
   (offline, blocked) it swaps itself for the built-in avatar.
   ========================================================= */

const escapeAttr = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

let fallbackBound = false;

/* "error" does not bubble, so listen once in the capture phase. */
function bindFallback() {
    if (fallbackBound || typeof document === "undefined") return;

    fallbackBound = true;

    document.addEventListener("error", (event) => {
        const img = event.target;

        if (!img || img.tagName !== "IMG" || !img.classList.contains("br-avatar-img")) return;
        if (img.dataset.fallbackSeed === undefined) return;

        const holder = document.createElement("template");

        holder.innerHTML = avatarSVG(img.dataset.fallbackSeed);

        const svg = holder.content.firstElementChild;

        if (svg) img.replaceWith(svg);
    }, true);
}

export function avatarImg(url, fallbackSeed) {
    bindFallback();

    return `<img class="br-avatar-img" src="${escapeAttr(url)}" alt="" data-fallback-seed="${escapeAttr(fallbackSeed || "")}" referrerpolicy="no-referrer" decoding="async" draggable="false">`;
}

export function avatarMarkup(url, seed) {
    return url ? avatarImg(url, seed) : avatarSVG(seed);
}
