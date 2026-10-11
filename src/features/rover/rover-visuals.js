import { formatINR } from "../dashboard/dashboard-service.js";
import { isUSD } from "../../services/currency.js";
import { esc } from "../../components/chat/chat-format.js";
import { tipAttr } from "../../components/chart-tooltip.js";

/*
 * Rover visuals: turns a reply's `blocks` into charts, tables, comparisons and gauges.
 *
 * Blocks are plain data (numbers, not formatted text), so they can be saved with the chat and
 * are drawn again in the current currency and theme. Colours come from CSS variables.
 *
 *   { kind: "kpi",     items: [{ label, value, fmt, tone }] }
 *   { kind: "chart",   type: "donut" | "bar" | "columns" | "line", title, ... }
 *   { kind: "table",   title, columns: [{ label, fmt, align }], rows: [[...]] }
 *   { kind: "compare", title, aLabel, bLabel, rows: [{ label, a, b, fmt, better }] }
 *   { kind: "gauge",   title, value, min, max, fmt, zones: [{ to, tone, label }], caption }
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
        const area = si === 0 && series.length === 1 ? `<path d="${d} L${x(last).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)} L${x(0).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)}Z" class="rv-area" style="fill:${c}"/>` : "";
        const dots = s.values.length <= 14 ? s.values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" style="fill:${c}"/>`).join("") : "";
        return `${area}<path class="rv-line" pathLength="1" d="${d}" style="stroke:${c}"/>${dots}`;
    }).join("");

    const hitW = iw / (labels.length - 1);
    const hits = labels.map((lab, i) => `<rect class="br-tip-hit" x="${(x(i) - hitW / 2).toFixed(1)}" y="${T}" width="${hitW.toFixed(1)}" height="${ih}" ${tipAttr(lab, series.map((s, si) => [s.name, plain(s.values[i]), s.color ? TONE[s.color] : color(si)]))}/>`).join("");

    const key = series.length > 1 ? `<div class="rv-key">${series.map((s, i) => `<span><i style="background:${s.color ? TONE[s.color] : color(i)}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";

    return wrap(b.title, `<svg class="rv-svg br-tip-scrub" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title || "Trend")}">${grid}${xs}${paths}${hits}</svg>${key}`);
}

const chart = (b) => (b.type === "donut" ? donut(b) : b.type === "bar" ? bars(b) : b.type === "columns" ? columns(b) : b.type === "line" ? line(b) : "");

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

    return wrap(b.title, `<div class="rv-table-wrap"><table class="rv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
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

/* ---------- entry point ---------- */

const RENDER = { kpi, chart, table, compare, gauge };

/* Rough height of a block, only used to balance the two columns on wide screens. */
function weight(b) {
    if (b.kind === "compare") return 70 + (b.rows || []).length * 68;
    if (b.kind === "gauge") return 250;
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
        if (c.b.kind === "kpi" || c.b.kind === "table") { flush(); out.push(cell(c)); }
        else run.push(c);
    });
    flush();

    return out.join("");
}
