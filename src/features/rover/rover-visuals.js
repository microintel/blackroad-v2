import { formatINR } from "../dashboard/dashboard-service.js";
import { isUSD } from "../../services/currency.js";
import { esc } from "../../components/chat/chat-format.js";
import { tipAttr } from "../../components/chart-tooltip.js";
import { stockLogoUrl } from "../stocks/stocks-live.js";

/*
 * Rover visuals: turns a reply's `blocks` into charts, tables, comparisons and gauges.
 *
 * Blocks are plain data (numbers, not formatted text), so they can be saved with the chat and
 * are drawn again in the current currency and theme. Colours come from CSS variables.
 *
 *   { kind: "kpi",     items: [{ label, value, fmt, tone }] }
 *   { kind: "chart",   type: "donut" | "bar" | "columns" | "line" | "stacked" | "stackcols" | "lollipop" | "radar" | "waterfall" | "treemap" | "bubble" | "rings", title, ... }
 *      (line takes area: true; any chart block can carry alt: true = shown only when that chart type is asked for)
 *   { kind: "table",   title, columns: [{ label, fmt, align }], rows: [[...]] }
 *   { kind: "compare", title, aLabel, bLabel, rows: [{ label, a, b, fmt, better }] }
 *   { kind: "gauge",   title, value, min, max, fmt, zones: [{ to, tone, label }], caption }
 *   { kind: "stocklist", title, hero, limit, items: [{ symbol, name, qty, avg, ltp, value, pnl, pnlPct }] }   stock cards with logos
 *   { kind: "statement", title, sections: [{ title, rows: [{ icon, label, value, fmt, tone, sub, bar, total }] }] }   emoji rows
 *   { kind: "reminders", title, items: [{ title, amount, date, type }] }   dues, coloured by how soon
 *
 * fmt: "money" | "signed" | "pct" | "spct" | "num" | "text" | "months"
 */

const TONE = {
    gold: "var(--br-gold, #D4AF37)",
    info: "var(--br-info, #60A5FA)",
    success: "var(--br-success, #22C55E)",
    warning: "var(--br-warning, #F59E0B)",
    danger: "var(--br-danger, #F87171)",
    muted: "var(--br-text-muted, #737373)"
};
const SERIES = [TONE.gold, TONE.info, TONE.success, TONE.warning, TONE.danger, "var(--br-gold-muted, #A88932)", TONE.muted];
const color = (i) => SERIES[i % SERIES.length];

/* ---------- number formatting (always in the current currency) ---------- */

const symbol = () => formatINR(0).replace(/[0-9.,\s-]/g, "") || "₹";

function compact(n) {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    let out;

    if (isUSD()) out = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
    else out = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;

    return `${sign}${symbol()}${out.replace(".0", "")}`;
}

function fmt(value, kind = "money") {
    const n = Number(value);

    switch (kind) {
        case "text": return esc(value ?? "");
        case "num": return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "–";
        case "pct": return Number.isFinite(n) ? `${n.toFixed(1)}%` : "–";
        case "spct": return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` : "–";
        case "months": return Number.isFinite(n) ? `${n.toFixed(1)} mo` : "–";
        case "signed": return Number.isFinite(n) ? `${n >= 0 ? "+" : "-"}${formatINR(Math.abs(n))}` : "–";
        default: return Number.isFinite(n) ? formatINR(n) : "–";
    }
}

/* Same numbers as fmt(), but plain text (tooltips escape on their own). */
const plain = (value, kind = "money") => (kind === "text" ? String(value ?? "") : fmt(value, kind));

const tone = (n) => (n > 0 ? "is-up" : n < 0 ? "is-down" : "");
const wrap = (title, inner, cls = "") =>
    `<section class="rv-block ${cls}">${title ? `<h4 class="rv-block-title">${esc(title)}</h4>` : ""}${inner}</section>`;

/* ---------- KPI cards ---------- */

function kpi(b) {
    const cards = (b.items || []).map((i) => {
        const cls = i.tone === "auto" ? tone(i.value) : i.tone ? `is-${i.tone}` : "";
        return `<div class="rv-kpi"><span>${esc(i.label)}</span><strong class="${cls}">${fmt(i.value, i.fmt)}</strong></div>`;
    });
    return `<div class="rv-block rv-kpis">${cards.join("")}</div>`;
}

/* ---------- donut ---------- */

const donutTip = (i, pct, n) => tipAttr(i.label, [["Share", `${pct.toFixed(1)}%`, color(n)], ["Amount", plain(i.value)]]);

function donut(b) {
    const items = (b.items || []).filter((i) => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return "";

    let at = 0;
    const segs = items.map((i, n) => {
        const pct = (i.value / total) * 100;
        const seg = `<circle class="rv-seg br-tip-seg" cx="21" cy="21" r="15.9155" style="stroke:${color(n)};stroke-dasharray:${Math.max(pct - 0.6, 0.1).toFixed(2)} ${(100 - Math.max(pct - 0.6, 0.1)).toFixed(2)};stroke-dashoffset:${(25 - at).toFixed(2)};--n:${n}" ${donutTip(i, pct, n)}/>`;
        at += pct;
        return seg;
    }).join("");

    const legend = items.map((i, n) =>
        `<li ${donutTip(i, (i.value / total) * 100, n)}><i style="background:${color(n)}"></i><span>${esc(i.label)}</span><b>${((i.value / total) * 100).toFixed(1)}%</b><em>${fmt(i.value)}</em></li>`
    ).join("");

    return wrap(b.title, `
        <div class="rv-donut">
            <svg viewBox="0 0 42 42" role="img" aria-label="${esc(b.title || "Breakdown")}">
                <circle cx="21" cy="21" r="15.9155" class="rv-ring"/>${segs}
                <text x="21" y="20.2" class="rv-donut-top">${esc(b.centerLabel || "Total")}</text>
                <text x="21" y="25.2" class="rv-donut-val">${compact(total)}</text>
            </svg>
            <ul class="rv-legend">${legend}</ul>
        </div>`);
}

/* ---------- horizontal bars (positive or +/-) ---------- */

function bars(b) {
    const items = (b.items || []).slice(0, 10);
    const max = Math.max(...items.map((i) => Math.abs(i.value)), 0);
    if (!max) return "";

    const rows = items.map((i, n) => {
        const w = Math.max((Math.abs(i.value) / max) * 100, 2);
        const c = b.signed ? (i.value >= 0 ? TONE.success : TONE.danger) : color(n);
        const label = b.signed ? fmt(i.value, "signed") : fmt(i.value, b.fmt || "money");
        const tip = tipAttr(i.label, [[b.signed ? "Change" : "Value", b.signed ? plain(i.value, "signed") : plain(i.value, b.fmt || "money"), c]]);
        return `<div class="rv-bar" ${tip}><span class="rv-bar-label">${esc(i.label)}</span>
            <span class="rv-bar-track"><span class="rv-bar-fill" style="width:${w.toFixed(1)}%;background:${c};--n:${n}"></span></span>
            <b class="${b.signed ? tone(i.value) : ""}">${label}</b></div>`;
    }).join("");

    return wrap(b.title, `<div class="rv-bars">${rows}</div>`);
}

/* ---------- grouped columns (e.g. income vs expenses by month) ---------- */

function niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function columns(b) {
    const series = b.series || [];
    const labels = b.labels || [];
    const peak = Math.max(...series.flatMap((s) => s.values), 0);
    if (!labels.length || !peak) return "";

    const W = 320, H = 168, L = 40, R = 6, T = 8, B = 22;
    const top = niceMax(peak);
    const iw = W - L - R, ih = H - T - B;
    const group = iw / labels.length;
    const bw = Math.min(18, (group * 0.72) / series.length);

    const grid = [0, 0.5, 1].map((f) => {
        const y = T + ih - f * ih;
        return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="rv-grid"/><text x="${L - 5}" y="${y + 3}" class="rv-axis" text-anchor="end">${compact(top * f)}</text>`;
    }).join("");

    const rects = labels.map((lab, gi) => {
        const gx = L + gi * group + (group - bw * series.length - (series.length - 1) * 3) / 2;
        const cols = series.map((s, si) => {
            const v = s.values[gi] || 0;
            const h = (v / top) * ih;
            return `<rect class="rv-cbar" x="${(gx + si * (bw + 3)).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, v > 0 ? 1.5 : 0).toFixed(1)}" rx="2" style="fill:${s.color ? TONE[s.color] : color(si)};--n:${gi}"/>`;
        }).join("");
        return `${cols}<text x="${(L + gi * group + group / 2).toFixed(1)}" y="${H - 6}" class="rv-axis" text-anchor="middle">${esc(lab)}</text>`;
    }).join("");

    // One invisible strip per group: hover or drag across the chart to read every series at that point.
    const hits = labels.map((lab, gi) => `<rect class="br-tip-hit" x="${(L + gi * group).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${ih}" ${tipAttr(lab, series.map((s, si) => [s.name, plain(s.values[gi] || 0), s.color ? TONE[s.color] : color(si)]))}/>`).join("");

    const key = series.map((s, i) => `<span><i style="background:${s.color ? TONE[s.color] : color(i)}"></i>${esc(s.name)}</span>`).join("");

    return wrap(b.title, `<svg class="rv-svg br-tip-scrub" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Chart")}">${grid}${rects}${hits}</svg><div class="rv-key">${key}</div>`);
}

/* ---------- line ---------- */

function line(b) {
    const series = b.series || [];
    const labels = b.labels || [];
    const all = series.flatMap((s) => s.values);
    if (labels.length < 2 || !all.length) return "";

    const W = 320, H = 168, L = 44, R = 10, T = 12, B = 22;
    let lo = Math.min(...all, 0), hi = Math.max(...all, 0);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    hi += pad; if (lo < 0) lo -= pad;

    const iw = W - L - R, ih = H - T - B;
    const x = (i) => L + (i / (labels.length - 1)) * iw;
    const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;

    const grid = [0, 0.5, 1].map((f) => {
        const v = lo + (hi - lo) * f, gy = y(v);
        return `<line x1="${L}" x2="${W - R}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" class="rv-grid"/><text x="${L - 5}" y="${(gy + 3).toFixed(1)}" class="rv-axis" text-anchor="end">${compact(v)}</text>`;
    }).join("");

    const step = Math.ceil(labels.length / 6);
    const xs = labels.map((lab, i) => (i % step === 0 || i === labels.length - 1) ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="rv-axis" text-anchor="middle">${esc(lab)}</text>` : "").join("");

    const paths = series.map((s, si) => {
        const c = s.color ? TONE[s.color] : color(si);
        const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
        const last = s.values.length - 1;
        const area = b.area || (si === 0 && series.length === 1) ? `<path d="${d} L${x(last).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)} L${x(0).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)}Z" class="rv-area" style="fill:${c}"/>` : "";
        const dots = s.values.length <= 14 ? s.values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" style="fill:${c}"/>`).join("") : "";
        return `${area}<path class="rv-line" pathLength="1" d="${d}" style="stroke:${c}"/>${dots}`;
    }).join("");

    const hitW = iw / (labels.length - 1);
    const hits = labels.map((lab, i) => `<rect class="br-tip-hit" x="${(x(i) - hitW / 2).toFixed(1)}" y="${T}" width="${hitW.toFixed(1)}" height="${ih}" ${tipAttr(lab, series.map((s, si) => [s.name, plain(s.values[i]), s.color ? TONE[s.color] : color(si)]))}/>`).join("");

    const key = series.length > 1 ? `<div class="rv-key">${series.map((s, i) => `<span><i style="background:${s.color ? TONE[s.color] : color(i)}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";

    return wrap(b.title, `<svg class="rv-svg br-tip-scrub" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Trend")}">${grid}${xs}${paths}${hits}</svg>${key}`);
}

/* ---------- more chart types: stacked strip, stacked columns, lollipop, radar, waterfall, treemap, bubble, rings ---------- */

const sColor = (s, i) => (s.color ? TONE[s.color] : color(i));
const clip = (t, n) => { const x = String(t ?? ""); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const axisFmt = (v, kind) => (!kind || kind === "money" ? compact(v) : plain(v, kind));

/* One bar split into shares, with a legend (good for "what is it made of"). */
function stacked(b) {
    const items = (b.items || []).filter((i) => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return "";

    const segs = items.map((i, n) => `<span class="rv-strip-seg" style="flex:${i.value};background:${color(n)};--n:${n}" ${donutTip(i, (i.value / total) * 100, n)}></span>`).join("");
    const legend = items.map((i, n) => `<li ${donutTip(i, (i.value / total) * 100, n)}><i style="background:${color(n)}"></i><span>${esc(i.label)}</span><b>${((i.value / total) * 100).toFixed(1)}%</b><em>${fmt(i.value)}</em></li>`).join("");

    return wrap(b.title, `<div class="rv-strip" role="img" aria-label="${esc(b.title || "Share")}">${segs}</div><ul class="rv-legend rv-legend-wide">${legend}</ul>`);
}

/* Columns stacked on top of each other (e.g. what each month's money went to). */
function stackcols(b) {
    const series = b.series || [];
    const labels = b.labels || [];
    const sums = labels.map((_, gi) => series.reduce((s, x) => s + Math.max(x.values[gi] || 0, 0), 0));
    const peak = Math.max(...sums, 0);
    if (!labels.length || !peak) return "";

    const W = 320, H = 168, L = 40, R = 6, T = 8, B = 22;
    const top = niceMax(peak), iw = W - L - R, ih = H - T - B;
    const group = iw / labels.length, bw = Math.min(26, group * 0.62);

    const grid = [0, 0.5, 1].map((f) => {
        const y = T + ih - f * ih;
        return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="rv-grid"/><text x="${L - 5}" y="${y + 3}" class="rv-axis" text-anchor="end">${compact(top * f)}</text>`;
    }).join("");

    const cols = labels.map((lab, gi) => {
        let acc = 0;
        const x = L + gi * group + (group - bw) / 2;
        const parts = series.map((sr, si) => {
            const v = Math.max(sr.values[gi] || 0, 0);
            const h = (v / top) * ih;
            const y = T + ih - acc - h;
            acc += h;
            return h > 0 ? `<rect class="rv-cbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h - 0.8, 0.5).toFixed(1)}" rx="2" style="fill:${sColor(sr, si)};--n:${gi}"/>` : "";
        }).join("");
        return `${parts}<text x="${(L + gi * group + group / 2).toFixed(1)}" y="${H - 6}" class="rv-axis" text-anchor="middle">${esc(lab)}</text>`;
    }).join("");

    const hits = labels.map((lab, gi) => `<rect class="br-tip-hit" x="${(L + gi * group).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${ih}" ${tipAttr(lab, [...series.map((sr, si) => [sr.name, plain(sr.values[gi] || 0), sColor(sr, si)]), ["Total", plain(sums[gi])]])}/>`).join("");
    const key = series.map((sr, i) => `<span><i style="background:${sColor(sr, i)}"></i>${esc(sr.name)}</span>`).join("");

    return wrap(b.title, `<svg class="rv-svg br-tip-scrub" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Chart")}">${grid}${cols}${hits}</svg><div class="rv-key">${key}</div>`);
}

/* A dot on a stick for each item: a lighter way to rank things than bars. */
function lollipop(b) {
    const items = (b.items || []).slice(0, 10);
    const max = Math.max(...items.map((i) => Math.abs(i.value)), 0);
    if (!max) return "";

    const W = 320, rowH = 28, LAB = 78, VAL = 74, T = 4;
    const H = T + items.length * rowH + 4;
    const x0 = LAB, x1 = W - VAL;
    const mid = b.signed ? (x0 + x1) / 2 : x0;
    const span = b.signed ? (x1 - x0) / 2 : x1 - x0;

    const rows = items.map((i, n) => {
        const y = T + n * rowH + rowH / 2;
        const x = mid + (i.value / max) * span;
        const c = b.signed ? (i.value >= 0 ? TONE.success : TONE.danger) : color(n);
        const label = b.signed ? plain(i.value, "signed") : plain(i.value, b.fmt || "money");
        const tip = tipAttr(i.label, [[b.signed ? "Change" : "Value", label, c]]);
        return `<g class="rv-lolli" ${tip} style="--n:${n}">
            <text x="0" y="${y + 3}" class="rv-lolli-label">${esc(clip(i.label, 12))}</text>
            <line x1="${mid}" x2="${x.toFixed(1)}" y1="${y}" y2="${y}" class="rv-lolli-stem" style="stroke:${c}"/>
            <circle cx="${x.toFixed(1)}" cy="${y}" r="5.5" style="fill:${c}"/>
            <text x="${W}" y="${y + 3}" class="rv-lolli-val ${b.signed ? tone(i.value) : ""}" text-anchor="end">${esc(label)}</text>
            <rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>
        </g>`;
    }).join("");

    const axis = b.signed ? `<line x1="${mid}" x2="${mid}" y1="${T}" y2="${H - 4}" class="rv-grid"/>` : "";
    return wrap(b.title, `<svg class="rv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Ranking")}">${axis}${rows}</svg>`);
}

/* Spider chart: 3 or more scores from 0 to 100 around a centre. */
function radar(b) {
    const items = (b.items || []).slice(0, 8);
    if (items.length < 3) return "";

    const W = 300, H = 240, cx = 150, cy = 120, R = 78;
    const n = items.length;
    const ang = (i) => -90 + (360 / n) * i;
    const pt = (i, f) => polar(cx, cy, R * f, ang(i)).map((v) => v.toFixed(1)).join(",");

    const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${items.map((_, i) => pt(i, f)).join(" ")}" class="rv-radar-ring"/>`).join("");
    const axes = items.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1).split(",")[0]}" y2="${pt(i, 1).split(",")[1]}" class="rv-radar-axis"/>`).join("");
    const shape = items.map((it, i) => pt(i, clamp(Number(it.value) || 0, 0, 100) / 100)).join(" ");
    const dots = items.map((it, i) => {
        const [x, y] = pt(i, clamp(Number(it.value) || 0, 0, 100) / 100).split(",");
        return `<circle cx="${x}" cy="${y}" r="3.4" class="rv-radar-dot" ${tipAttr(it.label, [[it.note || "Score", it.display ?? `${Math.round(it.value)}/100`, TONE.gold]])}/>`;
    }).join("");
    const labels = items.map((it, i) => {
        const [x, y] = polar(cx, cy, R + 14, ang(i));
        const a = x < cx - 6 ? "end" : x > cx + 6 ? "start" : "middle";
        return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" class="rv-axis rv-radar-label" text-anchor="${a}">${esc(clip(it.label, 14))}</text>`;
    }).join("");

    return wrap(b.title, `<svg class="rv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Radar")}">${rings}${axes}<polygon points="${shape}" class="rv-radar-poly" style="transform-origin:${cx}px ${cy}px"/>${dots}${labels}</svg>`);
}

/* Steps that add up: start, what was added or taken away, and where it ends. */
function waterfall(b) {
    const items = b.items || [];
    if (items.length < 2) return "";

    let run = 0;
    const bars = items.map((it) => {
        const v = Number(it.value) || 0;
        const from = it.total ? 0 : run;
        const to = it.total ? v : run + v;
        run = it.total ? v : run + v;
        return { ...it, from, to, end: run };
    });

    const lo = Math.min(0, ...bars.map((x) => Math.min(x.from, x.to)));
    const hi = Math.max(0, ...bars.map((x) => Math.max(x.from, x.to)));
    if (hi === lo) return "";

    const W = 320, H = 184, L = 8, R = 8, T = 18, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
    const group = iw / bars.length, bw = Math.min(40, group * 0.62);

    const parts = bars.map((x, i) => {
        const cxm = L + i * group + group / 2;
        const up = x.to >= x.from;
        const c = x.total ? TONE.gold : up ? TONE.success : TONE.danger;
        const top = y(Math.max(x.from, x.to)), h = Math.max(Math.abs(y(x.to) - y(x.from)), 1.5);
        const next = bars[i + 1] ? `<line x1="${(cxm + bw / 2).toFixed(1)}" x2="${(cxm + group - bw / 2).toFixed(1)}" y1="${y(x.end).toFixed(1)}" y2="${y(x.end).toFixed(1)}" class="rv-grid"/>` : "";
        const tip = tipAttr(x.label, [[x.total ? "Total" : up ? "Adds" : "Takes away", plain(x.total ? x.to : x.to - x.from, x.total ? "money" : "signed"), c]]);
        return `${next}<rect class="rv-cbar" x="${(cxm - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${c};--n:${i}" ${tip}/>
            <text x="${cxm.toFixed(1)}" y="${(top - 5).toFixed(1)}" class="rv-axis rv-wf-val" text-anchor="middle">${compact(x.total ? x.to : x.to - x.from)}</text>
            <text x="${cxm.toFixed(1)}" y="${H - 8}" class="rv-axis" text-anchor="middle">${esc(clip(x.label, 10))}</text>`;
    }).join("");

    const zero = lo < 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="rv-grid"/>` : "";
    return wrap(b.title, `<svg class="rv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Waterfall")}">${zero}${parts}</svg>`);
}

/* Blocks sized by value: big things look big (great for categories). */
function treemap(b) {
    const items = (b.items || []).filter((i) => i.value > 0).sort((a, c) => c.value - a.value).slice(0, 12);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (items.length < 2 || !total) return "";

    const out = [];
    const split = (list, x, y, w, h) => {
        if (list.length === 1) { out.push({ ...list[0], x, y, w, h }); return; }
        const sum = list.reduce((s, i) => s + i.value, 0);
        let acc = 0, cut = 1, best = Infinity;
        for (let k = 1; k < list.length; k++) {
            acc += list[k - 1].value;
            const gap = Math.abs(acc - sum / 2);
            if (gap < best) { best = gap; cut = k; }
        }
        const left = list.slice(0, cut), right = list.slice(cut);
        const f = left.reduce((s, i) => s + i.value, 0) / sum;
        if (w >= h) { split(left, x, y, w * f, h); split(right, x + w * f, y, w * (1 - f), h); }
        else { split(left, x, y, w, h * f); split(right, x, y + h * f, w, h * (1 - f)); }
    };
    split(items, 0, 0, 100, 100);

    const cells = out.map((c, n) => {
        const share = (c.value / total) * 100;
        const big = c.w > 22 && c.h > 24;
        const k = items.findIndex((i) => i.label === c.label);
        return `<div class="rv-tm" style="left:${c.x.toFixed(2)}%;top:${c.y.toFixed(2)}%;width:${c.w.toFixed(2)}%;height:${c.h.toFixed(2)}%;--n:${n}" ${donutTip(c, share, k)}>
            <div style="background:${color(k)}">${big ? `<b>${esc(clip(c.label, 16))}</b><span>${share.toFixed(0)}% · ${compact(c.value)}</span>` : c.w > 12 && c.h > 14 ? `<span>${share.toFixed(0)}%</span>` : ""}</div>
        </div>`;
    }).join("");

    const legend = items.map((i, n) => `<span><i style="background:${color(n)}"></i>${esc(clip(i.label, 18))}</span>`).join("");
    return wrap(b.title, `<div class="rv-treemap" role="img" aria-label="${esc(b.title || "Breakdown")}">${cells}</div><div class="rv-key">${legend}</div>`);
}

/* Dots placed by two numbers, sized by a third (e.g. stocks: money put in vs return, size = value). */
function bubble(b) {
    const pts = (b.points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 2) return "";

    const W = 320, H = 196, L = 46, R = 14, T = 12, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    let xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0);
    if (xhi === xlo) { xhi += 1; xlo -= 1; }
    if (yhi === ylo) yhi += 1;
    const xp = (xhi - xlo) * 0.12, yp = (yhi - ylo) * 0.12;
    xlo -= xp; xhi += xp; yhi += yp; if (ylo < 0) ylo -= yp;

    const x = (v) => L + ((v - xlo) / (xhi - xlo)) * iw;
    const y = (v) => T + ih - ((v - ylo) / (yhi - ylo)) * ih;
    const rmax = Math.max(...pts.map((p) => p.r || 1), 1);
    const rad = (p) => 5 + Math.sqrt((p.r || 1) / rmax) * 11;

    const gy = [0, 0.5, 1].map((f) => { const v = ylo + (yhi - ylo) * f; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="rv-grid"/><text x="${L - 5}" y="${(y(v) + 3).toFixed(1)}" class="rv-axis" text-anchor="end">${axisFmt(v, b.yFmt)}</text>`; }).join("");
    const gx = [0, 0.5, 1].map((f) => { const v = xlo + (xhi - xlo) * f; return `<text x="${x(v).toFixed(1)}" y="${H - 14}" class="rv-axis" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}">${axisFmt(v, b.xFmt)}</text>`; }).join("");
    const zero = ylo < 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="rv-bubble-zero"/>` : "";

    const dots = pts.map((p, i) => {
        const c = p.tone ? TONE[p.tone] : p.y >= 0 ? TONE.success : TONE.danger;
        const rows = [[b.xLabel || "X", plain(p.x, b.xFmt || "money")], [b.yLabel || "Y", plain(p.y, b.yFmt || "money"), c]];
        if (p.r) rows.push([b.rLabel || "Size", plain(p.r)]);
        return `<g class="rv-bubble" style="--n:${i}" ${tipAttr(p.label, rows)}><circle cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${rad(p).toFixed(1)}" style="fill:${c}"/>${rad(p) > 9 ? `<text x="${x(p.x).toFixed(1)}" y="${(y(p.y) + 2.6).toFixed(1)}" class="rv-bubble-text" text-anchor="middle">${esc(clip(p.label, 5))}</text>` : ""}</g>`;
    }).join("");

    const axisLabels = `<text x="${(L + iw / 2).toFixed(1)}" y="${H - 1}" class="rv-axis" text-anchor="middle">${esc(b.xLabel || "")}</text><text x="8" y="${(T + ih / 2).toFixed(1)}" class="rv-axis" text-anchor="middle" transform="rotate(-90 8 ${(T + ih / 2).toFixed(1)})">${esc(b.yLabel || "")}</text>`;
    return wrap(b.title, `<svg class="rv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Bubble chart")}">${gy}${zero}${gx}${dots}${axisLabels}</svg>`);
}

/* Concentric rings, one per measure, each filled to its percentage. */
function rings(b) {
    const items = (b.items || []).slice(0, 5);
    if (!items.length) return "";

    const rs = items.map((_, i) => 18 - i * 3.4);
    const arcs = items.map((it, i) => {
        const r = rs[i], circ = 2 * Math.PI * r;
        const v = clamp(Number(it.value) || 0, 0, 100);
        const c = it.tone ? TONE[it.tone] : color(i);
        return `<circle cx="21" cy="21" r="${r.toFixed(2)}" class="rv-rings-track"/><circle cx="21" cy="21" r="${r.toFixed(2)}" class="rv-rings-arc" style="stroke:${c};stroke-dasharray:${((v / 100) * circ).toFixed(2)} ${circ.toFixed(2)};--n:${i};--len:${circ.toFixed(2)}" ${tipAttr(it.label, [[it.note || "Score", it.display ?? `${Math.round(v)}%`, c]])}/>`;
    }).join("");
    const legend = items.map((it, i) => `<li><i style="background:${it.tone ? TONE[it.tone] : color(i)}"></i><span>${esc(it.label)}</span><b>${esc(it.display ?? `${Math.round(Number(it.value) || 0)}%`)}</b></li>`).join("");

    return wrap(b.title, `<div class="rv-donut"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(b.title || "Rings")}">${arcs}</svg><ul class="rv-legend rv-legend-rings">${legend}</ul></div>`);
}

const CHARTS = { donut, bar: bars, columns, line, stacked, stackcols, lollipop, radar, waterfall, treemap, bubble, rings };
const chart = (b) => (CHARTS[b.type] ? CHARTS[b.type](b) : "");

/* ---------- table ---------- */

function table(b) {
    const cols = b.columns || [];
    if (!cols.length || !(b.rows || []).length) return "";

    const head = cols.map((c, i) => `<th class="${i > 0 && c.fmt !== "text" ? "is-num" : ""}">${esc(c.label)}</th>`).join("");
    const body = b.rows.map((r) => `<tr>${r.map((v, i) => {
        const c = cols[i] || {};
        const signed = c.fmt === "signed" || c.fmt === "spct";
        return `<td class="${i > 0 && c.fmt !== "text" ? "is-num" : ""} ${signed ? tone(Number(v)) : ""}">${fmt(v, c.fmt || (i === 0 ? "text" : "money"))}</td>`;
    }).join("")}</tr>`).join("");

    return wrap(b.title, `<div class="rv-table-wrap"><table class="rv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${b.note ? `<p class="rv-note">${esc(b.note)}</p>` : ""}`);
}

/* ---------- compare (two things, side by side, row by row) ---------- */

function compare(b) {
    const rows = (b.rows || []).map((r) => {
        const max = Math.max(Math.abs(r.a), Math.abs(r.b), 0) || 1;
        const wa = Math.max((Math.abs(r.a) / max) * 100, r.a ? 3 : 0);
        const wb = Math.max((Math.abs(r.b) / max) * 100, r.b ? 3 : 0);
        const lead = r.better === false || r.a === r.b ? "" : (r.better === "low" ? (r.a < r.b ? "a" : "b") : (r.a > r.b ? "a" : "b"));
        const fa = r.fmt || "money";

        const tip = tipAttr(r.label, [[b.aLabel, plain(r.a, fa), r.a < 0 ? TONE.danger : TONE.gold], [b.bLabel, plain(r.b, fa), r.b < 0 ? TONE.danger : TONE.info]]);
        return `<div class="rv-cmp" ${tip}>
            <p class="rv-cmp-label">${esc(r.label)}</p>
            <div class="rv-cmp-line ${lead === "a" ? "is-lead" : ""}"><span class="rv-cmp-name">${esc(b.aLabel)}</span><span class="rv-bar-track"><span class="rv-bar-fill" style="width:${wa.toFixed(1)}%;background:${r.a < 0 ? TONE.danger : TONE.gold};--n:0"></span></span><b>${fmt(r.a, fa)}</b></div>
            <div class="rv-cmp-line ${lead === "b" ? "is-lead" : ""}"><span class="rv-cmp-name">${esc(b.bLabel)}</span><span class="rv-bar-track"><span class="rv-bar-fill" style="width:${wb.toFixed(1)}%;background:${r.b < 0 ? TONE.danger : TONE.info};--n:1"></span></span><b>${fmt(r.b, fa)}</b></div>
        </div>`;
    }).join("");

    return wrap(b.title, `<div class="rv-compare">${rows}</div>${b.note ? `<p class="rv-note">${esc(b.note)}</p>` : ""}`);
}

/* ---------- gauge ---------- */

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];

function arc(cx, cy, r, from, to) {
    const [x1, y1] = polar(cx, cy, r, from);
    const [x2, y2] = polar(cx, cy, r, to);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function gauge(b) {
    const min = b.min ?? 0, max = b.max ?? 100;
    const value = Math.min(Math.max(Number(b.value) || 0, min), max);
    const progress = (value - min) / (max - min || 1);
    const zones = b.zones && b.zones.length ? b.zones : [{ to: max, tone: "gold", label: "" }];
    const ang = (v) => 180 - ((v - min) / (max - min || 1)) * 180;

    const shown = String(b.display ?? plain(b.value, b.fmt)).replace(/<[^>]*>/g, "");
    let from = min;
    const hitPaths = [];
    const paths = zones.map((z) => {
        const to = Math.min(z.to, max);
        const p = `<path d="${arc(100, 100, 78, ang(from), ang(to) + (to < max ? 0.8 : 0))}" class="rv-zone" style="stroke:${TONE[z.tone] || TONE.gold}"/>`;
        // A wider invisible band on top of each zone: hover or tap it to see the range and your value.
        hitPaths.push(`<path d="${arc(100, 100, 78, ang(from), ang(to))}" class="rv-zone-hit" ${tipAttr(z.label || "Range", [["Range", `${plain(from, "num")} to ${plain(to, "num")}${to >= max && b.maxPlus ? "+" : ""}`, TONE[z.tone] || TONE.gold], ["Your value", shown]])}/>`);
        from = to;
        return p;
    }).join("");

    const active = zones.find((z, i) => value <= z.to || i === zones.length - 1);
    const label = (active && active.label) || "";
    const c = TONE[(active && active.tone) || "gold"];

    return wrap(b.title, `
        <div class="rv-gauge">
            <svg viewBox="0 0 200 124" class="rv-gauge-svg" role="img" aria-label="${esc(b.title || "Gauge")}: ${esc(String(b.display ?? fmt(b.value, b.fmt)))}">
                ${paths}${hitPaths.join("")}
                <g class="rv-needle" style="--rot:${(progress * 180).toFixed(1)}deg">
                    <line x1="100" y1="100" x2="30" y2="100" style="stroke:${c}"/><circle cx="100" cy="100" r="5.5" style="fill:${c}"/>
                </g>
                <text x="22" y="118" class="rv-axis" text-anchor="middle">${esc(b.minLabel ?? fmt(min, b.fmt === "months" ? "num" : "num"))}</text>
                <text x="178" y="118" class="rv-axis" text-anchor="middle">${esc(b.maxLabel ?? fmt(max, "num"))}${b.maxPlus ? "+" : ""}</text>
            </svg>
            <div class="rv-gauge-read"><strong style="color:${c}">${b.display ?? fmt(b.value, b.fmt)}</strong>${label ? `<span>${esc(label)}</span>` : ""}</div>
        </div>
        ${b.caption ? `<p class="rv-note">${esc(b.caption)}</p>` : ""}`, "rv-gauge-block");
}


/* ---------- stock cards (logo + name + value + profit, like the Stocks page) ---------- */

/* The logo comes from the same service as the Stocks page. If it can't load, the symbol's initials stay. */
const logo = (symbol, big) => `<span class="rv-logo${big ? " rv-logo-lg" : ""}" data-initials="${esc(String(symbol || "").slice(0, 2).toUpperCase())}"><img src="${esc(stockLogoUrl(symbol))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-stk-logo></span>`;

function stocklist(b) {
    const items = (b.items || []).slice(0, b.limit || 8);
    if (!items.length) return "";

    const cards = items.map((i) => {
        const up = i.pnl >= 0;
        const qty = Number(i.qty);
        const sub = [esc(i.symbol), Number.isFinite(qty) && qty ? `${qty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} sh` : "", i.ltp ? `LTP ${fmt(i.ltp)}` : ""].filter(Boolean).join(" · ");
        const tip = tipAttr(i.name || i.symbol, [["Value", plain(i.value)], ["Profit / loss", plain(i.pnl, "signed"), up ? TONE.success : TONE.danger], ["Return", plain(i.pnlPct, "spct")]]);
        return `<div class="rv-stk${b.hero ? " is-hero" : ""}" ${tip}>
            ${logo(i.symbol, b.hero)}
            <div class="rv-stk-main"><b>${esc(i.name || i.symbol)}</b><span>${sub}</span></div>
            <div class="rv-stk-nums"><b>${fmt(i.value)}</b><span class="${up ? "is-up" : "is-down"}">${up ? "▲" : "▼"} ${fmt(Math.abs(i.pnl))} · ${fmt(i.pnlPct, "spct")}</span></div>
        </div>`;
    }).join("");

    const more = (b.items || []).length > items.length ? `<p class="rv-note">+ ${(b.items || []).length - items.length} more on the Stocks page.</p>` : "";
    return wrap(b.title, `<div class="rv-stks">${cards}</div>${more}`, "rv-stk-block");
}

/* ---------- statement rows (emoji + label + amount) ---------- */

function statement(b) {
    const sections = (b.sections || []).map((s) => {
        const rows = (s.rows || []).map((r) => {
            const cls = r.tone === "auto" ? tone(Number(r.value)) : r.tone ? `is-${r.tone}` : "";
            const bar = Number.isFinite(r.bar) ? `<span class="rv-bar-track rv-stmt-bar"><span class="rv-bar-fill" style="width:${Math.min(Math.max(r.bar, 2), 100).toFixed(1)}%;background:${TONE.gold};--n:0"></span></span>` : "";
            return `<li class="rv-stmt-row${r.total ? " is-total" : ""}"><span class="rv-stmt-ico" aria-hidden="true">${esc(r.icon || "•")}</span><span class="rv-stmt-text"><span class="rv-stmt-label">${esc(r.label)}</span>${r.sub ? `<em>${esc(r.sub)}</em>` : ""}${bar}</span><b class="${cls}">${fmt(r.value, r.fmt)}</b></li>`;
        }).join("");
        return `<div class="rv-stmt-sec">${s.title ? `<h5>${esc(s.title)}</h5>` : ""}<ul class="rv-stmt">${rows}</ul></div>`;
    }).join("");

    return sections ? wrap(b.title, sections, "rv-stmt-block") : "";
}

/* ---------- reminders (due dates, coloured by how soon) ---------- */

const DUE_EMOJI = { emi: "💳", fd: "🏛️", back: "📥", owe: "📤" };

function dayCount(iso) {
    const target = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
}

function reminders(b) {
    const items = (b.items || []).slice(0, 8);
    if (!items.length) return "";

    const rows = items.map((i) => {
        const days = dayCount(i.date);
        const state = days === null ? "later" : days < 0 ? "overdue" : days <= 7 ? "soon" : "later";
        const dot = { overdue: "🔴", soon: "🟠", later: "🟢" }[state];
        const when = days === null ? "" : days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "Due today" : days === 1 ? "Tomorrow" : `In ${days} days`;
        const date = new Date(`${i.date}T00:00:00`);
        const pretty = Number.isNaN(date.getTime()) ? esc(i.date) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        return `<li class="rv-rem is-${state}"><span class="rv-rem-ico" aria-hidden="true">${DUE_EMOJI[i.type] || "🔔"}</span><span class="rv-rem-text"><b>${esc(i.title)}</b><span>${dot} ${esc(when)} · ${pretty}</span></span><strong>${fmt(i.amount)}</strong></li>`;
    }).join("");

    return wrap(b.title, `<ul class="rv-rems">${rows}</ul>`, "rv-rem-block");
}

/* ---------- entry point ---------- */

const RENDER = { kpi, chart, table, compare, gauge, stocklist, statement, reminders };

/* Rough height of a block, only used to balance the two columns on wide screens. */
function weight(b) {
    if (b.kind === "compare") return 70 + (b.rows || []).length * 68;
    if (b.kind === "gauge") return 250;
    if (b.kind === "stocklist") return 60 + Math.min((b.items || []).length, 8) * 66;
    if (b.kind === "statement") return 60 + (b.sections || []).reduce((n, x) => n + 30 + (x.rows || []).length * 44, 0);
    if (b.kind === "reminders") return 60 + Math.min((b.items || []).length, 8) * 62;
    if (b.kind === "chart") {
        if (b.type === "bar") return 70 + Math.min((b.items || []).length, 10) * 26;
        if (b.type === "columns" || b.type === "line") return 250;
    }
    return 210;
}

/*
 * Number cards and tables take the full width. Runs of charts between them are split into two
 * columns (each column is its own stack with a fixed gap, so charts never touch, and the last card
 * in a column stretches so both columns end level). On phones the wrappers disappear and the cells
 * stack in their original order (CSS `order`).
 */
export function renderBlocks(blocks) {
    const cells = (blocks || []).map((b, i) => {
        let html = "";
        try { html = (RENDER[b.kind] || (() => ""))(b); } catch (error) { console.error("Rover visual:", error); }
        return html ? { b, i, html } : null;
    }).filter(Boolean);

    const cell = (c) => `<div class="rv-cell" data-i="${c.i}" style="order:${c.i}">${c.html}</div>`;
    const out = [];
    let run = [];

    const flush = () => {
        if (run.length === 1) out.push(cell(run[0]));
        else if (run.length > 1) {
            const cols = [[], []], height = [0, 0];
            run.forEach((c) => {
                const k = height[0] <= height[1] ? 0 : 1;
                cols[k].push(c);
                height[k] += weight(c.b) + 16;
            });
            out.push(`<div class="rv-vgroup" style="order:${run[0].i}">${cols.map((col) => `<div class="rv-vcol">${col.map(cell).join("")}</div>`).join("")}</div>`);
        }
        run = [];
    };

    cells.forEach((c) => {
        // Lists of stocks, statement rows and reminders read best at full width.
        if (["kpi", "table", "stocklist", "statement", "reminders"].includes(c.b.kind)) { flush(); out.push(cell(c)); }
        else run.push(c);
    });
    flush();

    return out.join("");
}
