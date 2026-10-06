/* Live market chart background for the Login and Register screens.
   A thin price line with candlesticks scrolls slowly across the screen like
   a real trading chart: the newest candle ticks live at the right edge, a
   pulsing dot marks the current price and a dashed line shows the ₹ level.
   Flat colour only (no gradients, glow or blur). Self-contained canvas, works
   offline in the PWA. The canvas is aria-hidden and never takes clicks, so it
   cannot affect the forms. */

const ORANGE = "249, 115, 22";
const BASE_PRICE = 24000;
const CANDLE_MS = 1700;      // time for one new candle to scroll in
const TICK_MS = 110;         // how often the live candle ticks

export function authBackground() {
    return `<div class="br-auth-bg" aria-hidden="true"><canvas class="br-auth-canvas"></canvas></div>`;
}

export function startParticles(root) {
    const canvas = root.querySelector(".br-auth-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1, raf = 0, gap = 22;
    let candles = [];           // finished candles { o, h, l, c }
    let live = null;            // candle currently forming
    let target = 0;             // where the live candle will close
    let progress = 0;           // 0..1 scroll progress of the live candle
    let lastT = 0, tickAcc = 0, pulse = 0;
    let yMin = 0, yMax = 1;     // smoothed visible price range

    const rand = (a, b) => a + Math.random() * (b - a);
    const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
    const rgba = (a) => `rgba(${ORANGE}, ${a})`;
    const VOL = 0.0035, DRIFT = 0.0006;

    /* ---------- data ---------- */

    const nextCandle = (open) => {
        const close = open * (1 + DRIFT + randn() * VOL);
        const hi = Math.max(open, close) * (1 + Math.random() * VOL * 0.5);
        const lo = Math.min(open, close) * (1 - Math.random() * VOL * 0.5);
        return { o: open, h: hi, l: lo, c: close };
    };

    const startLive = (open) => {
        const plan = nextCandle(open);
        target = plan.c;
        live = { o: open, h: open, l: open, c: open };
    };

    const seed = () => {
        const need = Math.ceil(w / gap) + 4;
        candles = [];
        let price = BASE_PRICE * rand(0.9, 1.1);
        for (let i = 0; i < need; i++) {
            const c = nextCandle(price);
            candles.push(c);
            price = c.c;
        }
        startLive(price);
        progress = 0;
        yMin = yMax = 0;
    };

    const tick = () => {
        const noise = live.o * VOL * 0.22 * randn();
        live.c += (target - live.c) * 0.09 + noise;
        live.h = Math.max(live.h, live.c);
        live.l = Math.min(live.l, live.c);
    };

    const finishLive = () => {
        live.c = target;
        live.h = Math.max(live.h, live.c);
        live.l = Math.min(live.l, live.c);
        candles.push(live);
        const keep = Math.ceil(w / gap) + 6;
        if (candles.length > keep) candles.splice(0, candles.length - keep);
        startLive(live.c);
        progress = 0;
    };

    /* ---------- layout ---------- */

    const resize = () => {
        const rect = root.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(1, rect.width);
        h = Math.max(1, rect.height);
        gap = w < 700 ? 16 : 22;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
        if (reduced) draw(performance.now(), 0);
    };

    /* ---------- drawing ---------- */

    function draw(t, dt) {
        ctx.clearRect(0, 0, w, h);

        const headX = w * (w < 700 ? 0.78 : 0.84);
        const top = h * 0.3, bottom = h * 0.82;
        const liveX = headX + gap * (1 - progress);

        // Visible series: finished candles followed by the live one.
        const all = candles.concat(live);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < all.length; i++) {
            const x = liveX - (all.length - 1 - i) * gap;
            if (x < -gap || x > headX + gap * 2) continue;
            lo = Math.min(lo, all[i].l);
            hi = Math.max(hi, all[i].h);
        }
        if (!isFinite(lo)) { lo = live.l; hi = live.h; }
        if (yMax === yMin) { yMin = lo; yMax = hi; }
        const k = dt ? 0.03 : 1;
        yMin += (lo - yMin) * k;
        yMax += (hi - yMax) * k;
        const span = Math.max(1e-6, yMax - yMin);
        const Y = (v) => bottom - ((v - yMin) / span) * (bottom - top);
        const fade = (x) => Math.max(0, Math.min(1, x / (w * 0.22)));

        // Candlesticks (very light, they sit behind the line).
        const bodyW = Math.max(4, Math.round(gap * 0.42));
        ctx.lineWidth = 1;
        for (let i = 0; i < all.length; i++) {
            const x = Math.round(liveX - (all.length - 1 - i) * gap);
            if (x < -gap || x > headX + gap * 2) continue;
            const c = all[i];
            const a = 0.2 * fade(x);
            if (a <= 0.005) continue;
            const yo = Y(c.o), yc = Y(c.c);
            ctx.strokeStyle = rgba(a);
            ctx.beginPath();
            ctx.moveTo(x + 0.5, Y(c.h));
            ctx.lineTo(x + 0.5, Y(c.l));
            ctx.stroke();
            const by = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
            if (c.c >= c.o) {
                ctx.fillStyle = rgba(a);
                ctx.fillRect(x - bodyW / 2, by, bodyW, bh);
            } else {
                ctx.strokeRect(x - bodyW / 2 + 0.5, by + 0.5, bodyW - 1, Math.max(0, bh - 1));
            }
        }

        // Price line through the closes, drawn in short segments so it fades in from the left.
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (let i = 1; i < all.length; i++) {
            const x1 = liveX - (all.length - 1 - i) * gap;
            const x0 = x1 - gap;
            if (x1 < 0 || x0 > headX + gap * 2) continue;
            ctx.strokeStyle = rgba(0.6 * fade(x1));
            ctx.beginPath();
            ctx.moveTo(x0, Y(all[i - 1].c));
            ctx.lineTo(x1, Y(all[i].c));
            ctx.stroke();
        }

        // Current price: dashed level, pulsing dot and ₹ label.
        const py = Y(live.c);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = rgba(0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(liveX + 8, Math.round(py) + 0.5);
        ctx.lineTo(w, Math.round(py) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        pulse = (pulse + dt / 1600) % 1;
        const ring = reduced ? 0 : pulse;
        ctx.strokeStyle = rgba(0.5 * (1 - ring));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(liveX, py, 4 + ring * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = rgba(0.95);
        ctx.beginPath();
        ctx.arc(liveX, py, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(0.6);
        ctx.font = "500 11px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText("₹" + live.c.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), w - 10, Math.round(py) - 6);
    }

    const loop = (t) => {
        if (!root.isConnected) return stop();
        const dt = Math.min(50, lastT ? t - lastT : 16);
        lastT = t;
        tickAcc += dt;
        while (tickAcc >= TICK_MS) { tickAcc -= TICK_MS; tick(); }
        progress += dt / CANDLE_MS;
        if (progress >= 1) finishLive();
        draw(t, dt);
        raf = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
        cancelAnimationFrame(raf);
        lastT = 0;
        if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    function stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibility);
    }

    // Wait a frame so the element has its real size.
    requestAnimationFrame(() => {
        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", onVisibility);
        if (!reduced) raf = requestAnimationFrame(loop);
    });
}
