/* =========================================================
   BRAND LOGO  (assets/brand/blackroad-app-icon.png)
   jsPDF and the print layout cannot use CSS backgrounds, so this
   turns the BlackRoad app icon (black rounded tile, white bar,
   green up arrow, red down arrow) into a PNG data URL of the
   size asked for. Purely presentational: it never touches app
   data. If the image cannot be read, every function resolves to
   null and the report is simply produced without the logo.

       const logo = await brandLogoPNG({ size: 192, tile: true });
       if (logo) doc.addImage(logo.dataUrl, "PNG", x, y, w, h);

   The icon already carries its own black tile, so it reads on
   white pages and on dark banners alike. `tile` is kept so
   existing callers keep working; the result is always square.

   brandSymbolSVG() returns the inline symbol used by the loading
   animations (the bar follows the theme text colour so it shows
   on both light and dark surfaces).
   ========================================================= */

export const BRAND_LOGO_SRC = new URL("../../assets/brand/blackroad-app-icon.png", import.meta.url).href;

/* The full logo (symbol + "BlackRoad" wordmark), trimmed, transparent background.
   light = dark wordmark for white pages; dark = white wordmark for dark banners. */
export const BRAND_LOCKUP_LIGHT_SRC = new URL("../../assets/brand/blackroad-lockup-light.png", import.meta.url).href;
export const BRAND_LOCKUP_DARK_SRC = new URL("../../assets/brand/blackroad-lockup-dark.png", import.meta.url).href;

let imagePromise = null;
const cache = new Map();

function loadImage() {
    if (!imagePromise) {
        imagePromise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = BRAND_LOGO_SRC;
        });
    }
    return imagePromise;
}

/* Resolves { dataUrl, width, height } (pixels) or null. */
export async function brandLogoPNG({ size = 192, tile = true } = {}) {
    const key = String(size) + (tile ? "t" : "n");
    if (cache.has(key)) return cache.get(key);

    const job = (async () => {
        try {
            const img = await loadImage();
            if (!img) return null;

            const c = document.createElement("canvas");
            c.width = size; c.height = size;
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, size, size);

            return { dataUrl: c.toDataURL("image/png"), width: size, height: size };
        } catch (e) {
            return null;
        }
    })();

    cache.set(key, job);
    return job;
}

/* Resolves { dataUrl, width, height } (pixels) or null.
   The lockup is wide (about 4.6 : 1); use width/height to keep its proportions:
       const lk = await brandLockupPNG({ onDark: true, width: 900 });
       if (lk) doc.addImage(lk.dataUrl, "PNG", x, y, h * lk.width / lk.height, h);
   onDark: false -> dark wordmark (white pages); true -> white wordmark (dark banners). */
export async function brandLockupPNG({ onDark = false, width = 800 } = {}) {
    const key = "lockup" + (onDark ? "d" : "l") + width;
    if (cache.has(key)) return cache.get(key);

    const job = (async () => {
        try {
            const img = await new Promise((resolve) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => resolve(null);
                i.src = onDark ? BRAND_LOCKUP_DARK_SRC : BRAND_LOCKUP_LIGHT_SRC;
            });
            if (!img) return null;

            const w = width;
            const h = Math.round(width * (img.naturalHeight / img.naturalWidth));
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, w, h);

            return { dataUrl: c.toDataURL("image/png"), width: w, height: h };
        } catch (e) {
            return null;
        }
    })();

    cache.set(key, job);
    return job;
}

/* The BlackRoad symbol as inline SVG (same geometry as assets/brand/blackroad-symbol.svg).
   Classes let brand.css colour the bar and animate the two arrows. */
export function brandSymbolSVG(cls = "") {
    return `<svg class="br-symbol ${cls}" viewBox="0 0 56 56" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="6" aria-hidden="true" focusable="false">
        <path class="br-sym-base" d="M2 28H18"/>
        <g class="br-sym-up"><path d="M18 28L40 12" stroke="#12A150"/><polygon points="52,4 36,6 50,20" fill="#12A150" stroke="#12A150" stroke-width="2"/></g>
        <g class="br-sym-down"><path d="M18 28L40 44" stroke="#E02D3C"/><polygon points="52,52 36,50 50,36" fill="#E02D3C" stroke="#E02D3C" stroke-width="2"/></g>
    </svg>`;
}
