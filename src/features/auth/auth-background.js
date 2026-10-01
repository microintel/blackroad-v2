/* Financial "box" background for the Login and Register screens.
   - A square-cell grid (like a trading terminal / ledger) where random
     cells light up slowly and the cell under the cursor/finger glows.
   - Floating boxed finance particles: currency tiles (₹ $ € £ ¥ % ₿),
     candlesticks and mini bar charts that drift upward like a rising market.
   Self-contained canvas, works offline in the PWA, flat colour only (no
   gradients, glow or blur). The canvas is aria-hidden and never takes
   clicks, so it cannot affect the forms. */

const ORANGE = "249, 115, 22";
const GLYPHS = ["₹", "$", "€", "£", "¥", "%", "₹", "$", "₿", "+"];
const REPEL_DIST = 130;
const MAX_PARTICLES = 40;

export function authBackground() {
    return `<div class="br-auth-bg" aria-hidden="true"><canvas class="br-auth-canvas"></canvas></div>`;
}

export function startParticles(root) {
    const canvas = root.querySelector(".br-auth-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1, raf = 0, cell = 56;
    let particles = [];
    let lit = [];
    const mouse = { x: null, y: null };

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const rgba = (a) => `rgba(${ORANGE}, ${a})`;

    /* ---------- particles ---------- */

    const make = (x, y) => {
        const roll = Math.random();
        const type = roll < 0.45 ? "glyph" : roll < 0.75 ? "candle" : "bars";
        const depth = rand(0.65, 1.15);
        const p = {
            type, x, y, depth,
            vx: rand(-0.12, 0.12),
            vy: -rand(0.1, 0.34) * depth,
            a: rand(0.4, 0.8),
            boost: 0,
            ph: Math.random() * Math.PI * 2
        };
        if (type === "glyph") {
            p.size = Math.round(rand(26, 38) * depth);
            p.glyph = pick(GLYPHS);
        } else if (type === "candle") {
            p.bw = Math.round(rand(10, 15) * depth);
            p.body = Math.round(rand(16, 34) * depth);
            p.wickUp = Math.round(rand(6, 14) * depth);
            p.wickDn = Math.round(rand(6, 14) * depth);
            p.up = Math.random() < 0.6;
        } else {
            p.size = Math.round(rand(30, 42) * depth);
            p.bars = Array.from({ length: 4 }, () => rand(0.25, 1));
        }
        return p;
    };

    const extent = (p) => (p.type === "candle" ? p.body + p.wickUp + p.wickDn : p.size * 1.3) + 12;

    const targetCount = () => {
        const n = Math.round((w * h) / 38000);
        return Math.max(10, Math.min(w < 700 ? 16 : 30, n));
    };

    /* ---------- lit grid cells ---------- */

    const newLit = (t, scatter) => {
        const cols = Math.max(1, Math.ceil(w / cell));
        const rows = Math.max(1, Math.ceil(h / cell));
        const dur = rand(3500, 8000);
        return {
            c: Math.floor(Math.random() * cols),
            r: Math.floor(Math.random() * rows),
            dur,
            t0: scatter ? t - Math.random() * dur : t,
            max: rand(0.07, 0.2)
        };
    };

    const resize = () => {
        const rect = root.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(1, rect.width);
        h = Math.max(1, rect.height);
        cell = w < 700 ? 40 : 56;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const want = targetCount();
        while (particles.length < want) particles.push(make(Math.random() * w, Math.random() * h));
        if (particles.length > want) particles.length = want;

        const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
        const litWant = Math.max(6, Math.min(36, Math.round((cols * rows) / 15)));
        const now = performance.now();
        lit = Array.from({ length: litWant }, () => newLit(now, true));

        if (reduced) draw(now, false);
    };

    /* ---------- drawing ---------- */

    const drawGrid = () => {
        ctx.strokeStyle = rgba(0.07);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += cell) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
        for (let y = 0; y <= h; y += cell) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
        ctx.stroke();
    };

    const drawLit = (t) => {
        for (const L of lit) {
            let prog = (t - L.t0) / L.dur;
            if (prog >= 1) { Object.assign(L, newLit(t, false)); prog = 0; }
            const a = Math.sin(Math.PI * Math.max(0, prog)) * L.max;
            ctx.fillStyle = rgba(a);
            ctx.fillRect(L.c * cell + 1, L.r * cell + 1, cell - 1, cell - 1);
        }
    };

    const drawCursor = () => {
        if (mouse.x === null) return;
        const c = Math.floor(mouse.x / cell), r = Math.floor(mouse.y / cell);
        for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
                const near = dc === 0 && dr === 0;
                ctx.fillStyle = rgba(near ? 0.2 : 0.06);
                ctx.fillRect((c + dc) * cell + 1, (r + dr) * cell + 1, cell - 1, cell - 1);
            }
        }
        ctx.strokeStyle = rgba(0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(c * cell + 0.5, r * cell + 0.5, cell, cell);
    };

    const box = (x, y, bw, bh, a) => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = rgba(0.55 * a);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    };

    const drawParticle = (p) => {
        const a = Math.min(1, p.a + p.boost);
        const x = Math.round(p.x + Math.sin(p.ph) * 4);
        const y = Math.round(p.y);

        if (p.type === "glyph") {
            const s = p.size;
            box(x - s / 2, y - s / 2, s, s, a);
            ctx.fillStyle = rgba(0.95 * a);
            ctx.font = `600 ${Math.round(s * 0.55)}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.glyph, x, y + 1);
        } else if (p.type === "candle") {
            const top = y - p.body / 2;
            ctx.strokeStyle = rgba(0.8 * a);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, top - p.wickUp);
            ctx.lineTo(x, top + p.body + p.wickDn);
            ctx.stroke();
            if (p.up) {
                ctx.fillStyle = rgba(0.85 * a);
                ctx.fillRect(x - p.bw / 2, top, p.bw, p.body);
            } else {
                ctx.fillStyle = "#000";
                ctx.fillRect(x - p.bw / 2, top, p.bw, p.body);
                ctx.strokeRect(x - p.bw / 2 + 0.5, top + 0.5, p.bw - 1, p.body - 1);
            }
        } else {
            const bw = p.size * 1.2, bh = p.size;
            box(x - bw / 2, y - bh / 2, bw, bh, a);
            const pad = 6, gap = 3;
            const n = p.bars.length;
            const barW = (bw - pad * 2 - gap * (n - 1)) / n;
            ctx.fillStyle = rgba(0.85 * a);
            p.bars.forEach((v, i) => {
                const barH = (bh - pad * 2) * v;
                ctx.fillRect(x - bw / 2 + pad + i * (barW + gap), y + bh / 2 - pad - barH, barW, barH);
            });
        }
    };

    const step = () => {
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.ph += 0.01;

            if (mouse.x !== null) {
                const dx = p.x - mouse.x, dy = p.y - mouse.y;
                const d = Math.hypot(dx, dy);
                if (d < REPEL_DIST && d > 0.1) {
                    const k = 1 - d / REPEL_DIST;
                    p.x += (dx / d) * 0.9 * k;
                    p.y += (dy / d) * 0.9 * k;
                    p.boost = Math.max(p.boost, 0.35 * k);
                }
            }
            p.boost *= 0.94;

            const m = extent(p);
            if (p.y < -m) { p.y = h + m; p.x = Math.random() * w; }
            if (p.y > h + m * 2) p.y = -m;
            if (p.x < -m) p.x = w + m;
            if (p.x > w + m) p.x = -m;
        }
    };

    function draw(t, move) {
        ctx.clearRect(0, 0, w, h);
        drawGrid();
        drawLit(t);
        drawCursor();
        if (move) step();
        for (const p of particles) drawParticle(p);
    }

    const loop = (t) => {
        if (!root.isConnected) return stop();
        draw(t, true);
        raf = requestAnimationFrame(loop);
    };

    /* ---------- input ---------- */

    const local = (e) => {
        const r = root.getBoundingClientRect();
        const pt = e.touches ? e.touches[0] : e;
        return { x: pt.clientX - r.left, y: pt.clientY - r.top };
    };

    const onMove = (e) => { const p = local(e); mouse.x = p.x; mouse.y = p.y; };
    const onLeave = () => { mouse.x = null; mouse.y = null; };
    const onClick = (e) => {
        // Clicks on the form itself should not spawn anything.
        if (e.target.closest && e.target.closest(".br-auth-card")) return;
        const p = local(e);
        for (let i = 0; i < 2 && particles.length < MAX_PARTICLES; i++) {
            particles.push(make(p.x + rand(-16, 16), p.y + rand(-16, 16)));
        }
        const now = performance.now();
        lit.push({ c: Math.floor(p.x / cell), r: Math.floor(p.y / cell), t0: now, dur: 1400, max: 0.35 });
        if (lit.length > 60) lit.splice(0, lit.length - 60);
    };
    const onVisibility = () => {
        cancelAnimationFrame(raf);
        if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    function stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onLeave);
        document.removeEventListener("mouseleave", onLeave);
        window.removeEventListener("click", onClick);
        document.removeEventListener("visibilitychange", onVisibility);
    }

    // Wait a frame so the element has its real size.
    requestAnimationFrame(() => {
        resize();
        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onLeave);
        document.addEventListener("mouseleave", onLeave);
        window.addEventListener("click", onClick);
        document.addEventListener("visibilitychange", onVisibility);
        if (reduced) draw(performance.now(), false); else raf = requestAnimationFrame(loop);
    });
}
