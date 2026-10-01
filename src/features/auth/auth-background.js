/* Interactive particle network for the Login and Register screens.
   Behaves like particles.js (linked dots, hover "grab" lines to the
   cursor, click to add particles) but is self-contained, so it works
   offline in this PWA with no library or network needed.
   Flat colour only: no gradients. The canvas is aria-hidden and never
   takes clicks, so it cannot affect the forms. */

const GOLD = "212, 175, 55";
const LINK_DIST = 140;
const GRAB_DIST = 190;
const MAX_PARTICLES = 160;

export function authBackground() {
    return `<div class="br-auth-bg" aria-hidden="true"><canvas class="br-auth-canvas"></canvas></div>`;
}

export function startParticles(root) {
    const canvas = root.querySelector(".br-auth-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1, raf = 0;
    let particles = [];
    const mouse = { x: null, y: null };

    const make = (x, y) => {
        const a = Math.random() * Math.PI * 2;
        const s = 0.25 + Math.random() * 0.45;
        return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + Math.random() * 1.6 };
    };

    const targetCount = () => {
        const n = Math.round((w * h) / 11000);
        return Math.max(28, Math.min(w < 700 ? 55 : 110, n));
    };

    const resize = () => {
        const rect = root.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(1, rect.width);
        h = Math.max(1, rect.height);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const want = targetCount();
        while (particles.length < want) particles.push(make(Math.random() * w, Math.random() * h));
        if (particles.length > want) particles.length = want;
    };

    const draw = (move) => {
        ctx.clearRect(0, 0, w, h);

        for (const p of particles) {
            if (move) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
                p.x = Math.min(w, Math.max(0, p.x));
                p.y = Math.min(h, Math.max(0, p.y));
            }
        }

        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < LINK_DIST) {
                    ctx.strokeStyle = `rgba(${GOLD}, ${0.28 * (1 - d / LINK_DIST)})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
            if (mouse.x !== null) {
                const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
                if (d < GRAB_DIST) {
                    ctx.strokeStyle = `rgba(${GOLD}, ${0.7 * (1 - d / GRAB_DIST)})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    ctx.stroke();
                    // gentle pull toward the cursor
                    if (move) { a.x += (mouse.x - a.x) * 0.006; a.y += (mouse.y - a.y) * 0.006; }
                }
            }
        }

        ctx.fillStyle = `rgba(${GOLD}, 0.75)`;
        for (const p of particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const loop = () => {
        if (!root.isConnected) return stop();
        draw(true);
        raf = requestAnimationFrame(loop);
    };

    const local = (e) => {
        const r = root.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
    };

    const onMove = (e) => { const p = local(e); mouse.x = p.x; mouse.y = p.y; };
    const onLeave = () => { mouse.x = null; mouse.y = null; };
    const onClick = (e) => {
        const p = local(e);
        for (let i = 0; i < 4 && particles.length < MAX_PARTICLES; i++) {
            particles.push(make(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20));
        }
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
        if (reduced) draw(false); else loop();
    });
}
