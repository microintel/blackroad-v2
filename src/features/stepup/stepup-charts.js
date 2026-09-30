/* =========================================================
   STEPUP — CHARTS
   Small dependency-free canvas line chart (no CDN, so it works
   offline in the PWA). Replaces Chart.js from the old app for:
     - Portfolio value vs invested
     - Fund performance history (growth of ₹100)
     - Fund projection (best / average / worst year)
     - Path to target corpus
   Series: { name, color, dashed?, fill?, points: [{ x: "YYYY-MM-DD", y }] }
   ========================================================= */

const registry = new WeakMap();

function css(name, fallback) {
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return v || fallback;
}

const toMs = (iso) => new Date(iso + "T00:00:00").getTime();

function niceTicks(min, max, count = 4) {
    if (min === max) {
        max = min + 1;
    }
    const step0 = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const start = Math.floor(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 0.5; v += step) ticks.push(v);
    return ticks;
}

function downsample(points, limit = 700) {
    if (points.length <= limit) return points;
    const step = points.length / limit;
    const out = [];
    for (let i = 0; i < limit; i++) out.push(points[Math.floor(i * step)]);
    out.push(points[points.length - 1]);
    return out;
}

const fmtAxis = (n) => {
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
    if (a >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n * 100) / 100);
};

const fmtDate = (ms, spanMs) => {
    const d = new Date(ms);
    return spanMs > 1000 * 60 * 60 * 24 * 900
        ? String(d.getFullYear())
        : d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

/*
 * opts: { series, yFormat?, goal?: number, height? }
 */
export function drawChart(canvas, opts) {
    if (!canvas) return;

    const prev = registry.get(canvas);
    if (prev) prev.destroy();

    const series = opts.series
        .map((s) => ({
            ...s,
            pts: downsample(s.points).map((p) => ({ t: toMs(p.x), x: p.x, y: p.y }))
        }))
        .filter((s) => s.pts.length);

    if (!series.length) return;

    const yFormat = opts.yFormat || fmtAxis;
    let hover = null;

    const all = series.flatMap((s) => s.pts);
    let tMin = Math.min(...all.map((p) => p.t));
    let tMax = Math.max(...all.map((p) => p.t));
    let yMin = Math.min(...all.map((p) => p.y));
    let yMax = Math.max(...all.map((p) => p.y));

    if (opts.goal != null) {
        yMax = Math.max(yMax, opts.goal);
    }
    if (opts.zeroBase) yMin = Math.min(0, yMin);

    const ticks = niceTicks(yMin, yMax);
    yMin = Math.min(yMin, ticks[0]);
    yMax = Math.max(yMax, ticks[ticks.length - 1]);
    if (tMax === tMin) tMax = tMin + 86400000;

    function draw() {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 600;
        const h = opts.height || canvas.clientHeight || 260;

        canvas.width = w * dpr;
        canvas.height = h * dpr;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const muted = css("--br-text-muted", "#737373");
        const grid = css("--br-hairline", "#171717");
        const bg = css("--br-surface", "#0A0A0A");
        const text = css("--br-text", "#F5F5F5");

        const padL = 48, padR = 12, padT = 10, padB = 24;
        const cw = w - padL - padR;
        const ch = h - padT - padB;

        const X = (t) => padL + ((t - tMin) / (tMax - tMin)) * cw;
        const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * ch;

        ctx.font = "11px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";

        ticks.forEach((v) => {
            const y = Y(v);
            ctx.strokeStyle = grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);
            ctx.stroke();
            ctx.fillStyle = muted;
            ctx.fillText(yFormat(v), padL - 6, y);
        });

        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (let i = 0; i <= 4; i++) {
            const t = tMin + ((tMax - tMin) * i) / 4;
            ctx.fillStyle = muted;
            ctx.fillText(fmtDate(t, tMax - tMin), X(t), h - padB + 6);
        }

        if (opts.goal != null) {
            const y = Y(opts.goal);
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "#D4AF37";
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = "#D4AF37";
            ctx.textAlign = "left";
            ctx.fillText("Goal", padL + 4, y - 9);
        }

        series.forEach((s) => {
            ctx.save();
            ctx.beginPath();
            s.pts.forEach((p, i) =>
                i ? ctx.lineTo(X(p.t), Y(p.y)) : ctx.moveTo(X(p.t), Y(p.y))
            );
            if (s.fill) {
                ctx.lineTo(X(s.pts[s.pts.length - 1].t), Y(yMin));
                ctx.lineTo(X(s.pts[0].t), Y(yMin));
                ctx.closePath();
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = s.color;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.beginPath();
                s.pts.forEach((p, i) =>
                    i ? ctx.lineTo(X(p.t), Y(p.y)) : ctx.moveTo(X(p.t), Y(p.y))
                );
            }
            ctx.lineWidth = s.width || 2;
            ctx.lineJoin = "round";
            ctx.strokeStyle = s.color;
            if (s.dashed) ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.restore();
        });

        if (hover != null) {
            const t = hover;
            const x = X(t);

            ctx.strokeStyle = muted;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + ch);
            ctx.stroke();

            const rows = [];
            series.forEach((s) => {
                let best = null;
                for (const p of s.pts) {
                    if (best === null || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
                }
                if (best && Math.abs(best.t - t) < (tMax - tMin) / 8) {
                    rows.push({ s, p: best });
                    ctx.fillStyle = s.color;
                    ctx.beginPath();
                    ctx.arc(X(best.t), Y(best.y), 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            if (rows.length) {
                const lines = [
                    new Date(rows[0].p.t).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric"
                    }),
                    ...rows.map((r) => `${r.s.name}: ${yFormat(r.p.y)}`)
                ];
                ctx.font = "12px system-ui, sans-serif";
                const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
                const bh = lines.length * 16 + 10;
                let bx = x + 10;
                if (bx + bw > w - 4) bx = x - bw - 10;
                const by = padT + 4;

                ctx.fillStyle = bg;
                ctx.strokeStyle = grid;
                ctx.lineWidth = 1;
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeRect(bx, by, bw, bh);

                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                lines.forEach((l, i) => {
                    ctx.fillStyle = i ? text : muted;
                    ctx.fillText(l, bx + 8, by + 13 + i * 16);
                });
            }
        }
    }

    function pointer(e) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const padL = 48, padR = 12;
        const ratio = (cx - padL) / (rect.width - padL - padR);
        hover = tMin + Math.min(1, Math.max(0, ratio)) * (tMax - tMin);
        draw();
    }

    function leave() {
        hover = null;
        draw();
    }

    canvas.addEventListener("mousemove", pointer);
    canvas.addEventListener("mouseleave", leave);
    canvas.addEventListener("touchstart", pointer, { passive: true });
    canvas.addEventListener("touchmove", pointer, { passive: true });
    canvas.addEventListener("touchend", leave);

    const ro = new ResizeObserver(draw);
    ro.observe(canvas);

    registry.set(canvas, {
        destroy() {
            ro.disconnect();
            canvas.removeEventListener("mousemove", pointer);
            canvas.removeEventListener("mouseleave", leave);
            canvas.removeEventListener("touchstart", pointer);
            canvas.removeEventListener("touchmove", pointer);
            canvas.removeEventListener("touchend", leave);
        }
    });

    draw();
}
