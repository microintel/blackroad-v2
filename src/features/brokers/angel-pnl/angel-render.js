/* =========================================================
   BROKER REPORTS - on-screen report markup (BlackRoad style)
   Pure functions: data in, HTML string out. Colours come from
   the theme tokens, so reports follow Light and Dark mode.
   Styles live in styles/broker.css.
   ========================================================= */

import { icon } from "../../../components/icons.js";
import {
    CHARGE_LABELS,
    shortHeader,
    legendFor,
    fmtMoney,
    fmtSigned,
    num,
    esc,
    crossCheckTable,
    yearSummary,
    shortYearLabel
} from "./angel-parser.js";

const SERIES = [1, 2, 3, 4, 5, 6, 7];

export const nowLabel = () =>
    new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

const stat = (label, value, tone = "") => `
    <div class="ap-stat">
        <span class="br-stat-label">${label}</span>
        <strong class="ap-stat-value ${tone}">${value}</strong>
    </div>`;

const tone = (n) => (n >= 0 ? "is-pos" : "is-neg");

/* ---------------------------------------------------------
   Charts (inline SVG, token colours)
   --------------------------------------------------------- */

function pieSlicePath(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x1, y1] = p(a0);
    const [x2, y2] = p(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

function pie(slices, size = 112) {
    const r = size / 2;
    const total = slices.reduce((a, s) => a + Math.max(s.value, 0), 0);

    if (total <= 0) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
            <circle cx="${r}" cy="${r}" r="${r - 1}" style="fill:var(--br-surface-muted)"/></svg>`;
    }

    let angle = -Math.PI / 2;
    const paths = slices
        .filter((s) => s.value > 0)
        .map((s) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const d = pieSlicePath(r, r, r - 1, angle, angle + Math.min(sweep, Math.PI * 2 - 0.0001));
            angle += sweep;
            return `<path d="${d}" style="fill:${s.color}"/>`;
        })
        .join("");

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${paths}<circle cx="${r}" cy="${r}" r="${r * 0.56}" style="fill:var(--br-surface)"/></svg>`;
}

function compositionChart(map) {
    const gross = map["Total Gross PnL"] ?? 0;
    const charges = CHARGE_LABELS.reduce((a, l) => a + (map[l] ?? 0), 0);
    const net = map["Net PnL"] ?? gross - charges;

    const slices = [
        { label: "Net P&L kept", value: Math.abs(net), color: net >= 0 ? "var(--br-success)" : "var(--br-danger)" },
        { label: "Charges & taxes", value: Math.abs(charges), color: "var(--br-gold)" }
    ];

    return `
        <div class="ap-chart">
            <div class="ap-chart-title">P&amp;L composition</div>
            <div class="ap-pie-row">
                ${pie(slices)}
                <div class="ap-legend">
                    ${slices
                        .map(
                            (s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} — ${fmtMoney(s.value)}</span>`
                        )
                        .join("")}
                    <span class="br-muted">Gross P&amp;L ${fmtSigned(gross)}</span>
                </div>
            </div>
        </div>`;
}

function yearBarChart(rows) {
    const w = 420, h = 170, padL = 8, padR = 8, padTop = 24, baseY = h - 30;
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.netTotal)));
    const slotW = (w - padL - padR) / rows.length;

    const bars = rows
        .map((r, i) => {
            const bw = Math.min(50, slotW - 14);
            const x = padL + i * slotW + (slotW - bw) / 2;
            const hgt = Math.max(2, (Math.abs(r.netTotal) / max) * (baseY - padTop));
            const y = r.netTotal >= 0 ? baseY - hgt : baseY;
            const labelY = r.netTotal >= 0 ? y - 6 : y + hgt + 12;
            const fill = `var(--br-series-${SERIES[i % SERIES.length]})`;

            return `
                <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="3" style="fill:${fill}"/>
                <text x="${(x + bw / 2).toFixed(1)}" y="${labelY.toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" style="fill:var(--br-text)">${esc(fmtSigned(r.netTotal))}</text>
                <text x="${(x + bw / 2).toFixed(1)}" y="${h - 10}" font-size="9" text-anchor="middle" style="fill:var(--br-text-muted)">${esc(shortYearLabel(r.label, i))}</text>`;
        })
        .join("");

    return `
        <div class="ap-chart">
            <div class="ap-chart-title">Net P&amp;L by year</div>
            <svg viewBox="0 0 ${w} ${h}" class="ap-bars" role="img" aria-label="Net P&L by financial year">
                <line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" style="stroke:var(--br-border)"/>
                ${bars}
            </svg>
        </div>`;
}

/* ---------------------------------------------------------
   Angel One equity P&L
   --------------------------------------------------------- */

function angelTable(t) {
    const skip = String(t.headers[0] ?? "").trim() === "Scrip Symbol" ? 1 : 0;
    const headers = t.headers.slice(skip);
    const lastIdx = headers.length - 1;
    const check = crossCheckTable(t);

    const title = esc(t.section || "Transactions");

    if (!t.dataRows.length) {
        return `<div class="ap-table-block">
            <div class="ap-section-label"><span>${title}</span></div>
            <p class="br-muted ap-empty">No transactions in this section.</p></div>`;
    }

    const cell = (v, idx, isTotal, h) => {
        if (idx === 0) return `<td>${isTotal ? "Total" : esc(v)}</td>`;
        const n = num(v);
        if (n === null) return `<td class="num">${isTotal ? "" : esc(v)}</td>`;
        const cls = idx === lastIdx ? ` ${n >= 0 ? "is-pos" : "is-neg"}` : "";
        const isQty = String(h ?? "").trim().toLowerCase() === "quantity";
        return `<td class="num${cls}">${isQty ? n.toLocaleString("en-IN") : fmtMoney(n)}</td>`;
    };

    const head = headers
        .map((h, idx) => `<th class="${idx > 0 ? "num" : ""}">${esc(shortHeader(h))}</th>`)
        .join("");

    const body = t.dataRows
        .map((r) => {
            const rr = r.slice(skip);
            return `<tr>${headers.map((h, idx) => cell(rr[idx], idx, false, h)).join("")}</tr>`;
        })
        .join("");

    const total = t.totalRow
        ? (() => {
              const tr = t.totalRow.slice(skip);
              return `<tr class="is-total">${headers.map((h, idx) => cell(tr[idx], idx, true, h)).join("")}</tr>`;
          })()
        : "";

    const badge = check
        ? check.ok
            ? `<span class="br-badge br-badge-success">${icon("circle-check", { size: 13 })} Totals verified</span>`
            : `<span class="br-badge br-badge-danger">${icon("circle-alert", { size: 13 })} Total mismatch</span>`
        : "";

    const mismatch =
        check && !check.ok
            ? `<p class="ap-warn">Recalculated from the rows and compared with this sheet's own Total row — ${check.mismatches
                  .map(
                      (m) =>
                          `<b>${esc(m.header)}</b>: computed ${fmtMoney(m.computed)} vs reported ${fmtMoney(m.reported)} (${fmtSigned(m.diff)})`
                  )
                  .join("; ")}.</p>`
            : "";

    return `
        <div class="ap-table-block">
            <div class="ap-section-label"><span>${title}</span>${badge}</div>
            ${mismatch}
            <div class="br-table-wrap ap-table-wrap">
                <table class="br-table ap-table">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${body}${total}</tbody>
                </table>
            </div>
        </div>`;
}

const SUMMARY_CARDS = [
    ["Total Gross PnL", "Gross P&amp;L", true],
    ["Total Brokerage", "Brokerage", false],
    ["Total GST", "GST", false],
    ["Total STT", "STT", false],
    ["Net PnL", "Net P&amp;L", true],
    ["Intraday Net PnL", "Intraday net P&amp;L", true]
];

function clientLine(client) {
    const bits = [];
    if (client["Client Name"]) bits.push(`<b>${esc(client["Client Name"])}</b>`);
    if (client["Client Id"]) bits.push(`ID ${esc(client["Client Id"])}`);
    if (client["PAN"]) bits.push(`PAN ${esc(client["PAN"])}`);
    return bits.length ? `<div class="ap-client">${bits.map((b) => `<span>${b}</span>`).join("")}</div>` : "";
}

function angelSheet(s, yearLabel, showClient, legendItems) {
    const map = {};
    s.summary.forEach((i) => (map[i.label] = i.value));

    const cards = SUMMARY_CARDS.filter(([k]) => map[k] !== undefined)
        .map(([k, label, isPnl]) => stat(label, fmtMoney(map[k]), isPnl ? tone(map[k]) : ""))
        .join("");

    const period =
        s.range["From Date"] || s.range["To Date"]
            ? `Period: ${esc(s.range["From Date"] || "—")} to ${esc(s.range["To Date"] || "—")}`
            : "";

    const legend =
        legendItems && legendItems.length
            ? `<div class="ap-legend-note"><div class="ap-chart-title">Abbreviations used above</div>
                <ul>${legendItems.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`
            : "";

    return `
        <section class="br-card ap-sheet">
            <header class="ap-sheet-head">
                <div>
                    <div class="ap-eyebrow">Equity P&amp;L</div>
                    <h3>${esc(s.name)}${yearLabel ? ` — ${esc(yearLabel)}` : ""}</h3>
                    ${period ? `<p class="br-muted">${period}</p>` : ""}
                    ${showClient ? clientLine(s.client) : ""}
                </div>
            </header>
            ${cards ? `<div class="ap-stats">${cards}</div>` : ""}
            <div class="ap-charts">${compositionChart(map)}</div>
            ${s.tables.map(angelTable).join("")}
            ${legend}
            <p class="ap-note">Informational only, not investment advice. Equity segment only — F&amp;O excluded.</p>
        </section>`;
}

function angelOverall(years, client) {
    const rows = years.map((y) => ({ label: y.label, ...yearSummary(y.sheets) }));
    const grand = rows.reduce(
        (a, r) => ({
            grossTotal: a.grossTotal + r.grossTotal,
            chargesTotal: a.chargesTotal + r.chargesTotal,
            netTotal: a.netTotal + r.netTotal,
            txnCount: a.txnCount + r.txnCount
        }),
        { grossTotal: 0, chargesTotal: 0, netTotal: 0, txnCount: 0 }
    );

    const cards = [
        stat("Financial years", years.length),
        stat("Transactions", grand.txnCount),
        stat("Combined gross P&amp;L", fmtMoney(grand.grossTotal), tone(grand.grossTotal)),
        stat("Charges &amp; taxes", fmtMoney(grand.chargesTotal)),
        stat("Combined net P&amp;L", fmtMoney(grand.netTotal), tone(grand.netTotal))
    ].join("");

    const body = rows
        .map(
            (r) => `<tr>
                <td>${esc(r.label)}</td><td class="num">${r.txnCount}</td>
                <td class="num ${tone(r.grossTotal)}">${fmtMoney(r.grossTotal)}</td>
                <td class="num">${fmtMoney(r.chargesTotal)}</td>
                <td class="num ${tone(r.netTotal)}">${fmtMoney(r.netTotal)}</td></tr>`
        )
        .join("");

    return `
        <section class="br-card ap-sheet">
            <header class="ap-sheet-head">
                <div>
                    <div class="ap-eyebrow">Overall summary</div>
                    <h3>All financial years</h3>
                    <p class="br-muted">Equity segment only — F&amp;O is excluded from every figure.</p>
                    ${clientLine(client)}
                </div>
            </header>
            <div class="ap-stats">${cards}</div>
            <div class="ap-charts">
                ${compositionChart({
                    "Total Gross PnL": grand.grossTotal,
                    "Net PnL": grand.netTotal,
                    "Total Brokerage": grand.chargesTotal
                })}
                ${yearBarChart(rows)}
            </div>
            <div class="ap-table-block">
                <div class="ap-section-label"><span>Year-by-year breakdown</span></div>
                <div class="br-table-wrap ap-table-wrap">
                    <table class="br-table ap-table">
                        <thead><tr><th>Financial year</th><th class="num">Txns</th><th class="num">Gross P&amp;L</th><th class="num">Charges</th><th class="num">Net P&amp;L</th></tr></thead>
                        <tbody>${body}
                            <tr class="is-total"><td>All years combined</td><td class="num">${grand.txnCount}</td>
                                <td class="num ${tone(grand.grossTotal)}">${fmtMoney(grand.grossTotal)}</td>
                                <td class="num">${fmtMoney(grand.chargesTotal)}</td>
                                <td class="num ${tone(grand.netTotal)}">${fmtMoney(grand.netTotal)}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <p class="ap-note">Every total was recalculated from the row data and checked against each file's own totals.</p>
        </section>`;
}

export function renderAngelReport(years) {
    const first = years[0]?.sheets[0]?.client || {};
    let html = "";
    let clientShown = false;

    if (years.length > 1) {
        html += angelOverall(years, first);
        clientShown = true;
    }

    const legendItems = Array.from(
        new Map(
            years.flatMap((y) =>
                y.sheets.flatMap((s) => s.tables.flatMap((t) => legendFor(t.headers).map((l) => [l, l])))
            )
        ).values()
    );

    const total = years.reduce((n, y) => n + y.sheets.length, 0);
    let idx = 0;

    years.forEach((y) =>
        y.sheets.forEach((s) => {
            idx++;
            html += angelSheet(s, years.length > 1 ? y.label : "", !clientShown, idx === total ? legendItems : null);
            clientShown = true;
        })
    );

    return html;
}

export function angelYearChips(years) {
    return years
        .map((y, i) => {
            const sum = yearSummary(y.sheets);
            return `<span class="ap-chip">
                <b>${esc(y.label)}</b>
                <em class="${tone(sum.netTotal)}">${fmtSigned(sum.netTotal)}</em>
                <button type="button" data-remove="${i}" aria-label="Remove ${esc(y.label)}">${icon("x", { size: 14 })}</button>
            </span>`;
        })
        .join("");
}
