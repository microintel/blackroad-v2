/* =========================================================
   BRAND LOGO  (blackroad.png in the project root)
   jsPDF and the print layout cannot use CSS backgrounds, so this
   turns blackroad.png into a small, tightly cropped PNG data URL.
   Purely presentational: it never touches app data. If the image
   cannot be read, every function resolves to null and the report
   is simply produced without the logo.

       const logo = await brandLogoPNG({ size: 192, tile: true });
       if (logo) doc.addImage(logo.dataUrl, "PNG", x, y, w, h);

   tile: true   -> square, black rounded tile (use on white pages)
   tile: false  -> transparent, tight crop (use on dark banners)
   ========================================================= */

export const BRAND_LOGO_SRC = new URL("../../blackroad.png", import.meta.url).href;

let imagePromise = null;
let boxPromise = null;
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

/* The PNG has empty margin around the mark: find where the mark really is. */
function markBox(img) {
    if (!boxPromise) {
        boxPromise = Promise.resolve().then(() => {
            const w = img.naturalWidth, h = img.naturalHeight;
            const full = { x: 0, y: 0, w, h };
            try {
                const c = document.createElement("canvas");
                c.width = w; c.height = h;
                const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, w, h).data;
                let x0 = w, y0 = h, x1 = -1, y1 = -1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        if (data[(y * w + x) * 4 + 3] > 8) {
                            if (x < x0) x0 = x;
                            if (x > x1) x1 = x;
                            if (y < y0) y0 = y;
                            if (y > y1) y1 = y;
                        }
                    }
                }
                return x1 < 0 ? full : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
            } catch (e) {
                return full;   /* canvas blocked: use the whole image */
            }
        });
    }
    return boxPromise;
}

/* Resolves { dataUrl, width, height } (pixels) or null. */
export async function brandLogoPNG({ size = 192, tile = true } = {}) {
    const key = size + (tile ? "t" : "n");
    if (cache.has(key)) return cache.get(key);

    const job = (async () => {
        try {
            const img = await loadImage();
            if (!img) return null;
            const box = await markBox(img);

            const fill = tile ? 0.66 : 1;                 /* share of the tile the mark fills */
            const scale = (size * fill) / Math.max(box.w, box.h);
            const dw = Math.round(box.w * scale), dh = Math.round(box.h * scale);
            const cw = tile ? size : dw, ch = tile ? size : dh;

            const c = document.createElement("canvas");
            c.width = cw; c.height = ch;
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";

            if (tile) {
                const r = size * 0.22;
                ctx.fillStyle = "#000000";
                ctx.beginPath();
                ctx.moveTo(r, 0);
                ctx.arcTo(size, 0, size, size, r);
                ctx.arcTo(size, size, 0, size, r);
                ctx.arcTo(0, size, 0, 0, r);
                ctx.arcTo(0, 0, size, 0, r);
                ctx.closePath();
                ctx.fill();
            }
            ctx.drawImage(img, box.x, box.y, box.w, box.h,
                (cw - dw) / 2, (ch - dh) / 2, dw, dh);

            return { dataUrl: c.toDataURL("image/png"), width: cw, height: ch };
        } catch (e) {
            return null;
        }
    })();

    cache.set(key, job);
    return job;
}
