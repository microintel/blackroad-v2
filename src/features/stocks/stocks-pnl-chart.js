/*
 * stocks-pnl-chart.js
 *
 * Zoomable line graph of profit & loss over time for the Stocks
 * Analytics tab.
 *
 *  - One point per trading day, in order, from the first transaction
 *    to the last, plus a final "Now" point valued at current prices.
 *  - Between orders, open positions are valued at their last traded
 *    price (the same average-cost maths the rest of the module uses).
 *  - Zoom: mouse wheel / trackpad pinch / two-finger pinch / +/- buttons.
 *    Pan: drag. Reset: double-click / double-tap or the Reset button.
 *    Hover or tap shows the exact figures and the orders of that day.
 *
 * Read-only: never writes anything, never touches stored data.
 */

import {
    calculatePortfolioTotals,
    fmtMoney,
    fmtSigned,
    fmtDate,
    pnlClass,
    round2,
    getTxnPnLMap
} from "./stocks-service.js";

const DAY = 86400000;
const HEIGHT = 280;
const PAD_T = 14;
const PAD_B = 28;
const PAD_R = 14;

const RANGES = [
    { key: "all", label: "All", days: 0 },
    { key: "1y", label: "1Y", days: 365 },
    { key: "6m", label: "6M", days: 183 },
    { key: "3m", label: "3M", days: 91 },
    { key: "1m", label: "1M", days: 30 }
];

function esc(s) {
    return String(s ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

/* =========================================
   DATA
========================================= */

function dayStart(date) {
    return new Date(date + "T00:00:00").getTime();
}

function buildSeries(transactions, prices, realizedOnly) {
    if (!transactions.length) return [];

    const sorted = transactions.slice().sort((a, b) =>
        a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1
    );

    const pos = {};
    let realized = 0;
    const days = [];
    let cur = null;

    for (const t of sorted) {
        const prevRealized = realized;
        const p = pos[t.symbol] || (pos[t.symbol] = { qty: 0, cost: 0, last: t.price });

        if (t.type === "BUY") {
            p.cost = round2(p.cost + t.quantity * t.price);
            p.qty = Math.round((p.qty + t.quantity) * 1e6) / 1e6;
        } else {
            const q = Math.min(t.quantity, p.qty);
            const avg = p.qty > 0 ? p.cost / p.qty : 0;
            const basis = round2(avg * q);
            realized = round2(realized + q * t.price - basis);
            p.cost = round2(p.cost - basis);
            p.qty = Math.round((p.qty - q) * 1e6) / 1e6;
        }
        p.last = t.price;

        let unrealized = 0;
        for (const k in pos) {
            if (pos[k].qty > 0) unrealized += pos[k].qty * pos[k].last - pos[k].cost;
        }
        unrealized = round2(unrealized);

        const order = `${t.type} ${t.quantity} ${t.symbol} @ ${fmtMoney(t.price)}`;
        const isSell = t.type === "SELL";

        if (cur && cur.date === t.date) {
            cur.realized = realized;
            cur.unrealized = unrealized;
            cur.total = round2(realized + unrealized);
            if (!realizedOnly || isSell) cur.orders.push(order);
            cur.delta = round2(realized - cur.startRealized);
            if (isSell) cur.hasSell = true;
        } else {
            cur = {
                date: t.date,
                t: dayStart(t.date),
                realized,
                unrealized,
                total: round2(realized + unrealized),
                orders: !realizedOnly || isSell ? [order] : [],
                startRealized: prevRealized,
                delta: round2(realized - prevRealized),
                hasSell: isSell,
                now: false
            };
            days.push(cur);
        }
    }

    // Final point: today's value at current prices (matches the summary cards)
    const totals = calculatePortfolioTotals(transactions, prices);
    const lastT = days[days.length - 1].t;
    const nowT = Math.max(Math.floor(Date.now() / 60000) * 60000, lastT + 60000);

    days.push({
        date: new Date(nowT).toISOString().slice(0, 10),
        t: nowT,
        realized: totals.realizedPnL,
        unrealized: totals.unrealizedPnL,
        total: totals.totalPnL,
        orders: [],
        delta: 0,
        hasSell: false,
        now: true
    });

    // Realized view: the first day (starting at 0), every day with a sale, and Now
    if (realizedOnly) {
        return days.filter((d, i) => i === 0 || d.hasSell || d.now);
    }

    return days;
}

// One point per SELL: that sale's own realized P&L, oldest to newest.
// Several sales on the same day are spread across that day so none overlap.
function buildSellSeries(transactions) {
    const pnl = getTxnPnLMap(transactions);
    const sells = transactions
        .filter((t) => t.type === "SELL" && Number.isFinite(pnl[t.id]))
        .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));

    const perDay = {};
    sells.forEach((t) => (perDay[t.date] = (perDay[t.date] || 0) + 1));
    const seen = {};
    let running = 0;

    return sells.map((t) => {
        const i = (seen[t.date] = (seen[t.date] || 0) + 1) - 1;
        const v = pnl[t.id];
        running = round2(running + v);
        return {
            date: t.date,
            t: dayStart(t.date) + (i / perDay[t.date]) * DAY * 0.8,
            tDate: dayStart(t.date) + (i / perDay[t.date]) * DAY * 0.8,
            realized: v,
            unrealized: 0,
            total: v,
            running,
            orders: [`SELL ${t.quantity} ${t.symbol} @ ${fmtMoney(t.price)}`],
            now: false
        };
    });
}

/* =========================================
   SCALES
========================================= */

function niceTicks(min, max, n = 5) {
    const span = max - min;
    if (!(span > 0)) return [min];
    const raw = span / (n - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
        out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    }
    return out;
}

function fmtTick(t, span) {
    const d = new Date(t);
    if (span < 2 * DAY) {
        return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    if (span > 500 * DAY) {
        return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    }
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/*
 * Smooth curve through every point (monotone cubic / Fritsch-Carlson).
 * It passes exactly through each real value and never overshoots
 * between two points, so the curve can't show a gain or loss that
 * isn't in the data.
 */
function smoothPath(xy) {
    const n = xy.length;
    const f = (v) => v.toFixed(2);
    const straight = () => xy.map(([px, py], i) => `${i ? "L" : "M"}${f(px)},${f(py)}`).join("");

    if (n < 3) return straight();

    const dx = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) {
        const d = xy[i + 1][0] - xy[i][0];
        if (!(d > 0)) return straight();
        dx.push(d);
        m.push((xy[i + 1][1] - xy[i][1]) / d);
    }

    const tan = new Array(n);
    tan[0] = m[0];
    tan[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
        if (m[i - 1] * m[i] <= 0) {
            tan[i] = 0;
        } else {
            const w1 = 2 * dx[i] + dx[i - 1];
            const w2 = dx[i] + 2 * dx[i - 1];
            tan[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
        }
    }

    let d = `M${f(xy[0][0])},${f(xy[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = xy[i];
        const [x1, y1] = xy[i + 1];
        const h = dx[i] / 3;
        d += `C${f(x0 + h)},${f(y0 + tan[i] * h)},${f(x1 - h)},${f(y1 - tan[i + 1] * h)},${f(x1)},${f(y1)}`;
    }
    return d;
}

/* =========================================
   CHART
========================================= */

let chartSeq = 0;

export function createPnlChart(host, opts = {}) {
    const realizedOnly = opts.kind === "realized";
    const uid = "stk-pnl-" + ++chartSeq;
    host.innerHTML = `
        <div class="stk-pnl-bar">
            ${realizedOnly ? `<div class="br-chip-row" role="group" aria-label="Spacing">
                <button type="button" class="br-chip active" data-pnl-space="order">By sale</button>
                <button type="button" class="br-chip" data-pnl-space="date">By date</button>
            </div>` : `<div class="br-chip-row" role="group" aria-label="Line shown">
                <button type="button" class="br-chip active" data-pnl-mode="total">Total P&amp;L</button>
                <button type="button" class="br-chip" data-pnl-mode="realized">Realized only</button>
            </div>`}
            <div class="br-chip-row" role="group" aria-label="Date range and direction">
                ${RANGES.map((r) => `<button type="button" class="br-chip" data-pnl-range="${r.key}">${r.label}</button>`).join("")}
                ${realizedOnly ? `<button type="button" class="br-chip stk-pnl-dir" data-pnl-dir aria-label="Reverse date order" title="Reverse date order"><span data-pnl-dir-label>Old → New</span></button>` : ""}
                <button type="button" class="br-chip stk-pnl-zoom" data-pnl-zoom="out" aria-label="Zoom out" title="Zoom out">&minus;</button>
                <button type="button" class="br-chip stk-pnl-zoom" data-pnl-zoom="in" aria-label="Zoom in" title="Zoom in">+</button>
            </div>
        </div>
        <div class="stk-pnl-read" data-pnl-read></div>
        <div class="stk-pnl-plot" data-pnl-plot><svg class="stk-pnl-svg" role="img" aria-label="${realizedOnly ? 'Realized profit and loss over time' : 'Profit and loss over time'}"></svg></div>
        <div class="stk-pnl-foot">
            <span data-pnl-range-label></span>
        </div>
    `;

    const svg = host.querySelector("svg");
    const plot = host.querySelector("[data-pnl-plot]");
    const read = host.querySelector("[data-pnl-read]");
    const rangeLabel = host.querySelector("[data-pnl-range-label]");

    let pts = [];
    let series = []; // always oldest -> newest
    let reversed = false; // true = newest on the left
    let sMin = 0;
    let sMax = 0;
    let sig = "";
    let mode = realizedOnly ? "realized" : "total";
    let spacing = realizedOnly ? "order" : "date"; // "order" = evenly spaced sales, "date" = real time gaps
    let view = null; // null = full range, else [a, b] in ms
    let hover = null; // index into pts
    let T0 = 0;
    let T1 = 1;
    let L = null; // last layout

    const val = (p) => (mode === "realized" ? p.realized : p.total);
    const curView = () => (view ? view : [T0, T1]);
    const minSpan = () => Math.min(DAY, T1 - T0);

    function clampView(a, b) {
        const full = T1 - T0;
        const span = Math.min(Math.max(b - a, minSpan()), full);
        if (span >= full - 1) return null;
        if (a < T0) a = T0;
        b = a + span;
        if (b > T1) {
            b = T1;
            a = b - span;
        }
        return [a, b];
    }

    function setView(v) {
        view = v;
        draw();
    }

    function zoomAround(tc, factor) {
        const [a, b] = curView();
        const k = (tc - a) / (b - a || 1);
        const span = (b - a) * factor;
        setView(clampView(tc - k * span, tc - k * span + span));
    }

    function setDomain() {
        const base = (p) => (p.tDate !== undefined ? p.tDate : p.t);
        sMin = base(series[0]);
        sMax = base(series[series.length - 1]);

        pts = reversed ? series.slice().reverse() : series.slice();
        pts.forEach((p, i) => {
            if (spacing === "order") p.t = i * DAY;
            else p.t = reversed ? sMin + sMax - base(p) : base(p);
        });

        T0 = pts[0].t;
        T1 = Math.max(pts[pts.length - 1].t, T0 + 1);
        if (realizedOnly) {
            const pad = Math.max((T1 - T0) * 0.03, DAY * (pts.length === 1 ? 3 : 0.5));
            T0 -= pad;
            T1 += pad;
        }
    }

    // axis time -> real calendar time (date mode can be mirrored)
    const realT = (t) => (reversed && spacing === "date" ? sMin + sMax - t : t);

    // In evenly-spaced mode the axis holds sale numbers, so label ticks with that sale's date
    function dateAt(t) {
        if (spacing !== "order") return null;
        const i = Math.min(pts.length - 1, Math.max(0, Math.round(t / DAY)));
        return pts[i].date;
    }

    function valueAt(t) {
        if (t <= pts[0].t) return val(pts[0]);
        for (let i = 1; i < pts.length; i++) {
            if (t <= pts[i].t) {
                const p = pts[i - 1];
                const q = pts[i];
                const f = (t - p.t) / (q.t - p.t || 1);
                return val(p) + (val(q) - val(p)) * f;
            }
        }
        return val(pts[pts.length - 1]);
    }

    /* ---------- readout ---------- */

    function paintRead() {
        if (!pts.length) {
            read.innerHTML = "";
            return;
        }
        const idx = hover != null && pts[hover] ? hover : pts.length - 1;
        const p = pts[idx];
        const v = val(p);
        const label = p.now ? `Now · ${fmtDate(p.date)}` : realizedOnly ? `Sale · ${fmtDate(p.date)}` : fmtDate(p.date);
        const orders = p.orders.slice(0, 3).map((o) => `<span>${esc(o)}</span>`).join("");
        const more = p.orders.length > 3 ? `<span>+${p.orders.length - 3} more</span>` : "";

        read.innerHTML = `
            <div class="stk-pnl-read-main">
                <span class="br-muted">${esc(label)}</span>
                <strong class="br-pnl-${pnlClass(v)}">${fmtSigned(v, !realizedOnly)}</strong>
            </div>
            <div class="stk-pnl-read-sub">
                ${realizedOnly
                    ? `<span>Running total <b class="br-pnl-${pnlClass(p.running)}">${fmtSigned(p.running, true)}</b></span>`
                    : `<span>Realized <b class="br-pnl-${pnlClass(p.realized)}">${fmtSigned(p.realized, true)}</b></span>
                <span>Unrealized <b class="br-pnl-${pnlClass(p.unrealized)}">${fmtSigned(p.unrealized, true)}</b></span>`}
            </div>
            ${orders || more ? `<div class="stk-pnl-read-orders">${orders}${more}</div>` : ""}
        `;
    }

    function paintHover() {
        const g = svg.querySelector("[data-pnl-hover]");
        paintRead();
        if (!g || !L) return;

        const p = hover != null ? pts[hover] : null;
        if (!p || p.t < L.a || p.t > L.b) {
            g.setAttribute("visibility", "hidden");
            return;
        }
        const x = L.x(p.t);
        const y = L.y(val(p));
        g.setAttribute("visibility", "visible");
        g.querySelector("line").setAttribute("x1", x.toFixed(2));
        g.querySelector("line").setAttribute("x2", x.toFixed(2));
        const c = g.querySelector("circle");
        c.setAttribute("cx", x.toFixed(2));
        c.setAttribute("cy", y.toFixed(2));
        c.setAttribute("class", "stk-pnl-hover-dot " + pnlClass(val(p)));

        // Realized chart: date + exact amount right at the point
        const bg = g.querySelector(".stk-pnl-tip-bg");
        const tx = g.querySelector(".stk-pnl-tip-text");
        if (bg && tx) {
            const text = `${fmtDate(p.date)}  ${fmtSigned(val(p), false)}`;
            const w = text.length * 6.4 + 14;
            const bx = Math.min(L.padL + L.plotW - w, Math.max(L.padL, x - w / 2));
            const by = y - 32 > PAD_T ? y - 32 : y + 12;
            bg.setAttribute("x", bx.toFixed(2));
            bg.setAttribute("y", by.toFixed(2));
            bg.setAttribute("width", w.toFixed(2));
            tx.setAttribute("x", (bx + 7).toFixed(2));
            tx.setAttribute("y", (by + 14).toFixed(2));
            tx.textContent = text;
        }
    }

    /* ---------- drawing ---------- */

    function draw() {
        if (!pts.length) return;

        const width = plot.clientWidth;
        if (width < 80) return; // hidden tab; ResizeObserver redraws when shown

        const H = width < 420 ? 230 : HEIGHT;
        const [a, b] = curView();
        const span = b - a || 1;

        // visible y-range, including the interpolated values at the edges
        const vis = [valueAt(a), valueAt(b)];
        pts.forEach((p) => {
            if (p.t >= a && p.t <= b) vis.push(val(p));
        });
        let ymin = Math.min(...vis);
        let ymax = Math.max(...vis);
        if (ymin === ymax) {
            const d = Math.abs(ymin) * 0.05 + 1;
            ymin -= d;
            ymax += d;
        }
        const pad = (ymax - ymin) * 0.12;
        ymin -= pad;
        ymax += pad;

        const yTicks = niceTicks(ymin, ymax, 5);
        const yLabels = yTicks.map((v) => fmtMoney(v, true));
        const padL = Math.min(110, Math.max(46, Math.max(...yLabels.map((s) => s.length)) * 6.4 + 12));

        const plotW = width - padL - PAD_R;
        const plotH = H - PAD_T - PAD_B;
        const x = (t) => padL + ((t - a) / span) * plotW;
        const y = (v) => PAD_T + plotH - ((v - ymin) / (ymax - ymin)) * plotH;

        L = { padL, plotW, plotH, a, b, x, y };

        const y0 = Math.min(PAD_T + plotH, Math.max(PAD_T, y(0)));
        const line = smoothPath(pts.map((p) => [x(p.t), y(val(p))]));
        const area = `${line}L${x(pts[pts.length - 1].t).toFixed(2)},${y0.toFixed(2)}L${x(pts[0].t).toFixed(2)},${y0.toFixed(2)}Z`;

        const visible = pts.filter((p) => p.t >= a && p.t <= b);
        const showDots = visible.length <= 90;
        const dots = visible
            .filter((p) => showDots || p.now)
            .map((p) => `<circle cx="${x(p.t).toFixed(2)}" cy="${y(val(p)).toFixed(2)}" r="${p.now ? 4 : 2.8}" class="stk-pnl-dot ${pnlClass(val(p))}${p.now ? " now" : ""}"></circle>`)
            .join("");

        const nTicks = plotW < 420 ? 3 : 5;
        const xTicks = Array.from({ length: nTicks }, (_, i) => a + (span * i) / (nTicks - 1));

        svg.setAttribute("width", width);
        svg.setAttribute("height", H);
        svg.setAttribute("viewBox", `0 0 ${width} ${H}`);

        svg.innerHTML = `
            <defs>
                <clipPath id="${uid}-plot-clip"><rect x="${padL}" y="${PAD_T}" width="${plotW}" height="${plotH}"></rect></clipPath>
                <clipPath id="${uid}-pos-clip"><rect x="${padL}" y="${PAD_T}" width="${plotW}" height="${Math.max(0, y0 - PAD_T).toFixed(2)}"></rect></clipPath>
                <clipPath id="${uid}-neg-clip"><rect x="${padL}" y="${y0.toFixed(2)}" width="${plotW}" height="${Math.max(0, PAD_T + plotH - y0).toFixed(2)}"></rect></clipPath>
            </defs>
            ${yTicks.map((v) => `<line x1="${padL}" x2="${width - PAD_R}" y1="${y(v).toFixed(2)}" y2="${y(v).toFixed(2)}" class="br-chart-grid"></line>`).join("")}
            ${ymin < 0 && ymax > 0 ? `<line x1="${padL}" x2="${width - PAD_R}" y1="${y(0).toFixed(2)}" y2="${y(0).toFixed(2)}" class="stk-pnl-zero"></line>` : ""}
            <g clip-path="url(#${uid}-plot-clip)">
                <g clip-path="url(#${uid}-pos-clip)">
                    <path d="${area}" class="stk-pnl-area pos"></path>
                    <path d="${line}" class="stk-pnl-line pos"></path>
                </g>
                <g clip-path="url(#${uid}-neg-clip)">
                    <path d="${area}" class="stk-pnl-area neg"></path>
                    <path d="${line}" class="stk-pnl-line neg"></path>
                </g>
                ${dots}
            </g>
            ${yTicks.map((v, i) => `<text x="${padL - 6}" y="${(y(v) + 3.5).toFixed(2)}" text-anchor="end" class="br-chart-label">${esc(yLabels[i])}</text>`).join("")}
            ${xTicks.map((t, i) => `<text x="${x(t).toFixed(2)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === nTicks - 1 ? "end" : "middle"}" class="br-chart-label">${esc(dateAt(t) ? fmtTick(dayStart(dateAt(t)), 30 * DAY) : fmtTick(realT(t), span))}</text>`).join("")}
            <g data-pnl-hover visibility="hidden">
                <line y1="${PAD_T}" y2="${PAD_T + plotH}" class="stk-pnl-cross"></line>
                <circle r="5" class="stk-pnl-hover-dot"></circle>
                ${realizedOnly ? '<rect class="stk-pnl-tip-bg" rx="4" height="20"></rect><text class="stk-pnl-tip-text"></text>' : ""}
            </g>
        `;

        rangeLabel.textContent = spacing === "order"
            ? `${fmtDate(dateAt(a))} – ${fmtDate(dateAt(b))}`
            : `${fmtDate(new Date(realT(a)).toISOString().slice(0, 10))} – ${fmtDate(new Date(realT(b)).toISOString().slice(0, 10))}`;

        // chip highlight
        host.querySelectorAll("[data-pnl-range]").forEach((btn) => {
            const r = RANGES.find((x2) => x2.key === btn.dataset.pnlRange);
            let on = false;
            if (r.days === 0) on = view === null;
            else if (view) on = (reversed ? Math.abs(view[0] - T0) < 1 : Math.abs(view[1] - T1) < 1) && Math.abs(view[1] - view[0] - r.days * DAY) < DAY / 2;
            btn.classList.toggle("active", on);
            btn.style.display = spacing === "order" && r.days !== 0 ? "none" : "";
        });
        const dirLabel = host.querySelector("[data-pnl-dir-label]");
        if (dirLabel) dirLabel.textContent = reversed ? "New → Old" : "Old → New";
        host.querySelectorAll("[data-pnl-space]").forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.pnlSpace === spacing)
        );
        host.querySelectorAll("[data-pnl-mode]").forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.pnlMode === mode)
        );

        paintHover();
    }

    /* ---------- controls ---------- */

    host.addEventListener("click", (e) => {
        const m = e.target.closest("[data-pnl-mode]");
        if (m) {
            mode = m.dataset.pnlMode;
            draw();
            return;
        }

        if (e.target.closest("[data-pnl-dir]") && pts.length) {
            reversed = !reversed;
            view = null;
            hover = null;
            setDomain();
            draw();
            return;
        }

        const sp = e.target.closest("[data-pnl-space]");
        if (sp && pts.length) {
            spacing = sp.dataset.pnlSpace;
            view = null;
            hover = null;
            setDomain();
            draw();
            return;
        }

        const r = e.target.closest("[data-pnl-range]");
        if (r && pts.length) {
            const def = RANGES.find((x) => x.key === r.dataset.pnlRange);
            setView(def.days === 0 ? null : reversed ? clampView(T0, T0 + def.days * DAY) : clampView(T1 - def.days * DAY, T1));
            return;
        }

        const z = e.target.closest("[data-pnl-zoom]");
        if (z && pts.length) {
            const [a, b] = curView();
            zoomAround((a + b) / 2, z.dataset.pnlZoom === "in" ? 0.5 : 2);
        }
    });

    /* ---------- pointer: hover, pan, pinch ---------- */

    const ptrs = new Map();
    let gesture = null;

    const localX = (clientX) => clientX - svg.getBoundingClientRect().left;
    const xToT = (px) => {
        const [a, b] = curView();
        return a + ((px - L.padL) / L.plotW) * (b - a);
    };

    function nearest(px) {
        if (!L) return null;
        const t = xToT(px);
        let best = 0;
        let bd = Infinity;
        pts.forEach((p, i) => {
            const d = Math.abs(p.t - t);
            if (d < bd) {
                bd = d;
                best = i;
            }
        });
        return best;
    }

    svg.addEventListener("pointerdown", (e) => {
        if (!pts.length || !L) return;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (ptrs.size === 1) {
            gesture = { type: "pan", x0: e.clientX, view0: curView(), moved: false };
        } else if (ptrs.size === 2) {
            const [p, q] = [...ptrs.values()];
            gesture = {
                type: "pinch",
                d0: Math.hypot(p.x - q.x, p.y - q.y) || 1,
                view0: curView(),
                tc: xToT(localX((p.x + q.x) / 2))
            };
        }
    });

    svg.addEventListener("pointermove", (e) => {
        if (!L) return;

        if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (gesture && gesture.type === "pan" && ptrs.size === 1) {
            const dx = e.clientX - gesture.x0;
            if (!gesture.moved && Math.abs(dx) < 4) return;
            gesture.moved = true;
            hover = null;
            const [a0, b0] = gesture.view0;
            const shift = (-dx / L.plotW) * (b0 - a0);
            setView(clampView(a0 + shift, b0 + shift));
            return;
        }

        if (gesture && gesture.type === "pinch" && ptrs.size === 2) {
            const [p, q] = [...ptrs.values()];
            const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
            const [a0, b0] = gesture.view0;
            const span = (b0 - a0) * (gesture.d0 / d);
            const k = (gesture.tc - a0) / (b0 - a0 || 1);
            hover = null;
            setView(clampView(gesture.tc - k * span, gesture.tc - k * span + span));
            return;
        }

        if (e.pointerType === "mouse" && ptrs.size === 0) {
            const px = localX(e.clientX);
            hover = px >= L.padL && px <= L.padL + L.plotW ? nearest(px) : null;
            paintHover();
        }
    });

    function endPointer(e) {
        ptrs.delete(e.pointerId);

        if (gesture && gesture.type === "pan" && !gesture.moved && e.type === "pointerup" && L) {
            // a tap / click selects the nearest point
            const px = localX(e.clientX);
            hover = px >= L.padL && px <= L.padL + L.plotW ? nearest(px) : null;
            paintHover();
        }

        if (ptrs.size === 0 || (gesture && gesture.type === "pinch")) gesture = null;
    }

    svg.addEventListener("pointerup", endPointer);
    svg.addEventListener("pointercancel", endPointer);

    svg.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse" && ptrs.size === 0) {
            hover = null;
            paintHover();
        }
    });

    svg.addEventListener("dblclick", () => {
        if (pts.length) setView(null);
    });

    // double-tap to reset on touch screens
    let lastTap = 0;
    svg.addEventListener("pointerup", (e) => {
        if (e.pointerType !== "touch") return;
        const now = Date.now();
        if (now - lastTap < 320 && pts.length) setView(null);
        lastTap = now;
    });

    svg.addEventListener(
        "wheel",
        (e) => {
            if (!pts.length || !L) return;
            e.preventDefault();

            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
                const [a, b] = curView();
                const shift = (e.deltaX / L.plotW) * (b - a);
                setView(clampView(a + shift, b + shift));
                return;
            }

            const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
            zoomAround(xToT(Math.min(L.padL + L.plotW, Math.max(L.padL, localX(e.clientX)))), factor);
        },
        { passive: false }
    );

    if (typeof ResizeObserver !== "undefined") {
        let lastW = 0;
        new ResizeObserver(() => {
            const w = plot.clientWidth;
            if (w !== lastW) {
                lastW = w;
                draw();
            }
        }).observe(plot);
    }

    /* ---------- public ---------- */

    return {
        update(transactions, prices) {
            const next = realizedOnly ? buildSellSeries(transactions) : buildSeries(transactions, prices);

            if (!next.length) {
                pts = [];
                series = [];
                sig = "";
                view = null;
                hover = null;
                host.classList.add("is-empty");
                svg.innerHTML = "";
                read.innerHTML = `<div class="br-empty-state">${realizedOnly ? "Sell a stock to see your realized profit and loss here." : "Add a transaction to see your profit and loss over time."}</div>`;
                rangeLabel.textContent = "";
                return;
            }

            host.classList.remove("is-empty");

            const nextSig = JSON.stringify(next.map((p) => [p.tDate !== undefined ? p.tDate : p.t, p.total, p.realized, p.unrealized]));
            if (nextSig === sig) return; // nothing changed: leave the user's zoom alone
            sig = nextSig;

            series = next;
            setDomain();
            if (view) view = clampView(view[0], view[1]);
            if (hover != null && hover >= pts.length) hover = null;

            draw();
        }
    };
}
